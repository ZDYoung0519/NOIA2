use std::collections::HashMap;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub cpu_percent: f32,
    pub rss_mb: f64,
    pub vms_mb: f64,
    pub memory_percent: f32,
    pub cap_device: Option<String>,
    pub cap_port: Option<String>,
    pub packet_sizes: HashMap<String, usize>,
    pub ping_ms: Option<f64>,
    pub ping_history: Vec<(u64, f64)>,
    pub main_actor_name: Option<String>,
}
