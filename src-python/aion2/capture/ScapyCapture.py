import sys
import time
import threading

from typing import Callable, Optional, Tuple
from scapy.all import sniff, IP, TCP, conf
from .channel import Channel
from scapy.arch.windows import get_windows_if_list



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
    
    # 优先选择非回环设备
    loopbacks = get_loopbacks(all_devices)
    if loopbacks:
        print(f"选择非回环设备: {loopbacks[0]['name']}")
        return loopbacks[0]
    else:
        loopbacks = get_loopbacks(all_devices)
        if loopbacks:
            print(f"选择回环设备: {loopbacks[0]['name']}")
            return loopbacks[0]

    return None

class ScapyCapture:
    def __init__(
        self,
        channel: Channel,

    ):
        """
        :param magic_bytes: 用于识别游戏协议的魔数（如 b'\\xAA\\xBB\\xCC\\xDD'）
        :param on_packet: 回调函数，当捕获到有效游戏包时调用，参数为 dict
        :param snapshot_length: 抓包最大长度
        :param fragment_timeout: IP 分片缓存超时时间（秒）
        """
        self.channel = channel
        self._stop_event = threading.Event()

    def prn(self, pkt):
        self.channel.try_send(pkt)

    def run(self):
        """
        开始抓包（阻塞式，建议在子线程中调用）
        """
        device = auto_detect_device()
        if not device:
            print("无法找到合适的网络设备")
            return
        device_name = device['name']
        print(f"[ScapyCapture] Starting capture on: {device_name}", file=sys.stderr)
        conf.bufsize=1024*1024*1024*10
        sniff(
            iface=device_name,
            prn=self.prn,
            filter="ip and tcp",
            store=False,
            count=0,
            timeout=None,
            stop_filter=lambda _: self._stop_event.is_set(),
            # snaplen=1024*1024*10,
            # L2=False
        )
    
    def start(self):
        self.thread = threading.Thread(target=self.run, args=[])
        self.thread.daemon = True
        self.thread.start()


    def stop(self):
        """请求停止抓包"""
        self._stop_event.set()
    
