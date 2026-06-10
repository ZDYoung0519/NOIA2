use std::collections::{HashMap, HashSet, VecDeque};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
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
use crate::dps_meter::config::SharedDpsMeterConfig;
use crate::dps_meter::logging::DpsLogger;
use crate::dps_meter::storage::data_storage::DataStorage;

const TLS_CONTENT_TYPES: [u8; 4] = [0x14, 0x15, 0x16, 0x17];
const TLS_VERSIONS: [u8; 5] = [0x00, 0x01, 0x02, 0x03, 0x04];

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
    recent_ports: RecentPortWindow,
    filter_ports: HashSet<u16>,
    filter_checked_at: Option<Instant>,
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
    fn new(
        data_storage: Arc<DataStorage>,
        _logger: Arc<DpsLogger>,
        config: SharedDpsMeterConfig,
    ) -> Self {
        Self {
            data_storage: Arc::clone(&data_storage),
            config: Arc::clone(&config),
            assemblers: HashMap::new(),
            recent_ports: RecentPortWindow::new(Duration::from_secs(2)),
            filter_ports: HashSet::new(),
            filter_checked_at: None,
        }
    }

    fn clear(&mut self) {
        // self.unified.clear();
        // self.unified1.clear();
        for assembler in self.assemblers.values() {
            assembler.assembler.clear();
        }
        self.assemblers.clear();
        self.recent_ports.entries.clear();
        self.filter_checked_at = None;
        self.filter_ports.clear();
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
            // Attempt port filter immediately
            {
                let mut state = state.lock().unwrap();
                state.filter_ports = find_accelerator_ports(&logger).iter().map(|a| a.port).collect();
                state.filter_checked_at = Some(Instant::now());
                if state.filter_ports.is_empty() {
                    logger.info("No accelerator ports found, will recheck every 5s");
                } else {
                    logger.info(format!("Filtering ports: {:?}", state.filter_ports));
                }
            }
            while running.load(Ordering::SeqCst) {
                let packet = match channel.receive(Some(Duration::from_secs(1))) {
                    Some(packet) => packet,
                    None => continue,
                };

                let mut state = state.lock().unwrap();

                // Port filtering: only process accelerator ports
                let should_recheck = state.filter_checked_at
                    .map(|t| t.elapsed() > Duration::from_secs(5))
                    .unwrap_or(true);
                if should_recheck {
                    state.filter_ports = find_accelerator_ports(&logger).iter().map(|a| a.port).collect();
                    state.filter_checked_at = Some(Instant::now());
                    if state.filter_ports.is_empty() {
                        logger.info("No accelerator ports found, skipping all packets");
                    } else {
                        logger.info(format!("Filtering ports: {:?}", state.filter_ports));
                    }
                }
                if !state.filter_ports.is_empty() {
                    if !state.filter_ports.contains(&packet.src_port) && !state.filter_ports.contains(&packet.dst_port) {
                        continue;
                    }
                }

                ping_tracker.on_packet(&packet.data, packet.captured_at);

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

                // On loopback device, all packets are potentially game traffic
                // Register port and create assembler on first packet seen
                if let Some(locked) = state.recent_ports.add_and_get_locked(key.clone()) {
                    *combat_port.write().unwrap() = Some(locked.clone());
                    let data_storage = Arc::clone(&state.data_storage);
                    let logger = Arc::clone(&logger);
                    let config = Arc::clone(&state.config);
                    state.assemblers.entry(locked.clone()).or_insert_with(|| {
                        TrackedAssembler::new(StreamAssembler::new(
                            data_storage,
                            logger,
                            locked,
                            ProcessingMode::Full,
                            Arc::clone(&config),
                        ))
                    });
                }
                {
                    // Process packet through its port's assembler
                    let data_storage = Arc::clone(&state.data_storage);
                    let assembler_logger = Arc::clone(&logger);
                    let config = Arc::clone(&state.config);
                    let assembler = state.assemblers.entry(key.clone()).or_insert_with(|| {
                        TrackedAssembler::new(StreamAssembler::new(
                            data_storage,
                            assembler_logger,
                            key.clone(),
                            ProcessingMode::Full,
                            Arc::clone(&config),
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


fn hidden_cmd(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    { cmd.creation_flags(0x08000000); }
    cmd
}

fn find_accelerator_ports(logger: &DpsLogger) -> Vec<AccelInfo> {
    logger.info("port scan: starting...");
    let aion2_pid = match get_pid("Aion2.exe") {
        Some(p) => { logger.info(format!("port scan: Aion2.exe PID={p}")); p }
        None => { logger.info("port scan: Aion2.exe not running"); return vec![]; }
    };
    let netstat = match hidden_cmd("netstat").args(["-ano", "-p", "tcp"]).output() {
        Ok(o) => o,
        Err(e) => { logger.info(format!("port scan: netstat failed: {e}")); return vec![]; }
    };
    let text = String::from_utf8_lossy(&netstat.stdout);

    let mut all: Vec<(String, u16, u16, u32, String)> = Vec::new();
    let mut aion2_conns: Vec<(u16, u16)> = Vec::new();
    for line in text.lines().skip(4) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 { continue; }
        let (lip, lp) = split_addr(parts.get(1).unwrap_or(&""));
        let (_, rp) = split_addr(parts.get(2).unwrap_or(&""));
        let state = parts.get(3).unwrap_or(&"").to_string();
        let pid: u32 = parts.last().unwrap_or(&"0").parse().unwrap_or(0);
        if let (Some(lp), Some(rp)) = (lp, rp) {
            if pid > 0 { all.push((lip.to_string(), lp, rp, pid, state.clone())); }
            if pid == aion2_pid && state != "LISTENING" && !is_public_ip(lip) {
                aion2_conns.push((lp, rp));
            }
        }
    }
    logger.info(format!("port scan: found {} Aion2 loopback connections", aion2_conns.len()));

    let peer_ports: Vec<u16> = aion2_conns.iter()
        .filter(|(lp, rp)| !aion2_conns.iter().any(|(l2, r2)| (l2 != lp || r2 != rp) && *lp == *r2 && *rp == *l2))
        .map(|(_, rp)| *rp).collect::<HashSet<_>>().into_iter().collect();
    logger.info(format!("port scan: {} unique peer ports (after excluding self-comm): {:?}", peer_ports.len(), peer_ports));

    let mut result = Vec::new();
    for &port in &peer_ports {
        for (lip, lp, _rp, pid, state) in &all {
            if *pid == aion2_pid { continue; }
            if *lp == port && state == "LISTENING" {
                if !result.iter().any(|r: &AccelInfo| r.port == port) {
                    let name = get_name(*pid);
                    logger.info(format!("port scan: port={port} -> PID={pid} ({name})"));
                    result.push(AccelInfo { port, pid: *pid, name });
                }
            }
        }
    }
    logger.info(format!("port scan: done, {} accelerator ports found", result.len()));
    result
}

#[derive(Debug, Clone)]
pub struct AccelInfo {
    pub port: u16,
    pub pid: u32,
    pub name: String,
}

fn get_pid(name: &str) -> Option<u32> {
    let out = hidden_cmd("tasklist").args(["/fo", "csv", "/nh", "/fi", &format!("imagename eq {name}")]).output().ok()?;
    String::from_utf8_lossy(&out.stdout).split(',').nth(1)?.trim_matches('"').trim().parse().ok()
}

fn get_name(pid: u32) -> String {
    hidden_cmd("tasklist").args(["/fi", &format!("PID eq {pid}"), "/fo", "csv", "/nh"]).output().ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).split(',').next().map(|s| s.trim_matches('"').to_string()))
        .unwrap_or_else(|| pid.to_string())
}

fn split_addr(addr: &str) -> (&str, Option<u16>) {
    if let Some(p) = addr.rfind(':') { (&addr[..p], addr[p+1..].parse().ok()) } else { (addr, None) }
}

fn is_public_ip(ip: &str) -> bool {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 { return true; } // IPv6 or non-standard — treat as public
    let Ok(b0) = parts[0].parse::<u8>() else { return true; };
    // Exclude: loopback (127.x), private (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x)
    if b0 == 127 || b0 == 10 { return false; }
    if b0 == 172 {
        let Ok(b1) = parts[1].parse::<u8>() else { return true; };
        if (16..=31).contains(&b1) { return false; }
    }
    if b0 == 192 && parts[1] == "168" { return false; }
    if b0 == 169 && parts[1] == "254" { return false; }
    true
}