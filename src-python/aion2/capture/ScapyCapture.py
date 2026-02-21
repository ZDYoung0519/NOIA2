import sys
import time
import threading

from typing import Callable, Optional, Tuple
from scapy.all import sniff, IP, TCP, conf
from .channel import Channel

from utils.logger import logger

from auto_detect import auto_detect_device


class ScapyCapture:
    def __init__(self, channel):
        self.channel = channel
        self._stop_event = threading.Event()
        self.tgt_device = None
        self._capture_thread = None

    def prn(self, pkt):
        self.channel.try_send(pkt)

    def _capture_loop(self):
        device_name = self.tgt_device['name']
        logger.info(f"Starting capture on {device_name}")
        sniff(
            iface=device_name,
            prn=self.prn,
            filter="ip and tcp",
            store=False,
            stop_filter=lambda _: self._stop_event.is_set(),
        )
        logger.info(f"Capture stopped on {device_name}")

    def _detector_loop(self):
        while not self._stop_event.is_set():
            device = auto_detect_device()  # 获取当前最佳设备
            if device and device != self.tgt_device:
                # 停止旧抓包
                if self._capture_thread and self._capture_thread.is_alive():
                    self._stop_event.set()
                    self._capture_thread.join(timeout=3)
                    self._stop_event.clear()
                # 设置新设备并启动抓包
                self.tgt_device = device
                self._capture_thread = threading.Thread(target=self._capture_loop)
                self._capture_thread.daemon = True
                self._capture_thread.start()
            time.sleep(5)  # 每隔5秒检测一次

    def start(self):
        self._stop_event.clear()
        self._detector_thread = threading.Thread(target=self._detector_loop)
        self._detector_thread.daemon = True
        self._detector_thread.start()

    def stop(self):
        self._stop_event.set()
        if self._capture_thread:
            self._capture_thread.join()
        if self._detector_thread:
            self._detector_thread.join()
    

