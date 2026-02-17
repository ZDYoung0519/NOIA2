from aion2.capture.ScapyCapture import ScapyCapture
from aion2.capture.dataStorage import DataStorage
from aion2.capture.CaptureDisptcher import CaptureDispatcher
from aion2.capture.DpsCalculator import DpsCalculator
from aion2.capture.channel import Channel
from aion2.capture.WindowTitleDetector import WindowTitleDetector

from scapy.arch.windows import get_windows_if_list
import time
import threading
import sys

def get_all_devices():
    """获取所有网络设备"""
    return get_windows_if_list()

def get_loopbacks(devices):
    """获取回环设备（注意：可能不是你想要抓包的设备）"""
    loopbacks = []
    for device in devices:
        if 'loopback' in device['name'].lower() or 'loopback' in device['description'].lower():
            loopbacks.append(device)
    return loopbacks

def get_non_loopback_devices(devices):
    """获取非回环设备（通常用于抓取真实网络流量）"""
    non_loopbacks = []
    for device in devices:
        if 'loopback' not in device['name'].lower() and 'loopback' not in device['description'].lower():
            # 排除虚拟适配器和断开连接的适配器
            if device.get('ips') and 'disconnected' not in device['description'].lower():
                non_loopbacks.append(device)
    return non_loopbacks

def auto_detect_device():
    all_devices = get_all_devices()
    
    print("所有可用网络设备:")
    for i, device in enumerate(all_devices):
        print(f"{i+1}. {device.get('name', 'N/A')} - {device.get('description', 'N/A')}")
        if device.get('ips'):
            print(f"   IP地址: {', '.join(device['ips'])}")
        print(f"   MAC地址: {device.get('mac', 'N/A')}")
        print(f"   GUID: {device.get('guid', 'N/A')}")
        print()
    
    # 优先选择非回环设备
    loopbacks = get_loopbacks(all_devices)
    
    if loopbacks:
        print(f"选择非回环设备: {loopbacks[0]['name']}")
        return loopbacks[0]
    else:
        # 如果没有非回环设备，使用回环设备
        loopbacks = get_loopbacks(all_devices)
        if loopbacks:
            print(f"选择回环设备: {loopbacks[0]['name']}")
            return loopbacks[0]
    
    print("未找到合适的网络设备")
    return None

class DPSMeter():
    def __init__(self, dps_callback=None):
        self.channel = Channel()
        self.capturer = ScapyCapture(
            on_packet=self.channel.try_send
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
        self.running = False
    
    def set_dps_callback(self, dps_callback):
        self.dps_calculator.call_back = dps_callback

    def start(self):
        device = auto_detect_device()
        if not device:
            print("无法找到合适的网络设备")
            return
        
        print(f"选择设备: {device['name']} - {device['description']}")
        
        # 设置特征码并开始抓包
        try:
            self.running = True
            self.capturer.start(
                device_name=device['name'],
                magic_bytes=bytes([0x06, 0x00, 0x36]),
            )
            self.dispatcher.start()
            self.dps_calculator.start()
            self.window_detector.start()
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
            self.running = False
            print("抓包已停止")
    
    def rest(self):
        self.dataStorage.reset()
        self.dps_calculator.reset()
    
    def wait(self):
        """等待用户中断"""
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n接收到中断信号")
            self.stop()


# dps_meter = DPSMeter()

