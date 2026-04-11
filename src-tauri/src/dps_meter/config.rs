use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

pub const DEFAULT_DPS_SNAPSHOT_INTERVAL_MS: u64 = 500;
pub const TRAINING_DUMMY_MOB_CODE: u32 = 2_400_032;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DpsMeterConfig {
    pub dps_snapshot_interval_ms: u64,
    pub boss_only: bool,
    pub my_muzhuang_only: bool,
    pub output_debug_log: bool,
}

impl Default for DpsMeterConfig {
    fn default() -> Self {
        Self {
            dps_snapshot_interval_ms: DEFAULT_DPS_SNAPSHOT_INTERVAL_MS,
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
        self.dps_snapshot_interval_ms = self.dps_snapshot_interval_ms.clamp(50, 10_000);
        self
    }
}

pub type SharedDpsMeterConfig = Arc<RwLock<DpsMeterConfig>>;
