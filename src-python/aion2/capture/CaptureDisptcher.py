import time
from aion2.capture.StreamProcesser import StreamProcessor
from aion2.capture.channel import Channel
from aion2.capture.dataStorage import DataStorage
from aion2.capture.StreamAssembler import StreamAssembler

import threading

            
class CaptureDispatcher:
    """
    1. channel 从 capture 中收取TCP数据流，然后给CaptureDispatcher读取
    2. CaptureDispatcher将数据发给 StreamAssembler 进行重组
    3. StreamAssembler 中 StreamProcessor 对数据进行解析
    4. StreamProcessor 将解析结果写入datastorage
    """
    def __init__(self, channel, data_storage, delay=1):
        self.channel = channel
        self.processor = StreamProcessor(data_storage)
        self.assemblers = {}
        self.combat_port_locked = False
        self.MAGIC = b"\x06\x00\x36"
        self.is_running = False
        self.delay = delay

    def contains_magic(self, data: bytes) -> bool:
        return self.MAGIC in data

    def run(self):
        while self.is_running:
            time.sleep(self.delay/1000)
            cap = self.channel.try_receive()
            if cap is None:
                continue

            a, b = min(cap["srcPort"], cap["dstPort"]), max(cap["srcPort"], cap["dstPort"])
            key = f"{a}-{b}"

            if key not in self.assemblers:
                self.assemblers[key] = StreamAssembler(self.processor)

            # MAGIC 检测（仅一次）
            if not self.combat_port_locked and self.contains_magic(bytes.fromhex(cap["data"])):
                self.combat_port_locked = True
                print(f"Magic detected on {key}")

            # 交给 assembler 重组
            assert isinstance(self.assemblers[key], StreamAssembler)
            self.assemblers[key].process_chunk(bytes.fromhex(cap["data"]))
    
    def start(self):
        self.is_running = True
        self.thread = threading.Thread(target=self.run, args=[])
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        """请求停止抓包"""
        self.is_running = False
    
