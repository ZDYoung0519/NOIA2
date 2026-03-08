from auto_detect import auto_detect_device
from utils.logger import logger
from scapy.all import sniff, Raw
from aion2.capture.channel import Channel
import threading
import msvcrt

channel = Channel()
dev = auto_detect_device()
device_name = dev['name']

TARGET_PATTERN = bytes.fromhex("0A1ABACB00")
running = True

def prn(pkt):
    if Raw in pkt:
        channel.try_send(bytes(pkt[Raw].load))

def keyboard_listener():
    global running
    while running:
        if msvcrt.kbhit() and msvcrt.getch().decode('utf-8', errors='ignore').lower() == 'q':
            running = False
            logger.info("Stopping...")

logger.info(f"Capturing on {device_name} | Press 'q' to stop")

threading.Thread(target=keyboard_listener, daemon=True).start()

sniff(
    iface=device_name,
    prn=prn,
    filter="ip and tcp",
    store=False,
    stop_filter=lambda x: not running,
)

# 重组所有数据后搜索
all_data = b''.join(channel.try_receive() for _ in range(channel.size))
total_count = all_data.count(TARGET_PATTERN)

logger.info(f"Stopped. Pattern '0A 1A BA CB 00' found {total_count} times")