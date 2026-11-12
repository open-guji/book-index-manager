"""目录库拆表映射：JSON 记录的每个键进哪张表、哪一列。

这是唯一真源：建表语句（ddl.py）、拆表与还原（shred.py）、「schema 有、映射没有」检查（coverage.py）都从这里读。

写法：
  C(type, col=None)  建列。type 取 TYPES 或 ENUMS 里的名字；col 缺省同 JSON 键名。
  N                  不建列，原值进该行的 notes（jsonb）。依据、判断备注、ai_note 这类审计字段走这里。
  Flat({...})        对象拆进本行的几列（description.text → description_text）。
  Kid(...)           数组／对象拆进明细表，一项一行。
  extra_ok           映射里故意不建列的长尾键（十条以内的对象等），原样进 extra。

值装不进列（类型不对、不在枚举里）时原样进 extra，还原无损；还原门禁见 shred.roundtrip。
"""

TYPES = {
    'text': 'text', 'int': 'int', 'bool': 'boolean', 'date': 'date', 'jsonb': 'jsonb',
    'text[]': 'text[]', 'int2': 'int[]', 'char1': 'char(1)',
}

ENUMS = {
    'edition_type': ('刻本', '抄本', '稿本', '活字本', '石印本', '油印本', '曬印本', '鉛印本', '影印本', '套印本', '拓本',
                     '印刷本', '其他'),
    'loss_status': ('lost', 'partially_extant', 'extant', 'undetermined'),
    'work_subtype': ('book', 'article', 'poem', 'chapter'),
    'coll_subtype': ('work_collection', 'book_collection'),
    'entity_subtype': ('people', 'collective', 'dynasty', 'reign', 'office', 'place', 'seal', 'publisher'),
    'attested_status': ('extant', 'lost', 'partial', 'not_seen'),
}


class C:
    __slots__ = ('type', 'col', 'notnull')

    def __init__(self, type='text', col=None, notnull=False):
        assert type in TYPES or type in ENUMS, type
        self.type, self.col, self.notnull = type, col, notnull

    def __repr__(self):
        return 'C(%r, %r)' % (self.type, self.col)


class _Notes:
    def __repr__(self):
        return 'N'


N = _Notes()


class Flat:
    """对象拆进本行的列：{子键: C | N}。子键对应的 Kid 用 'k.sub' 写在 kids 里（如 description.sources）。"""

    def __init__(self, fields):
        self.fields = fields


class Kid:
    """明细映射。

    mode：list＝数组每项一行（seq 记位置）；one＝单值一行；dict＝对象每个键一行（键存 dictkey 列）。
    scalar：项是标量时整个进这一列（如 additional_titles 的字符串项）；项也可能是对象，则按 fields 拆。
    fixed：本用途在表里的区分列及其值（index_entry.kind＝'I'／'E'）。
    sub：项里的数组再拆一层（provenance[].seal_marks），parent 是子表里记上层 seq 的列。
    cols：表上还有、但不来自 JSON 的列（如 id_map.live_id，装载时另算）。
    extra_ok：项里故意不建列的长尾键，原样进该行 extra。
    """

    def __init__(self, table, fields=None, scalar=None, mode='list', owner='owner_id', dictkey=None, fixed=None,
                 sub=None, parent=None, cols=None, extra_ok=()):
        self.table, self.fields, self.scalar, self.mode = table, fields or {}, scalar, mode
        self.owner, self.dictkey, self.fixed = owner, dictkey, fixed or {}
        self.sub, self.parent, self.cols = sub or {}, parent, cols or {}
        self.extra_ok = tuple(extra_ok)


class Side:
    """Entity 子类表（主键即 entity.id）：fields 进子类表列；N 进主表 notes；Flat 拆进子类表列。"""

    def __init__(self, table, fields=None, flat=None):
        self.table, self.fields, self.flat = table, fields or {}, flat or {}


class Record:
    def __init__(self, name, table, owner_type, fixed, cols, flat=None, notes=(), kids=None, side=None,
                 extra_ok=()):
        self.name, self.table, self.owner_type, self.fixed = name, table, owner_type, fixed
        self.cols = cols                     # {键: C}
        self.flat = flat or {}               # {键: Flat}
        self.notes = tuple(notes)            # 顶层审计键，原值进 notes
        self.kids = kids or {}               # {键 或 'k.sub': Kid}
        self.side = side or {}               # {subtype: Side}
        self.extra_ok = tuple(extra_ok)


# ---------------------------------------------------------------- 四类共用的明细

