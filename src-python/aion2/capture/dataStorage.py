# data_storage.py
import bisect
import time
from typing import List, Dict, Optional
from copy import deepcopy
import logging
import json

logger = logging.getLogger("DataStorage")

class SpecialDamage:
    BACK = "BACK"
    UNKNOWN = "UNKNOWN"
    PARRY = "PARRY"
    PERFECT = "PERFECT"
    DOUBLE = "DOUBLE"
    ENDURE = "ENDURE"
    UNKNOWN4 = "UNKNOWN4"
    POWER_SHARD = "POWER_SHARD"
    CRITICAL = "CRITICAL"

def init_special_counter():
    counter = {
        getattr(SpecialDamage, attr): 0
        for attr in dir(SpecialDamage)
        if not attr.startswith('_') and isinstance(getattr(SpecialDamage, attr), str)}
    return counter

class VarIntOutput:
    def __init__(self, value: int, length: int):
        self.value = value
        self.length = length

    def __repr__(self):
        return f"VarIntOutput(value={self.value}, length={self.length})"

class ParsedDamagePacket:
    def __init__(self):
        self._dot = False
        self._target_id = None
        self._actor_id = None
        self._skill_code = 0
        self._damage = None
        self._specials: List[str] = []
        # 其他字段略（按需添加）

    def setDot(self, is_dot: bool): self._dot = is_dot
    def setTargetId(self, v: VarIntOutput): self._target_id = v
    def setActorId(self, v: VarIntOutput): self._actor_id = v
    def setSkillCode(self, code: int): self._skill_code = code
    def setDamage(self, v: VarIntOutput): self._damage = v
    def setSpecials(self, flags: List[str]): self._specials = flags
    def setType(self, type): self.type = type

    def getDot(self) -> bool: return self._dot
    def getTargetId(self) -> Optional[int]: return self._target_id.value if self._target_id else None
    def getActorId(self) -> Optional[int]: return self._actor_id.value if self._actor_id else None
    def getSkillCode1(self) -> int: return self._skill_code
    def getDamage(self) -> Optional[int]: return self._damage.value if self._damage else None
    def getSpecials(self) -> List[str]: return self._specials
    def isCrit(self):
        return hasattr(self, 'type') and self.type == 3 
    
    def __str__(self):
        return f"target: {self._target_id.value}, actor: {self._actor_id.value}, damage: {self._damage.value}, skill: {self._skill_code}, {self._specials}, dot: {self._dot}"
    def to_websocket_msg(self):
        return {
            'type': 'dps:data',
            'data': {
                'target': self._target_id.value,
                'actor': self._actor_id.value,
                'damage': self._damage.value,
                'skill': self._skill_code,
                'specials': self._specials,
                'isdot': self._dot
            }
        }

from typing import TypedDict, List, Optional, Dict
class SkillStats(TypedDict):
    total_damage: int
    counts: int
    special_counts: Dict[str, int]

