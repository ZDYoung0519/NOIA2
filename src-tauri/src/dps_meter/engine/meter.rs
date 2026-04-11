use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::dps_meter::capture::capturer::{CapturedPacket, PcapCapturer};
use crate::dps_meter::capture::channel::Channel;
use crate::dps_meter::capture::dispatcher::CaptureDispatcher;
use crate::dps_meter::config::{DpsMeterConfig, SharedDpsMeterConfig};
use crate::dps_meter::engine::calculator::DpsCalculator;
use crate::dps_meter::logging::DpsLogger;
use crate::dps_meter::models::combat::CombatSnapshot;
use crate::dps_meter::storage::data_storage::DataStorage;

pub struct DpsMeter {
    app: AppHandle,
    config: SharedDpsMeterConfig,
    logger: Arc<DpsLogger>,
    data_storage: Arc<DataStorage>,
    calculator: Arc<DpsCalculator>,
    packet_channel: Channel<CapturedPacket>,
    capturer: PcapCapturer,
    dispatcher: CaptureDispatcher,
    snapshot_running: Arc<AtomicBool>,
    snapshot_thread: Mutex<Option<JoinHandle<()>>>,
}

impl DpsMeter {
    pub fn new(app: AppHandle) -> Self {
        let config = Arc::new(RwLock::new(DpsMeterConfig::default()));
        let logger = Arc::new(DpsLogger::new(&app, false));
        let data_storage = Arc::new(DataStorage::new(Arc::clone(&config), Arc::clone(&logger)));
        let calculator = Arc::new(DpsCalculator::new(Arc::clone(&data_storage)));
        let packet_channel = Channel::new(2000);
        let capturer = PcapCapturer::new(packet_channel.clone());
        let dispatcher = CaptureDispatcher::new(
            packet_channel.clone(),
            Arc::clone(&data_storage),
            Arc::clone(&logger),
        );

        Self {
            app,
            config,
            logger,
            data_storage,
            calculator,
            packet_channel,
            capturer,
            dispatcher,
            snapshot_running: Arc::new(AtomicBool::new(false)),
            snapshot_thread: Mutex::new(None),
        }
    }

    pub fn apply_config(&self, config: DpsMeterConfig) -> DpsMeterConfig {
        let config = config.normalized();
        *self.config.write().unwrap() = config.clone();
        self.logger.set_output_debug_log(config.output_debug_log);
        self.logger.info(format!(
            "config applied: interval={}ms boss_only={} my_muzhuang_only={} output_debug_log={}",
            config.dps_snapshot_interval_ms,
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
        self.clear_runtime_state();
        self.dispatcher.start();
        self.capturer.start();
        self.start_snapshot_loop();
        self.logger.info("dps meter started");
        Ok(())
    }

    pub fn stop_dps_meter(&self) {
        self.stop_snapshot_loop();
        self.capturer.stop();
        self.dispatcher.stop();
        self.clear_runtime_state();
        self.logger.info("dps meter stopped");
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

        let handle = thread::spawn(move || {
            while snapshot_running.load(Ordering::SeqCst) {
                if let Some(snapshot) = calculator.get_dps_snapshot(0) {
                    let _ = app.emit("dps-snapshot", snapshot);
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

    fn clear_runtime_state(&self) {
        self.data_storage.clear();
        self.calculator.reset_snapshot_state();
        self.packet_channel.clear();
        self.dispatcher.clear();
    }
}

impl Drop for DpsMeter {
    fn drop(&mut self) {
        self.stop_snapshot_loop();
        self.capturer.stop();
        self.dispatcher.stop();
        self.clear_runtime_state();
    }
}
