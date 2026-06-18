use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MARKER: [u8; 4] = [0x03, 0x36, 0x00, 0x00];
const DOTNET_EPOCH_OFFSET_MS: i64 = 62_135_596_800_000;
const MIN_PING_RS_BYTES: usize = 12;
const MAX_PING_MS: f64 = 9_999.0;
const MAX_HISTORY: usize = 10_000;

#[derive(Debug, Default)]
struct PingTrackerInner {
    last_ping_ms: Option<f64>,
    history: VecDeque<(u64, f64)>,
}

#[derive(Debug, Default)]
pub struct PingTracker {
    inner: Mutex<PingTrackerInner>,
}

impl PingTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn on_packet(&self, data: &[u8], captured_at_seconds: f64) {
        if data.len() < MIN_PING_RS_BYTES {
            return;
        }

        let mut start = 0usize;
        while start + MIN_PING_RS_BYTES <= data.len() {
            let Some(relative_idx) = data[start..]
                .windows(MARKER.len())
                .position(|window| window == MARKER)
            else {
                break;
            };

            let idx = start + relative_idx;
            if idx + MIN_PING_RS_BYTES > data.len() {
                break;
            }

            let client_sent_raw = i64::from_le_bytes([
                data[idx + 4],
                data[idx + 5],
                data[idx + 6],
                data[idx + 7],
                data[idx + 8],
                data[idx + 9],
                data[idx + 10],
                data[idx + 11],
            ]);
            let client_sent_unix_ms = client_sent_raw - DOTNET_EPOCH_OFFSET_MS;
            let arrival_ms = captured_at_seconds * 1000.0;
            let ping_ms = (arrival_ms - client_sent_unix_ms as f64).round();

            if (1.0..=MAX_PING_MS).contains(&ping_ms) {
                let mut inner = self.inner.lock().unwrap();
                inner.last_ping_ms = Some(ping_ms);
                inner.history.push_back((current_time_ms(), ping_ms));
                while inner.history.len() > MAX_HISTORY {
                    inner.history.pop_front();
                }
            }

            start = idx + MIN_PING_RS_BYTES;
        }
    }

    pub fn current_ping_ms(&self) -> Option<f64> {
        self.inner.lock().unwrap().last_ping_ms
    }

    pub fn history_snapshot(&self, limit: usize) -> Vec<(u64, f64)> {
        let inner = self.inner.lock().unwrap();
        let len = inner.history.len();
        let start = len.saturating_sub(limit);
        inner.history.iter().skip(start).copied().collect()
    }

    pub fn reset(&self) {
        let mut inner = self.inner.lock().unwrap();
        // inner.last_ping_ms = None;
        inner.history.clear();
    }
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
