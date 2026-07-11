use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

pub const DEFAULT_DPS_SNAPSHOT_INTERVAL_MS: u64 = 100;
pub const DEFAULT_MEMORY_SNAPSHOT_INTERVAL_MS: u64 = 2000;
pub const DEFAULT_MAX_PACKET_SIZE_THRESHOLD: u64 = 8 * 1024;
pub const DEFAULT_STALL_RESYNC_DELAY_MS: u64 = 200;
pub const DEFAULT_FULL_PROCESSOR_STALL_RESYNC_DELAY_MS: u64 = 0;
pub const TRAINING_DUMMY_MOB_CODE: u32 = 2_400_032;
pub const DEFAULT_HIDE_KNOWN_PLAYERS: bool = false;
pub const DEFAULT_MAX_PLAYER_COUNT: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PvpOverlayPosition {
    Bottom,
    Right,
    Free,
}

impl Default for PvpOverlayPosition {
    fn default() -> Self {
        Self::Bottom
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DpsMeterConfig {
    #[serde(default = "default_dps_snapshot_interval_ms")]
    pub dps_snapshot_interval_ms: u64,
    #[serde(default = "default_memory_snapshot_interval_ms")]
    pub memory_snapshot_interval_ms: u64,
    #[serde(default = "default_max_packet_size_threshold")]
    pub max_packet_size_threshold: u64,
    #[serde(default = "default_stall_resync_delay_ms")]
    pub stall_resync_delay_ms: u64,
    #[serde(default = "default_full_processor_stall_resync_delay_ms")]
    pub full_processor_stall_resync_delay_ms: u64,
    #[serde(default)]
    pub boss_only: bool,
    #[serde(default)]
    pub pvp_mode_on: bool,
    #[serde(default)]
    pub pvp_overlay_position: PvpOverlayPosition,
    #[serde(default)]
    pub show_possible_boss: bool,
    #[serde(default)]
    pub my_muzhuang_only: bool,
    #[serde(default)]
    pub output_debug_log: bool,
    #[serde(default = "default_hide_unknown_players")]
    pub hide_unknown_players: bool,
    #[serde(default = "default_max_player_count")]
    pub max_player_count: usize,
}

impl Default for DpsMeterConfig {
    fn default() -> Self {
        Self {
            dps_snapshot_interval_ms: DEFAULT_DPS_SNAPSHOT_INTERVAL_MS,
            memory_snapshot_interval_ms: DEFAULT_MEMORY_SNAPSHOT_INTERVAL_MS,
            max_packet_size_threshold: DEFAULT_MAX_PACKET_SIZE_THRESHOLD,
            stall_resync_delay_ms: DEFAULT_STALL_RESYNC_DELAY_MS,
            full_processor_stall_resync_delay_ms: DEFAULT_FULL_PROCESSOR_STALL_RESYNC_DELAY_MS,
            boss_only: false,
            pvp_mode_on: false,
            pvp_overlay_position: PvpOverlayPosition::Bottom,
            show_possible_boss: false,
            my_muzhuang_only: false,
            output_debug_log: false,
            hide_unknown_players: false,
            max_player_count: 10,
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
        self.max_packet_size_threshold =
            normalize_max_packet_size_threshold(self.max_packet_size_threshold);
        self.stall_resync_delay_ms = self.stall_resync_delay_ms.clamp(50, 2000);
        self.full_processor_stall_resync_delay_ms =
            self.full_processor_stall_resync_delay_ms.min(2000);
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

fn default_stall_resync_delay_ms() -> u64 {
    DEFAULT_STALL_RESYNC_DELAY_MS
}

fn default_full_processor_stall_resync_delay_ms() -> u64 {
    DEFAULT_FULL_PROCESSOR_STALL_RESYNC_DELAY_MS
}

fn default_max_player_count() -> usize {
    DEFAULT_MAX_PLAYER_COUNT
}

fn default_hide_unknown_players() -> bool {
    DEFAULT_HIDE_KNOWN_PLAYERS
}

fn normalize_max_packet_size_threshold(value: u64) -> u64 {
    if matches!(value, 2048 | 4096 | 8192 | 16384) {
        value
    } else {
        DEFAULT_MAX_PACKET_SIZE_THRESHOLD
    }
}
