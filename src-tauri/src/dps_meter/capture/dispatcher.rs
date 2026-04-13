use std::collections::{HashMap, VecDeque};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::dps_meter::capture::assembler::StreamAssembler;
use crate::dps_meter::capture::capturer::CapturedPacket;
use crate::dps_meter::capture::channel::Channel;
use crate::dps_meter::capture::ping_tracker::PingTracker;
use crate::dps_meter::capture::processor::ProcessingMode;
use crate::dps_meter::logging::DpsLogger;
use crate::dps_meter::storage::data_storage::DataStorage;

const TLS_CONTENT_TYPES: [u8; 4] = [0x14, 0x15, 0x16, 0x17];
const TLS_VERSIONS: [u8; 5] = [0x00, 0x01, 0x02, 0x03, 0x04];
const MAGIC: [u8; 3] = [0x06, 0x00, 0x36];

#[derive(Default)]
struct RecentPortWindow {
    entries: VecDeque<(Instant, String)>,
    gap_time: Duration,
}

impl RecentPortWindow {
    fn new(gap_time: Duration) -> Self {
        Self {
            entries: VecDeque::new(),
            gap_time,
        }
    }

    fn add_and_get_locked(&mut self, key: String) -> Option<String> {
        let now = Instant::now();
        self.entries.push_back((now, key));
        while let Some((timestamp, _)) = self.entries.front() {
            if now.duration_since(*timestamp) > self.gap_time {
                self.entries.pop_front();
            } else {
                break;
            }
        }

        self.entries.iter().map(|(_, port)| port).min().cloned()
    }
}

struct DispatcherState {
    data_storage: Arc<DataStorage>,
    unified: StreamAssembler,
    unified1: StreamAssembler,
    assemblers: HashMap<String, TrackedAssembler>,
    recent_ports: RecentPortWindow,
    logged_packets: usize,
    logged_magic_packets: usize,
}

struct TrackedAssembler {
    assembler: StreamAssembler,
    last_processed_at: Instant,
}

impl TrackedAssembler {
    fn new(assembler: StreamAssembler) -> Self {
        Self {
            assembler,
            last_processed_at: Instant::now(),
        }
    }

    fn mark_processed(&mut self) {
        self.last_processed_at = Instant::now();
    }
}

impl DispatcherState {
    fn new(data_storage: Arc<DataStorage>, logger: Arc<DpsLogger>) -> Self {
        Self {
            data_storage: Arc::clone(&data_storage),
            unified: StreamAssembler::new(
                Arc::clone(&data_storage),
                Arc::clone(&logger),
                "unified".to_string(),
                ProcessingMode::MetadataOnly,
            ),
            unified1: StreamAssembler::new(
                data_storage,
                logger,
                "unified1".to_string(),
                ProcessingMode::MetadataOnly,
            ),
            assemblers: HashMap::new(),
            recent_ports: RecentPortWindow::new(Duration::from_secs(2)),
            logged_packets: 0,
            logged_magic_packets: 0,
        }
    }

    fn clear(&mut self) {
        self.unified.clear();
        self.unified1.clear();
        for assembler in self.assemblers.values() {
            assembler.assembler.clear();
        }
        self.assemblers.clear();
        self.recent_ports.entries.clear();
        self.logged_packets = 0;
        self.logged_magic_packets = 0;
    }
}

#[derive(Clone)]
pub struct CaptureDispatcher {
    channel: Channel<CapturedPacket>,
    logger: Arc<DpsLogger>,
    ping_tracker: Arc<PingTracker>,
    running: Arc<AtomicBool>,
    thread: Arc<Mutex<Option<JoinHandle<()>>>>,
    combat_port: Arc<RwLock<Option<String>>>,
    state: Arc<Mutex<DispatcherState>>,
}

impl CaptureDispatcher {
    pub fn new(
        channel: Channel<CapturedPacket>,
        data_storage: Arc<DataStorage>,
        logger: Arc<DpsLogger>,
        ping_tracker: Arc<PingTracker>,
    ) -> Self {
        let state = Arc::new(Mutex::new(DispatcherState::new(
            data_storage,
            Arc::clone(&logger),
        )));

        Self {
            channel,
            logger,
            ping_tracker,
            running: Arc::new(AtomicBool::new(false)),
            thread: Arc::new(Mutex::new(None)),
            combat_port: Arc::new(RwLock::new(None)),
            state,
        }
    }

