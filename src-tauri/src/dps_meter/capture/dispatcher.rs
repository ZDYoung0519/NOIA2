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
use crate::dps_meter::capture::tcp_reassembler::{TcpFlowKey, TcpReassembler};
use crate::dps_meter::config::SharedDpsMeterConfig;
use crate::dps_meter::storage::data_storage::DataStorage;
use crate::plugins::logger::AppLogger;

const TLS_CONTENT_TYPES: [u8; 4] = [0x14, 0x15, 0x16, 0x17];
const TLS_VERSIONS: [u8; 5] = [0x00, 0x01, 0x02, 0x03, 0x04];
const MAGIC: [u8; 3] = [0x0E, 0x00, 0x36];
const MAGIC_LOCK_THRESHOLD: usize = 1;
const MAGIC_LOCK_WINDOW: Duration = Duration::from_secs(3);

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
    config: SharedDpsMeterConfig,
    // unified: StreamAssembler,
    // unified1: StreamAssembler,
    assemblers: HashMap<String, TrackedAssembler>,
    nickname_assemblers: HashMap<String, TrackedAssembler>,
    tcp_reassemblers: HashMap<TcpFlowKey, TrackedTcpReassembler>,
    magic_hits: HashMap<String, VecDeque<Instant>>,
    recent_ports: RecentPortWindow,
    logged_packets: usize,
    logged_magic_packets: usize,
}

struct TrackedAssembler {
    assembler: StreamAssembler,
    last_processed_at: Instant,
}

