use std::sync::Arc;

use crate::dps_meter::storage::data_storage::DataStorage;
use crate::plugins::logger::AppLogger;

pub(crate) struct ParserContext<'a> {
    pub(super) data_storage: &'a Arc<DataStorage>,
    pub(super) logger: &'a Arc<AppLogger>,
    pub(super) port: &'a str,
}

impl<'a> ParserContext<'a> {
    pub(crate) fn new(
        data_storage: &'a Arc<DataStorage>,
        logger: &'a Arc<AppLogger>,
        port: &'a str,
    ) -> Self {
        Self {
            data_storage,
            logger,
            port,
        }
    }
}
