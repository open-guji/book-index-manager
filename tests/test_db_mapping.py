"""目录库映射（book_index_manager.db）：表结构、拆表还原无损、schema 覆盖检查。"""
import copy
import os

import pytest

from book_index_manager.db import ddl
from book_index_manager.db.mapping import RECORDS
from book_index_manager.db.shred import fits, restore, roundtrip, shred
from book_index_manager.db.tables import TABLES

WORK = {
    'id': 'd59df01avcw0', 'type': 'work', 'title': '紅樓夢', 'subtype': 'book', 'dynasty': '清', 'dynasty_basis': '據作者',
    'period': 'qing', 'ai_note': '批次說明', 'schema_version': 1, 'revision': '1.2.0', 'revised_at': '2026-10-08',
    'loss_status': 'extant', 'loss_status_evidence': {'basis': '有傳本', 'note': '見書目'},
    'description': {'text': '小說。', 'sources': ['《中國通俗小說書目》', {'name': 'x', 'url': 'y'}]},
    'additional_titles': ['石頭記', '金玉緣'],
    'authors': [{'name': '曹雪芹', 'role': '撰', 'entity_id': 'hixhd2h9bf1f', 'name_basis': '題署', 'source': {'id': 1}}],
    'indexed_by': [{'source': '總目', 'source_bid': 'abc', 'title_info': '紅樓夢', 'note': '附注', 'text': '長尾欄',
                    'misattached': False}],
    'measures': [{'number': 120, 'unit': '回'}],
    'related_works': [{'id': 'd59df01avcw1', 'relation': '續作', 'note': '後四十回'}],
    'additional_works': [{'book_title': '附錄', 'n_juan': 1}],
    'resources': [{'id': 'r1', 'name': '影像', 'url': 'https://x', 'types': ['image'], 'group': 'g1'}],
    'resource_groups': {'g1': {'label': '甲本', 'description': '說明'}},
    'title_emendation': {'from': '紅樓', 'to': '紅樓夢'},       # extra_ok 長尾
    'publication_info': {'year': '乾隆'},
    'appendix': None,                                           # 顯式 null
    'contained_in': [],                                         # 空數組
}

BOOK = {
    'id': '96mid1ogzk', 'type': 'book', 'work_id': 'd59df01avcw0', 'title': '紅樓夢', 'edition': '程甲本',
    'edition_type': '活字本', 'revision': '1.0.0', 'revised_at': '2026-11-01', 'schema_version': 1,
    'dating': {'certainty': 'inferred', 'source': 'catalog', 'basis': '據版本名', 'year_range': [1791, 1792],
               'later_repair': [{'x': 1}]},
    'physical_description': {'binding': '線裝', 'source': '館藏目錄'},
    'publication_info': {'details': '萃文書屋'},
    'external_ids': {'zhsy_id': 'Z1'},
    'additional_titles': ['新鐫紅樓夢', {'book_title': '附刻一種', 'type': '附刻'}],
    'provenance': [{'institution': '國圖', 'call_number': 'A1', 'notes': '鈐印', 'source': 'nlc', 'seals': ['甲印'],
                    'seal_marks': [{'seal_id': 's1', 'note': '首葉'}, {'seal_id': 's2'}]},
                   {'institution': '北大', 'source': 'pku'}],
    'base_edition': [{'role': '底本', 'source': 'catalog', 'book_id': '96mid1ogzj', 'evidence': '序', 'work_id': None}],
    'related_books': [{'book_id': '96mid1ogzl', 'relation': '同版', 'evidence': '目驗'}],
    'contained_in': [{'id': '8rlcsybg2hhf', 'volume_index': [1, 2], 'order': 3}],
    'sources': [{'id': 's', 'name': '總目', 'type': 'url', 'details': 'https://x'}, '字符串舊寫'],
    'measures': [{'number': 4, 'unit': '冊'}],
    'metadata': {'k': 'v'},
    'description': {},                                          # 空對象
}

