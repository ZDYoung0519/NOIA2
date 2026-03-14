import time
import threading
import os
import psutil

from .channel import Channel
from .CaptureDisptcher import CaptureDispatcher
from .ScapyCapture import ScapyCapture


class MemoryMonitor():
    def __init__(self, channel: Channel, dispatcher: CaptureDispatcher, capture:  ScapyCapture, call_back: str = None):
        self.channel = channel
        self.dispatcher = dispatcher
        self.capture = capture
        self.call_back = call_back
        self.is_running = True
        self.process = psutil.Process(os.getpid())

    def get_status(self):
        cpu_percent = self.process.cpu_percent(interval=1) 
        cores = psutil.cpu_count(logical=True)
        cpu_percent /= cores
        memory_info = self.process.memory_info()
        rss = memory_info.rss / (1024 * 1024)  # 常驻内存，单位转换为 MB
        vms = memory_info.vms / (1024 * 1024)  # 虚拟内存，单位转换为 MB
        memory_percent = self.process.memory_percent()

        cap_device = self.capture.tgt_device if self.capture.tgt_device else "None"
        # cap_port = s

        # try:
        #     import GPUtil
        #     GPUs = GPUtil.getGPUs()
        #     gpu_util = {}
        #     for gpu in GPUs:
        #         gpu_util = {
        #             "load": gpu.load,
        #             "memoryUtil": gpu.memoryUtil,
        #             "memoryUsed":gpu.memoryUsed,
        #             "memoryTotal": gpu.memoryTotal
        #         }
        #         break

        # except:
        #     gpu_util = {
        #             "load": 0,
        #             "memoryUtil": 0,
        #             "memoryUsed": 0,
        #             "memoryTotal": 0
        #         }

        channel_size = self.channel.size + self.dispatcher.assembler.buffer.size
        
        return {

            "cpu_percent": cpu_percent,
            "rss": rss,
            "vms": vms,
            "memory_percent": memory_percent,
            "cap_device": cap_device,
            "channel_size": channel_size,
            "channel_num": 1
            # "gpu_util": gpu_util['load'],
            # "memoryUtil": gpu_util['memoryUtil']
        }

    def run(self):
        while self.is_running:
            self.stats = self.get_status()
            self.call_back(self.stats)
    
    def start(self):
        self.is_running = True
        self.thread = threading.Thread(target=self.run, args=[])
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        self.is_running = False
    
    def reset(self):
        pass
    
    