AUTHORS = Kid('authorship', {'name': C(notnull=True), 'role': C(notnull=True), 'entity_id': C(), 'dynasty': C(),
                             'dynasty_basis': N, 'name_basis': N, 'role_basis': N, 'original_name': N, 'note': N,
                             'source': N})
_IDX = {'source': C(notnull=True), 'source_bid': C(), 'title_info': C(), 'summary': C(), 'section': C(),
        'author_info': C(), 'juan_count': C(), 'juan': C(), 'volume': C(), 'page': C(), 'edition': C(),
        'catalog_no': C(), 'in_note_of': C(), 'attested_status': C('attested_status'), 'attested_status_raw': C(),
        'misattached': C('bool'),
        'section_basis': N, 'attested_status_note': N, 'misattached_note': N, 'note': N}
# 《四庫》等少数目录的附加栏（各几百条），不建列
_IDX_EXTRA = ('text', 'comment', 'category', 'self_note', 'commentaries', 'link_basis', 'additional_comment')
SOURCES = Kid('source_ref', {'id': C(col='sid'), 'name': C(), 'type': C(), 'details': C(), 'version': C(),
                             'processor_version': C()})
RESOURCES = Kid('resource', {'id': C(col='rid'), 'name': C(), 'label': C(), 'short_name': C(), 'url': C(),
                             'types': C('text[]'), 'details': C(), 'group': C(col='grp'), 'group_role': C(),
                             'root_type': C(), 'color_mode': C(), 'expected_volumes': C('int'), 'note': C(),
                             'source_label': C(), 'volumes': C('jsonb'), 'metadata': C('jsonb')})
RESOURCE_GROUPS = Kid('resource_group', {'label': C(), 'description': C()}, mode='dict', dictkey='key')
MEASURES = Kid('measure', {'number': C('int'), 'unit': C(), 'note': C()})
MEMBER_OF = Kid('member_of', {'id': C(col='collection_id', notnull=True), 'volume_index': C('jsonb'),
                             'group': C(col='grp'), 'details': C(), 'section': C(), 'order': C('int', col='orig_order'),
                             'sub_items': C('jsonb')}, owner='member_id')
DESC_SOURCES = Kid('description_source', scalar=C('jsonb', col='source'))
# 墓碑的 merged_into＋merged_basis 合成一项（shred 先合、还原再拆）；live_id 是链末的现行记录，装载时解
ID_MAP = Kid('id_map', {'into': C(col='direct_into', notnull=True), 'rule': C(), 'at': C(), 'by': C(), 'why': C()},
             mode='one', owner='old_id', fixed={'kind': 'merged', 'src': 'tombstone'},
             cols={'live_id': 'text', 'title': 'text'})


def common_kids(emendated=True, groups=True):
    out = {
        'authors': AUTHORS,
        'indexed_by': Kid('index_entry', _IDX, fixed={'kind': 'I'}, extra_ok=_IDX_EXTRA),
        'emendated_by': Kid('index_entry', _IDX, fixed={'kind': 'E'}, extra_ok=_IDX_EXTRA),
        'sources': SOURCES,
        'resources': RESOURCES,
        'resource_groups': RESOURCE_GROUPS,
        'contained_in': MEMBER_OF,
        'measures': MEASURES,
        'merged_into': ID_MAP,
        'description.sources': DESC_SOURCES,
    }
    if not emendated:
        del out['emendated_by']
    if not groups:
        del out['resource_groups']
    return out


TITLE_ALT = Kid('alt_name', scalar=C(col='name'))
COMMON = {'id': C(notnull=True), 'title': C(), 'measure_info': C(), 'schema_version': C('int'), 'revision': C(),
          'revised_at': C('date')}
DESCRIPTION = Flat({'text': C(col='description_text')})

# ---------------------------------------------------------------- 主记录

WORK = Record(
    'Work', 'work', 'W', {'type': 'work'},
    cols=dict(COMMON, subtype=C('work_subtype'), original_title=C(), dynasty=C(), period=C(), period_upper=C(),
              loss_status=C('loss_status'), authenticity=C(), additional_works=C('jsonb')),
    flat={'description': DESCRIPTION},
    notes=('title_basis', 'dynasty_basis', 'period_basis', 'period_upper_basis', 'loss_status_evidence',
           'authenticity_basis', 'ai_note'),
    kids=dict(common_kids(),
              additional_titles=TITLE_ALT,
              related_works=Kid('work_relation', {'id': C(col='dst', notnull=True), 'relation': C(notnull=True),
                                                  'note': N}, owner='src')),
    extra_ok=('title_emendation', 'version_graph', 'collection_scale', 'publication_info', 'appendix'),
)

