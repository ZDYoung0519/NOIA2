from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass
import re
import traceback
from typing import Callable, Deque, Dict, Iterable, List, Optional, Set, Tuple


NICKNAME_PATTERN = re.compile(r"^[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\u3040-\u309f\u30a0-\u30ff]+$")

# Reconstructed from strings embedded in the binary.
NAME_FIELD_MARKERS = (
    bytes.fromhex("3336"),
    bytes.fromhex("4436"),
    bytes.fromhex("0107"),
    bytes.fromhex("0007"),
    bytes.fromhex("048d"),
    bytes.fromhex("0592"),
)

TRUSTED_OPCODES_FOR_NICKNAME = {
    "0592",
    "048d",
    "2607",
    "3336",
    "0107",
    "4436",
    "d807",
    "broken",
    "398a",
}

NICKNAME_BLACKLIST = {
    "",
    "???",
    "????",
    "0000",
    "00",
}


class BoundedDict(OrderedDict):
    def __init__(self, maxsize: int = 1024) -> None:
        super().__init__()
        self.maxsize = maxsize

    def __setitem__(self, key, value) -> None:
        if key in self:
            super().__delitem__(key)
        super().__setitem__(key, value)
        while len(self) > self.maxsize:
            self.popitem(last=False)


class BoundedSet:
    def __init__(self, maxsize: int = 1024) -> None:
        self.maxsize = maxsize
        self._data: "OrderedDict[str, None]" = OrderedDict()

    def add(self, value: str) -> None:
        if value in self._data:
            del self._data[value]
        self._data[value] = None
        while len(self._data) > self.maxsize:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()

    def __contains__(self, value: object) -> bool:
        return value in self._data

    def __iter__(self):
        return iter(self._data.keys())

    def __len__(self) -> int:
        return len(self._data)


@dataclass
class NickResult:
    player_id: int
    nickname: str
    source: str
    server_id: int = 0
    locked: bool = False


@dataclass
class SelfIdentity:
    entity_id: int
    nickname: str


def _read_le_u16(data: bytes, offset: int) -> Optional[int]:
    if offset < 0 or offset + 2 > len(data):
        return None
    return int.from_bytes(data[offset : offset + 2], "little")


def _read_varint_forward(data: bytes, offset: int) -> Optional[Tuple[int, int]]:
    shift = 0
    value = 0
    pos = offset
    while pos < len(data) and shift <= 35:
        byte = data[pos]
        value |= (byte & 0x7F) << shift
        pos += 1
        if not (byte & 0x80):
            return value, pos - offset
        shift += 7
    return None


def _read_varint_backward(data: bytes, end_pos: int, max_width: int = 5) -> Optional[Tuple[int, int]]:
    start = max(0, end_pos - max_width)
    for pos in range(end_pos - 1, start - 1, -1):
        decoded = _read_varint_forward(data, pos)
        if decoded is None:
            continue
        value, used = decoded
        if pos + used == end_pos:
            return value, used
    return None


def _decode_utf8_ignoring_gaps(raw: bytes) -> str:
    raw = raw.replace(b"\x00", b"")
    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _decode_3336_name(data: bytes, name_field_start: int, name_len: int) -> Tuple[str, int]:
    raw = data[name_field_start : name_field_start + name_len]
    decoded = _decode_utf8_ignoring_gaps(raw).strip()
    return decoded, len(raw)


