use std::collections::{HashMap, HashSet, VecDeque};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::dps_meter::models::combat::{
    BuffSummary, CombatInfos, CombatSnapshot, PlayerOverviewStat, SkillStats, TargetInfo,
};

const MAGIC: &[u8; 4] = b"DPSH";
const VERSION: u16 = 1;
const HISTORY_THRESHOLD: u64 = 1_000_000;
const MAX_RECORDS: usize = 500;

// =============================================================================
// Per-target history record
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub target_id: u32,
    pub total_damage: u64,
    pub target_info: Option<TargetInfo>,
    pub combat_infos: CombatInfos,
    pub player_skill_stats: HashMap<u32, HashMap<u32, SkillStats>>,
    pub player_stats: HashMap<u32, PlayerOverviewStat>,
    #[serde(default)]
    pub use_buffs_by_target: HashMap<u32, Vec<BuffSummary>>,
    pub created_at: u64,
    #[serde(default)]
    pub uploaded: bool,
}

// =============================================================================
// Store
// =============================================================================

pub struct HistoryStore {
    records: Mutex<VecDeque<HistoryRecord>>,
    dir: Mutex<Option<PathBuf>>,
}

impl HistoryStore {
    pub fn new() -> Self {
        Self {
            records: Mutex::new(VecDeque::new()),
            dir: Mutex::new(None),
        }
    }

    pub fn get_records(&self) -> Vec<HistoryRecord> {
        self.records.lock().unwrap().iter().cloned().collect()
    }

    pub fn clear_all(&self) -> usize {
        let mut stored = self.records.lock().unwrap();
        let count = stored.len();
        stored.clear();
        self.write_to_disk(&[]);
        count
    }

    pub fn delete_record(&self, id: &str) -> bool {
        let mut stored = self.records.lock().unwrap();
        let old_len = stored.len();
        stored.retain(|r| r.id != id);
        if stored.len() != old_len {
            let snapshot: Vec<HistoryRecord> = stored.iter().cloned().collect();
            self.write_to_disk(&snapshot);
            true
        } else {
            false
        }
    }

    pub fn delete_records(&self, ids: &[String]) -> usize {
        if ids.is_empty() {
            return 0;
        }

        let ids: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
        let mut stored = self.records.lock().unwrap();
        let old_len = stored.len();
        stored.retain(|record| !ids.contains(record.id.as_str()));
        let deleted = old_len - stored.len();

        if deleted > 0 {
            let snapshot: Vec<HistoryRecord> = stored.iter().cloned().collect();
            self.write_to_disk(&snapshot);
        }

        deleted
    }

    pub fn mark_records_uploaded(&self, ids: &[String]) -> usize {
        if ids.is_empty() {
            return 0;
        }

        let ids: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
        let mut stored = self.records.lock().unwrap();
        let mut updated = 0;

        for record in stored.iter_mut() {
            if ids.contains(record.id.as_str()) && !record.uploaded {
                record.uploaded = true;
                updated += 1;
            }
        }

        if updated > 0 {
            let snapshot: Vec<HistoryRecord> = stored.iter().cloned().collect();
            self.write_to_disk(&snapshot);
        }

        updated
    }

    pub fn init_dir(&self, app_data_dir: PathBuf) {
        let dir = app_data_dir.join("history");
        let _ = std::fs::create_dir_all(&dir);
        *self.dir.lock().unwrap() = Some(dir);
    }

    /// Persist current snapshot as per-target history records, then clear.
    pub fn save_and_clear(&self, snapshot: CombatSnapshot) {
        let records = Self::extract_records(snapshot);
        if !records.is_empty() {
            self.push(records);
        }
    }