BOOK = Record(
    'Book', 'book', 'B', {'type': 'book'},
    cols=dict(COMMON, work_id=C(), edition=C(), edition_type=C('edition_type')),
    flat={
        'publication_info': Flat({'place': C(col='pub_place'), 'publisher': C(col='pub_publisher'),
                                  'details': C(col='pub_details')}),
        'dating': Flat({'certainty': C(col='dating_certainty'), 'source': C(col='dating_source'), 'basis': N,
                        'era': C(col='dating_era'), 'reign': C(col='dating_reign'), 'year': C('int', 'dating_year'),
                        'year_range': C('int2', 'dating_year_range'),
                        'year_uncertain': C('bool', 'dating_year_uncertain'), 'text': C(col='dating_text')}),
        'physical_description': Flat({'leaf_style': C(col='physical_leaf_style'), 'binding': C(col='physical_binding'),
                                      'dimensions': C(col='physical_dimensions'),
                                      'condition': C(col='physical_condition'), 'source': N}),
        'description': DESCRIPTION,
        'external_ids': Flat({'zhsy_id': C()}),
    },
    notes=('ai_note',),
    kids=dict(common_kids(emendated=False), **{
        'additional_titles': Kid('alt_name', {'book_title': C(col='name'), 'type': C(col='kind')},
                                 scalar=C(col='name')),
        'provenance': Kid('book_provenance', {'institution': C(notnull=True), 'call_number': C(),
                                              'notes': C(col='note'), 'source': C(), 'seals': C('text[]')},
                          sub={'seal_marks': Kid('book_seal_mark', {'seal_id': C(notnull=True), 'note': C()},
                                                 parent='prov_seq')}),
        'base_edition': Kid('book_base_edition', {'role': C(notnull=True), 'relation': C(), 'name': C(),
                                                  'source': C(), 'book_id': C(), 'hypothetical_id': C(),
                                                  'confidence': C(), 'evidence': N, 'note': N},
                                  extra_ok=('work_id',)),
        'location_history': Kid('book_location_history', {'location': C(), 'name': C(), 'item_id': C(), 'url': C(),
                                                          'note': C(), 'description': C(), 'source': C(),
                                                          'acckey': C()}),
        'related_books': Kid('related_record', {'book_id': C(col='dst'), 'relation': C(), 'confidence': C(),
                                                'evidence': N}, owner='src'),
    }),
    extra_ok=('page_count', 'lineage', 'metadata', 'dating.later_repair'),
)

COLLECTION = Record(
    'Collection', 'collection', 'C', {'type': 'collection'},
    cols=dict(COMMON, subtype=C('coll_subtype'), edition=C(), work_id=C()),
    flat={
        'count': Flat({'juan': C('int', 'count_juan'), 'ce': C('int', 'count_ce'), 'zhong': C('int', 'count_zhong'),
                       'han': C('int', 'count_han'), 'source': N}),
        'publication_info': Flat({'year': C(col='pub_year'), 'year_iso': C(col='pub_year_iso'),
                                  'place': C(col='pub_place'), 'publisher': C(col='pub_publisher'),
                                  'details': C(col='pub_details')}),
        'description': DESCRIPTION,
    },
    notes=('ai_note',),
    kids=dict(common_kids(emendated=False, groups=False), **{
        'contains': Kid('collection_content', {'type': C(), 'title': C(), 'scope': C(), 'note': C(), 'position': C(),
                                               'work_id': C(), 'book_id': C(), 'collection_id': C(),
                                               'related_work_id': C(), 'own_work_id': C(), 'categorization': C()}),
        'additional_titles': TITLE_ALT,
        'related_collections': Kid('related_record', scalar=C(col='dst'), owner='src'),
    }),
    extra_ok=('juan_count', 'dating', 'page_count', 'current_location'),
)


def _rel(rel, key, fields=None, scalar=True, mode='list'):
    return Kid('entity_relation', fields, scalar=C(col='dst') if scalar else None, mode=mode, owner='src',
               fixed={'rel': rel, 'src_key': key})


