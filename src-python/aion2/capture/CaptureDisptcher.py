import time
from aion2.capture.StreamProcesser import StreamProcessor
from aion2.capture.channel import Channel
from aion2.capture.dataStorage import DataStorage
from aion2.capture.StreamAssembler import StreamAssembler



from scapy.all import IP, TCP
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

    def process_pkt(self, packet):
        if IP not in packet:
            return

        # # 跳过非 TCP
        # if proto != 6:
        #     return
        
        # if TCP not in ip:
        #     return

        ip = packet[IP]
        proto = ip.proto

        tcp_payload = bytes(ip[TCP].payload)
        srcport = ip[TCP].sport
        dstport = ip[TCP].dport

        return {
                "srcPort": srcport,
                "dstPort": dstport,
                "data": tcp_payload,
            }

    def run(self):
        while self.is_running:
            # time.sleep(0.0001)
            packet = self.channel.try_receive()
            if packet is None:
                continue
            cap = self.process_pkt(packet)
            if cap is None:
                continue

            a, b = min(cap["srcPort"], cap["dstPort"]), max(cap["srcPort"], cap["dstPort"])
            key = f"{a}-{b}"

            if key not in self.assemblers and self.contains_magic(cap['data']):
                self.assemblers[key] = StreamAssembler(self.processor)
                self.assemblers[key].process_chunk(cap["data"])
            elif key in self.assemblers:
                # 交给 assembler 重组
                assert isinstance(self.assemblers[key], StreamAssembler)
                self.assemblers[key].process_chunk(cap["data"])

            # if key not in self.assemblers:
            #     self.assemblers[key] = StreamAssembler(self.processor)
            # else:
            #     assert isinstance(self.assemblers[key], StreamAssembler)
            #     self.assemblers[key].process_chunk(cap["data"])
    
    def start(self):
        self.is_running = True
        self.thread = threading.Thread(target=self.run, args=[])
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        """请求停止抓包"""
        self.is_running = False
    