class DataStorage:
    def __init__(self):
        self.combat_stats: Dict[str, SkillStats] = {}
        self.target_list = []           # 收到伤害的目标列表
        self.actor_list = []           # 造成伤害的玩家名字
        self._main_player = None           # 主玩家名称
        self._last_target = None        # 最近受到伤害的目标
        self._last_target_by_me = None  # 我造成伤害的最近目标
        self.nickname_map: Dict[int, str] = {}  # 玩家id->玩家名称的映射表
        self.mobStorage = {}
        self.summonStorage = {}
        self.mobCodeData = {}
        self.pendingNicknameStorage = {}

        self.actorClassMap = {}
        self.actorSkillSlots = {}

        self.start_time = None
        self.last_damage_time = None

        with open('./data/skill_code.json', 'r', encoding='utf-8') as f:
            self.skill_code = json.load(f)
        self.parsed_skill_code = {}
        self.failed_skill_code = {}
    
    def getStartTime(self):
        return self.start_time

    def getCurrentTarget(self) -> int:
        return self._last_target

    def appendDamage(self, pdp: ParsedDamagePacket):
        if self.start_time is None:
            self.start_time = time.time()

        self.last_damage_time = time.time()
        
        if not hasattr(self, 'combat_stats') or self.combat_stats is None:
            self.combat_stats = {}

        dot = pdp.getDot()
        target_id = pdp.getTargetId()
        actor_id = pdp.getActorId()
        skill_code = pdp.getSkillCode1()
        damage = pdp.getDamage()
        specials =  pdp.getSpecials()
        isCrit = pdp.isCrit()
        if isCrit:
            specials.append(SpecialDamage.CRITICAL)

        self._last_target = target_id

        actor_name = self.nickname_map.get(actor_id, None)

        if actor_name and self._main_player is not None and self._main_player == actor_name:
            self._last_target_by_me = target_id
        
        logger.debug(f"Damage: actor={actor_id}, target={target_id}, skill={skill_code}, damage={damage}, specials={specials}, dot={dot}")

        key = f"{target_id}->{actor_id}->{skill_code}"
        if not key in self.combat_stats:
            self.combat_stats[key] = {
                'total_damage': 0,
                'counts': 0,
                'special_counts': init_special_counter()
            }
        self.combat_stats[key]['total_damage'] += damage
        self.combat_stats[key]['counts'] += 1
        for spe in specials:
            self.combat_stats[key]['special_counts'][spe] += 1
        
        if not actor_id in self.actor_list:
            self.actor_list.append(actor_id)

        if not target_id in self.target_list:
            self.target_list.append(target_id)
        
        original_code = self.inferOriginalSkillCode(skill_code)
        if original_code:
            if skill_code not in self.parsed_skill_code:
                self.parsed_skill_code[skill_code] = original_code
            actor_class = self.inferActorClass(original_code)
            if actor_class:
                self.actorClassMap[actor_id] = actor_class


            skill_speciality = self.parse_specialty_slots(skill_code)
            if not actor_id in self.actorSkillSlots:
                self.actorSkillSlots[actor_id] = {}
            self.actorSkillSlots[actor_id][original_code] = skill_speciality
        else:
            self.failed_skill_code[skill_code] = -1
            print(f"Debug: Falied inferred original skill code: {skill_code}, damage: {damage}, actor={actor_id}, target={target_id}")        
        
    def appendMobCode(self, code, name):
        self.mobCodeData[code] = name

    def appendMob(self, mid: int, code: int):
        # 实例id -> 类型id
        self.mobStorage[mid] = code
    
    def appendSummon(self, summoner: int, summon: int):
        # 召唤物id -> 召唤者id
        self.summonStorage[summon] = summoner        
    
    def reset(self):
        self.actor_list = []
        self.target_list = []
        self.start_time = None
        if hasattr(self, 'combat_stats'):
            del self.combat_stats

    def appendNickname(self, actor_id: int, name: str) -> None:
        self.nickname_map[actor_id] = name
        # print('[Actor-name] {}: {}'.format(actor_id, name))
    
    def setMainPlayer(self, name):
        self._main_player = name

    def cache_pending_nickname(self, actor_id: int, name: str) -> None:
        self.pendingNicknameStorage[actor_id] = name
        # print('[Actor-name(chache)] {}: {}'.format(actor_id, name))
    
    def get_nickname(self) -> Dict[int, str]:
        return self.nickname_map
    
    def get_actor_data(self) -> Dict[int, any]:
        raise self.actor_list
    
    def get_boss_mode_data(self) -> Dict[int, any]:
        raise self.target_list
    
    def get_summon_data(self) -> Dict[int, any]:
        raise self.summonStorage
    
    def inferOriginalSkillCode(self, code:int):
        # possible_offsets = self.skill_code['possibleOffsets']
        # skill_codes = self.skill_code['skillCodes']
        # sorted_skill_codes = sorted(skill_codes)
        
        # for offset in possible_offsets:
        #     possible_origin = code - offset
            
        #     # Python 二分查找：返回插入位置，如果存在则在该位置
        #     pos = bisect.bisect_left(sorted_skill_codes, possible_origin)
            
        #     # 检查是否找到（pos 在范围内且值匹配）
        #     if pos < len(sorted_skill_codes) and sorted_skill_codes[pos] == possible_origin:

        #         return possible_origin

        # return None

        return str(code)[:4] + "0000"

    def parse_specialty_slots(self, skill_id: int) -> list[int]:
        last_4_digits = skill_id % 10000
        # 提取各个位上的数字: [S1][S2][S3]0
        slot_1 = (last_4_digits // 1000) % 10  # 千位
        slot_2 = (last_4_digits // 100) % 10   # 百位
        slot_3 = (last_4_digits // 10) % 10    # 十位

        slots = []
        if slot_1 > 0:
            slots.append(slot_1)
        if slot_2 > 0:
            slots.append(slot_2)
        if slot_3 > 0:
            slots.append(slot_3)
        return sorted(slots)  # 返回排序后的列表
    
    def inferActorClass(self, skill_code: int) -> str:
        skill_map = {
            11020000: "GLADIATOR",
            12010000: "TEMPLAR",
            14340000: "RANGER",
            13010000: "ASSASSIN",
            15210000: "SORCERER",  # 마도 확인 필요함
            17010000: "CLERIC",
            16010000: "ELEMENTALIST",
            18010000: "CHANTER"
        }        
        return skill_map.get(int(skill_code), None)

