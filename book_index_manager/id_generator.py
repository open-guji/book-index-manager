import time
from enum import IntEnum
from dataclasses import dataclass

class BookIndexStatus(IntEnum):
    Official = 0
    Draft = 1

class BookIndexType(IntEnum):
    # 0-3: 实体书目
    Book = 0
    Reserved1 = 1
    Collection = 2
    Work = 3
    # 4-7: 抽象概念（人物/地名/朝代等）
    Entity = 4
    Reserved5 = 5
    Reserved6 = 6
    Reserved7 = 7

@dataclass
class BookIndexIdComponents:
    status: BookIndexStatus
    timestamp: int
    type: BookIndexType
    machine_id: int
    sequence: int

class BookIndexIdGenerator:
    """
    规范定义见 book-index 仓根目录 SCHEMA.md「ID 类型编码」一节。

    ID Layout (64 bits):
    [0] Sign (1 bit): Fixed to 0
    [1] Status (1 bit): 0=Official, 1=Draft
    [2-4] Type (3 bits): 0=Book, 2=Collection, 3=Work, 4=Entity, etc.
    [5-44] Timestamp (40 bits): Draft(ms), Official(s)
    [45-55] Machine ID (11 bits): Up to 2048 nodes
    [56-63] Sequence (8 bits): 256 per time unit
    """

    SHIFT_STATUS = 62
    SHIFT_TYPE = 59
    SHIFT_TIMESTAMP = 19
    SHIFT_MACHINE = 8

    MASK_TIMESTAMP = (1 << 40) - 1
    MASK_TYPE = (1 << 3) - 1
    MASK_MACHINE = (1 << 11) - 1
    MASK_SEQUENCE = (1 << 8) - 1

    def __init__(self, machine_id: int):
        if not (0 <= machine_id <= 2047):
            raise ValueError("Machine ID must be between 0 and 2047")
        self.machine_id = machine_id
        # **每個 status 各記一份 (last_timestamp, sequence)**。
        # 舊制以單一 last_status 判之，兩個 status 交替生成時，
        # 每次切換都走 else 分支把 sequence 歸零而 timestamp 未推進——
        # 於是同一時間單位內先後生成之兩個同 status id 完全相同。
        # official 之時間戳是**秒**級（見 _get_current_timestamp），
        # 一秒之內只要穿插過一次 draft id 之生成，下一個 official id 即與前一個相撞。
        # 2026-08-24 隋唐升格 3,824 條踩到：撞號九組十八條，
        # 後升者覆蓋先升者，production 憑空少了九條而無人知
        # （promotions.json 之映射亦二對一）。漢代那輪已中一組（《風角注》）而未發覺。
        self._state = {}          # status -> [last_timestamp, sequence]

    def next_id(self, status: BookIndexStatus, type: BookIndexType) -> int:
        timestamp = self._get_current_timestamp(status)
        last_timestamp, sequence = self._state.get(status, (-1, 0))

        if timestamp < last_timestamp:
            raise RuntimeError("Clock moved backwards. Refusing to generate ID.")

        if timestamp == last_timestamp:
            sequence = (sequence + 1) & self.MASK_SEQUENCE
            if sequence == 0:
                timestamp = self._til_next_unit(last_timestamp, status)
        else:
            sequence = 0

        self._state[status] = (timestamp, sequence)
        self.sequence = sequence          # 兼容舊有讀此欄者
        self.last_timestamp = timestamp
        self.last_status = status

        return (
            (int(status) << self.SHIFT_STATUS) |
            (int(type) << self.SHIFT_TYPE) |
            ((timestamp & self.MASK_TIMESTAMP) << self.SHIFT_TIMESTAMP) |
            (self.machine_id << self.SHIFT_MACHINE) |
            self.sequence
        )

    def _get_current_timestamp(self, status: BookIndexStatus) -> int:
        now_ms = int(time.time() * 1000)
        if status == BookIndexStatus.Draft:
            return now_ms
        else:
            return now_ms // 1000

    def _til_next_unit(self, last_timestamp: int, status: BookIndexStatus) -> int:
        timestamp = self._get_current_timestamp(status)
        while timestamp <= last_timestamp:
            timestamp = self._get_current_timestamp(status)
        return timestamp

    @classmethod
    def parse(cls, id_val: int) -> BookIndexIdComponents:
        status = BookIndexStatus((id_val >> cls.SHIFT_STATUS) & 1)
        type_val = BookIndexType((id_val >> cls.SHIFT_TYPE) & cls.MASK_TYPE)
        timestamp = (id_val >> cls.SHIFT_TIMESTAMP) & cls.MASK_TIMESTAMP
        machine_id = (id_val >> cls.SHIFT_MACHINE) & cls.MASK_MACHINE
        sequence = id_val & cls.MASK_SEQUENCE

        return BookIndexIdComponents(
            status=status,
            type=type_val,
            timestamp=timestamp,
            machine_id=machine_id,
            sequence=sequence
        )

    @classmethod
    def to_datetime(cls, id_val: int):
        from datetime import datetime
        components = cls.parse(id_val)

        MOD = 1 << 40
        now = time.time()

        if components.status == BookIndexStatus.Draft:
            now_ms = int(now * 1000)
            full_ts_ms = now_ms - ((now_ms - components.timestamp) % MOD)
            return datetime.fromtimestamp(full_ts_ms / 1000.0)
        else:
            now_s = int(now)
            full_ts_s = now_s - ((now_s - components.timestamp) % MOD)
            return datetime.fromtimestamp(full_ts_s)

# Base36 implementation (case-insensitive safe: digits + lowercase only)
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

def base36_encode(num: int) -> str:
    if num == 0:
        return ALPHABET[0]
    res = ""
    while num > 0:
        num, rem = divmod(num, 36)
        res = ALPHABET[rem] + res
    return res

def base36_decode(s: str) -> int:
    num = 0
    for char in s:
        num = num * 36 + ALPHABET.index(char)
    return num

# Legacy base58 support (for migration / backward compatibility)
_ALPHABET_58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def base58_decode(s: str) -> int:
    """Decode a legacy base58-encoded ID string."""
    num = 0
    for char in s:
        num = num * 58 + _ALPHABET_58.index(char)
    return num

def smart_decode(s: str) -> int:
    """Auto-detect base58 or base36 and decode."""
    if any(c.isupper() for c in s):
        return base58_decode(s)
    return base36_decode(s)

# Aliases for backward compatibility
encode_id = base36_encode
decode_id = base36_decode