ENTITY = Record(
    'Entity', 'entity', 'E', {'type': 'entity'},
    cols={'id': C(notnull=True), 'subtype': C('entity_subtype'), 'primary_name': C(), 'dynasty': C(), 'period': C(),
          'schema_version': C('int'), 'revision': C(), 'revised_at': C('date'),
          'images': C('jsonb'), 'locations': C('jsonb'), 'todo': C('jsonb'), 'appears_in': C('jsonb')},
    flat={'description': DESCRIPTION},
    notes=('dynasty_basis', 'period_basis', 'name_basis', 'ai_note'),
    side={
        'people': Side('person', {'title_or_office': C(), 'native_place': C(), 'native_place_entity_id': C(),
                                  'native_place_basis': N},
                       {'external_ids_meta': Flat({'cbdb_match': C(), 'cbdb_source': C()})}),
        'collective': Side('collective', {'concept_id': C(), 'collective_kind': C(), 'institution_level': C(),
                                          'function': C(), 'function_basis': N}),
        'publisher': Side('publisher', {'publisher_kind': C(), 'status': C()}),
        'office': Side('office', {'concept_id': C(), 'office_level': C(), 'office_class': C(), 'function': C(),
                                  'base_office_id': C(), 'function_basis': N},
                       {'rank': Flat({'text': C(col='rank_text'), 'basis': N}),
                        'qualifier': Flat({'kind': C(col='qualifier_kind'), 'name': C(col='qualifier_name'),
                                           'note': C(col='qualifier_note'), 'target': C(col='qualifier_target')})}),
        'place': Side('place', {'concept_id': C(), 'place_level': C()},
                      {'modern': Flat({'text': C(col='modern_text'), 'relation': C(col='modern_relation'),
                                       'adcode': C(col='modern_adcode'), 'note': C(col='modern_note')})}),
        'seal': Side('seal', {'seal_text': C(), 'seal_kind': C(), 'seal_style': C(), 'seal_form': C(),
                              'usage_scope': C()}),
        'reign': Side('reign', flat={'ruler': Flat({'name': C(col='ruler_name'), 'entity_id': C(col='ruler_entity_id')})}),
    },
    kids={
        'alt_names': Kid('alt_name', {'name': C(col='name'), 'type': C(col='kind'), 'ambiguous': C('bool'),
                                      'note': N}),
        'external_ids': Kid('entity_external_id', scalar=C('jsonb', col='value'), mode='dict', dictkey='key'),
        'dates': Kid('entity_dates', {'birth': C('int'), 'death': C('int'),
                                      'floruit': (C('int', 'floruit_start'), C('int', 'floruit_end')),
                                      'start': C('int', 'start_year'), 'end': C('int', 'end_year'), 'basis': N},
                     mode='one'),
        'history': Kid('place_history', {'name': C(), 'level': C(), 'start': C('int', 'start_year'),
                                         'end': C('int', 'end_year'), 'parent_id': C(), 'note': N},
                       sub={'dynasty_ids': Kid('place_history_dynasty', scalar=C(col='dynasty_id'), parent='hseq')}),
        'dynasty_ids': _rel('in_dynasty', 'dynasty_ids'),
        'dynasty_id': _rel('in_dynasty', 'dynasty_id', mode='one'),
        'parent_id': _rel('parent', 'parent_id', mode='one'),
        'institution_ref': _rel('institution', 'institution_ref', mode='one'),
        'institution_ids': _rel('institution', 'institution_ids'),
        'predecessors': _rel('predecessor', 'predecessors',
                             {'id': C(col='dst'), 'kind': C(), 'year': C('int'), 'note': N}, scalar=False),
        'superiors': _rel('superior', 'superiors', {'id': C(col='dst'), 'start': C('int', 'start_year'), 'note': N},
                          scalar=False),
        'owner_ids': _rel('owner', 'owner_ids'),
        'owners': _rel('owner', 'owners', {'id': C(col='dst'), 'role': C(), 'note': N}, scalar=False),
        'group_ids': _rel('in_group', 'group_ids'),
        'relations': _rel('person', 'relations', {'entity_id': C(col='dst'), 'type': C(col='kind'), 'basis': N,
                                                  'sources': N}, scalar=False),
        # 人物任官（2026-11-12 A12 统一方案）：一项一行，出处另表；反向「历任者」「某地长官」由库查询派生
        'offices': Kid('person_office', {'office_id': C(), 'text': C(), 'kind': C(), 'posthumous': C('bool'),
                                         'declined': C('bool'), 'place_id': C(), 'institution_id': C(),
                                         'start': C('int', 'start_year'), 'end': C('int', 'end_year'),
                                         'date_text': C(), 'basis': N},
                       sub={'sources': Kid('person_office_source', {'title': C(), 'url': C(), 'details': C(),
                                                                    'source_bid': C()}, parent='oseq')}),
        'merged_into': ID_MAP,
        'description.sources': DESC_SOURCES,
    },
    extra_ok=('suppressed_fields',),
)