struct TrackedTcpReassembler {
    reassembler: TcpReassembler,
    last_seen_at: Instant,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpReassemblyFlowStatus {
    pub connection: String,
    pub source: String,
    pub destination: String,
    pub next_sequence: Option<u32>,
    pub pending_segments: usize,
    pub held_bytes: usize,
    pub retransmits: u64,
    pub gap_skips: u64,
    pub idle_ms: u64,
    pub is_combat_flow: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpReassemblyStatus {
    pub combat_connection: Option<String>,
    pub total_flows: usize,
    pub total_pending_segments: usize,
    pub total_held_bytes: usize,
    pub total_retransmits: u64,
    pub total_gap_skips: u64,
    pub flows: Vec<TcpReassemblyFlowStatus>,
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
    fn new(
        data_storage: Arc<DataStorage>,
        _logger: Arc<AppLogger>,
        config: SharedDpsMeterConfig,
    ) -> Self {
        Self {
            data_storage: Arc::clone(&data_storage),
            config: Arc::clone(&config),
            assemblers: HashMap::new(),
            nickname_assemblers: HashMap::new(),
            tcp_reassemblers: HashMap::new(),
            magic_hits: HashMap::new(),
            recent_ports: RecentPortWindow::new(Duration::from_secs(2)),
            logged_packets: 0,
            logged_magic_packets: 0,
        }
    }

    fn clear(&mut self) {
        // self.unified.clear();
        // self.unified1.clear();
        for assembler in self.assemblers.values() {
            assembler.assembler.clear();
        }
        for assembler in self.nickname_assemblers.values() {
            assembler.assembler.clear();
        }
        self.assemblers.clear();
        self.nickname_assemblers.clear();
        self.tcp_reassemblers.clear();
        self.magic_hits.clear();
        self.recent_ports.entries.clear();
        self.logged_packets = 0;
        self.logged_magic_packets = 0;
    }

    fn ensure_candidate_assemblers(&mut self, key: &str, logger: &Arc<AppLogger>) {
        let data_storage = Arc::clone(&self.data_storage);
        let config = Arc::clone(&self.config);
        self.assemblers.entry(key.to_string()).or_insert_with({
            let key = key.to_string();
            let data_storage = Arc::clone(&data_storage);
            let logger = Arc::clone(logger);
            let config = Arc::clone(&config);
            move || TrackedAssembler::new(StreamAssembler::new(data_storage, logger, key, config))
        });

        self.nickname_assemblers
            .entry(key.to_string())
            .or_insert_with({
                let key = key.to_string();
                let logger = Arc::clone(logger);
                move || {
                    TrackedAssembler::new(StreamAssembler::new_nickname_only(
                        data_storage,
                        logger,
                        format!("{key}:nickname"),
                        config,
                    ))
                }
            });
    }
}

#[derive(Clone)]
pub struct CaptureDispatcher {
    channel: Channel<CapturedPacket>,
    logger: Arc<AppLogger>,
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
        logger: Arc<AppLogger>,
        ping_tracker: Arc<PingTracker>,
        config: SharedDpsMeterConfig,
    ) -> Self {
        let state = Arc::new(Mutex::new(DispatcherState::new(
            data_storage,
            Arc::clone(&logger),
            Arc::clone(&config),
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
                let mut packet = match channel.receive(Some(Duration::from_secs(1))) {
                    Some(packet) => packet,
                    None => continue,
                };

                let mut state = state.lock().unwrap();
                let flow_key = TcpFlowKey {
                    src_ip: packet.src_ip,
                    src_port: packet.src_port,
                    dst_ip: packet.dst_ip,
                    dst_port: packet.dst_port,
                };
                let tracked_reassembler =
                    state.tcp_reassemblers.entry(flow_key).or_insert_with(|| {
                        TrackedTcpReassembler {
                            reassembler: TcpReassembler::default(),
                            last_seen_at: Instant::now(),
                        }
                    });
                tracked_reassembler.last_seen_at = Instant::now();
                let reassembler = &mut tracked_reassembler.reassembler;
                let previous_retransmits = reassembler.retransmits();
                let previous_gap_skips = reassembler.gap_skips();
                let aligned = reassembler.feed(packet.sequence, std::mem::take(&mut packet.data));
                if aligned.is_empty() {
                    continue;
                }
                packet.data = aligned.concat();
                if reassembler.retransmits() != previous_retransmits
                    || reassembler.gap_skips() != previous_gap_skips
                {
                    logger.debug(format!(
                        "tcp reassembly src={}:{} dst={}:{} retransmits={} gap_skips={}",
                        format_ipv4(packet.src_ip),
                        packet.src_port,
                        format_ipv4(packet.dst_ip),
                        packet.dst_port,
                        reassembler.retransmits(),
                        reassembler.gap_skips()
                    ));
                }
                ping_tracker.on_packet(&packet.data, packet.captured_at);

                if state.logged_packets < 20 {
                    logger.info(format!(
                        "dispatcher packet src={}:{} dst={}:{} sequence={} payload_len={} captured_at={:.3}",
                        format_ipv4(packet.src_ip),
                        packet.src_port,
                        format_ipv4(packet.dst_ip),
                        packet.dst_port,
                        packet.sequence,
                        packet.data.len(),
                        packet.captured_at
                    ));
                    state.logged_packets += 1;
                }

                if looks_like_tls_payload(&packet.data) {
                    // logger.debug(format!(
                    //     "dispatcher skip tls-like payload src={} dst={} len={}",
                    //     packet.src_port,
                    //     packet.dst_port,
                    //     packet.data.len()
                    // ));
                    continue;
                }

                let key = directional_connection_key(
                    packet.src_ip,
                    packet.src_port,
                    packet.dst_ip,
                    packet.dst_port,
                );
                let contains_magic = packet
                    .data
                    .windows(MAGIC.len())
                    .any(|window| window == MAGIC);

                if contains_magic && state.logged_magic_packets < 20 {
                    // logger.debug(format!(
                    //     "dispatcher magic packet key={} payload_len={} head={}",
                    //     key,
                    //     packet.data.len(),
                    //     format_packet_prefix(&packet.data, 24)
                    // ));
                    state.logged_magic_packets += 1;
                }

                let has_enough_magic_hits = if contains_magic {
                    state.ensure_candidate_assemblers(&key, &logger);
                    let now = Instant::now();
                    let hits = state.magic_hits.entry(key.clone()).or_default();
                    while hits.front().is_some_and(|hit_at| {
                        now.saturating_duration_since(*hit_at) > MAGIC_LOCK_WINDOW
                    }) {
                        hits.pop_front();
                    }
                    hits.push_back(now);
                    hits.len() > MAGIC_LOCK_THRESHOLD
                } else {
                    false
                };

                if contains_magic && has_enough_magic_hits {
                    if let Some(locked) = state.recent_ports.add_and_get_locked(key.clone()) {
                        *combat_port.write().unwrap() = Some(locked.clone());
                        state.ensure_candidate_assemblers(&locked, &logger);
                    }
                }

                let is_candidate_connection = state.assemblers.contains_key(&key);
                if is_candidate_connection {
                    let combat_damage_enabled =
                        combat_port.read().unwrap().as_deref() == Some(key.as_str());
                    let assembler = state
                        .assemblers
                        .get_mut(&key)
                        .expect("candidate assembler must exist");
                    let _ = assembler
                        .assembler
                        .process_chunk(&packet.data, combat_damage_enabled);
                    assembler.mark_processed();

                    let nickname_assembler = state
                        .nickname_assemblers
                        .get_mut(&key)
                        .expect("candidate nickname assembler must exist");
                    let _ = nickname_assembler
                        .assembler
                        .process_chunk(&packet.data, false);
                    nickname_assembler.mark_processed();
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

    /// Check whether any game data packets have been detected recently.
    /// Returns `false` if no matching packets have been seen (game may not be running).
    pub fn has_recent_ports(&self) -> bool {
        let state = self.state.lock().unwrap();
        !state.recent_ports.entries.is_empty()
    }

    pub fn cleanup_stale_assemblers(&self, max_idle: Duration) -> Vec<String> {
        let now = Instant::now();
        let mut state = self.state.lock().unwrap();
        let mut combat_port = self.combat_port.write().unwrap();
        let mut removed = Vec::new();
        state
            .tcp_reassemblers
            .retain(|_, tracked| now.duration_since(tracked.last_seen_at) <= max_idle);

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

        for key in &removed {
            if let Some(tracked) = state.nickname_assemblers.remove(key) {
                tracked.assembler.clear();
            }
        }

        removed
    }

    pub fn assembler_buffer_sizes(&self) -> HashMap<String, usize> {
        let state = self.state.lock().unwrap();
        let mut sizes = HashMap::new();

        // let unified_size = state.unified.buffer_size();
        // if unified_size > 0 {
        //     sizes.insert("unified".to_string(), unified_size);
        // }

        // let unified1_size = state.unified1.buffer_size();
        // if unified1_size > 0 {
        //     sizes.insert("unified1".to_string(), unified1_size);
        // }

        for (key, assembler) in &state.assemblers {
            let size = assembler.assembler.buffer_size();
            sizes.insert(key.clone(), size);
        }
        for (key, assembler) in &state.nickname_assemblers {
            let size = assembler.assembler.buffer_size();
            sizes.insert(format!("{key}:nickname"), size);
        }

        sizes
    }

    pub fn tcp_reassembly_status(&self) -> TcpReassemblyStatus {
        let now = Instant::now();
        let combat_connection = self.combat_port.read().unwrap().clone();
        let state = self.state.lock().unwrap();
        let mut flows: Vec<TcpReassemblyFlowStatus> = state
            .tcp_reassemblers
            .iter()
            .map(|(key, tracked)| {
                let connection =
                    directional_connection_key(key.src_ip, key.src_port, key.dst_ip, key.dst_port);
                TcpReassemblyFlowStatus {
                    source: format!("{}:{}", format_ipv4(key.src_ip), key.src_port),
                    destination: format!("{}:{}", format_ipv4(key.dst_ip), key.dst_port),
                    next_sequence: tracked.reassembler.next_sequence(),
                    pending_segments: tracked.reassembler.pending_segments(),
                    held_bytes: tracked.reassembler.held_bytes(),
                    retransmits: tracked.reassembler.retransmits(),
                    gap_skips: tracked.reassembler.gap_skips(),
                    idle_ms: now
                        .saturating_duration_since(tracked.last_seen_at)
                        .as_millis()
                        .min(u128::from(u64::MAX)) as u64,
                    is_combat_flow: combat_connection.as_deref() == Some(connection.as_str()),
                    connection,
                }
            })
            .collect();
        flows.sort_by(|left, right| {
            right
                .is_combat_flow
                .cmp(&left.is_combat_flow)
                .then_with(|| right.held_bytes.cmp(&left.held_bytes))
                .then_with(|| left.idle_ms.cmp(&right.idle_ms))
        });

        TcpReassemblyStatus {
            combat_connection,
            total_flows: flows.len(),
            total_pending_segments: flows.iter().map(|flow| flow.pending_segments).sum(),
            total_held_bytes: flows.iter().map(|flow| flow.held_bytes).sum(),
            total_retransmits: flows.iter().map(|flow| flow.retransmits).sum(),
            total_gap_skips: flows.iter().map(|flow| flow.gap_skips).sum(),
            flows,
        }
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

fn directional_connection_key(
    src_ip: [u8; 4],
    src_port: u16,
    dst_ip: [u8; 4],
    dst_port: u16,
) -> String {
    format!(
        "{}:{src_port}->{}:{dst_port}",
        format_ipv4(src_ip),
        format_ipv4(dst_ip)
    )
}

fn format_ipv4(ip: [u8; 4]) -> String {
    format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3])
}
