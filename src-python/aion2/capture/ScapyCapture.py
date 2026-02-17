import sys
import time
import threading

from typing import Callable, Optional, Tuple
from scapy.all import sniff, IP, TCP


class ScapyCapture:
    def __init__(
        self,
        on_packet: Callable[[dict], None] | None,
        snapshot_length: int = 65535,
        fragment_timeout: float = 30.0,
    ):
        """
        :param magic_bytes: 用于识别游戏协议的魔数（如 b'\\xAA\\xBB\\xCC\\xDD'）
        :param on_packet: 回调函数，当捕获到有效游戏包时调用，参数为 dict
        :param snapshot_length: 抓包最大长度
        :param fragment_timeout: IP 分片缓存超时时间（秒）
        """
        self.magic_bytes = None
        self.on_packet = on_packet

        self.snapshot_length = snapshot_length
        self.fragment_timeout = fragment_timeout

        # 状态
        self.combat_port_locked = False
        self.locked_ports: Optional[Tuple[int, int]] = None
        self.locked_device: Optional[str] = None

        # 缓存
        self.fragment_cache = {}  # key -> {fragments: [bytes], timestamp: float}
        self._stop_event = threading.Event()

    def _is_aion_packet(self, payload: bytes) -> bool:
        return self.magic_bytes in payload

    def _reassemble_fragments(self, fragments: list[bytes]) -> bytes:
        """根据 IP 分片 offset 重组 payload"""
        fragment_data = []
        total_length = 0

        for raw_ip in fragments:
            pkt = IP(raw_ip)
            frag_offset = pkt.frag * 8
            payload_len = len(pkt.payload)
            payload = bytes(pkt.payload)

            fragment_data.append((frag_offset, payload))
            end = frag_offset + payload_len
            if end > total_length:
                total_length = end

        full = bytearray(total_length)
        for offset, data in fragment_data:
            full[offset : offset + len(data)] = data

        return bytes(full)

    def _process_packet(self, packet, device_name: str):
        if IP not in packet:
            return

        ip = packet[IP]
        tcp = packet[TCP]

        srcaddr, dstaddr = ip.src, ip.dst
        proto = ip.proto

        # 跳过非 TCP
        if proto != 6:
            return

        ip_id = ip.id
        is_fragment = bool(ip.flags & 0x1)
        frag_offset = ip.frag
        key = f"{ip_id}-{srcaddr}-{dstaddr}-{proto}"
        now = time.time()
        if is_fragment or frag_offset > 0:
            if key not in self.fragment_cache:
                self.fragment_cache[key] = {"fragments": [], "timestamp": now}
            self.fragment_cache[key]["fragments"].append(bytes(packet))
            self.fragment_cache[key]["timestamp"] = now

            if is_fragment:
                return

            fragments = self.fragment_cache.pop(key, {}).get("fragments", [])
            if not fragments:
                return
            try:
                full_ip_payload = self._reassemble_fragments([IP(frag)[IP].build() for frag in fragments])
                full_ip = IP(full_ip_payload)
                if TCP not in full_ip:
                    return
                tcp_payload = bytes(full_ip[TCP].payload)
                srcport = full_ip[TCP].sport
                dstport = full_ip[TCP].dport
            except Exception:
                return
        else:
            if TCP not in ip:
                return
            tcp_payload = bytes(ip[TCP].payload)
            srcport = ip[TCP].sport
            dstport = ip[TCP].dport


        if self._is_aion_packet(tcp_payload):
            # if not self.combat_port_locked:
            #     # self._lock_combat_port(srcport, dstport, device_name)
            #     pass
            if self.on_packet:
                self.on_packet({
                    "srcPort": srcport,
                    "dstPort": dstport,
                    "data": tcp_payload.hex(),
                    "deviceName": device_name,
                })

    def _cleanup_fragments(self):
        """后台线程：清理过期分片"""
        while not self._stop_event.is_set():
            time.sleep(10)
            now = time.time()
            expired = [
                k for k, v in self.fragment_cache.items()
                if now - v["timestamp"] > self.fragment_timeout
            ]
            for k in expired:
                self.fragment_cache.pop(k, None)

    def run(self, device_name, magic_bytes):
        """
        开始抓包（阻塞式，建议在子线程中调用）
        """
        print(f"[ScapyCapture] Starting capture on: {device_name}", file=sys.stderr)
        self.magic_bytes = magic_bytes
        sniff(
            iface=device_name,
            prn=lambda pkt: self._process_packet(pkt, device_name),
            filter="tcp",
            store=False,
            count=0,
            stop_filter=lambda _: self._stop_event.is_set(),
        )
    
    def start(self, device_name, magic_bytes):
        cleaner = threading.Thread(target=self._cleanup_fragments, daemon=True)
        cleaner.start()

        self.thread = threading.Thread(target=self.run, args=[device_name, magic_bytes, ])
        self.thread.daemon = True
        self.thread.start()


    def stop(self):
        """请求停止抓包"""
        self._stop_event.set()
    

    