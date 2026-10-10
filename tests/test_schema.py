from book_index_manager.schema import ResourceEntry, extract_id_from_url, CoverageInfo


def test_extract_id_from_url():
    assert extract_id_from_url("https://zh.wikisource.org/wiki/test") == "wikisource"
    assert extract_id_from_url("https://www.shidianguji.com/book/123") == "shidianguji"
    assert extract_id_from_url("https://archive.org/details/test") == "archive"
    assert extract_id_from_url("https://ctext.org/wiki.pl?res=123") == "ctext"
    assert extract_id_from_url("https://read.nlc.cn/something") == "nlc"
    assert extract_id_from_url("") == ""


def test_resource_entry_to_dict_minimal():
    r = ResourceEntry(id="wikisource", name="维基文库", url="https://zh.wikisource.org/wiki/test", type="text")
    d = r.to_dict()
    assert d["id"] == "wikisource"
    assert d["name"] == "维基文库"
    assert d["types"] == ["text"]
    assert "type" not in d  # 不再写单值 type
    assert "root_type" not in d  # catalog is default, omitted
    assert "structure" not in d
    assert "coverage" not in d


def test_resource_entry_to_dict_full():
    r = ResourceEntry(
        id="archive",
        name="Internet Archive",
        url="https://archive.org/details/test",
        type="image",
        root_type="search",
        structure=["册"],
        coverage=CoverageInfo(level=1, ranges="3-4"),
        details="彩色",
    )
    d = r.to_dict()
    assert d["root_type"] == "search"
    assert d["structure"] == ["册"]
    assert d["coverage"] == {"level": 1, "ranges": "3-4"}
    assert d["details"] == "彩色"


def test_resource_entry_physical_no_url():
    r = ResourceEntry(id="pku-lib", name="北京大学图书馆", type="physical")
    d = r.to_dict()
    assert "url" not in d


def test_resource_entry_from_dict():
    d = {"id": "wikisource", "name": "维基文库", "url": "https://example.com", "type": "text"}
    r = ResourceEntry.from_dict(d)
    assert r.id == "wikisource"
    assert r.root_type == "catalog"


def test_resource_entry_validate():
    r = ResourceEntry(id="test", name="", type="text", url="https://example.com")
    errors = r.validate()
    assert any("name" in e for e in errors)

    r2 = ResourceEntry(id="test", name="Test", type="invalid")
    errors2 = r2.validate()
    assert any("type" in e for e in errors2)

    r3 = ResourceEntry(id="test", name="Test", type="text", url="")
    errors3 = r3.validate()
    assert any("url" in e for e in errors3)

    r4 = ResourceEntry(id="test", name="Test", type="physical")
    assert r4.validate() == []


def test_resource_entry_to_dict_splits_text_plus_image():
    r = ResourceEntry(id="x", name="X", url="https://example.com", type="text+image")
    d = r.to_dict()
    assert d["types"] == ["text", "image"]
    assert "type" not in d


def test_resource_entry_to_dict_prefers_types_and_defaults():
    d = ResourceEntry(id="x", name="X", url="https://e.com", types=["image", "annotated"]).to_dict()
    assert d["types"] == ["image", "annotated"]
    assert "type" not in d
    # 什么都没给：默认 text，同样写 types
    d2 = ResourceEntry(id="x", name="X", url="https://e.com").to_dict()
    assert d2["types"] == ["text"] and "type" not in d2


def test_types_closed_set_accepts_catalog_and_annotated():
    from book_index_manager.schema import normalize_resource_types, VALID_TYPE_ATOMS
    assert VALID_TYPE_ATOMS == {"text", "image", "physical", "catalog", "annotated"}
    assert normalize_resource_types({"types": ["catalog", "annotated"]}) == ["catalog", "annotated"]
    assert normalize_resource_types({"type": "text+image"}) == ["text", "image"]  # 读侧回退保留
    assert normalize_resource_types({"type": "bogus"}) == []
    assert ResourceEntry(id="c", name="C", url="https://e.com", types=["catalog"]).validate() == []
