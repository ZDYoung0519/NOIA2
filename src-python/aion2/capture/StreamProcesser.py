# stream_processor.py
import re
import logging
from typing import List, Optional, Tuple, Union
from aion2.capture.dataStorage import (
    DataStorage, ParsedDamagePacket, SpecialDamage,
    VarIntOutput
)

from dataclasses import dataclass
from typing import Dict, Optional, Tuple, Set




logger = logging.getLogger("StreamProcessor")
MAGIC_PACKET = b"\x06\x00\x36"



@dataclass
class ActorAnchor:
    actor_id: int
    start_index: int
    end_index: int

def read_utf8_name(packet: bytes, anchor_index: int):
    length_index = anchor_index + 1
    if length_index >= len(packet):
        return None
    name_length = packet[length_index]  # 已经是0-255
    if not (1 <= name_length <= 16):
        return None
    name_start = length_index + 1
    name_end = name_start + name_length
    if name_end > len(packet):
        return None
    name_bytes = packet[name_start:name_end]
    try:
        possible_name = name_bytes.decode('utf-8')
    except UnicodeDecodeError:
        return None
    sanitized_name = sanitize_nickname(possible_name)
    if sanitized_name is None or sanitized_name == '':
        return None
    return (name_start, name_length)


def to_hex(data: bytes) -> str:
    return " ".join(f"{b:02X}" for b in data)

def find_array_index(data: bytes, pattern: bytes) -> int:
    """KMP 算法查找子序列（简化版：用内置 find）"""
    return data.find(pattern)

def is_han_character(code: int) -> bool:
    ranges = [
        (0x4e00, 0x9fff),   # CJK Unified Ideographs
        (0x3400, 0x4dbf),   # Extension A
        (0xf900, 0xfaff),   # Compatibility
    ]
    return any(start <= code <= end for start, end in ranges)

def convert_varint(value: int) -> bytes:
    """Encode a non-negative integer as VarInt (same as protobuf)."""
    if value < 0:
        raise ValueError("VarInt must be non-negative")
    buf = bytearray()
    while value > 0x7F:
        buf.append((value & 0x7F) | 0x80)
        value >>= 7
    buf.append(value & 0x7F)
    return bytes(buf)
    
def sanitize_nickname(nickname: str) -> Optional[str]:
    # 首先移除 null 字符后部分
    sanitized = nickname.split("\x00")[0].strip()
    if not sanitized:
        return None

    nickname_builder = []
    only_numbers = True
    has_han = False

    for ch in sanitized:
        code = ord(ch)
        
        # 过滤控制字符和不可打印字符
        if code < 32 or code == 127:  # 控制字符
            continue
        if 0x80 <= code <= 0x9F:      # C1控制字符
            continue
            
        # 替换字符
        if ch == '\ufffd':
            continue
            
        # 检查是否为有效字符
        # 使用正确的Unicode属性检查
        if not (ch.isalnum() or re.match(r'[\u4e00-\u9fff]', ch)):
            # 如果不是字母数字或汉字，跳过
            continue

        nickname_builder.append(ch)

        if ch.isalpha():
            only_numbers = False
        if is_han_character(code):
            has_han = True

    result = "".join(nickname_builder)
    if not result:
        return None
    if len(result) < 3 and not has_han:
        return None
    if only_numbers:
        return None
    if len(result) == 1 and result.isalpha():
        return None

    return result


def read_varint(data: bytes, offset: int = 0) -> VarIntOutput:
    value = 0
    shift = 0
    count = 0

    while True:
        if offset + count >= len(data):
            # logger.error(f"Array out of bounds, packet {to_hex(data)}, offset {offset}, count {count}")
            return VarIntOutput(-1, -1)

        byte_val = data[offset + count] & 0xFF
        count += 1
        value |= (byte_val & 0x7F) << shift

        if (byte_val & 0x80) == 0:
            return VarIntOutput(value & 0xFFFFFFFF, count)

        shift += 7
        if shift >= 32:
            logger.debug(f"Varint overflow, packet {to_hex(data[offset:offset+4])}")
            return VarIntOutput(-1, -1)

def parse_uint16_le(data: bytes, offset: int) -> int:
    return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8)

def parse_uint32_le(data: bytes, offset: int) -> int:
    if offset + 4 > len(data):
        raise ValueError("Not enough bytes for uint32")
    return (
        (data[offset] & 0xFF) |
        ((data[offset + 1] & 0xFF) << 8) |
        ((data[offset + 2] & 0xFF) << 16) |
        ((data[offset + 3] & 0xFF) << 24)
    )