RECORDS = {r.name: r for r in (WORK, BOOK, COLLECTION, ENTITY)}

# 映射先于 schema 落地的字段（coverage 对它们报 WARN 属预期）。对应 schema PR 合并后从这里删掉。
PENDING_SCHEMA = ('Entity.offices',)   # A12 人物任官，统一方案 2026-11-12

# 跨记录引用：(表, 列, 目标主表)。生成 NOT VALID 外键与悬空检查；目标可能是几类之一的（如 work_relation.dst
# 可指 Collection、related_record.dst 可指 Book 或 Collection）只出悬空检查、不加外键。
REFS = [
    ('book', 'work_id', ('work',)),
    ('collection', 'work_id', ('work',)),
    ('authorship', 'entity_id', ('entity',)),
    ('member_of', 'collection_id', ('collection',)),
    ('index_entry', 'source_bid', ('work',)),
    ('book_seal_mark', 'seal_id', ('entity',)),
    ('book_base_edition', 'book_id', ('book',)),
    ('person', 'native_place_entity_id', ('entity',)),
    ('office', 'base_office_id', ('entity',)),
    ('place_history_dynasty', 'dynasty_id', ('entity',)),
    ('person_office', 'office_id', ('entity',)),
    ('person_office', 'place_id', ('entity',)),
    ('person_office', 'institution_id', ('entity',)),
    ('person_office_source', 'source_bid', ('work', 'book')),
    ('entity_relation', 'dst', ('entity',)),
    ('work_relation', 'dst', ('work', 'collection')),
    ('related_record', 'dst', ('book', 'collection')),
    ('id_map', 'live_id', ('work', 'book', 'collection', 'entity')),
]

# 主键与索引里要用、但不来自映射的部分：{表: 额外 DDL 片段}
INDEXES = [
    'CREATE INDEX ON work USING gin (title gin_trgm_ops)',
    'CREATE INDEX ON book USING gin (title gin_trgm_ops)',
    'CREATE INDEX ON collection USING gin (title gin_trgm_ops)',
    'CREATE INDEX ON entity USING gin (primary_name gin_trgm_ops)',
    'CREATE INDEX ON alt_name USING gin (name gin_trgm_ops)',
    'CREATE INDEX ON authorship USING gin (name gin_trgm_ops)',
    'CREATE INDEX ON authorship (entity_id) WHERE entity_id IS NOT NULL',
    'CREATE INDEX ON book (work_id)',
    'CREATE INDEX ON work (period)',
    'CREATE INDEX ON entity (subtype)',
    'CREATE INDEX ON book_provenance (institution)',
    'CREATE INDEX ON book_seal_mark (seal_id)',
    'CREATE INDEX ON book_base_edition (book_id)',
    'CREATE INDEX ON index_entry (source_bid)',
    'CREATE INDEX ON resource (rid)',
    'CREATE INDEX ON member_of (collection_id)',
    'CREATE INDEX ON work_relation (dst, relation)',
    'CREATE INDEX ON related_record (dst)',
    'CREATE INDEX ON entity_relation (dst, rel)',
    'CREATE INDEX ON entity_external_id (key, value)',
    'CREATE INDEX ON place_history_dynasty (dynasty_id)',
    'CREATE INDEX ON person_office (office_id)',
    'CREATE INDEX ON person_office (place_id)',
    'CREATE INDEX ON person_office_source (source_bid)',
    'CREATE INDEX ON id_map (live_id)',
]


# ---------------------------------------------------------------- book-text（GUJI-755 第 4 步）
# book-text 仓的元数据进库：manifest.json、各版本 index.json、辑佚 fragments/*.json。正文 NNN.md、char／cord 逐格数据不进库。
# 这些文件本身没有 id，装库时补一个（bt_docs）：manifest 用条目 id；index.json 用「条目id/版本key」；
# 辑佚用「Work id/文件名」。还原时去掉补的 id 即原文件内容。

BT_ITEM = Record(
    'BtItem', 'bt_item', 'T', {},
    cols={'id': C(notnull=True)},
    kids={'versions': Kid('bt_manifest_version', {
        'key': C(notnull=True), 'kind': C(), 'label': C(), 'edition_label': C(), 'is_original': C('bool'),
        'license': C(), 'quality': C(), 'script': C(), 'source': C(), 'source_name': C(), 'source_url': C(),
        'chapters_total': C('int'), 'note': C()}, owner='item_id')},
)