class NicknameResolver:
    """
    Reconstructed version of engine.nickname_resolver.py.

    This file is rebuilt from binary strings and call signatures, so it should
    be treated as a readable working skeleton rather than exact original source.
    """

    def __init__(self) -> None:
        self.nickname_by_id: BoundedDict = BoundedDict(maxsize=1024)
        self.nickname_by_marker: BoundedDict = BoundedDict(maxsize=1024)
        self.server_id_by_id: BoundedDict = BoundedDict(maxsize=1024)
        self.gear_score_by_id: BoundedDict = BoundedDict(maxsize=1024)
        self.found_nicknames = BoundedSet(maxsize=1024)
        self.known_legion_names: Set[str] = set()
        self.locked_0592: Dict[int, str] = {}

        self.self_entity_id: int = 0
        self.self_nickname: str = ""
        self._pending_self_id: int = 0
        self._self_id_candidates: Dict[int, int] = {}
        self._self_id_threshold: int = 2

        self._log: Deque[str] = deque()
        self._log_max: int = 200

        self.enable_0592 = True
        self.enable_048d = True
        self.enable_2607 = True
        self.enable_3336 = True
        self.enable_0107 = True
        self.enable_4436 = True
        self.enable_d807 = True
        self.enable_broken = True
        self.enable_398a = True

    def _log_msg(self, msg: str) -> None:
        self._log.append(msg)
        while len(self._log) > self._log_max:
            self._log.popleft()

    def is_valid_nickname(self, text: str) -> bool:
        if not text:
            return False
        text = text.strip()
        if text in NICKNAME_BLACKLIST:
            return False
        if not text.isascii() and not NICKNAME_PATTERN.match(text):
            return False
        return len(text) >= 2

    def register(
        self,
        player_id: int,
        nickname: str,
        source: str,
        server_id: int = 0,
        by_actor_id: Optional[Dict[int, object]] = None,
        by_marker: Optional[Dict[str, int]] = None,
        target_nickname: Optional[str] = None,
        target_actor_id_ref: Optional[List[int]] = None,
        pending_summon_by_nick: Optional[Dict[str, int]] = None,
        summon_owner_map: Optional[Dict[int, int]] = None,
        retroactive_merge_fn: Optional[Callable[[int, int], None]] = None,
    ) -> Optional[NickResult]:
        nickname = nickname.strip()
        if not self.is_valid_nickname(nickname):
            return None

        old = self.nickname_by_id.get(player_id)
        if old and old != nickname:
            self._log_msg(f"[NICK-DUP][{source}] '{nickname}' new ID={player_id}, old='{old}'")

        self.nickname_by_id[player_id] = nickname
        self.found_nicknames.add(nickname)
        if server_id:
            self.server_id_by_id[player_id] = server_id

        if target_nickname and target_actor_id_ref is not None and nickname == target_nickname:
            if target_actor_id_ref:
                target_actor_id_ref[0] = player_id

        if pending_summon_by_nick and summon_owner_map and retroactive_merge_fn:
            if nickname in pending_summon_by_nick:
                entity_id = pending_summon_by_nick.pop(nickname)
                old_owner = summon_owner_map.get(entity_id)
                summon_owner_map[entity_id] = player_id
                if old_owner and old_owner != player_id:
                    retroactive_merge_fn(old_owner, player_id)

        return NickResult(
            player_id=player_id,
            nickname=nickname,
            source=source,
            server_id=server_id,
            locked=(source == "0592"),
        )

    def register_by_marker(self, marker: str, nickname: str) -> bool:
        nickname = nickname.strip()
        if not marker or not self.is_valid_nickname(nickname):
            return False
        self.nickname_by_marker[marker] = nickname
        self.found_nicknames.add(nickname)
        return True

    def get_nickname(self, actor_id: int, marker: str = "") -> Optional[str]:
        if actor_id in self.nickname_by_id:
            return self.nickname_by_id[actor_id]
        if marker and marker in self.nickname_by_marker:
            return self.nickname_by_marker[marker]
        return None

    def reset(self, clear_all: bool = False) -> None:
        if clear_all:
            self.nickname_by_id.clear()
            self.nickname_by_marker.clear()
            self.server_id_by_id.clear()
            self.gear_score_by_id.clear()
            self.found_nicknames.clear()
            self.known_legion_names.clear()
            self.locked_0592.clear()
            self._log_msg("[NICK-RESET] complete reset")
            return
        self.self_entity_id = 0
        self.self_nickname = ""
        self._pending_self_id = 0
        self._self_id_candidates.clear()
        self._log_msg(
            f"[NICK-RESET] keep {len(self.nickname_by_id)} id mappings, {len(self.locked_0592)} 0592 locks"
        )

    def reset_self(self) -> None:
        self.self_entity_id = 0
        self.self_nickname = ""
        self._pending_self_id = 0
        self._self_id_candidates.clear()

    def _id_to_possible_marker(
        self,
        by_actor_id: Optional[Dict[int, object]],
        by_marker: Optional[Dict[str, int]],
    ) -> Dict[int, str]:
        result: Dict[int, str] = {}
        if by_marker:
            for marker, actor_id in by_marker.items():
                if isinstance(actor_id, int):
                    result[actor_id] = marker
        return result

    def parse_0592(
        self,
        payload: bytes,
        entity_npc_id: Optional[int] = None,
        target_stats: Optional[object] = None,
        export_report_fn: Optional[Callable[..., None]] = None,
        summon_owner_map: Optional[Dict[int, int]] = None,
        retroactive_merge_fn: Optional[Callable[[int, int], None]] = None,
        register_kwargs: Optional[dict] = None,
    ) -> List[NickResult]:
        """
        Party-event packet, scene actor_id LE16, lock-grade nickname source.
        """
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        by_actor_id = register_kwargs.get("by_actor_id")
        by_marker = register_kwargs.get("by_marker")

        anchor = bytes.fromhex("0592")
        search_idx = 0
        while True:
            anchor_pos = payload.find(anchor, search_idx)
            if anchor_pos < 0:
                break
            search_idx = anchor_pos + 2

            actor_id = _read_le_u16(payload, max(0, anchor_pos - 2))
            if actor_id is None:
                continue

            # Best-effort scan for nearby marker-looking strings.
            marker = ""
            d807_search = payload[max(0, anchor_pos - 64) : anchor_pos + 96]
            for idx in range(0, len(d807_search) - 8):
                candidate = d807_search[idx : idx + 8].hex()
                if candidate.startswith("00") or candidate == "00000000":
                    continue
                marker = candidate
                break

            name = ""
            name_len = 0
            for pos in range(anchor_pos + 2, min(len(payload), anchor_pos + 96)):
                possible_len = payload[pos]
                end = pos + 1 + possible_len
                if possible_len < 2 or end > len(payload):
                    continue
                candidate = _decode_utf8_ignoring_gaps(payload[pos + 1 : end]).strip()
                if self.is_valid_nickname(candidate):
                    name = candidate
                    name_len = possible_len
                    break

            if not name:
                continue

            if marker:
                self.register_by_marker(marker, name)
            self.locked_0592[actor_id] = name
            result = self.register(
                actor_id,
                name,
                "0592",
                by_actor_id=by_actor_id,
                by_marker=by_marker,
                summon_owner_map=summon_owner_map,
                retroactive_merge_fn=retroactive_merge_fn,
                **{k: v for k, v in register_kwargs.items() if k not in {"by_actor_id", "by_marker"}},
            )
            if result:
                results.append(result)
        return results

    def _parse_single_048d(
        self,
        payload: bytes,
        opcode: str,
        register_kwargs: Optional[dict] = None,
        debug_track_nicknames: bool = False,
    ) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        anchor = bytes.fromhex(opcode)
        pos = 0
        while True:
            idx = payload.find(anchor, pos)
            if idx < 0:
                break
            pos = idx + 2

            aid_info = _read_varint_forward(payload, idx + 10)
            if not aid_info:
                continue
            actor_id, aid_len = aid_info
            name_len_pos = idx + 10 + aid_len
            if name_len_pos >= len(payload):
                continue
            name_len = payload[name_len_pos]
            name_start = name_len_pos + 1
            name_end = name_start + name_len
            if name_end > len(payload):
                continue

            nickname = _decode_utf8_ignoring_gaps(payload[name_start:name_end]).strip()
            if not self.is_valid_nickname(nickname):
                continue

            result = self.register(actor_id, nickname, opcode, **register_kwargs)
            if result:
                results.append(result)
        return results

    def parse_048d(
        self,
        payload: bytes,
        entity_npc_id: Optional[int] = None,
        target_stats: Optional[object] = None,
        export_report_fn: Optional[Callable[..., None]] = None,
        summon_owner_map: Optional[Dict[int, int]] = None,
        retroactive_merge_fn: Optional[Callable[[int, int], None]] = None,
        register_kwargs: Optional[dict] = None,
    ) -> List[NickResult]:
        return self._parse_single_048d(payload, "048d", register_kwargs)

    def parse_2607(self, payload: bytes, register_kwargs: Optional[dict] = None, debug_track_nicknames: bool = False) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        anchor = bytes.fromhex("2607")
        pos = 0
        while True:
            idx = payload.find(anchor, pos)
            if idx < 0:
                break
            pos = idx + 2
            aid_info = _read_varint_forward(payload, idx + 2)
            if not aid_info:
                continue
            actor_id, aid_len = aid_info
            marker_pos = idx + 2 + aid_len
            marker = payload[marker_pos : marker_pos + 8].hex()
            name_len_pos = marker_pos + 8
            if name_len_pos >= len(payload):
                continue
            name_len = payload[name_len_pos]
            name_start = name_len_pos + 1
            name_end = name_start + name_len
            nickname = _decode_utf8_ignoring_gaps(payload[name_start:name_end]).strip()
            if not self.is_valid_nickname(nickname):
                continue
            if marker:
                self.register_by_marker(marker, nickname)
            result = self.register(actor_id, nickname, "2607", **register_kwargs)
            if result:
                results.append(result)
        return results

    def parse_3336(self, payload: bytes, register_kwargs: Optional[dict] = None) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        anchor = bytes.fromhex("3336")
        pos = 0
        while True:
            idx = payload.find(anchor, pos)
            if idx < 0:
                break
            pos = idx + 2
            aid_info = _read_varint_forward(payload, idx + 2)
            if not aid_info:
                continue
            actor_id, aid_len = aid_info
            name_len_pos = idx + 2 + aid_len
            if name_len_pos >= len(payload):
                continue
            name_len = payload[name_len_pos]
            if name_len < 2:
                continue
            name_start = name_len_pos + 1
            nickname, _ = _decode_3336_name(payload, name_start, name_len)
            if not self.is_valid_nickname(nickname):
                continue
            result = self.register(actor_id, nickname, "3336", **register_kwargs)
            if result:
                results.append(result)
        return results

    def _extract_player_id_before_0107(self, payload: bytes, pos_0107: int) -> Optional[Tuple[int, int]]:
        return _read_varint_backward(payload, pos_0107)

    def parse_0107(self, payload: bytes, register_kwargs: Optional[dict] = None) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        for marker_hex in ("0107", "0007"):
            marker = bytes.fromhex(marker_hex)
            pos = 0
            while True:
                idx = payload.find(marker, pos)
                if idx < 0:
                    break
                pos = idx + 2
                aid_info = self._extract_player_id_before_0107(payload, idx)
                if not aid_info:
                    continue
                actor_id, _ = aid_info
                name_len_pos = idx + 2
                if name_len_pos >= len(payload):
                    continue
                name_len = payload[name_len_pos]
                name_start = name_len_pos + 1
                name_end = name_start + name_len
                nickname = _decode_utf8_ignoring_gaps(payload[name_start:name_end]).strip()
                if not self.is_valid_nickname(nickname):
                    continue
                result = self.register(actor_id, nickname, "0107", **register_kwargs)
                if result:
                    results.append(result)
        return results

    def parse_4436(self, payload: bytes, register_kwargs: Optional[dict] = None) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        anchor = bytes.fromhex("4436")
        pos = 0
        while True:
            idx = payload.find(anchor, pos)
            if idx < 0:
                break
            pos = idx + 2
            aid_info = _read_varint_forward(payload, idx + 2)
            if not aid_info:
                continue
            actor_id, aid_len = aid_info
            gap_start = idx + 2 + aid_len
            scan_to = min(len(payload), gap_start + 64)
            name = ""
            server_id = 0
            for cursor in range(gap_start, scan_to):
                name_len = payload[cursor]
                name_start = cursor + 1
                name_end = name_start + name_len
                if name_len < 2 or name_end > len(payload):
                    continue
                candidate = _decode_utf8_ignoring_gaps(payload[name_start:name_end]).strip()
                if self.is_valid_nickname(candidate):
                    name = candidate
                    sid_info = _read_varint_forward(payload, max(gap_start, cursor - 5))
                    if sid_info:
                        server_id = sid_info[0]
                    break
            if not name:
                continue
            result = self.register(actor_id, name, "4436", server_id=server_id, **register_kwargs)
            if result:
                results.append(result)
        return results

    def _extract_player_id_before_d807(self, payload: bytes, d807_pos: int) -> Optional[Tuple[int, int]]:
        return _read_varint_backward(payload, d807_pos)

    def _try_link_d807_to_marker(self, payload: bytes, d807_pos: int, nickname: str) -> Optional[str]:
        search_start = max(0, d807_pos - 48)
        search_area = payload[search_start : d807_pos + 16]
        for actor in range(0, max(0, len(search_area) - 8)):
            marker_bytes = search_area[actor : actor + 8]
            marker_hex = marker_bytes.hex()
            if marker_hex.startswith("00") or marker_hex == "00000000":
                continue
            self.register_by_marker(marker_hex, nickname)
            return marker_hex
        return None

    def parse_d807(self, payload: bytes, register_kwargs: Optional[dict] = None) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        anchor = bytes.fromhex("d807")
        pos = 0
        while True:
            d807_pos = payload.find(anchor, pos)
            if d807_pos < 0:
                break
            pos = d807_pos + 2
            aid_info = self._extract_player_id_before_d807(payload, d807_pos)
            if not aid_info:
                continue
            actor_id, _ = aid_info
            name_len_pos = d807_pos + 2
            if name_len_pos >= len(payload):
                continue
            name_len = payload[name_len_pos]
            name_start = name_len_pos + 1
            name_end = name_start + name_len
            nickname = _decode_utf8_ignoring_gaps(payload[name_start:name_end]).strip()
            if not self.is_valid_nickname(nickname):
                continue
            self._try_link_d807_to_marker(payload, d807_pos, nickname)
            result = self.register(actor_id, nickname, "d807", **register_kwargs)
            if result:
                results.append(result)
        return results

    def parse_broken(self, payload: bytes, register_kwargs: Optional[dict] = None) -> List[NickResult]:
        results: List[NickResult] = []
        register_kwargs = register_kwargs or {}
        scan_limit = min(len(payload), 256)
        for origin_offset in range(scan_limit):
            info = _read_varint_forward(payload, origin_offset)
            if not info:
                continue
            actor_id, used = info
            inner_offset = origin_offset + used
            if inner_offset >= len(payload):
                continue
            possible_length = payload[inner_offset]
            possible_bytes = payload[inner_offset + 1 : inner_offset + 1 + possible_length]
            nickname = _decode_utf8_ignoring_gaps(possible_bytes).strip()
            if not self.is_valid_nickname(nickname):
                continue
            result = self.register(actor_id, nickname, "broken", **register_kwargs)
            if result:
                results.append(result)
        return results

    def parse_398a(self, payload: bytes) -> Optional[SelfIdentity]:
        marker_398a = bytes.fromhex("398a")
        search_start = payload.find(marker_398a)
        if search_start < 0:
            return None

        pos = search_start + 2
        if pos >= len(payload):
            return None
        nick_len = payload[pos]
        nick_end = pos + 1 + nick_len
        nickname = _decode_utf8_ignoring_gaps(payload[pos + 1 : nick_end]).strip()
        if not self.is_valid_nickname(nickname):
            return None

        marker_008d = bytes.fromhex("008d")
        scan_start = max(0, nick_end - 8)
        scan_pos = payload.find(marker_008d, scan_start)
        entity_id = 0
        if scan_pos >= 0:
            eid_off = scan_pos + 2
            eid_info = _read_varint_forward(payload, eid_off)
            if eid_info:
                entity_id = eid_info[0]

        self.self_nickname = nickname
        if entity_id:
            self.self_entity_id = entity_id
        return SelfIdentity(entity_id=entity_id, nickname=nickname)

    def try_resolve_self_from_008d(self, payload: bytes) -> bool:
        marker_008d = bytes.fromhex("008d")
        scan_pos = payload.find(marker_008d)
        if scan_pos < 0 or not self.self_nickname:
            return False
        eid_off = scan_pos + 2
        eid_info = _read_varint_forward(payload, eid_off)
        if not eid_info:
            return False
        self.self_entity_id = eid_info[0]
        return True

    def parse_008d_hp(
        self,
        payload: bytes,
        entity_npc_id: Optional[int] = None,
        target_stats: Optional[object] = None,
        export_report_fn: Optional[Callable[..., None]] = None,
    ) -> None:
        # Present in the binary, but its output is consumed by core/boss tracking.
        return None

    def debug_track_nickname(self, payload: bytes, track_name: str) -> str:
        target_bytes = track_name.encode("utf-8", errors="ignore")
        idx = payload.find(target_bytes)
        if idx < 0:
            return ""
        context_start = max(0, idx - 32)
        context_end = min(len(payload), idx + len(target_bytes) + 32)
        return payload[context_start:context_end].hex()


__all__ = [
    "BoundedDict",
    "BoundedSet",
    "NickResult",
    "SelfIdentity",
    "NicknameResolver",
]