class StreamProcessor:
    def __init__(self, data_storage: DataStorage):
        self.data_storage = data_storage
        self.mask = 0x0F
        self.main_loop = None  # 👈 新增：保存主事件循环
    
    def set_event_loop(self, loop):
        """由主程序传入 asyncio 主循环"""
        self.main_loop = loop

    def on_packet_received(self, packet: bytes) -> None:
        # if len(packet) <= 3:
        #     return

        packet_length_info = read_varint(packet)
        if packet_length_info.length == -1:
            return

        expected_len = packet_length_info.value
        actual_len = len(packet)

        if actual_len == expected_len:
            self.parse_perfect_packet(packet[:-3])
            return

        if expected_len > actual_len:
            self.parse_broken_length_packet(packet)
            return

        if expected_len <= 3:
            self.on_packet_received(packet[1:])
            return

        start_idx = 0
        end_idx = expected_len - 3
        if start_idx < end_idx <= actual_len:
            extracted = packet[start_idx:end_idx]
            if len(extracted) > 0 and len(extracted) != 3:
                self.parse_perfect_packet(extracted)

        if expected_len - 3 < actual_len:
            self.on_packet_received(packet[expected_len - 3:])


    def parse_perfect_packet(self, packet: bytes) -> None:
        if len(packet) < 3:
            return
        if self.parsing_damage(packet):
            return
            
        if self.parse_actor_name_binding_rules(packet) or self.parsing_nickname(packet):
            return
        # if self.parse_entity_name_binding_rules(packet):
        #     return
        if self.parse_summon_packet(packet):
            return
        self.parse_dot_packet(packet)

    def parsing_damage(self, packet: bytes) -> bool:
        if not packet or packet[0] == 0x20:
            return False

        offset = 0
        packet_length_info = read_varint(packet)
        if packet_length_info.length < 0:
            return False
        offset += packet_length_info.length
        if offset + 2 > len(packet):
            return False
        if packet[offset] != 0x04 or packet[offset + 1] != 0x38:
            return False
        offset += 2

        pdp = ParsedDamagePacket()
        target_info = read_varint(packet, offset)
        if target_info.length < 0:
            return False
        pdp.setTargetId(target_info)
        offset += target_info.length

        switch_info = read_varint(packet, offset)
        if switch_info.length < 0:
            return False
        pdp.setSwitchVariable = lambda x: None  # 占位
        offset += switch_info.length

        flag_info = read_varint(packet, offset)
        if flag_info.length < 0:
            return False
        pdp.setFlag = lambda x: None  # 占位
        offset += flag_info.length

        actor_info = read_varint(packet, offset)
        if actor_info.length < 0:
            return False
        pdp.setActorId(actor_info)
        offset += actor_info.length

        if offset + 5 > len(packet):
            return False

        skill_code = parse_uint32_le(packet, offset)
        pdp.setSkillCode(skill_code)
        offset += 5

        type_info = read_varint(packet, offset)
        if type_info.length < 0:
            return False
        pdp.setType(type_info.value)
        offset += type_info.length

        if offset >= len(packet):
            return False

        damage_type = packet[offset]
        and_result = switch_info.value & self.mask
        temp_v = {4: 8, 5: 12, 6: 10, 7: 14}.get(and_result, -1)
        if temp_v == -1:
            return False

        if offset + temp_v > len(packet):
            return False

        specials = self.parse_special_damage_flags(packet[offset:offset + temp_v])
        pdp.setSpecials(specials)
        offset += temp_v

        unknown_info = read_varint(packet, offset)
        if unknown_info.length < 0:
            return False
        pdp.setUnknown = lambda x: None  # 占位
        offset += unknown_info.length

        damage_info = read_varint(packet, offset)
        if damage_info.length < 0:
            return False
        pdp.setDamage(damage_info)
        offset += damage_info.length

        loop_info = read_varint(packet, offset)
        if loop_info.length < 0:
            return False
        pdp.setLoop = lambda x: None  # 占位

        if pdp.getActorId() != pdp.getTargetId():
            self.data_storage.appendDamage(pdp)

        return True

    def parse_dot_packet(self, packet: bytes) -> None:
        offset = 0
        pdp = ParsedDamagePacket()
        pdp.setDot(True)

        packet_length_info = read_varint(packet)
        if packet_length_info.length < 0:
            return
        offset += packet_length_info.length

        if offset + 2 > len(packet) or packet[offset] != 0x05 or packet[offset + 1] != 0x38:
            return
        offset += 2

        target_info = read_varint(packet, offset)
        if target_info.length < 0:
            return
        pdp.setTargetId(target_info)
        offset += target_info.length + 1

        actor_info = read_varint(packet, offset)
        if actor_info.length < 0 or actor_info.value == target_info.value:
            return
        pdp.setActorId(actor_info)
        offset += actor_info.length

        unknown_info = read_varint(packet, offset)
        if unknown_info.length < 0:
            return
        offset += unknown_info.length

        if offset + 4 > len(packet):
            return
        skill_code = parse_uint32_le(packet, offset) // 100
        pdp.setSkillCode(skill_code)
        offset += 4

        damage_info = read_varint(packet, offset)
        if damage_info.length < 0:
            return
        pdp.setDamage(damage_info)

        logger.debug(f"Dot damage: actor={pdp.getActorId()}, target={pdp.getTargetId()}, "
                     f"skill={pdp.getSkillCode1()}, damage={pdp.getDamage()}")
        if pdp.getActorId() != pdp.getTargetId():
            self.data_storage.appendDamage(pdp)

    def parsing_nickname(self, packet: bytes) -> bool:
        offset = 0
        packet_length_info = read_varint(packet)
        if packet_length_info.length < 0:
            return False
        offset += packet_length_info.length

        if offset + 2 > len(packet) or packet[offset] != 0x04 or packet[offset + 1] != 0x8D:
            return False
        offset = 10
        if offset >= len(packet):
            return False

        player_info = read_varint(packet, offset)
        if player_info.length <= 0:
            return False
        offset += player_info.length

        if offset >= len(packet):
            return False

        nickname_length = packet[offset]
        if not (0 <= nickname_length <= 72) or offset + 1 + nickname_length > len(packet):
            return False

        name_bytes = packet[offset + 1:offset + 1 + nickname_length]
        try:
            possible_name = name_bytes.decode('utf-8')
        except UnicodeDecodeError:
            return False

        sanitizedName = sanitize_nickname(possible_name)
        if not sanitizedName:
            return False

        
        self.data_storage.appendNickname(player_info.value, sanitizedName)
        print(f"Detected confirmed nickname: {sanitizedName} ({player_info.value})")
        return True

    def parse_summon_packet(self, packet: bytes) -> bool:
        offset = 0
        
        # 读取包长度
        packet_length_info = read_varint(packet)
        if packet_length_info.length < 0:
            return False
        offset += packet_length_info.length

        # 检查固定头部 0x40 0x36
        if offset + 2 > len(packet) or packet[offset] != 0x40 or packet[offset + 1] != 0x36:
            return False
        offset += 2

        # 读取召唤信息
        summon_info = read_varint(packet, offset)
        if summon_info.length < 0:
            return False
        offset += summon_info.length + 28

        # 读取Mob信息（如果有）
        if len(packet) > offset:
            mob_info = read_varint(packet, offset)
            if mob_info.length < 0:
                return False
            offset += mob_info.length
            
            if len(packet) > offset:
                mob_info2 = read_varint(packet, offset)
                if mob_info2.length < 0:
                    return False
                if mob_info.value == mob_info2.value:
                    logger.debug(f"mid: {summon_info.value}, code: {mob_info.value}")
                    self.data_storage.appendMob(summon_info.value, mob_info.value)
                    # print("[Mob]", self.data_storage.mobStorage)

        # 查找8个0xFF的序列
        key_idx = find_array_index(packet, b"\xff\xff\xff\xff\xff\xff\xff\xff")
        if key_idx == -1:
            return False

        # 从8个0xFF之后开始查找操作码
        after_packet = packet[key_idx + 8:]
        opcode_idx = find_array_index(after_packet, b"\x07\x02\x06")
        if opcode_idx == -1:
            return False

        # 计算实际actorId的位置
        real_offset = key_idx + opcode_idx + 11
        if real_offset + 2 > len(packet):
            return False

        # 解析16位无符号整数（小端序）
        real_actor_id = parse_uint16_le(packet, real_offset)
        
        logger.debug(f"소환몹 맵핑 성공 {real_actor_id},{summon_info.value}")
        self.data_storage.appendSummon(real_actor_id, summon_info.value)
        # print("[Summon]", self.data_storage.summonStorage)
        return True
    
    def parse_broken_length_packet(self, packet: bytes, flag: bool = True) -> None:
        # 检查是否是特殊标记：packet[2] == 0xFF and packet[3] == 0xFF
        if len(packet) < 4 or packet[2] != 0xFF or packet[3] != 0xFF:
            logger.debug(f"Remaining packet buffer: {to_hex(packet)}")
            target = self.data_storage.getCurrentTarget()
            processed = False
            if target is None:
                return

            target_bytes = convert_varint(target)
            damage_keyword = b"\x04\x38" + target_bytes
            dot_keyword = b"\x05\x38" + target_bytes

            damage_idx = find_array_index(packet, damage_keyword)
            dot_idx = find_array_index(packet, dot_keyword)

            idx = -1
            handler = None

            if damage_idx != -1 and dot_idx != -1:
                if damage_idx < dot_idx:
                    idx = damage_idx
                    handler = self.parsing_damage
                else:
                    idx = dot_idx
                    handler = self.parse_dot_packet
            elif damage_idx != -1:
                idx = damage_idx
                handler = self.parsing_damage
            elif dot_idx != -1:
                idx = dot_idx
                handler = self.parse_dot_packet

            if idx != -1 and handler is not None:
                # 从 idx - 1 开始读取 VarInt（即长度字段）
                if idx - 1 >= 0:
                    length_info = read_varint(packet, idx - 1)
                    if length_info.length == 1:  # VarInt 占 1 字节
                        start_idx = idx - 1
                        end_idx = start_idx + length_info.value - 3
                        if 0 <= start_idx < end_idx <= len(packet):
                            extracted = packet[start_idx:end_idx]
                            if handler(extracted):
                                processed = True
                                if end_idx < len(packet):
                                    remaining = packet[end_idx:]
                                    self.parse_broken_length_packet(remaining, False)

            if flag and not processed:
                self.parse_nickname_from_broken_length_packet(packet)
                # parse_loot_attribution_actor_name(packet)
                self.parse_actor_name_binding_rules(packet)
            return

        # 是特殊标记：跳过前 10 字节
        if len(packet) > 10:
            new_packet = packet[10:]
            self.on_packet_received(new_packet)


    def parse_nickname_from_broken_length_packet(self, packet: bytes) -> None:
        # logger.debug(f"Remaining packet {to_hex(packet)}")

        origin_offset = 0
        packet_len = len(packet)

        while origin_offset < packet_len:
            # 尝试读取 VarInt
            try:
                varint_output = read_varint(packet, origin_offset)
                varint_value = varint_output.value
                varint_len = varint_output.length
            except Exception:
                origin_offset += 1
                continue

            if varint_len <= 0:
                origin_offset += 1
                continue

            inner_offset = origin_offset + varint_len
            if inner_offset + 6 > packet_len:
                origin_offset += 1
                continue

            found = False

            # === Pattern 1: 0x01, 0x07 ===
            if packet[inner_offset + 3] == 0x01 and packet[inner_offset + 4] == 0x07:
                name_len = packet[inner_offset + 5]
                end_pos = inner_offset + 6 + name_len
                if 0 < name_len <= 72 and end_pos <= packet_len:
                    name_bytes = packet[inner_offset + 6 : end_pos]
                    try:
                        name_str = name_bytes.decode("utf-8")
                        sanitizedName = sanitize_nickname(name_str)
                        if sanitizedName:
                            print(
                                f"Potential nickname found in pattern 1: {sanitizedName} {varint_value}"
                                f"(hex={to_hex(name_bytes)})"
                            )
                            self.data_storage.appendNickname(varint_value, sanitizedName)
                            found = True
                    except UnicodeDecodeError:
                        pass

            # === Pattern 2: 0x00, 0x07 ===
            if not found and packet[inner_offset + 3] == 0x00 and packet[inner_offset + 4] == 0x07:
                name_len = packet[inner_offset + 5]
                end_pos = inner_offset + 6 + name_len
                if 0 < name_len <= 72 and end_pos <= packet_len:
                    name_bytes = packet[inner_offset + 6 : end_pos]
                    try:
                        name_str = name_bytes.decode("utf-8")
                        if '\p' in name_str:
                            continue
                        sanitizedName = sanitize_nickname(name_str)
                        if sanitizedName:
                            print(
                                f"Potential nickname found in new pattern: {sanitizedName} {varint_value}"
                                f"(hex={to_hex(name_bytes)})"
                            )
                            self.data_storage.appendNickname(varint_value, sanitizedName)
                            found = True
                    except UnicodeDecodeError:
                        pass

            # === Pattern 3: 0x39, 0x8A ===
            if not found and packet[inner_offset + 3] == 0x39 and packet[inner_offset + 4] == 0x8A:
                name_len = packet[inner_offset + 5]
                end_pos = inner_offset + 6 + name_len
                if 0 < name_len <= 72 and end_pos <= packet_len:
                    name_bytes = packet[inner_offset + 6 : end_pos]
                    try:
                        name_str = name_bytes.decode("utf-8")
                        sanitizedName = sanitize_nickname(name_str)
                        if sanitizedName:
                            self.data_storage.appendNickname(varint_value, sanitizedName)
                            self.data_storage.setMainPlayer(sanitizedName)
                            print(
                                f"Potential nickname found in pattern 3: {sanitizedName} {varint_value}"
                                f"(hex={to_hex(name_bytes)})"
                            )
                            return
                    except UnicodeDecodeError:
                        pass

            origin_offset += 1
    
    def register_utf8_nickname(
            self,
            packet: bytes,
            actor_id: int,
            name_start: int,
            name_length: int,

        ) -> bool:
        # 如果 actor_id 已经有昵称，返回 False
        if self.data_storage.nickname_map.get(actor_id) is not None:
            return False

        # 检查名字长度
        if not (1 <= name_length <= 16):
            return False

        name_end = name_start + name_length
        # 检查索引范围
        if name_start < 0 or name_end > len(packet):
            return False

        possible_name_bytes = packet[name_start:name_end]
        try:
            possible_name = possible_name_bytes.decode('utf-8')
        except:
            possible_name = None
        if possible_name is None:
            return False

        sanitized_name = sanitize_nickname(possible_name)
        if sanitized_name is None:
            return False
        
        self.data_storage.appendNickname(actor_id, sanitized_name)
        print(
            f"Potential nickname found in binding rules: {sanitized_name} ({actor_id})"
            f"(hex={to_hex(possible_name_bytes)})"
        )


    def parse_actor_name_binding_rules(self, packet: bytes) -> bool:
        """
        解析字节包中的角色名绑定规则。
        如果找到并成功绑定一个名字，返回 True；否则返回 False。
        """
        i = 0
        last_anchor: Optional[ActorAnchor] = None
        named_actors: Set[int] = set()
        packet_len = len(packet)

        while i < packet_len:
            # 检查 0x36 标记：可能的 actor ID 锚点
            if packet[i] == 0x36:
                # 尝试从 i+1 读取 VarInt
                actor_info = read_varint(packet, i + 1)
                if actor_info is not None:
                    value, length = actor_info.value, actor_info.length
                    if length > 0 and value >= 100:
                        last_anchor = ActorAnchor(
                            actor_id=value,
                            start_index=i,
                            end_index=i + 1 + length
                        )
                    else:
                        last_anchor = None
                else:
                    last_anchor = None
                i += 1
                continue

            # 检查 0x07 标记：可能的 UTF-8 名字
            if packet[i] == 0x07:
                name_info = read_utf8_name(packet, i)
                if name_info is not None:
                    name_start, name_length = name_info
                    if last_anchor is not None and last_anchor.actor_id not in named_actors:
                        distance = i - last_anchor.end_index
                        if distance >= 0:
                            can_bind = self.register_utf8_nickname(
                                packet,
                                last_anchor.actor_id,
                                name_start,
                                name_length,

                            )
                            if can_bind:
                                named_actors.add(last_anchor.actor_id)
                                last_anchor = None
                                return True
                i += 1
                continue

            i += 1

        return False

    def parse_special_damage_flags(self, data: bytes) -> List[str]:
        if len(data) < 10:
            return []
        flag_byte = data[0] & 0xFF
        flags = []
        if flag_byte & 0x01: flags.append(SpecialDamage.BACK)
        if flag_byte & 0x02: flags.append(SpecialDamage.UNKNOWN)
        if flag_byte & 0x04: flags.append(SpecialDamage.PARRY)
        if flag_byte & 0x08: flags.append(SpecialDamage.PERFECT)
        if flag_byte & 0x10: flags.append(SpecialDamage.DOUBLE)
        if flag_byte & 0x20: flags.append(SpecialDamage.ENDURE)
        if flag_byte & 0x40: flags.append(SpecialDamage.UNKNOWN4)
        if flag_byte & 0x80: flags.append(SpecialDamage.POWER_SHARD)
        return flags


