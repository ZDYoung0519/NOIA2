use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

pub const DEFAULT_DPS_SNAPSHOT_INTERVAL_MS: u64 = 500;
pub const DEFAULT_MEMORY_SNAPSHOT_INTERVAL_MS: u64 = 1500;
pub const DEFAULT_MAX_PACKET_SIZE_THRESHOLD: u64 = 4 * 1024;
pub const TRAINING_DUMMY_MOB_CODE: u32 = 2_400_032;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DpsMeterConfig {
    #[serde(default = "default_dps_snapshot_interval_ms")]
    pub dps_snapshot_interval_ms: u64,
    #[serde(default = "default_memory_snapshot_interval_ms")]
    pub memory_snapshot_interval_ms: u64,
    #[serde(default = "default_max_packet_size_threshold")]
    pub max_packet_size_threshold: u64,
    #[serde(default)]
    pub boss_only: bool,
    #[serde(default)]
    pub my_muzhuang_only: bool,
    #[serde(default)]
    pub output_debug_log: bool,
}

impl Default for DpsMeterConfig {
    fn default() -> Self {
        Self {
            dps_snapshot_interval_ms: DEFAULT_DPS_SNAPSHOT_INTERVAL_MS,
            memory_snapshot_interval_ms: DEFAULT_MEMORY_SNAPSHOT_INTERVAL_MS,
            max_packet_size_threshold: DEFAULT_MAX_PACKET_SIZE_THRESHOLD,
            boss_only: false,
            my_muzhuang_only: false,
            output_debug_log: false,
        }
    }
}

impl DpsMeterConfig {
    pub fn normalized(mut self) -> Self {
        if self.dps_snapshot_interval_ms == 0 {
            self.dps_snapshot_interval_ms = DEFAULT_DPS_SNAPSHOT_INTERVAL_MS;
        }
        if self.memory_snapshot_interval_ms == 0 {
            self.memory_snapshot_interval_ms = DEFAULT_MEMORY_SNAPSHOT_INTERVAL_MS;
        }
        self.dps_snapshot_interval_ms = self.dps_snapshot_interval_ms.clamp(50, 10_000);
        self.memory_snapshot_interval_ms = self.memory_snapshot_interval_ms.clamp(100, 10_000);
        self.max_packet_size_threshold = normalize_max_packet_size_threshold(
            self.max_packet_size_threshold,
        );
        self
    }
}

pub type SharedDpsMeterConfig = Arc<RwLock<DpsMeterConfig>>;

fn default_dps_snapshot_interval_ms() -> u64 {
    DEFAULT_DPS_SNAPSHOT_INTERVAL_MS
}

fn default_memory_snapshot_interval_ms() -> u64 {
    DEFAULT_MEMORY_SNAPSHOT_INTERVAL_MS
}

fn default_max_packet_size_threshold() -> u64 {
    DEFAULT_MAX_PACKET_SIZE_THRESHOLD
}

fn normalize_max_packet_size_threshold(value: u64) -> u64 {
    if matches!(value, 2048 | 4096 | 8192 | 16384) {
        value
    } else {
        DEFAULT_MAX_PACKET_SIZE_THRESHOLD
    }
}
