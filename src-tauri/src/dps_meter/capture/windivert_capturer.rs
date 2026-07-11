use std::collections::HashMap;
use std::ffi::{c_void, CString};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use windivert_sys::address::WINDIVERT_ADDRESS;
use windivert_sys::{
    WinDivertClose, WinDivertFlags, WinDivertLayer, WinDivertOpen, WinDivertRecv,
    WinDivertShutdown, WinDivertShutdownMode, WINDIVERT_MTU_MAX,
};
use windows_048::Win32::Foundation::HANDLE;

use crate::dps_meter::capture::channel::Channel;
use crate::plugins::logger::AppLogger;

const MAGIC_PATTERN: [u8; 3] = [0x0e, 0x00, 0x36];
const FILTER: &str = "tcp and ip";
const IPV4_MIN_HEADER_LEN: usize = 20;
const TCP_MIN_HEADER_LEN: usize = 20;
const CANDIDATE_STALE_AFTER: Duration = Duration::from_secs(30);
const CANDIDATE_CLEANUP_INTERVAL: Duration = Duration::from_secs(1);

struct CandidateConnections {
    last_magic_at: HashMap<(u16, u16), Instant>,
}

impl CandidateConnections {
    fn new() -> Self {
        Self {
            last_magic_at: HashMap::new(),
        }
    }

    fn observe_magic(&mut self, connection: (u16, u16), now: Instant) {
        self.last_magic_at.insert(connection, now);
    }

    fn contains(&self, connection: &(u16, u16)) -> bool {
        self.last_magic_at.contains_key(connection)
    }

