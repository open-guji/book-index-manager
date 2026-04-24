from book_index_manager.id_generator import (
    BookIndexIdGenerator, BookIndexStatus, BookIndexType,
    base36_encode, base36_decode, base58_decode, smart_decode,
)


def test_base36_roundtrip():
    for val in [0, 1, 36, 1000, 999999999]:
        assert base36_decode(base36_encode(val)) == val


def test_base36_only_lowercase():
    """base36 IDs must contain only digits and lowercase letters."""
    gen = BookIndexIdGenerator(machine_id=1)
    for type_val in [BookIndexType.Book, BookIndexType.Collection, BookIndexType.Work, BookIndexType.Entity]:
        for status in [BookIndexStatus.Official, BookIndexStatus.Draft]:
            id_val = gen.next_id(status, type_val)
            id_str = base36_encode(id_val)
            assert id_str == id_str.lower(), f"ID contains uppercase: {id_str}"
            assert all(c in '0123456789abcdefghijklmnopqrstuvwxyz' for c in id_str)


def test_base36_id_length():
    """Official IDs should be <= 12 chars, Draft IDs <= 13 chars."""
    gen = BookIndexIdGenerator(machine_id=1)
    for type_val in [BookIndexType.Book, BookIndexType.Collection, BookIndexType.Work, BookIndexType.Entity]:
        off_id = gen.next_id(BookIndexStatus.Official, type_val)
        off_str = base36_encode(off_id)
        assert len(off_str) <= 12, f"Official ID too long: {off_str} ({len(off_str)})"

        draft_id = gen.next_id(BookIndexStatus.Draft, type_val)
        draft_str = base36_encode(draft_id)
        assert len(draft_str) <= 13, f"Draft ID too long: {draft_str} ({len(draft_str)})"


def test_id_generation():
    gen = BookIndexIdGenerator(machine_id=1)
    id1 = gen.next_id(BookIndexStatus.Draft, BookIndexType.Book)
    id2 = gen.next_id(BookIndexStatus.Draft, BookIndexType.Book)
    assert id1 != id2


def test_id_parse():
    gen = BookIndexIdGenerator(machine_id=42)
    id_val = gen.next_id(BookIndexStatus.Draft, BookIndexType.Work)
    comp = BookIndexIdGenerator.parse(id_val)
    assert comp.status == BookIndexStatus.Draft
    assert comp.type == BookIndexType.Work
    assert comp.machine_id == 42


def test_id_encode_decode():
    gen = BookIndexIdGenerator(machine_id=1)
    id_val = gen.next_id(BookIndexStatus.Official, BookIndexType.Collection)
    id_str = base36_encode(id_val)
    assert base36_decode(id_str) == id_val

    comp = BookIndexIdGenerator.parse(id_val)
    assert comp.status == BookIndexStatus.Official
    assert comp.type == BookIndexType.Collection


def test_smart_decode_base58():
    """smart_decode should auto-detect legacy base58 IDs (contain uppercase)."""
    # A known base58 ID
    old_id = "GYL54TNYYa3"
    val = base58_decode(old_id)
    assert smart_decode(old_id) == val


def test_smart_decode_base36():
    """smart_decode should handle base36 IDs (all lowercase + digits)."""
    gen = BookIndexIdGenerator(machine_id=1)
    id_val = gen.next_id(BookIndexStatus.Draft, BookIndexType.Work)
    id_str = base36_encode(id_val)
    assert smart_decode(id_str) == id_val


def test_entity_type_value():
    """Entity 在 type 枚举里值为 4，与 Book/Collection/Work 区分开。"""
    assert int(BookIndexType.Entity) == 4
    assert int(BookIndexType.Book) == 0
    assert int(BookIndexType.Collection) == 2
    assert int(BookIndexType.Work) == 3


def test_entity_id_roundtrip():
    """Entity ID 可以正确生成、编码、解码、解析回 Entity 类型。"""
    gen = BookIndexIdGenerator(machine_id=7)
    id_val = gen.next_id(BookIndexStatus.Draft, BookIndexType.Entity)
    id_str = base36_encode(id_val)
    assert base36_decode(id_str) == id_val

    comp = BookIndexIdGenerator.parse(id_val)
    assert comp.type == BookIndexType.Entity
    assert comp.status == BookIndexStatus.Draft
    assert comp.machine_id == 7


def test_entity_id_distinct_from_work():
    """同时生成 Entity 和 Work，解析后 type 必须不同。"""
    gen = BookIndexIdGenerator(machine_id=1)
    ent = gen.next_id(BookIndexStatus.Draft, BookIndexType.Entity)
    wrk = gen.next_id(BookIndexStatus.Draft, BookIndexType.Work)
    assert BookIndexIdGenerator.parse(ent).type == BookIndexType.Entity
    assert BookIndexIdGenerator.parse(wrk).type == BookIndexType.Work
    assert ent != wrk


def test_base58_to_base36_migration():
    """Verify that base58 -> base36 conversion preserves the underlying integer."""
    old_ids = ["GYL54TNYYa3", "CX8nkEm1UAB", "FCNcSJbF77V", "aTNoXYramSa"]
    for old_id in old_ids:
        int_val = base58_decode(old_id)
        new_id = base36_encode(int_val)
        assert base36_decode(new_id) == int_val
        # New ID should be all lowercase
        assert new_id == new_id.lower()
