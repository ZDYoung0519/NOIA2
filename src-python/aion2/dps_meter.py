from aion2.capture.ScapyCapture import ScapyCapture
from aion2.capture.dataStorage import DataStorage
from aion2.capture.CaptureDisptcher import CaptureDispatcher
from aion2.capture.DpsCalculator import DpsCalculator
from aion2.capture.channel import Channel
from aion2.capture.WindowTitleDetector import WindowTitleDetector
from aion2.capture.MemoryMonitor import MemoryMonitor

from aion2.capture.StreamAssembler import StreamAssembler

import time


class DPSMeter():
    def __init__(self, dps_callback=None, memory_callback=None):
        self.channel = Channel()
        self.capturer = ScapyCapture(
            self.channel
        )

        self.dataStorage = DataStorage()
        self.dispatcher = CaptureDispatcher(
            channel=self.channel,
            data_storage = self.dataStorage
        )

        self.dps_calculator = DpsCalculator(
            data_storage=self.dataStorage,
            call_back=dps_callback
        )

        self.window_detector = WindowTitleDetector(
            self.dataStorage
        )

        self.memory_monitor = MemoryMonitor(
            self.channel, 
            self.dispatcher,
            memory_callback if memory_callback is not None else print
        )
        self.running = False
    
    def set_dps_callback(self, dps_callback):
        self.dps_calculator.call_back = dps_callback

    def start(self):
        # 开始抓包
        try:
            self.running = True
            self.capturer.start()
            self.dispatcher.start()
            self.dps_calculator.start()
            self.window_detector.start()
            self.memory_monitor.start()
        except Exception as e:
            print(f"启动抓包失败: {e}")
            self.running = False
    
    def stop(self):
        """停止抓包"""
        if self.running:
            self.capturer.stop()
            self.dispatcher.stop()
            self.dps_calculator.stop()
            self.window_detector.stop()
            self.memory_monitor.stop()
            self.running = False
            print("抓包已停止")
    
    def rest(self):
        self.dps_calculator.reset()
        self.dataStorage.reset()
        self.channel.clear()
        for k, v in self.dispatcher.assemblers.items():
            assert isinstance(v, StreamAssembler)
            v.buffer.reset()
            del self.dispatcher.assemblers[k]
    
    def wait(self):
        """等待用户中断"""
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n接收到中断信号")
            self.stop()


# dps_meter = DPSMeter()