    fn remove_stale(&mut self, now: Instant) {
        self.last_magic_at.retain(|_, last_magic_at| {
            now.saturating_duration_since(*last_magic_at) <= CANDIDATE_STALE_AFTER
        });
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedPacket {
    pub src_port: u16,
    pub dst_port: u16,
    pub data: Vec<u8>,
    pub captured_at: f64,
}

#[derive(Clone)]
pub struct WinDivertCapturer {
    channel: Channel<CapturedPacket>,
    logger: Arc<AppLogger>,
    running: Arc<AtomicBool>,
    thread: Arc<Mutex<Option<JoinHandle<()>>>>,
    handle: Arc<Mutex<Option<isize>>>,
}

impl WinDivertCapturer {
    pub fn new(channel: Channel<CapturedPacket>, logger: Arc<AppLogger>) -> Self {
        Self {
            channel,
            logger,
            running: Arc::new(AtomicBool::new(false)),
            thread: Arc::new(Mutex::new(None)),
            handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start(&self) -> Result<(), String> {
        self.stop();

        let handle = open_handle()?;
        let raw_handle = handle.0;
        *self.handle.lock().unwrap() = Some(raw_handle);
        self.running.store(true, Ordering::SeqCst);

        let channel = self.channel.clone();
        let logger = Arc::clone(&self.logger);
        let running = Arc::clone(&self.running);

        let capture_thread = thread::spawn(move || {
            let handle = HANDLE(raw_handle);
            let mut buffer = vec![0u8; WINDIVERT_MTU_MAX as usize];
            let mut candidates = CandidateConnections::new();
            let mut last_candidate_cleanup = Instant::now();

            logger.info("WinDivert capture started");

            while running.load(Ordering::SeqCst) {
                let mut received_len = 0u32;
                let mut address = WINDIVERT_ADDRESS::default();
                let received = unsafe {
                    WinDivertRecv(
                        handle,
                        buffer.as_mut_ptr().cast::<c_void>(),
                        buffer.len() as u32,
                        &mut received_len,
                        &mut address,
                    )
                };

                if !received.as_bool() {
                    if running.load(Ordering::SeqCst) {
                        logger.error(format!(
                            "WinDivert receive failed: {}",
                            std::io::Error::last_os_error()
                        ));
                    }
                    break;
                }

                let Some(packet) = parse_network_packet(&buffer[..received_len as usize]) else {
                    continue;
                };

                let connection = normalized_connection(packet.src_port, packet.dst_port);
                let now = Instant::now();
                if now.saturating_duration_since(last_candidate_cleanup)
                    >= CANDIDATE_CLEANUP_INTERVAL
                {
                    candidates.remove_stale(now);
                    last_candidate_cleanup = now;
                }

                if contains_magic(&packet.data) {
                    if !candidates.contains(&connection) {
                        logger.info(format!(
                            "WinDivert capture candidate detected: {}-{}",
                            connection.0, connection.1
                        ));
                    }
                    candidates.observe_magic(connection, now);
                }

                if candidates.contains(&connection) {
                    let _ = channel.try_send(packet);
                }
            }

            logger.info("WinDivert capture stopped");
        });

        *self.thread.lock().unwrap() = Some(capture_thread);
        Ok(())
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);

        let raw_handle = self.handle.lock().unwrap().take();
        if let Some(raw_handle) = raw_handle {
            unsafe {
                let _ = WinDivertShutdown(HANDLE(raw_handle), WinDivertShutdownMode::Recv);
            }
        }

        if let Some(handle) = self.thread.lock().unwrap().take() {
            let _ = handle.join();
        }

        if let Some(raw_handle) = raw_handle {
            unsafe {
                let _ = WinDivertClose(HANDLE(raw_handle));
            }
        }
    }

    pub fn target_device(&self) -> Option<String> {
        self.running
            .load(Ordering::SeqCst)
            .then(|| "WinDivert Network".to_string())
    }

    pub fn target_port(&self) -> Option<String> {
        None
    }
}

pub fn is_windivert_available() -> bool {
    let Ok(handle) = open_handle() else {
        return false;
    };

    unsafe { WinDivertClose(handle).as_bool() }
}

fn open_handle() -> Result<HANDLE, String> {
    let filter = CString::new(FILTER).expect("static WinDivert filter");
    let flags = WinDivertFlags::new().set_sniff().set_recv_only();
    let handle = unsafe { WinDivertOpen(filter.as_ptr(), WinDivertLayer::Network, 0, flags) };

    if handle.is_invalid() {
        Err(format!(
            "Failed to open WinDivert: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(handle)
    }
}

fn parse_network_packet(packet: &[u8]) -> Option<CapturedPacket> {
    if packet.len() < IPV4_MIN_HEADER_LEN || packet[0] >> 4 != 4 || packet[9] != 6 {
        return None;
    }

    let ip_header_len = usize::from(packet[0] & 0x0f) * 4;
    if ip_header_len < IPV4_MIN_HEADER_LEN || packet.len() < ip_header_len + TCP_MIN_HEADER_LEN {
        return None;
    }

    let total_len = usize::from(u16::from_be_bytes([packet[2], packet[3]])).min(packet.len());
    if total_len < ip_header_len + TCP_MIN_HEADER_LEN {
        return None;
    }

    let tcp = &packet[ip_header_len..total_len];
    let tcp_header_len = usize::from(tcp[12] >> 4) * 4;
    if tcp_header_len < TCP_MIN_HEADER_LEN || tcp.len() <= tcp_header_len {
        return None;
    }

    Some(CapturedPacket {
        src_port: u16::from_be_bytes([tcp[0], tcp[1]]),
        dst_port: u16::from_be_bytes([tcp[2], tcp[3]]),
        data: tcp[tcp_header_len..].to_vec(),
        captured_at: current_timestamp_seconds(),
    })
}

fn normalized_connection(src_port: u16, dst_port: u16) -> (u16, u16) {
    if src_port <= dst_port {
        (src_port, dst_port)
    } else {
        (dst_port, src_port)
    }
}

fn contains_magic(payload: &[u8]) -> bool {
    payload
        .windows(MAGIC_PATTERN.len())
        .any(|window| window == MAGIC_PATTERN)
}

fn current_timestamp_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::ffi::c_void;
    use std::thread;
    use std::time::Duration;

    use windivert_sys::address::WINDIVERT_ADDRESS;
    use windivert_sys::{
        WinDivertClose, WinDivertRecv, WinDivertShutdown, WinDivertShutdownMode, WINDIVERT_MTU_MAX,
    };

    use super::{normalized_connection, open_handle, parse_network_packet, CandidateConnections};

    #[test]
    fn keeps_candidate_with_recent_magic() {
        let mut candidates = CandidateConnections::new();
        let started_at = std::time::Instant::now();

        candidates.observe_magic((10_007, 50_000), started_at);
        candidates.remove_stale(started_at + Duration::from_secs(30));

        assert!(candidates.contains(&(10_007, 50_000)));
    }

    #[test]
    fn removes_candidate_without_magic_for_more_than_thirty_seconds() {
        let mut candidates = CandidateConnections::new();
        let started_at = std::time::Instant::now();

        candidates.observe_magic((10_007, 50_000), started_at);
        candidates.remove_stale(started_at + Duration::from_secs(31));

        assert!(!candidates.contains(&(10_007, 50_000)));
    }

    #[test]
    #[ignore = "requires administrator privileges and WinDivert runtime files"]
    fn opens_and_stops_capture() {
        let handle = open_handle().expect("open WinDivert capture");
        let raw_handle = handle.0;
        let receiver = thread::spawn(move || {
            let mut buffer = vec![0u8; WINDIVERT_MTU_MAX as usize];
            let mut received_len = 0;
            let mut address = WINDIVERT_ADDRESS::default();
            unsafe {
                WinDivertRecv(
                    windows_048::Win32::Foundation::HANDLE(raw_handle),
                    buffer.as_mut_ptr().cast::<c_void>(),
                    buffer.len() as u32,
                    &mut received_len,
                    &mut address,
                )
            }
        });

        thread::sleep(Duration::from_millis(20));
        unsafe {
            let _ = WinDivertShutdown(handle, WinDivertShutdownMode::Recv);
        }
        receiver.join().expect("capture receiver stops");
        unsafe {
            let _ = WinDivertClose(handle);
        }
    }

    #[test]
    fn parses_ipv4_tcp_payload() {
        let mut packet = vec![0u8; 44];
        packet[0] = 0x45;
        packet[2..4].copy_from_slice(&(44u16).to_be_bytes());
        packet[9] = 6;
        packet[20..22].copy_from_slice(&(50_000u16).to_be_bytes());
        packet[22..24].copy_from_slice(&(10_007u16).to_be_bytes());
        packet[32] = 0x50;
        packet[40..44].copy_from_slice(&[0x33, 0x36, 0xaa, 0xbb]);

        let captured = parse_network_packet(&packet).expect("valid TCP packet");

        assert_eq!(captured.src_port, 50_000);
        assert_eq!(captured.dst_port, 10_007);
        assert_eq!(captured.data, [0x33, 0x36, 0xaa, 0xbb]);
        assert_eq!(normalized_connection(50_000, 10_007), (10_007, 50_000));
    }
}