    fn extract_records(snapshot: CombatSnapshot) -> Vec<HistoryRecord> {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        snapshot
            .by_target_player_stats
            .into_iter()
            .filter_map(|(target_id, player_stats)| {
                let total_damage: u64 = player_stats.values().map(|s| s.total_damage).sum();

                if total_damage <= HISTORY_THRESHOLD {
                    return None;
                }

                let target_info = snapshot.combat_infos.target_infos.get(&target_id).cloned();

                let skill_stats = snapshot
                    .by_target_player_skill_stats
                    .get(&target_id)
                    .cloned()
                    .unwrap_or_default();

                let relevant_buff_targets: HashSet<u32> = std::iter::once(target_id)
                    .chain(player_stats.keys().copied())
                    .collect();
                let use_buffs_by_target = snapshot
                    .use_buffs_by_target
                    .iter()
                    .filter_map(|(buff_target_id, buffs)| {
                        relevant_buff_targets
                            .contains(buff_target_id)
                            .then(|| (*buff_target_id, buffs.clone()))
                    })
                    .collect();

                let combat_infos = CombatInfos {
                    target_infos: target_info
                        .as_ref()
                        .map(|ti| {
                            let mut m = HashMap::new();
                            m.insert(target_id, ti.clone());
                            m
                        })
                        .unwrap_or_default(),
                    ..snapshot.combat_infos.clone()
                };

                Some(HistoryRecord {
                    id: format!("{}-{}", target_id, now_ms),
                    target_id,
                    total_damage,
                    target_info,
                    combat_infos,
                    player_stats,
                    player_skill_stats: skill_stats,
                    use_buffs_by_target,
                    created_at: now_ms,
                    uploaded: false,
                })
            })
            .collect()
    }

    fn push(&self, records: Vec<HistoryRecord>) {
        let mut stored = self.records.lock().unwrap();
        stored.extend(records);

        // Trim to max
        while stored.len() > MAX_RECORDS {
            stored.pop_front();
        }

        // Write to disk
        let snapshot: Vec<HistoryRecord> = stored.iter().cloned().collect();
        self.write_to_disk(&snapshot);
    }

    // =========================================================================
    // Disk I/O (lz4 compressed binary)
    // =========================================================================

    fn write_to_disk(&self, records: &[HistoryRecord]) {
        let dir = match self.dir.lock().unwrap().as_ref() {
            Some(d) => d.clone(),
            None => return,
        };

        let json = serde_json::to_vec(records).unwrap_or_default();
        let compressed = lz4_flex::compress_prepend_size(&json);

        let crc = crc32fast::hash(&compressed);

        let file_path = dir.join("combat_history.bin");
        let mut file = match std::fs::File::create(&file_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[history] failed to create file: {}", e);
                return;
            }
        };

        let _ = file.write_all(MAGIC);
        let _ = file.write_all(&VERSION.to_le_bytes());
        let _ = file.write_all(&crc.to_le_bytes());
        let _ = file.write_all(&compressed);
    }

    pub fn load_from_disk(&self) {
        let dir = match self.dir.lock().unwrap().as_ref() {
            Some(d) => d.clone(),
            None => return,
        };

        let file_path = dir.join("combat_history.bin");
        let data = match std::fs::read(&file_path) {
            Ok(d) => d,
            Err(_) => return,
        };

        if data.len() < 10 {
            return;
        }

        // Verify magic
        if &data[0..4] != MAGIC {
            eprintln!("[history] bad magic");
            return;
        }

        // Verify version
        let version = u16::from_le_bytes([data[4], data[5]]);
        if version != VERSION {
            eprintln!("[history] unsupported version: {}", version);
            return;
        }

        // Verify CRC
        let expected_crc = u32::from_le_bytes([data[6], data[7], data[8], data[9]]);
        let compressed = &data[10..];
        let actual_crc = crc32fast::hash(compressed);
        if actual_crc != expected_crc {
            eprintln!("[history] CRC mismatch");
            return;
        }

        // Decompress and parse
        match lz4_flex::decompress_size_prepended(compressed) {
            Ok(json) => {
                if let Ok(records) = serde_json::from_slice::<Vec<HistoryRecord>>(&json) {
                    let mut stored = self.records.lock().unwrap();
                    stored.clear();
                    stored.extend(records);
                }
            }
            Err(e) => {
                eprintln!("[history] decompress failed: {}", e);
            }
        }
    }
}
