import time
from enum import IntEnum
from dataclasses import dataclass

class BookIndexStatus(IntEnum):
    Official = 0
    Draft = 1

class BookIndexType(IntEnum):
    Book = 0
    Reserved1 = 1
    Collection = 2
    Work = 3
    Reserved4 = 4
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
    ID Layout (64 bits):
    [0] Sign (1 bit): Fixed to 0
    [1] Status (1 bit): 0=Official, 1=Draft
    [2-4] Type (3 bits): 0=Book, 2=Collection, 3=Work, etc.
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
        self.last_timestamp = -1
        self.last_status = None
        self.sequence = 0

    def next_id(self, status: BookIndexStatus, type: BookIndexType) -> int:
        timestamp = self._get_current_timestamp(status)

        if timestamp < self.last_timestamp and status == self.last_status:
            raise RuntimeError("Clock moved backwards. Refusing to generate ID.")

        if timestamp == self.last_timestamp and status == self.last_status:
            self.sequence = (self.sequence + 1) & self.MASK_SEQUENCE
            if self.sequence == 0:
                timestamp = self._til_next_unit(self.last_timestamp, status)
        else:
            self.sequence = 0

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

# Base58 implementation
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def base58_encode(num: int) -> str:
    if num == 0:
        return ALPHABET[0]
    res = ""
    while num > 0:
        num, rem = divmod(num, 58)
        res = ALPHABET[rem] + res
    return res

def base58_decode(s: str) -> int:
    num = 0
    for char in s:
        num = num * 58 + ALPHABET.index(char)
    return num
