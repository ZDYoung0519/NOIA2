use std::sync::Arc;

use crate::dps_meter::capture::accumulator::PacketAccumulator;
use crate::dps_meter::capture::processor::{ProcessingMode, StreamProcessor};
use crate::dps_meter::logging::DpsLogger;
use crate::dps_meter::storage::data_storage::DataStorage;

pub struct StreamAssembler {
    accumulator: PacketAccumulator,
    processor: StreamProcessor,
}

impl StreamAssembler {
    pub fn new(
        data_storage: Arc<DataStorage>,
        logger: Arc<DpsLogger>,
        port: String,
        mode: ProcessingMode,
    ) -> Self {
        Self {
            accumulator: PacketAccumulator::new(),
            processor: StreamProcessor::new(data_storage, logger, port, mode),
        }
    }

    pub fn process_chunk(&mut self, data: &[u8]) -> bool {
        self.accumulator.append(data);
        let mut parsed_any = false;

        while self.accumulator.size() > 0 {
            let snapshot = self.accumulator.snapshot();
            let consumed = self.processor.consume_stream(&snapshot);
            if consumed == 0 {
                break;
            }
            self.accumulator.discard_bytes(consumed);
            parsed_any = true;
        }

        parsed_any
    }

    pub fn clear(&self) {
        self.accumulator.clear();
    }

    pub fn buffer_size(&self) -> usize {
        self.accumulator.size()
    }
}
