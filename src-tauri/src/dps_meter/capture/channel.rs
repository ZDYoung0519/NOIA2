#![allow(dead_code)]

use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug)]
struct ChannelState<T> {
    queue: VecDeque<T>,
    closed_for_send: bool,
    capacity: Option<usize>,
}

#[derive(Debug)]
struct ChannelInner<T> {
    state: Mutex<ChannelState<T>>,
    not_empty: Condvar,
    not_full: Condvar,
}

#[derive(Debug, Clone)]
pub struct Channel<T> {
    inner: Arc<ChannelInner<T>>,
}

impl<T> Channel<T> {
    pub fn new(capacity: isize) -> Self {
        let normalized_capacity = if capacity < 0 {
            None
        } else {
            Some(capacity as usize)
        };

        Self {
            inner: Arc::new(ChannelInner {
                state: Mutex::new(ChannelState {
                    queue: VecDeque::new(),
                    closed_for_send: false,
                    capacity: normalized_capacity,
                }),
                not_empty: Condvar::new(),
                not_full: Condvar::new(),
            }),
        }
    }

    pub fn try_send(&self, value: T) -> bool {
        let mut state = self.inner.state.lock().unwrap();
        if state.closed_for_send {
            return false;
        }

        if let Some(capacity) = state.capacity {
            if state.queue.len() >= capacity {
                return false;
            }
        }

        state.queue.push_back(value);
        self.inner.not_empty.notify_one();
        true
    }

    pub fn try_receive(&self) -> Option<T> {
        let mut state = self.inner.state.lock().unwrap();
        let value = state.queue.pop_front();
        if value.is_some() {
            self.inner.not_full.notify_one();
        }
        value
    }

    pub fn receive(&self, timeout: Option<Duration>) -> Option<T> {
        let mut state = self.inner.state.lock().unwrap();

        if let Some(value) = state.queue.pop_front() {
            self.inner.not_full.notify_one();
            return Some(value);
        }

        match timeout {
            None => loop {
                if state.closed_for_send {
                    return None;
                }

                state = self.inner.not_empty.wait(state).unwrap();
                if let Some(value) = state.queue.pop_front() {
                    self.inner.not_full.notify_one();
                    return Some(value);
                }
            },
            Some(timeout) => {
                let deadline = Instant::now() + timeout;
                let mut remaining = timeout;

                loop {
                    if state.closed_for_send {
                        return None;
                    }

                    let (next_state, wait_result) =
                        self.inner.not_empty.wait_timeout(state, remaining).unwrap();
                    state = next_state;

                    if let Some(value) = state.queue.pop_front() {
                        self.inner.not_full.notify_one();
                        return Some(value);
                    }

                    if wait_result.timed_out() {
                        return None;
                    }

                    let now = Instant::now();
                    if now >= deadline {
                        return None;
                    }
                    remaining = deadline.saturating_duration_since(now);
                }
            }
        }
    }

    pub fn close(&self) -> bool {
        let mut state = self.inner.state.lock().unwrap();
        if state.closed_for_send {
            return false;
        }

        state.closed_for_send = true;
        self.inner.not_empty.notify_all();
        self.inner.not_full.notify_all();
        true
    }

    pub fn is_closed_for_send(&self) -> bool {
        self.inner.state.lock().unwrap().closed_for_send
    }

    pub fn is_empty(&self) -> bool {
        self.inner.state.lock().unwrap().queue.is_empty()
    }

    pub fn size(&self) -> usize {
        self.inner.state.lock().unwrap().queue.len()
    }

    pub fn clear(&self) -> usize {
        let mut state = self.inner.state.lock().unwrap();
        let cleared_count = state.queue.len();
        state.queue.clear();
        if cleared_count > 0 {
            self.inner.not_full.notify_all();
        }
        cleared_count
    }
}

#[cfg(test)]
mod tests {
    use super::Channel;
    use std::time::Duration;

    #[test]
    fn try_send_respects_capacity() {
        let channel = Channel::new(1);
        assert!(channel.try_send(1));
        assert!(!channel.try_send(2));
        assert_eq!(channel.size(), 1);
    }

    #[test]
    fn receive_times_out() {
        let channel = Channel::<u32>::new(1);
        let value = channel.receive(Some(Duration::from_millis(25)));
        assert!(value.is_none());
    }

    #[test]
    fn clear_returns_removed_items() {
        let channel = Channel::new(-1);
        assert!(channel.try_send(1));
        assert!(channel.try_send(2));
        assert_eq!(channel.clear(), 2);
        assert!(channel.is_empty());
    }
}
