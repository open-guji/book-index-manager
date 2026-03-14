from book_index_manager.id_generator import (
    BookIndexIdGenerator, BookIndexStatus, BookIndexType,
    base58_encode, base58_decode,
)


def test_base58_roundtrip():
    for val in [0, 1, 58, 1000, 999999999]:
        assert base58_decode(base58_encode(val)) == val


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
    id_str = base58_encode(id_val)
    assert base58_decode(id_str) == id_val

    comp = BookIndexIdGenerator.parse(id_val)
    assert comp.status == BookIndexStatus.Official
    assert comp.type == BookIndexType.Collection
