use std::sync::Mutex;

const MAX_BUFFER_SIZE: usize = 2 * 1024 * 1024;
const INITIAL_CAPACITY: usize = 64 * 1024;

#[derive(Debug)]
struct AccumulatorInner {
    buffer: Vec<u8>,
}

#[derive(Debug)]
pub struct PacketAccumulator {
    inner: Mutex<AccumulatorInner>,
}

impl PacketAccumulator {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(AccumulatorInner {
                buffer: Vec::with_capacity(INITIAL_CAPACITY),
            }),
        }
    }

    pub fn append(&self, data: &[u8]) {
        let mut inner = self.inner.lock().unwrap();
        if inner.buffer.len() + data.len() > MAX_BUFFER_SIZE {
            inner.buffer.clear();
            return;
        }
        inner.buffer.extend_from_slice(data);
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.inner.lock().unwrap().buffer.clone()
    }

    pub fn discard_bytes(&self, length: usize) {
        let mut inner = self.inner.lock().unwrap();
        if length >= inner.buffer.len() {
            inner.buffer.clear();
            return;
        }
        inner.buffer.drain(0..length);
    }

    pub fn clear(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.buffer = Vec::with_capacity(INITIAL_CAPACITY);
    }

    pub fn size(&self) -> usize {
        self.inner.lock().unwrap().buffer.len()
    }
}

impl Default for PacketAccumulator {
    fn default() -> Self {
        Self::new()
    }
}