    pub fn start(&self) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }

        let channel = self.channel.clone();
        let logger = Arc::clone(&self.logger);
        let ping_tracker = Arc::clone(&self.ping_tracker);
        let running = Arc::clone(&self.running);
        let combat_port = Arc::clone(&self.combat_port);
        let state = Arc::clone(&self.state);

        let handle = thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                let packet = match channel.receive(Some(Duration::from_secs(1))) {
                    Some(packet) => packet,
                    None => continue,
                };

                let mut state = state.lock().unwrap();
                ping_tracker.on_packet(&packet.data, packet.captured_at);

                if state.logged_packets < 20 {
                    logger.debug(format!(
                        "dispatcher packet src={} dst={} payload_len={} captured_at={:.3}",
                        packet.src_port,
                        packet.dst_port,
                        packet.data.len(),
                        packet.captured_at
                    ));
                    state.logged_packets += 1;
                }

                if looks_like_tls_payload(&packet.data) {
                    logger.debug(format!(
                        "dispatcher skip tls-like payload src={} dst={} len={}",
                        packet.src_port,
                        packet.dst_port,
                        packet.data.len()
                    ));
                    continue;
                }

                let key = normalized_port_key(packet.src_port, packet.dst_port);
                let contains_magic = packet
                    .data
                    .windows(MAGIC.len())
                    .any(|window| window == MAGIC);

                if contains_magic && state.logged_magic_packets < 20 {
                    logger.debug(format!(
                        "dispatcher magic packet key={} payload_len={} head={}",
                        key,
                        packet.data.len(),
                        format_packet_prefix(&packet.data, 24)
                    ));
                    state.logged_magic_packets += 1;
                }

                if contains_magic {
                    if let Some(locked) = state.recent_ports.add_and_get_locked(key.clone()) {
                        *combat_port.write().unwrap() = Some(locked.clone());
                        let data_storage = Arc::clone(&state.data_storage);
                        let logger = Arc::clone(&logger);
                        state.assemblers.entry(locked.clone()).or_insert_with(|| {
                            TrackedAssembler::new(StreamAssembler::new(
                                data_storage,
                                logger,
                                locked,
                                ProcessingMode::Full,
                            ))
                        });
                    }
                }

                let _ = state.unified.process_chunk(&packet.data);
                if contains_magic {
                    let _ = state.unified1.process_chunk(&packet.data);
                }
                if combat_port.read().unwrap().as_deref() == Some(key.as_str()) {
                    let data_storage = Arc::clone(&state.data_storage);
                    let assembler_logger = Arc::clone(&logger);
                    let assembler = state.assemblers.entry(key.clone()).or_insert_with(|| {
                        TrackedAssembler::new(StreamAssembler::new(
                            data_storage,
                            assembler_logger,
                            key.clone(),
                            ProcessingMode::Full,
                        ))
                    });
                    let _ = assembler.assembler.process_chunk(&packet.data);
                    assembler.mark_processed();
                }
            }
        });

        *self.thread.lock().unwrap() = Some(handle);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread.lock().unwrap().take() {
            let _ = handle.join();
        }
        *self.combat_port.write().unwrap() = None;
    }

    pub fn clear(&self) {
        *self.combat_port.write().unwrap() = None;
        self.state.lock().unwrap().clear();
    }

    pub fn current_combat_port(&self) -> Option<String> {
        self.combat_port.read().unwrap().clone()
    }

    pub fn cleanup_stale_assemblers(&self, max_idle: Duration) -> Vec<String> {
        let now = Instant::now();
        let mut state = self.state.lock().unwrap();
        let mut combat_port = self.combat_port.write().unwrap();
        let mut removed = Vec::new();

        state.assemblers.retain(|key, tracked| {
            let is_stale = now.duration_since(tracked.last_processed_at) > max_idle;
            if !is_stale {
                return true;
            }

            tracked.assembler.clear();
            if combat_port.as_deref() == Some(key.as_str()) {
                *combat_port = None;
            }
            removed.push(key.clone());
            false
        });

        removed
    }

    pub fn assembler_buffer_sizes(&self) -> HashMap<String, usize> {
        let state = self.state.lock().unwrap();
        let current_port = self.current_combat_port();
        let mut sizes = HashMap::new();

        let unified_size = state.unified.buffer_size();
        if unified_size > 0 {
            sizes.insert("unified".to_string(), unified_size);
        }

        let unified1_size = state.unified1.buffer_size();
        if unified1_size > 0 {
            sizes.insert("unified1".to_string(), unified1_size);
        }

        for (key, assembler) in &state.assemblers {
            let size = assembler.assembler.buffer_size();
            if size > 0 || current_port.as_deref() == Some(key.as_str()) {
                sizes.insert(key.clone(), size);
            }
        }

        sizes
    }
}

impl Drop for CaptureDispatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

fn looks_like_tls_payload(data: &[u8]) -> bool {
    data.len() >= 3
        && TLS_CONTENT_TYPES.contains(&data[0])
        && data[1] == 0x03
        && TLS_VERSIONS.contains(&data[2])
}

fn normalized_port_key(src_port: u16, dst_port: u16) -> String {
    let (a, b) = if src_port <= dst_port {
        (src_port, dst_port)
    } else {
        (dst_port, src_port)
    };
    format!("{a}-{b}")
}

fn format_packet_prefix(data: &[u8], max_bytes: usize) -> String {
    data.iter()
        .take(max_bytes)
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}
