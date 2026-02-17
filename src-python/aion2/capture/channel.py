# channel.py
import queue
from typing import Any, Optional

class Channel:
    def __init__(self, capacity: int = -1):
        # Python Queue 的 maxsize=0 表示无限，maxsize<0 也视为无限
        maxsize = 0 if capacity == -1 else capacity
        self._queue = queue.Queue(maxsize=maxsize)
        self._closed = False

    def try_send(self, value: Any) -> bool:
        """非阻塞发送，成功返回 True"""
        if self._closed:
            return False
        try:
            self._queue.put_nowait(value)
            return True
        except queue.Full:
            return False

    def try_receive(self) -> Optional[Any]:
        """非阻塞接收"""
        try:
            return self._queue.get_nowait()
        except queue.Empty:
            return None

    def close(self) -> bool:
        if not self._closed:
            self._closed = True
            return True
        return False

    @property
    def is_closed_for_send(self) -> bool:
        return self._closed

    @property
    def is_empty(self) -> bool:
        return self._queue.empty()

    @property
    def size(self) -> int:
        return self._queue.qsize()

    def clear(self) -> int:
        """
        清空队列，返回被清除的元素数量
        """
        cleared_count = 0
        while True:
            try:
                self._queue.get_nowait()
                cleared_count += 1
            except queue.Empty:
                break
        return cleared_count
    
    