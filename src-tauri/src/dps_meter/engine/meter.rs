use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use sysinfo::{get_current_pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

use crate::dps_meter::capture::capturer::{CapturedPacket, PcapCapturer};
use crate::dps_meter::capture::channel::Channel;
use crate::dps_meter::capture::dispatcher::CaptureDispatcher;
use crate::dps_meter::capture::ping_tracker::PingTracker;
use crate::dps_meter::config::{DpsMeterConfig, SharedDpsMeterConfig};
use crate::dps_meter::engine::calculator::DpsCalculator;
use crate::dps_meter::logging::DpsLogger;
use crate::dps_meter::models::combat::CombatSnapshot;
use crate::dps_meter::models::diagnostics::MemorySnapshot;
use crate::dps_meter::storage::data_storage::DataStorage;

const STALE_ASSEMBLER_IDLE_SECS: u64 = 10;

pub struct DpsMeter {
    app: AppHandle,
    config: SharedDpsMeterConfig,
    logger: Arc<DpsLogger>,
    data_storage: Arc<DataStorage>,
    calculator: Arc<DpsCalculator>,
    ping_tracker: Arc<PingTracker>,
    packet_channel: Channel<CapturedPacket>,
    capturer: PcapCapturer,
    dispatcher: CaptureDispatcher,
    running: Arc<AtomicBool>,
    snapshot_running: Arc<AtomicBool>,
    memory_snapshot_running: Arc<AtomicBool>,
    snapshot_thread: Mutex<Option<JoinHandle<()>>>,
    memory_snapshot_thread: Mutex<Option<JoinHandle<()>>>,
    last_emitted_total_damage: Arc<Mutex<Option<u64>>>,
}

impl DpsMeter {
    pub fn new(app: AppHandle) -> Self {
        let config = Arc::new(RwLock::new(DpsMeterConfig::default()));
        let logger = Arc::new(DpsLogger::new(&app, false));
        let data_storage = Arc::new(DataStorage::new(app.clone(), Arc::clone(&config)));
        let calculator = Arc::new(DpsCalculator::new(Arc::clone(&data_storage)));
        let ping_tracker = Arc::new(PingTracker::new());
        let packet_channel = Channel::new(2000);
        let capturer = PcapCapturer::new(packet_channel.clone());
        let dispatcher = CaptureDispatcher::new(
            packet_channel.clone(),
            Arc::clone(&data_storage),
            Arc::clone(&logger),
            Arc::clone(&ping_tracker),
        );

        Self {
            app,
            config,
            logger,
            data_storage,
            calculator,
            ping_tracker,
            packet_channel,
            capturer,
            dispatcher,
            running: Arc::new(AtomicBool::new(false)),
            snapshot_running: Arc::new(AtomicBool::new(false)),
            memory_snapshot_running: Arc::new(AtomicBool::new(false)),
            snapshot_thread: Mutex::new(None),
            memory_snapshot_thread: Mutex::new(None),
            last_emitted_total_damage: Arc::new(Mutex::new(None)),
        }
    }

    pub fn apply_config(&self, config: DpsMeterConfig) -> DpsMeterConfig {
        let config = config.normalized();
        *self.config.write().unwrap() = config.clone();
        self.logger.set_output_debug_log(config.output_debug_log);
        self.logger.info(format!(
            "config applied: dps_interval={}ms memory_interval={}ms boss_only={} my_muzhuang_only={} output_debug_log={}",
            config.dps_snapshot_interval_ms,
            config.memory_snapshot_interval_ms,
            config.boss_only,
            config.my_muzhuang_only,
            config.output_debug_log
        ));
        config
    }

    pub fn current_config(&self) -> DpsMeterConfig {
        self.config.read().unwrap().clone()
    }

    pub fn start_dps_meter(&self) -> Result<(), String> {
        if self.running.swap(true, Ordering::SeqCst) {
            self.emit_running_status();
            return Ok(());
        }

        self.clear_runtime_state();
        self.dispatcher.start();
        self.capturer.start();
        self.start_snapshot_loop();
        self.start_memory_snapshot_loop();
        self.emit_running_status();
        self.logger.info("dps meter started");
        Ok(())
    }

    pub fn stop_dps_meter(&self) {
        if !self.running.swap(false, Ordering::SeqCst) {
            self.emit_running_status();
            return;
        }

        self.stop_snapshot_loop();
        self.stop_memory_snapshot_loop();
        self.capturer.stop();
        self.dispatcher.stop();
        self.clear_runtime_state();
        self.emit_running_status();
        self.logger.info("dps meter stopped");
    }

    pub fn reset_dps_meter(&self) {
        self.clear_runtime_state_nopacket();
        self.logger.info(format!(
            "dps meter runtime state reset (running={})",
            self.is_running()
        ));
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn get_dps_snapshot(&self, target_damage_threshold: u64) -> Option<CombatSnapshot> {
        self.calculator.get_dps_snapshot(target_damage_threshold)
    }

    fn start_snapshot_loop(&self) {
        if self.snapshot_running.swap(true, Ordering::SeqCst) {
            return;
        }

        let app = self.app.clone();
        let calculator = Arc::clone(&self.calculator);
        let config = Arc::clone(&self.config);
        let logger = Arc::clone(&self.logger);
        let snapshot_running = Arc::clone(&self.snapshot_running);
        let last_emitted_total_damage = Arc::clone(&self.last_emitted_total_damage);

        let handle = thread::spawn(move || {
            while snapshot_running.load(Ordering::SeqCst) {
                if let Some(snapshot) = calculator.get_dps_snapshot(0) {
                    let should_emit = {
                        let mut last_damage = last_emitted_total_damage.lock().unwrap();
                        let changed = last_damage
                            .map(|previous| previous != snapshot.total_damage)
                            .unwrap_or(true);
                        if changed {
                            *last_damage = Some(snapshot.total_damage);
                        }
                        changed
                    };

                    if should_emit {
                        let _ = app.emit("dps-snapshot", snapshot);
                    }
                }

                let interval_ms = config.read().unwrap().dps_snapshot_interval_ms;
                logger.debug(format!("snapshot loop sleep {}ms", interval_ms));
                thread::sleep(Duration::from_millis(interval_ms));
            }
        });

        *self.snapshot_thread.lock().unwrap() = Some(handle);
    }

    fn stop_snapshot_loop(&self) {
        self.snapshot_running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.snapshot_thread.lock().unwrap().take() {
            let _ = handle.join();
        }
    }

    fn start_memory_snapshot_loop(&self) {
        if self.memory_snapshot_running.swap(true, Ordering::SeqCst) {
            return;
        }

        let app = self.app.clone();
        let config = Arc::clone(&self.config);
        let logger = Arc::clone(&self.logger);
        let data_storage = Arc::clone(&self.data_storage);
        let ping_tracker = Arc::clone(&self.ping_tracker);
        let packet_channel = self.packet_channel.clone();
        let capturer = self.capturer.clone();
        let dispatcher = self.dispatcher.clone();
        let memory_snapshot_running = Arc::clone(&self.memory_snapshot_running);

        let handle = thread::spawn(move || {
            let pid = match get_current_pid() {
                Ok(pid) => pid,
                Err(error) => {
                    logger.error(format!("failed to resolve current pid: {error}"));
                    return;
                }
            };
            let mut system = System::new_all();

            while memory_snapshot_running.load(Ordering::SeqCst) {
                dispatcher.cleanup_stale_assemblers(Duration::from_secs(STALE_ASSEMBLER_IDLE_SECS));

                // if !cleanup_summary.cleared_buffer_ports.is_empty() {
                //     logger.info(format!(
                //         "cleared oversized assembler buffers (>10000 packets): {}",
                //         cleanup_summary.cleared_buffer_ports.join(", ")
                //     ));
                // }

                if let Some(snapshot) = build_memory_snapshot(
                    &mut system,
                    pid,
                    &data_storage,
                    &ping_tracker,
                    &packet_channel,
                    &capturer,
                    &dispatcher,
                ) {
                    let _ = app.emit("dps-memory", snapshot);
                }

                let interval_ms = config.read().unwrap().memory_snapshot_interval_ms;
                logger.debug(format!("memory snapshot loop sleep {}ms", interval_ms));
                thread::sleep(Duration::from_millis(interval_ms));
            }
        });

        *self.memory_snapshot_thread.lock().unwrap() = Some(handle);
    }

    fn stop_memory_snapshot_loop(&self) {
        self.memory_snapshot_running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.memory_snapshot_thread.lock().unwrap().take() {
            let _ = handle.join();
        }
    }

    fn clear_runtime_state(&self) {
        self.data_storage.clear();
        self.calculator.reset_snapshot_state();
        self.packet_channel.clear();
        self.dispatcher.clear();
        self.ping_tracker.reset();
        *self.last_emitted_total_damage.lock().unwrap() = None;
    }

    fn clear_runtime_state_nopacket(&self) {
        self.data_storage.clear();
        self.calculator.reset_snapshot_state();
        // self.packet_channel.clear();
        // self.dispatcher.clear();
        // self.ping_tracker.reset();
        *self.last_emitted_total_damage.lock().unwrap() = None;
    }

    fn emit_running_status(&self) {
        let _ = self.app.emit("dps-meter-status", self.is_running());
    }
}

impl Drop for DpsMeter {
    fn drop(&mut self) {
        self.stop_snapshot_loop();
        self.stop_memory_snapshot_loop();
        self.capturer.stop();
        self.dispatcher.stop();
        self.clear_runtime_state();
    }
}

fn build_memory_snapshot(
    system: &mut System,
    pid: sysinfo::Pid,
    data_storage: &Arc<DataStorage>,
    ping_tracker: &Arc<PingTracker>,
    packet_channel: &Channel<CapturedPacket>,
    capturer: &PcapCapturer,
    dispatcher: &CaptureDispatcher,
) -> Option<MemorySnapshot> {
    system.refresh_memory();
    let _ = system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    let process = system.process(pid)?;

    let total_memory = system.total_memory().max(1) as f64;
    let rss_bytes = process.memory() as f64;
    let vms_bytes = process.virtual_memory() as f64;
    let logical_cpu_count = system.cpus().len().max(1) as f32;
    let normalized_cpu_percent = (process.cpu_usage() / logical_cpu_count).clamp(0.0, 100.0);
    let mut packet_sizes: HashMap<String, usize> = dispatcher.assembler_buffer_sizes();
    let channel_size = packet_channel.size();
    if channel_size > 0 {
        packet_sizes.insert("channel".to_string(), channel_size);
    }

    Some(MemorySnapshot {
        cpu_percent: normalized_cpu_percent,
        rss_mb: rss_bytes / (1024.0 * 1024.0),
        vms_mb: vms_bytes / (1024.0 * 1024.0),
        memory_percent: ((rss_bytes / total_memory) * 100.0) as f32,
        cap_device: capturer.target_device(),
        cap_port: dispatcher
            .current_combat_port()
            .or_else(|| capturer.target_port()),
        packet_sizes,
        ping_ms: ping_tracker.current_ping_ms(),
        ping_history: ping_tracker.history_snapshot(100),
        main_actor_name: data_storage.main_actor_name(),
    })
}