COLLECTION = {
    'id': '8rlcsybg2hhf', 'type': 'collection', 'subtype': 'book_collection', 'title': '武英殿聚珍版叢書',
    'count': {'zhong': 138, 'source': '總目', 'juan': None},
    'publication_info': {'year': '乾隆', 'details': '武英殿'},
    'juan_count': {'number': 1, 'description': '一卷'},
    'contains': [{'type': 'work', 'title': '甲', 'work_id': 'd59df01avcw0'}],
    'related_collections': ['8rlcsybg2hhg'], 'additional_titles': ['聚珍版叢書'], 'ai_note': 'n',
}

ENTITIES = [
    {'id': 'hixhd2h9bf1f', 'type': 'entity', 'subtype': 'people', 'primary_name': '曹雪芹', 'dynasty': '清',
     'dynasty_basis': '據CBDB', 'native_place': '遼陽', 'native_place_basis': '傳記',
     'external_ids': {'cbdb_id': 3767, 'wikidata_id': 'Q36020', 'cbdb_id_alt': [1, 2]},
     'external_ids_meta': {'cbdb_match': 'exact', 'cbdb_source': 'api'},
     'alt_names': [{'name': '曹霑', 'type': '本名', 'note': '一說'}, {'name': '芹圃', 'type': '字', 'ambiguous': True}],
     'dates': {'birth': 1715, 'death': 1763, 'floruit': [1740, 1760], 'basis': '年譜'},
     'relations': [{'type': '祖', 'entity_id': 'hixhd2h9bf1e', 'basis': '家譜', 'sources': ['甲']}],
     'description': {'sources': ['《清史稿》']}, 'todo': [{'what': '待核'}], 'suppressed_fields': ['dates'],
     'alt_names_extra_none': None},
    {'id': 'hixi1ubqbwv8', 'type': 'entity', 'subtype': 'office', 'primary_name': '中書令', 'office_level': 'concrete', 'office_scope': '地方官',
     'function': '掌詔命', 'function_basis': '職官志', 'rank': {'text': '正二品', 'basis': '唐六典'},
     'qualifier': {'kind': '加官', 'name': '同平章事'}, 'institution_ref': 'hixi1ubqbwv7',
     'superiors': [{'id': 'hixi1ubqbwv6', 'start': 1082, 'note': '元豐改制'}]},
    {'id': 'hixiclzgh2iu', 'type': 'entity', 'subtype': 'place', 'primary_name': '橫州', 'place_level': 'concept',
     'geo_kind': '河流', 'generic': True, 'polity_dynasty_id': 'hixi1ubjrxgp', 'site_kind': '塔',
     'modern': {'text': '廣西橫州市', 'adcode': '450181'},
     'history': [{'name': '橫州', 'level': '州', 'start': 916, 'end': 1125, 'note': '據遼史',
                  'dynasty_ids': ['hixi1ubjrxgp', 'hixi1ubjrxgq']}, {'name': '寧浦', 'level': '縣', 'start': 1126,
                                                                     'end': 1279, 'parent_id': 'hixiclzgh2iv'}]},
    {'id': 'hixi1ubjrxgp', 'type': 'entity', 'subtype': 'dynasty', 'primary_name': '遼', 'dates': {'start': 916,
                                                                                                  'end': 1125},
     'parent_id': 'hixi1ubjrxgo'},
    {'id': 'hixi1ub00001', 'type': 'entity', 'subtype': 'reign', 'primary_name': '乾隆', 'dynasty_id': 'hixi1ubjrxgz',
     'ruler': {'name': '弘曆', 'entity_id': 'hixhd2h9bf00'}},
    {'id': 'hixi1ub00002', 'type': 'entity', 'subtype': 'seal', 'primary_name': '乾隆御覽之寶', 'seal_text': '乾隆御覽之寶',
     'seal_kind': '鑑藏', 'owner_ids': ['hixi1ub00003'], 'images': [{'file': 'a.png', 'credit': 'x'}]},
    {'id': 'hixi1ub00004', 'type': 'entity', 'subtype': 'publisher', 'primary_name': '萃文書屋', 'publisher_kind': '書坊',
     'owners': [{'id': 'hixhd2h9bf1f', 'role': '主人'}], 'revised_at': '2026-02-30'},   # 不合法日期進 extra
    # 墓碑：merged_into＋merged_basis 合成一行 id_map
    {'id': 'hixi1ub00005', 'type': 'entity', 'subtype': 'people', 'primary_name': '張杲',
     'merged_into': 'hixhd2h9bf1f', 'merged_basis': {'rule': '同人', 'at': '2026-10-21', 'by': 'A12'}},
]