_BT_CHAPTER = {
    'n': C('int', notnull=True), 'file': C(notnull=True), 'title': C(), 'has_json': C('bool'), 'md_len': C('int'),
    'page_title': C(), 'revid': C('int'), 'juan': C(), 'volume': C('int'), 'pdf_pages': C(), 'has_table': C('bool'),
    'pages': C(), 'proofing': C('bool'), 'text_version': C(), 'punct_version': C(), 'entity_version': C(),
    'char_file': C(), 'cord_file': C(), 'punct_file': C(), 'entity_file': C(), 'norm_file': C(), 'fig_file': C()}

BT_VERSION = Record(
    'BtVersion', 'bt_version', 'V', {},
    cols={'id': C(notnull=True), 'work_id': C(), 'book_id': C(), 'title': C(), 'type': C(col='entry_type'),
          'schema_version': C('int'), 'revision': C(), 'revised_at': C(), 'version_label': C(), 'edition_note': C(),
          'fetched_at': C(), 'updated_at': C(), 'guji_markdown': C(), 'line_is_column': C('bool'),
          'total_chapters': C('int'), 'total_entries': C('int'), 'matched_entries': C('int'),
          'books_linked': C('int'), 'books_listed': C('int'), 'dropped_refs': C('int'),
          'placeholder_chars': C('int'), 'collated_edition_type': C(), 'edition': C(), 'author': C(),
          'compiler': C(), 'compiler_role': C(), 'annotator': C(), 'annotator_role': C(), 'table_notation': C(),
          'heading_levels': C('text[]'), 'juan_groups': C('jsonb'), 'variants': C('jsonb'),
          'unknown_templates': C('jsonb'), 'fetch_stats': C('jsonb'), 'coverage': C('jsonb'),
          'references': C('jsonb', col='refs'), 'volume_structure': C('jsonb')},
    flat={
        'source': Flat({'name': C(col='source_name'), 'url': C(col='source_url'), 'license': C(col='source_license'),
                        'base_edition': C(col='source_base_edition'), 'commit': C(col='source_commit'),
                        'dump_date': C(col='source_dump_date'), 'page_title': C(col='source_page_title'),
                        'revid': C('int', 'source_revid'), 'siku_class': C(col='source_siku_class'),
                        'catalog_line': C('jsonb', 'source_catalog_line'), 'upstream': C('jsonb', 'source_upstream'),
                        'type': C(col='source_type'), 'note': N}),
        'text_quality': Flat({'grade': C(col='quality_grade'), 'scope': C(col='quality_scope'),
                              'issues': C('jsonb', 'quality_issues'), 'source_note': N, 'grade_note': N,
                              'gap_note': N}),
    },
    notes=('ai_note', 'note', 'annotation_note', 'count_caveat', 'entry_count_note', 'source_note', 'structure_note',
           'structure_basis', '_note', '_emend_note', '_l2_note', '_match_note', '_pending_note', '_text_note'),
    kids={
        'chapters': Kid('bt_chapter', _BT_CHAPTER, owner='version_id',
                        sub={'headings': Kid('bt_heading', {'level': C('int'), 'label': C(), 'anchor': C()},
                                             owner='version_id', parent='ch_seq')}),
        'other_sources': Kid('bt_other_source', {'id': C(col='src_id'), 'name': C(), 'url': C(), 'note': N},
                             owner='version_id'),
    },
    extra_ok=('external_check', 'hidden_from', 'daxu', 'style', 'text_source', 'source_text', 'source_type',
              'scraped_from', 'target_source', 'target_source_id', 'target_work_id', 'total_lue', 'total_zhong',
              'source.kind', 'source.pageid', 'source.timestamp'),
)

_FRAG_SECTION = Kid('fragment_collector_section', {'file': C(), 'index': C('int', 'idx'), 'juan_no': C('int'),
                                                   'lei': C(), 'part': C(), 'title': C(col='section_title')},
                    owner='fragment_id', parent='cseq')
