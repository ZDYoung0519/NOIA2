# stream_assembler.py
import logging
from typing import Optional, Callable, Awaitable
import asyncio

from aion2.capture.StreamProcesser import StreamProcessor

# 配置 logger（可替换为你的日志系统）
logger = logging.getLogger("StreamAssembler")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(name)s] %(levelname)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

MAGIC_PACKET = b"\x06\x00\x36"

class PacketAccumulator:
    MAX_BUFFER_SIZE = 20 * 1024 * 1024  # 2 MB
    WARN_BUFFER_SIZE = 10 * 1024 * 1024  # 1 MB

    def __init__(self):
        self.buffer: bytearray = bytearray()

    def append(self, data: bytes) -> None:
        current_size = len(self.buffer)
        new_size = current_size + len(data)

        if (
            PacketAccumulator.WARN_BUFFER_SIZE < current_size <= PacketAccumulator.MAX_BUFFER_SIZE
        ):
            logger.warning(f"PacketAccumulator: buffer nearing limit ({current_size} bytes)")

        if new_size > PacketAccumulator.MAX_BUFFER_SIZE:
            logger.error(f"PacketAccumulator: buffer exceeded limit ({new_size} bytes), resetting")
            self.reset()
            return

        self.buffer.extend(data)

    def snapshot(self) -> bytes:
        return bytes(self.buffer)

    def index_of(self, target: bytes) -> int:
        """返回 target 在 buffer 中首次出现的索引，未找到返回 -1"""
        if len(self.buffer) < len(target):
            return -1
        return self.buffer.find(target)

    def get_range(self, start: int, end_exclusive: int) -> bytes:
        if start < 0 or end_exclusive > len(self.buffer) or start > end_exclusive:
            return b""
        return bytes(self.buffer[start:end_exclusive])

    def discard_bytes(self, length: int) -> None:
        if length >= len(self.buffer):
            self.reset()
        else:
            # 切片赋值，保留剩余部分
            self.buffer = self.buffer[length:]

    def reset(self) -> None:
        self.buffer = bytearray()

    @property
    def size(self) -> int:
        return len(self.buffer)


class StreamAssembler:
    def __init__(self, processor: StreamProcessor):
        self.buffer = PacketAccumulator()
        self.processor = processor

        self.notfoundCount = 0

    def process_chunk(self, chunk: bytes) -> None:
        """
        处理一个 TCP 片段。
        每当在缓冲区开头到某处发现 MAGIC_PACKET，就提取 [0, magic_end] 作为一个包。
        """
        self.buffer.append(chunk)

        while True:
            suffix_index = self.buffer.index_of(MAGIC_PACKET)
            if suffix_index == -1:
                if self.buffer.size > 1000:
                    self.buffer.reset()
                break  # 未找到 magic，等待更多数据

            cut_point = suffix_index + len(MAGIC_PACKET)
            full_packet = self.buffer.get_range(0, cut_point)

            if full_packet:
                self.processor.on_packet_received(full_packet)

            self.buffer.discard_bytes(cut_point)

    def stop(self) -> None:
        self.buffer.reset()