def test_table_count():
    # 目录 36 张（含 build_meta）＋ book-text 19 张
    assert len(TABLES) == 55
    assert len([t for t in TABLES if t.startswith(('bt_', 'fragment'))]) == 19
    for name in ('alt_name', 'related_record', 'id_map', 'build_meta'):
        assert name in TABLES
    for gone in ('dynasty', 'record_todo', 'entity_image', 'work_additional', 'merged_into', 'work_title_alt'):
        assert gone not in TABLES
    assert 'repo' not in TABLES['work'].cols
    assert 'owner_type' in TABLES['alt_name'].cols and 'owner_type' not in TABLES['work_relation'].cols


def test_audit_fields_have_no_columns():
    for col in ('ai_note', 'dynasty_basis', 'period_basis', 'title_basis'):
        assert col not in TABLES['work'].cols
    assert 'notes' in TABLES['work'].cols and 'notes' in TABLES['authorship'].cols
    assert 'notes' not in TABLES['measure'].cols


def test_ddl_generates():
    sql = ddl.schema_sql()
    assert sql.count('CREATE TABLE') == 55
    assert 'CREATE TABLE id_map' in sql and 'PRIMARY KEY (old_id, kind, src, direct_into)' in sql
    cons = ddl.constraints_sql()
    assert 'book_seal_mark' in cons and 'NOT VALID' in cons
    assert 'book_work_id_ref FOREIGN KEY (work_id) REFERENCES work (id)' in cons
    assert 'related_record_dst_ref' not in cons            # 目标可是 Book 或 Collection，只查悬空
    checks = ddl.checks_sql()
    assert "'related_record.dst 悬空'" in checks and "'alt_name.owner_type 不符'" in checks


@pytest.mark.parametrize('name,docs', [('Work', [WORK]), ('Book', [BOOK]), ('Collection', [COLLECTION]),
                                       ('Entity', ENTITIES)])
def test_roundtrip_lossless(name, docs):
    bad, rows = roundtrip(RECORDS[name], copy.deepcopy(docs))
    assert bad == []


def test_notes_and_extra_placement():
    rows = shred(RECORDS['Work'], copy.deepcopy(WORK)).t
    w = rows['work'][0]
    assert w['notes']['dynasty_basis'] == '據作者' and w['notes']['ai_note'] == '批次說明'
    assert w['notes']['loss_status_evidence'] == {'basis': '有傳本', 'note': '見書目'}
    assert w['description_text'] == '小說。'
    assert set(w['extra']) == {'title_emendation', 'publication_info', 'appendix', 'contained_in'}
    ie = rows['index_entry'][0]
    assert ie['notes'] == {'note': '附注'} and ie['extra'] == {'text': '長尾欄'} and ie['kind'] == 'I'
    assert rows['authorship'][0]['notes'] == {'name_basis': '題署', 'source': {'id': 1}}
    assert [r['name'] for r in rows['alt_name']] == ['石頭記', '金玉緣']


def test_book_nested_and_mixed():
    rows = shred(RECORDS['Book'], copy.deepcopy(BOOK)).t
    b = rows['book'][0]
    assert b['dating_year_range'] == [1791, 1792] and b['notes']['dating.basis'] == '據版本名'
    assert b['extra']['dating'] == {'later_repair': [{'x': 1}]}
    assert [(r['prov_seq'], r['seq'], r['seal_id']) for r in rows['book_seal_mark']] == [(0, 0, 's1'), (0, 1, 's2')]
    alts = rows['alt_name']
    assert alts[0]['name'] == '新鐫紅樓夢' and 'extra' not in alts[0]
    assert alts[1]['kind'] == '附刻' and alts[1]['extra'] == {'_obj': True}
    assert rows['source_ref'][1]['extra'] == {'@': '字符串舊寫'}