FRAGMENT = Record(
    'Fragment', 'fragment', 'F', {},
    cols={'id': C(notnull=True), 'work_id': C(), 'title': C(), 'type': C(col='frag_type'), 'schema_version': C('int'),
          'schema_ref': C(), 'loss_status': C('loss_status'), 'provenance': C(), 'statement': C(), 'updated_at': C(),
          'text_condition': C(), 'cited_in_summary': C('jsonb'), 'collection_attested': C('jsonb'),
          'other_statements': C('jsonb'), 'related_titles': C('jsonb')},
    flat={'coverage': Flat({'level': C(col='coverage_level'), 'note': C(col='coverage_note'),
                            'fragments_attested': C('int'), 'fragments_attested_note': N,
                            'fragments_recorded': C('int'), 'text_available': C('bool')})},
    notes=('ai_note', 'note', 'provenance_note', 'statement_note', 'cited_in_summary_note', 'collectors_note',
           'collection_attested_note', '_dead_owner_note'),
    kids={
        'based_on': Kid('fragment_based_on', {'source': C(), 'source_bid': C(), 'field': C(), 'note': N},
                        owner='fragment_id'),
        'collectors': Kid('fragment_collector', {
            'collector': C(), 'work': C(), 'work_id': C(col='collector_work_id'), 'work_alias': C(),
            'count': C('int'), 'count_unit': C(), 'count_note': N, 'statement': C(), 'statement_label': C(),
            'note': C(), 'basis': N, 'location': C('jsonb'), 'juans': C('jsonb'), 'edition': C(), 'measure': C(),
            'appendix_count': C('int'), 'verified_against': C(), 'verify_result': C(), 'verify_note': N,
            'attested_count': C('int'), 'attested_count_basis': C('jsonb')},
            owner='fragment_id', sub={'sections': _FRAG_SECTION}),
        'fragments': Kid('fragment_piece', {
            'seq': C('int', 'num'), 'heading': C(), 'piece_title': C(), 'text': C(), 'text_status': C(),
            'text_from': C(), 'attested_by': C(), 'confidence': C(), 'note': C(), 'editor_note': C()},
            owner='fragment_id',
            sub={'collected_by': Kid('fragment_piece_collector', {'collector': C(), 'work': C(),
                                                                  'work_id': C(col='collector_work_id'), 'juan': C()},
                                     owner='fragment_id', parent='pseq'),
                 'cited_in': Kid('fragment_citation', {'raw': C(), 'book': C(), 'juan': C(), 'title': C(),
                                                       'section': C(), 'detail': C(), 'work_id': C(), 'note': C()},
                                 owner='fragment_id', parent='pseq')}),
    },
)

# 整理本各章 NNN.json：id＝「条目id/版本key/章文件名」。sections 每节一行，content 也进库（全库约 600 万字），还原无损
_SECTION = {
    'level': C('int'), 'type': C(col='sec_type'), 'title': C(), 'content': C(), 'content_from': C(),
    'book_title': C(), 'original_title': C(), 'author': C(), 'author_info': C(), 'author_role': C(),
    'author_type': C(), 'dynasty': C(), 'dynasty_tag': C(), 'edition': C(), 'n_juan': C('int'), 'juan': C(),
    'juan_count': C('int'), 'page': C(), 'summary': C(), 'note': C(), 'comment': C(), 'additional_comment': C(),
    'section_kind': C(), 'sub_cat': C(), 'tag': C(), 'target_bid': C(), 'target_source': C(), 'target_type': C(),
    'book_id': C(), 'collection_id': C(), 'is_jiyi': C('bool'), 'lei': C(), 'part': C(), 'bian': C(),
    'juan_no': C('int'), 'zhi_no': C('int'), 'measure': C('int'), 'header_line': C(), 'footnotes': C(),
    'headings': C('int'), 'index': C('int', 'idx'), 'zi_idx': C('int'), 'text_status': C(),
    'pian': C('jsonb'), 'coverage': C('jsonb'), 'fragments': C('jsonb'), 'metadata': C('jsonb'),
    'title_emendation': C('jsonb'), 'collectors_tally': C('jsonb'), 'juans': C('jsonb'),
    'other_records': C('jsonb'),
    'evidence': N, 'ai_note': N, 'link_basis': N, 'section_kind_basis': N, 'section_kind_note': N, 'title_basis': N,
    'unlinked_reason': N, 'relink_note': N, 'no_work_note': N, 'appendix_note': N, 'other_records_note': N,
}
BT_COLLATED = Record(
    'BtCollated', 'bt_collated', 'K', {},
    cols={'id': C(notnull=True), 'title': C()},
    flat={'meta': Flat({
        'work_id': C(col='meta_work_id'), 'type': C(col='meta_type'), 'schema_version': C('int', 'meta_schema_version'),
        'page_title': C(col='meta_page_title'), 'source_url': C(col='meta_source_url'), 'source': C(col='meta_source'),
        'source_juan': C(col='meta_source_juan'), 'chapter': C(col='meta_chapter'), 'bian': C(col='meta_bian'),
        'lei': C(col='meta_lei'), 'part': C(col='meta_part'), 'page': C(col='meta_page'),
        'collated_edition_type': C(col='meta_collated_edition_type'), 'updated_at': C(col='meta_updated_at'),
        'related_works': C('jsonb', 'meta_related_works'), 'ai_note': N})},
    kids={'sections': Kid('bt_section', _SECTION, owner='file_id', sub={
        'work_ids': Kid('bt_section_work', scalar=C(col='work_id'), owner='file_id', parent='sec_seq'),
        'additional_titles': Kid('bt_section_alt_title', {'book_title': C(), 'n_juan': C('int')}, owner='file_id',
                                 parent='sec_seq'),
    })},
    extra_ok=('meta.lue', 'meta.lue_xu', 'meta.total', 'meta.total_notes', 'meta.zhong_count'),
)

