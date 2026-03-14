from book_index_manager.migration import migrate_metadata, migrate_old_resource


def test_migrate_old_resource_text():
    old = {"title": "维基文库", "url": "https://zh.wikisource.org/wiki/test"}
    result = migrate_old_resource(old, "text")
    assert result["type"] == "text"
    assert result["name"] == "维基文库"
    assert result["id"] == "wikisource"


def test_migrate_old_resource_image():
    old = {"title": "Internet Archive", "url": "https://archive.org/details/test", "details": "彩色"}
    result = migrate_old_resource(old, "image")
    assert result["type"] == "image"
    assert result["id"] == "archive"
    assert result["details"] == "彩色"


def test_migrate_metadata_converts():
    metadata = {
        "id": "test123",
        "title": "测试",
        "text_resources": [
            {"title": "维基文库", "url": "https://zh.wikisource.org/wiki/test"}
        ],
        "image_resources": [
            {"title": "Internet Archive", "url": "https://archive.org/details/test"}
        ],
    }
    result, changed = migrate_metadata(metadata)
    assert changed is True
    assert "text_resources" not in result
    assert "image_resources" not in result
    assert len(result["resources"]) == 2
    assert result["resources"][0]["type"] == "text"
    assert result["resources"][1]["type"] == "image"


def test_migrate_metadata_no_old_fields():
    metadata = {
        "id": "test123",
        "title": "测试",
        "resources": [{"id": "wikisource", "name": "维基文库", "url": "...", "type": "text"}],
    }
    result, changed = migrate_metadata(metadata)
    assert changed is False


def test_migrate_metadata_dedup():
    metadata = {
        "text_resources": [
            {"title": "Wikisource A", "url": "https://zh.wikisource.org/wiki/a"},
            {"title": "Wikisource B", "url": "https://zh.wikisource.org/wiki/b"},
        ],
    }
    result, changed = migrate_metadata(metadata)
    assert changed is True
    ids = [r["id"] for r in result["resources"]]
    # Second wikisource should get a suffix
    assert ids[0] == "wikisource"
    assert ids[1] == "wikisource-2"


def test_migrate_metadata_skip_duplicate_urls():
    """If resources already contains a URL, don't add it again from old fields."""
    metadata = {
        "resources": [
            {"id": "wikisource", "name": "维基文库", "url": "https://zh.wikisource.org/wiki/test", "type": "text"}
        ],
        "text_resources": [
            {"title": "维基文库", "url": "https://zh.wikisource.org/wiki/test"}
        ],
    }
    result, changed = migrate_metadata(metadata)
    assert changed is True  # old fields were removed
    assert len(result["resources"]) == 1  # no duplicate added
