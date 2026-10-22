"""块 D：Work 索引（步 4 先给内存构建；步 5 补从 book-index 读盘、existing_res／already_linked）。

按归一模式（jp=True 国書／NDL，jp=False 国图）各建一份：题名键随 jp 变。
"""
import collections
import glob
import json
import os
import era
from normalize import norm_title, norm_author
from titleparse import PREF


class WorkIndex:
    def __init__(self, jp=True):
        self.jp = jp
        self.idx = collections.defaultdict(list)     # 归一题名 -> [info]
        self.idx2 = collections.defaultdict(list)    # 去装饰词后的键
        self.byauth = collections.defaultdict(list)  # 归一责任者名 -> [(归一题名, info)]
        self.works = {}

    @classmethod
    def build(cls, works, jp=True, entities=None):
        """works：Work dict 的可迭代（已排除墓碑）；entities：{entity_id: {'name', 'alts'}}（别名，可无）。"""
        self = cls(jp)
        entities = entities or {}
        for w in works:
            names, alias, eras = set(), set(), []
            for a in w.get('authors') or []:
                for x in norm_author(a.get('name', ''), jp).split('|'):
                    if x:
                        names.add(x)
                e = era.work_era(a)
                if e is not None:
                    eras.append(e)
                en = entities.get(a.get('entity_id'))
                if en:
                    for x in [en['name']] + list(en.get('alts') or []):
                        for y in norm_author(x, jp).split('|'):
                            if y and y not in names:
                                alias.add(y)
            jc = (w.get('juan_count') or {}).get('number')
            info = dict(id=w['id'], title=w['title'], authors=names, alias=alias - names, eras=eras,
                        juan=jc if isinstance(jc, int) else None, juan_unit=(w.get('juan_count') or {}).get('unit'),
                        n_books=len(w.get('books') or []), has_res=bool(w.get('resources')))
            self.works[w['id']] = info
            for n in names:
                self.byauth[n].append((norm_title(w['title'], jp), info))
            ts = {w['title']} | {t if isinstance(t, str) else t.get('title', '') for t in (w.get('additional_titles') or [])}
            if w.get('original_title'):
                ts.add(w['original_title'])
            info['tkeys'] = {norm_title(t, jp) for t in ts if t}
            for t in ts:
                k = norm_title(t, jp)
                if k:
                    if info not in self.idx[k]:
                        self.idx[k].append(info)
                    k2 = PREF.sub('', k)
                    if k2 and k2 != k and info not in self.idx2[k2]:
                        self.idx2[k2].append(info)
        return self


# --------------------------------------------------------------------------- 读盘
# 资源项里站方记录号所在的 metadata 键（口径 K 的 metadata_keys；site_id 见 SITE_OF_SOURCE）
RECORD_KEY = {'nlc': 'nlc_fid', 'kokusho': 'kokusho_bid', 'ndl': 'ndl_record', 'nat-archives-jp': 'naikaku_file_id', 'waseda': 'waseda_id'}
SITE_OF_SOURCE = {'nlc': 'nlc', 'kokusho': 'kokusho', 'ndl': 'ndl', 'naikaku': 'nat-archives-jp', 'waseda': 'waseda'}


def iter_work_files(root):
    return glob.iglob(os.path.join(root, 'Work', '*', '*', '*', '*.json'))


def load_works(root):
    """在世 Work：排除 merged_into／promoted_to 墓碑。返回 (works 列表, 墓碑数)。"""
    out, tomb = [], 0
    for f in iter_work_files(root):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        if d.get('merged_into') or d.get('promoted_to'):
            tomb += 1
            continue
        out.append(d)
    return out, tomb


def load_entities(root, ids):
    """只读被 Work 引用的 Entity：{entity_id: {name, alts}}。"""
    out = {}
    for f in glob.iglob(os.path.join(root, 'Entity', '*', '*', '*', '*.json')):
        eid = os.path.basename(f).split('-')[0].split('.')[0]
        if eid in ids:
            try:
                e = json.load(open(f, encoding='utf-8'))
            except Exception:
                continue
            alts = [a if isinstance(a, str) else (a.get('name') or '') for a in e.get('alt_names') or []]
            out[eid] = dict(name=e.get('primary_name', ''), alts=alts)
    return out


class Resources:
    """Work／其下 Book 的现有资源：existing_res（净增判断）与 linked（幂等跳过）。"""

    def __init__(self):
        self.res_works = set()                         # 本身或其下 Book 已有任何资源的 work_id
        self.linked = collections.defaultdict(set)     # (site_id, 站方记录号) -> {work_id}

    @classmethod
    def scan(cls, root, live_ids=None):
        self = cls()

        def take(d, wid):
            for r in d.get('resources') or []:
                self.res_works.add(wid)
                k = RECORD_KEY.get(r.get('id'))
                v = (r.get('metadata') or {}).get(k) if k else None
                if v:
                    self.linked[(r['id'], str(v))].add(wid)
                if r.get('id') in RECORD_KEY:        # 无 group 的旧项也占额：以记录号或序号代键
                    self.linked[(r['id'], 'group:' + (r.get('group') or 'nogroup-%s-%s' % (v, id(r))))].add(wid)
        for f in iter_work_files(root):
            try:
                d = json.load(open(f, encoding='utf-8'))
            except Exception:
                continue
            take(d, d.get('id'))
        for f in glob.iglob(os.path.join(root, 'Book', '*', '*', '*', '*.json')):
            try:
                d = json.load(open(f, encoding='utf-8'))
            except Exception:
                continue
            if d.get('work_id'):
                take(d, d['work_id'])
        return self

    def existing_groups(self, source):
        """{work_id: {group 键}}：该来源在各 Work（含其 Book）已挂的藏本（占 ≤3 额度用）。"""
        site = SITE_OF_SOURCE.get(source, source)
        out = collections.defaultdict(set)
        for (s, k), ws in self.linked.items():
            if s == site and k.startswith('group:'):
                for w in ws:
                    out[w].add(k[6:])
        return out

    def existing_res(self, work_id):
        return int(work_id in self.res_works)

    def already_linked(self, source, record_id, work_id, group=None):
        """目标 Work（或其下 Book）已挂同一站方记录号（或同一 group 键，旧批 ndl_record 写法不一）→ 幂等跳过。"""
        site = SITE_OF_SOURCE.get(source, source)
        return int(work_id in self.linked.get((site, str(record_id)), ()) or
                   bool(group) and work_id in self.linked.get((site, 'group:' + group), ()))


def build_from_root(root, jp=True, with_entities=False):
    works, tomb = load_works(root)
    ents = None
    if with_entities:
        ids = {a['entity_id'] for w in works for a in w.get('authors') or [] if a.get('entity_id')}
        ents = load_entities(root, ids)
    wi = WorkIndex.build(works, jp=jp, entities=ents)
    wi.n_tombstone = tomb
    return wi
