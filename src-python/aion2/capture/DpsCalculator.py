import threading
import time
from typing import TypedDict, List, Optional, Dict
from copy import deepcopy
from aion2.capture.dataStorage import DataStorage, init_special_counter
import json


class SkillStats(TypedDict):
    total_damage: int
    counts: int
    special_counts: Dict[str, int]

class PlayerStats(TypedDict):
    total_damage: int
    counts: int
    special_counts: Dict[str, int]
    skill_stats: Dict[str, SkillStats]

TargetStats = Dict[int, PlayerStats]

CombatStats = Dict[int, TargetStats]


class DpsCalculator():
    def __init__(
            self, 
            data_storage: DataStorage=None, 
            update_delay: int=100, 
            call_back=print
        ):
        self.data_storage = data_storage
        self.update_delay = update_delay
        self.call_back = call_back              # 更新数据后的回调

        # 用来标识是否返回玩家的具体技能数据
        self._return_detailed_skills = False
        # 这个标识用来在process_stats返回哪一个玩家对哪一个目标技能数据
        self.cur_target = None          
        self.cur_player = None
        self.duration = None
        self.is_running = True

        self.stats = None

    def set_cur_target(self, target: int):
        self.cur_target = target

    def set_cur_player(self, cur_player):
        self.cur_player = cur_player

    def set_data_storage(self, data_storage):
        self.data_storage = data_storage

    def get_detailed_skills_stats(self, actor, target, skill, raw_stats):
        """
        用来获得actor对target的技能细节, 如果target是None, 那么是针对所有目标的
        """
        res = {}
        for key, data in raw_stats.items():
            _target, _actor, _skill = key.split('->')
            _target, _actor, _skill = int(_target), int(_actor), int(_skill)
            if target is not None and _target != target:
                continue
            if actor is not None and _actor != actor:
                continue
            if _skill not in res.keys():
                res[_skill] = {
                    "total_damage": 0,
                    "counts": 0,
                    "special_counts": init_special_counter()
                }
            res[_skill]['total_damage'] += data['total_damage']
            res[_skill]['counts'] += data['counts']
            for spe in res[_skill]['special_counts'].keys():
                res[_skill]['special_counts'][spe] += data['special_counts'][spe]
        return res

    def get_overview_stats(self, actor, target, raw_stats):
        """
        用来获取actor对target的总览数据, 如果target是None, 那么是针对所有目标的
        """
        res = {
            "total_damage": 0,
            "counts": 0,
            "special_counts": init_special_counter()
        }
        for key, data in raw_stats.items():
            _target, _actor, _skill = key.split('->')
            _target, _actor, _skill = int(_target), int(_actor), int(_skill)
            if target is not None and _target != target:
                continue
            if actor is not None and _actor != actor:
                continue

            res['total_damage'] += data['total_damage']
            res['counts'] += data['counts']
            for spe in res['special_counts'].keys():
                res['special_counts'][spe] += data['special_counts'][spe]
        return res
    
    def process_data(self):
        if not self.is_running:
            return

        start_time = self.data_storage.getStartTime()
        if start_time is None:
            return
        last_time = self.data_storage.last_damage_time

        try:
            raw_stats = deepcopy(self.data_storage.combat_stats)
        except:
            return

        target_list = deepcopy(self.data_storage.target_list)
        actor_list = deepcopy(self.data_storage.actor_list)
        nickname_map = deepcopy(self.data_storage.nickname_map)
        actor_class_map = deepcopy(self.data_storage.actorClassMap)

        # 每个目标受到每个玩家的总览信息（技能聚合）
        overview_stats = {"total_damage": 0, "counts": 0}
        overview_stats_by_target = {}
        overview_stats_by_target_player = {}
        for target in target_list:
            for actor in actor_list:
                if target not in overview_stats_by_target_player:
                    overview_stats_by_target_player[target] = {}
                if actor not in overview_stats_by_target_player:
                    overview_stats_by_target_player[target][actor] ={}
                tgt_stat = self.get_overview_stats(actor, target, raw_stats)
                overview_stats_by_target_player[target][actor] = tgt_stat

                if target not in overview_stats_by_target:
                    overview_stats_by_target[target] = {"total_damage": 0, "counts": 0}
                overview_stats_by_target[target]['total_damage'] += tgt_stat['total_damage']
                overview_stats_by_target[target]['counts'] += tgt_stat['counts']

                overview_stats['total_damage'] += tgt_stat['total_damage']
                overview_stats['counts'] += tgt_stat['counts']
        

        # 所有目标受到每个玩家的总览信息（按照目标聚合）
        overview_stats_by_player = {}
        for actor in actor_list:
            res = self.get_overview_stats(actor, None, raw_stats)
            overview_stats_by_player[actor] = res
        
        # 每个目标受到每个玩家的技能细节
        detailed_skills_stats_by_tagert_player = {}
        for target in target_list:
            for actor in actor_list:
                if target not in detailed_skills_stats_by_tagert_player:
                    detailed_skills_stats_by_tagert_player[target] = {}
                if actor not in detailed_skills_stats_by_tagert_player:
                    detailed_skills_stats_by_tagert_player[target][actor] ={}
                detailed_skills_stats_by_tagert_player[target][actor] = self.get_detailed_skills_stats(actor, target, None, raw_stats)

        # 所有目标受到每个玩家的技能细节
        detailed_skills_stats_by_actor = {}
        for actor in actor_list:
            detailed_skills_stats_by_actor[actor] = self.get_detailed_skills_stats(actor, None, None, raw_stats)
        
        return {
            "main_player": self.data_storage._main_player,
            "last_target": self.data_storage._last_target,
            "last_target_by_me": self.data_storage._last_target_by_me,
            "target_list": target_list,
            "actort_list": actor_list,
            "target_start_time": self.data_storage.target_start_time,
            "target_last_time": self.data_storage.target_last_time,
            "nickname_map": nickname_map,
            "actor_class_map": actor_class_map,
            "mob_code": self.data_storage.mobStorage,
            "summon_code": self.data_storage.summonStorage,
            "actor_skill_slots": self.data_storage.actorSkillSlots,
            "parsed_skill_code": self.data_storage.parsed_skill_code,
            "duration": time.time() - start_time,
            "running_time": (last_time - start_time)+1e-5,
            "overview_stats": overview_stats, 
            "overview_stats_by_target": overview_stats_by_target,
            "overview_stats_by_target_player":overview_stats_by_target_player,
            "overview_stats_by_player": overview_stats_by_player,
            "detailed_skills_stats_by_tagert_player": detailed_skills_stats_by_tagert_player,
            "detailed_skills_stats_by_actor": detailed_skills_stats_by_actor,
        }





    def run(self):
        while self.is_running:
            time.sleep(self.update_delay/1000)
            self.stats = self.process_data()
            if self.call_back:
                self.call_back(self.stats)
    
    def start(self):
        self.is_running = True
        self.thread = threading.Thread(target=self.run, args=[])
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        self.is_running = False
    
    def reset(self):
        pass
    
    