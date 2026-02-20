import json
from types import SimpleNamespace

def load_config(json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return json2obj(data)

def json2obj(data):
    if isinstance(data, dict):
        # 将字典的键值对转换为 SimpleNamespace
        # 递归处理值
        ns = SimpleNamespace()
        for key, value in data.items():
            setattr(ns, key, json2obj(value))
        return ns
    elif isinstance(data, list):
        # 递归处理列表中的元素
        return [json2obj(item) for item in data]
    else:
        # 基本类型直接返回
        return data


cfg = load_config('config.json')