def test_entity_side_and_relations():
    rows = shred(RECORDS['Entity'], copy.deepcopy(ENTITIES[1])).t
    assert rows['office'][0]['rank_text'] == '正二品'
    e = rows['entity'][0]
    assert e['notes'] == {'function_basis': '職官志', 'rank.basis': '唐六典'}
    rels = {(r['rel'], r['src_key']): r for r in rows['entity_relation']}
    assert rels[('superior', 'superiors')]['start_year'] == 1082
    assert rels[('institution', 'institution_ref')]['dst'] == 'hixi1ubqbwv7'


def test_tombstone_into_id_map():
    rows = shred(RECORDS['Entity'], copy.deepcopy(ENTITIES[-1])).t
    m = rows['id_map'][0]
    assert m['old_id'] == 'hixi1ub00005' and m['direct_into'] == m['live_id'] == 'hixhd2h9bf1f'
    assert (m['kind'], m['src'], m['owner_type'], m['rule']) == ('merged', 'tombstone', 'E', '同人')


def test_rows_filtered_by_owner_type():
    """共用表里别的类型的行不会被还原进来。"""
    rows = shred(RECORDS['Work'], copy.deepcopy(WORK)).t
    shred(RECORDS['Collection'], copy.deepcopy(COLLECTION), type('R', (), {'t': rows, 'add': lambda s, t, r:
                                                                                rows.setdefault(t, []).append(r)})())
    back = restore(RECORDS['Work'], rows)
    assert list(back) == [WORK['id']] and back[WORK['id']]['additional_titles'] == ['石頭記', '金玉緣']


def test_fits():
    assert fits('2026-10-08', 'date') and not fits('2026-02-30', 'date')
    assert fits([1, 2], 'int2') and not fits([1, True], 'int2')
    assert not fits(True, 'int') and not fits('其他本', 'edition_type')


SCHEMA_DIR = os.environ.get('BOOK_INDEX_SCHEMA') or os.path.join(os.path.dirname(__file__), '..', '..', 'book-index',
                                                                 'schema', 'json')


@pytest.mark.skipif(not os.path.isdir(SCHEMA_DIR), reason='没有 book-index 的 schema/json（CI 会取）')
def test_schema_coverage():
    from book_index_manager.db.coverage import check
    from book_index_manager.db.mapping import PENDING_SCHEMA
    errors, warns = check(SCHEMA_DIR)
    assert errors == [], errors
    assert [w for w in warns if not any(p + '：' in w for p in PENDING_SCHEMA)] == [], warns


def test_person_offices():
    doc = {'id': 'hixhd2h9bf2a', 'type': 'entity', 'subtype': 'people', 'primary_name': '王安石',
           'offices': [{'office_id': 'hixioff1', 'text': '知揚州', 'place_id': 'hixiplc1', 'start': 1067, 'end': 1069,
                        'date_text': '熙寧元年', 'basis': '承前文年號',
                        'sources': [{'title': '《宋史》·王安石傳', 'source_bid': 'd59f2gonq7sy', 'details': '出知揚州'},
                                    {'title': '另一來源'}]},
                       {'office_id': 'hixioff2', 'text': '贈太傅', 'posthumous': True, 'sources': [{'title': '同上'}]}]}
    rows = shred(RECORDS['Entity'], copy.deepcopy(doc)).t
    po = rows['person_office']
    assert [(r['seq'], r['office_id'], r.get('start_year'), r.get('posthumous')) for r in po] == [
        (0, 'hixioff1', 1067, None), (1, 'hixioff2', None, True)]
    assert po[0]['notes'] == {'basis': '承前文年號'}
    assert [(r['oseq'], r['seq'], r['title']) for r in rows['person_office_source']] == [
        (0, 0, '《宋史》·王安石傳'), (0, 1, '另一來源'), (1, 0, '同上')]
    bad, _ = roundtrip(RECORDS['Entity'], [copy.deepcopy(doc)])
    assert bad == []
