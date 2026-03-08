from aion2.capture.dataStorage import ParsedDamagePacket


class VarIntOutput:
    def __init__(self, value: int, length: int):
        self.value = value
        self.length = length

    def __repr__(self):
        return f"VarIntOutput(value={self.value}, length={self.length})"
    

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
            return VarIntOutput(-1, -1)
        

def to_hex(data: bytes) -> str:
    return ' '.join(f'{byte:02X}' for byte in data)


def from_hex(hex_str: str) -> bytes:
    """
    将十六进制字符串转换成bytes
    支持格式: "2F 04 38 AD", "2F0438AD", "2f 04 38 ad" 等
    """
    # 移除空格并转换为大写
    hex_str = hex_str.strip().replace(" ", "").upper()
    
    # 确保字符串长度为偶数
    if len(hex_str) % 2 != 0:
        hex_str = "0" + hex_str
    
    # 每两个字符一组转换为字节
    try:
        return bytes(int(hex_str[i:i+2], 16) for i in range(0, len(hex_str), 2))
    except ValueError as e:
        raise ValueError(f"无效的十六进制字符串: {hex_str}") from e


def parse_uint32_le(data: bytes, offset: int) -> int:
    if offset + 4 > len(data):
        raise ValueError("Not enough bytes for uint32")
    return (
        (data[offset] & 0xFF) |
        ((data[offset + 1] & 0xFF) << 8) |
        ((data[offset + 2] & 0xFF) << 16) |
        ((data[offset + 3] & 0xFF) << 24)
    )


def parsing_damage(packet: bytes) -> bool:
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
        print('perfect damage packet', to_hex(packet))
    return True

# hex_str = "30 04 38 AD AA 01 36 04 92 0A 1A BA CB 00 67 02 91 00 33 B2 94 4F 01 00 00 00 C6 8F 01 B3 E8 03 04 82 0A 82 0A 82 0A 82 0A 01 00 8D 18"

# bytes_data = from_hex(hex_str)

# parsing_damage(bytes_data)

out = parsing_damage(from_hex("30 04 38 AD AA 01 36 04 92 0A 1A BA CB 00 A8 03 91 00 33 B2 94 4F 01 00 00 00 C6 8F 01 C0 E3 07 04 B5 14 B5 14 B5 14 B5 14 01 00 8D 18"))
print(out)
