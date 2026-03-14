import time
from scapy.arch.windows import get_windows_if_list
from scapy.all import sniff, conf
from scapy.all import IP, TCP
from utils.logger import logger

def get_all_devices():
    return get_windows_if_list()

def get_loopbacks(devices):
    return [d for d in devices if 'loopback' in d['name'].lower() or 'loopback' in d['description'].lower()]

def get_non_loopback_devices(devices):
    non_loopbacks = []
    for d in devices:
        desc = d['description'].lower()
        name = d['name'].lower()
        if 'loopback' not in name and 'loopback' not in desc:
            if d.get('ips') and 'disconnected' not in desc:
                non_loopbacks.append(d)
    return non_loopbacks

def try_capture(device_name):
    start_time = time.time()

    detected = [False]
    detected_port = [None]

    def stop_filter(pkt):
        # 超时检查
        if time.time() - start_time > 1:
            if not detected[0]:
                logger.info(f"设备 {device_name} 超时，未检测到特征")
            return True
        return False

    def prn(packet):
        cap = process_pkt(packet)
        if cap is None:
            return
        if b"\x06\x00\x36" in bytes(packet):
            a, b = min(cap["srcPort"], cap["dstPort"]), max(cap["srcPort"], cap["dstPort"])
            key = f"{a}-{b}"
            detected_port[0] = key
            detected[0] = True

    logger.info(f"开始嗅探设备: {device_name}")
    try:
        sniff(
            iface=device_name,
            prn=prn,
            filter="ip and tcp",
            store=False,
            count=0,
            timeout=1,
            stop_filter=stop_filter
        )
    except Exception as e:
        logger.error(f"设备 {device_name} 抓包失败: {e}")

    return detected, detected_port


def process_pkt(packet):
    if IP not in packet:
        return
    ip = packet[IP]

    tcp_payload = bytes(ip[TCP].payload)
    srcport = ip[TCP].sport
    dstport = ip[TCP].dport

    return {
        
            "srcPort": srcport,
            "dstPort": dstport,
            "data": tcp_payload,
        }

def auto_detect_device():
    all_devices = get_all_devices()
    loopbacks = get_loopbacks(all_devices)
    nonloopbacks = get_non_loopback_devices(all_devices)

    # 依次尝试每个设备
    for dev in loopbacks + nonloopbacks:
        detected, detected_port = try_capture(dev['name'])
        if detected[0]:
            print(f"Detecte Magic code on: {dev['name']}, port: {detected_port[0]}")
            return dev['name'], detected_port[0]
    return None, None

if __name__ == "__main__":
    auto_detect_device()

    
