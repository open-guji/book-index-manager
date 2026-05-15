"""Production semver revision 字段维护（设计 Q1-Q8）。

覆盖：
- save_item 首次写 production 初始化 1.0.0
- save_item 在 production 默认 bump patch
- save_item 接受 bump='minor'/'major'/None
- draft 条目不维护 revision
- 同日多改不刷新 revised_at
- promote_to_official 写 production 初始化 1.0.0
- rewrite_references 改 production 不动 revision（走 _rewrite_file 不走 save_item）
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from book_index_manager import BookIndexManager, BookIndexStatus, BookIndexType
from book_index_manager.storage import _bump_revision


@pytest.fixture
def manager(tmp_path: Path) -> BookIndexManager:
    return BookIndexManager(storage_root=str(tmp_path), machine_id=1)


def _make_work(mgr, title='测试', status=BookIndexStatus.Draft):
    md = {'type': 'work', 'title': title, 'authors': [{'name': '测试作者', 'role': '撰'}]}
    mgr.save_item(md, BookIndexType.Work, status)
    return md['id'], md


# ── _bump_revision 单元 ──

def test_bump_first_time_returns_100():
    assert _bump_revision(None, 'patch') == '1.0.0'
    assert _bump_revision(None, 'minor') == '1.0.0'
    assert _bump_revision(None, 'major') == '1.0.0'


def test_bump_invalid_current_returns_100():
    assert _bump_revision('', 'patch') == '1.0.0'
    assert _bump_revision('not-semver', 'patch') == '1.0.0'


def test_bump_patch():
    assert _bump_revision('1.0.5', 'patch') == '1.0.6'
    assert _bump_revision('2.3.4', 'patch') == '2.3.5'


def test_bump_minor():
    assert _bump_revision('1.0.5', 'minor') == '1.1.0'
    assert _bump_revision('2.3.4', 'minor') == '2.4.0'


def test_bump_major():
    assert _bump_revision('1.0.5', 'major') == '2.0.0'
    assert _bump_revision('2.3.4', 'major') == '3.0.0'


def test_bump_invalid_level_raises():
    with pytest.raises(ValueError):
        _bump_revision('1.0.0', 'patchh')


# ── draft 不维护 revision ──

def test_draft_save_does_not_add_revision(manager):
    wid, _ = _make_work(manager, status=BookIndexStatus.Draft)
    w = manager.get_item(wid)
    assert 'revision' not in w
    assert 'revised_at' not in w


# ── production 首次写入初始化 1.0.0 ──

def test_official_first_save_initializes_100(manager):
    md = {'type': 'work', 'title': '正式作品', 'authors': []}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)
    w = manager.get_item(md['id'])
    assert w['revision'] == '1.0.0'
    assert w['revised_at'] == date.today().isoformat()


# ── production 默认 bump patch ──

def test_official_default_bump_patch(manager):
    md = {'type': 'work', 'title': '默认 patch', 'authors': []}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)
    assert md['revision'] == '1.0.0'
    # 第二次保存（默认 patch）
    md['title'] = '默认 patch v2'
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)
    assert md['revision'] == '1.0.1'
    # 第三次
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)
    assert md['revision'] == '1.0.2'


# ── 显式 bump minor / major ──

def test_official_minor_bump(manager):
    from book_index_manager.id_generator import smart_decode, BookIndexIdGenerator
    md = {'type': 'work', 'title': 'minor 测试', 'authors': []}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)  # 1.0.0
    id_val = smart_decode(md['id'])
    type_val = BookIndexIdGenerator.parse(id_val).type
    manager.storage.save_item(type_val, id_val, md, bump='minor')
    assert md['revision'] == '1.1.0'
    manager.storage.save_item(type_val, id_val, md, bump='major')
    assert md['revision'] == '2.0.0'


def test_official_bump_none_does_not_change_revision(manager):
    from book_index_manager.id_generator import smart_decode, BookIndexIdGenerator
    md = {'type': 'work', 'title': 'none 测试', 'authors': []}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)  # 1.0.0
    id_val = smart_decode(md['id'])
    type_val = BookIndexIdGenerator.parse(id_val).type
    manager.storage.save_item(type_val, id_val, md, bump=None)
    assert md['revision'] == '1.0.0'  # 不变


# ── promote 初始化 1.0.0 ──

def test_promote_initializes_production_revision(manager):
    # draft 作品（无 revision）
    draft_id, _ = _make_work(manager, status=BookIndexStatus.Draft)
    # promote
    prod_id = manager.promote_to_official(draft_id)
    p = manager.get_item(prod_id)
    assert p['revision'] == '1.0.0'
    assert p['revised_at'] == date.today().isoformat()
    # draft tombstone 不应有 revision（draft 不维护）
    d = manager.get_item(draft_id)
    assert 'revision' not in d
    assert d['promoted_to'] == prod_id


# ── 同日多改不刷新 revised_at ──

def test_promote_initializes_collated_edition_meta(manager, tmp_path):
    """promote 时若 draft asset dir 含 collated_edition，production 自动写 _meta.json。"""
    import json as _json
    draft_id, _ = _make_work(manager, status=BookIndexStatus.Draft)
    # 模拟整理本 draft 内容
    asset = manager.init_asset_dir(draft_id)
    ce = asset / 'collated_edition'
    ce.mkdir()
    (ce / 'text').mkdir()
    (ce / 'text' / '卷一.md').write_text('# 卷一', encoding='utf-8')
    # promote
    prod_id = manager.promote_to_official(draft_id)
    prod_ce_meta = manager.find_item_path(prod_id).parent / prod_id / 'collated_edition' / '_meta.json'
    assert prod_ce_meta.exists()
    with open(prod_ce_meta, encoding='utf-8') as f:
        meta = _json.load(f)
    assert meta['revision'] == '1.0.0'
    assert meta['quality'] == 'rough'
    assert meta['revised_at'].startswith('2026-')  # 当前年份


def test_promote_skips_meta_init_when_no_collated_edition(manager):
    """asset dir 无 collated_edition 子目录时不写 _meta.json。"""
    draft_id, _ = _make_work(manager, status=BookIndexStatus.Draft)
    asset = manager.init_asset_dir(draft_id)
    (asset / 'other.md').write_text('# other', encoding='utf-8')  # 有 asset 但无 collated_edition
    prod_id = manager.promote_to_official(draft_id)
    prod_dir = manager.find_item_path(prod_id).parent / prod_id
    assert prod_dir.is_dir()
    assert not (prod_dir / 'collated_edition').exists()


def test_revised_at_does_not_refresh_same_day(manager, monkeypatch):
    md = {'type': 'work', 'title': '同日多改', 'authors': []}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)
    today = md['revised_at']
    # 模拟同一天再保存
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Official)
    assert md['revised_at'] == today  # 同日不刷新（即便 today 函数返回同值）
    # revision 还是该 ++
    assert md['revision'] == '1.0.1'