# original 的专名层 NNN.entity.json：id＝「条目id/版本key/册」。每处专名一行
BT_ENTITY = Record(
    'BtEntityLayer', 'bt_entity_layer', 'L', {},
    cols={'id': C(notnull=True), '$schema': C(col='schema'), 'book_id': C(), 'volume': C('int'), 'version': C(),
          'text_version': C(), 'review': C('jsonb')},
    flat={'metadata': Flat({'title': C(col='meta_title'), 'creator': C(), 'base_edition': C(),
                            'description': C(col='meta_description')})},
    kids={'entities': Kid('bt_entity_span', {
        'id': C(col='eid'), 'type': C(col='span_type'), 'text': C(), 'source': C(),
        'anchor': Flat({'start': C(col='anchor_start'), 'end': C(col='anchor_end')}),
        'span': Flat({'start_offset': C('int'), 'end_offset': C('int')}),
        'target': Flat({'status': C(), 'entity_id': C(col='target_id'), 'canonical_name': C(),
                        'coarse': C(col='target_coarse'), 'level': C(col='target_level'), 'note': C(col='target_note'),
                        'targets': C('jsonb', 'target_multi'), 'candidates': C('jsonb')}),
        'group': Flat({'id': C(col='group_id'), 'kind': C(col='group_kind'), 'text': C(col='group_text')}),
    }, owner='layer_id')},
)

BT_RECORDS = {r.name: r for r in (BT_ITEM, BT_VERSION, FRAGMENT, BT_COLLATED, BT_ENTITY)}
# book-text 指向目录的引用：只出悬空检查、不加外键（两仓各自提交，book-text 常落后于并条）
BT_REFS = [
    ('bt_item', 'id', ('work', 'book')),
    ('bt_version', 'work_id', ('work',)),
    ('bt_version', 'book_id', ('book',)),
    ('fragment', 'work_id', ('work',)),
    ('fragment_based_on', 'source_bid', ('work', 'book', 'collection')),
    ('fragment_collector', 'collector_work_id', ('work', 'book', 'collection')),
    ('bt_section_work', 'work_id', ('work',)),
    ('bt_entity_span', 'target_id', ('entity', 'work')),
]
ALL_RECORDS = dict(RECORDS, **BT_RECORDS)
INDEXES += [
    'CREATE INDEX ON bt_version (work_id)',
    'CREATE INDEX ON bt_version (book_id)',
    'CREATE INDEX ON fragment (work_id)',
    'CREATE INDEX ON fragment_piece USING gin (text gin_trgm_ops)',
    'CREATE INDEX ON bt_section_work (work_id)',
    'CREATE INDEX ON bt_section (target_bid)',
    'CREATE INDEX ON bt_entity_span (target_id)',
    # 专名出处反查：实体（或作品）× 文本条目 × 册 × 次数。单目标在 target_id，一处对多条的在 target_multi
    "CREATE VIEW bt_mention AS SELECT target_id, split_part(layer_id, '/', 1) AS item_id, layer_id, count(*) AS n "
    "FROM (SELECT layer_id, target_id FROM bt_entity_span WHERE target_id IS NOT NULL "
    "UNION ALL SELECT layer_id, t->>'entity_id' FROM bt_entity_span, jsonb_array_elements(target_multi) t "
    "WHERE jsonb_typeof(target_multi) = 'array' AND t->>'entity_id' IS NOT NULL) x GROUP BY 1, 2, 3",
]
