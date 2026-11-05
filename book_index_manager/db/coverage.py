"""「schema 有、映射没有」检查：JSON schema 里登记的每个字段，映射都要说清它去哪（列、notes、明细表或 extra_ok）。

  python -m book_index_manager.db coverage --schema ../book-index/schema/json

缺的报 ERROR（新加字段忘了进库）；映射里有、schema 已没有的报 WARN（删字段后映射没跟着删）。
"""
import json
import os

from .mapping import RECORDS, C, Flat, N

FILES = {'Work': 'work.schema.json', 'Book': 'book.schema.json', 'Collection': 'collection.schema.json',
         'Entity': 'entity.schema.json'}


class Schemas:
    def __init__(self, folder):
        self.folder = folder
        self.docs = {}

    def doc(self, name):
        if name not in self.docs:
            with open(os.path.join(self.folder, name), encoding='utf-8') as f:
                self.docs[name] = json.load(f)
        return self.docs[name]

    def resolve(self, node, base):
        while isinstance(node, dict) and '$ref' in node:
            ref = node['$ref']
            file, _, frag = ref.partition('#')
            base = file or base
            node = self.doc(base)
            for part in [p for p in frag.split('/') if p]:
                node = node[part]
        return node, base

    def props(self, node, base, seen=None):
        """对象节点的全部属性 {名: (子节点, base)}，合并 allOf/anyOf/oneOf/if-then-else。"""
        seen = seen or set()
        node, base = self.resolve(node, base)
        if not isinstance(node, dict) or id(node) in seen:
            return {}
        seen.add(id(node))
        out = {k: (v, base) for k, v in (node.get('properties') or {}).items()}
        for key in ('allOf', 'anyOf', 'oneOf'):
            for sub in node.get(key) or ():
                for k, v in self.props(sub, base, seen).items():
                    out.setdefault(k, v)
        for key in ('then', 'else'):
            if isinstance(node.get(key), dict):
                for k, v in self.props(node[key], base, seen).items():
                    out.setdefault(k, v)
        return out

    def items(self, node, base):
        """数组节点（或 anyOf 里的数组分支）的 items。"""
        node, base = self.resolve(node, base)
        if not isinstance(node, dict):
            return None
        if isinstance(node.get('items'), dict):
            return node['items'], base
        for key in ('anyOf', 'oneOf', 'allOf'):
            for sub in node.get(key) or ():
                got = self.items(sub, base)
                if got:
                    return got
        return None


def _fields_known(fields):
    return set(fields)


def check(folder):
    """回 (errors, warns)，每项是一句话。"""
    sc = Schemas(folder)
    errors, warns = [], []
    kid_missing = {}   # (id(Kid), 字段) → [是否缺]：共用的明细映射只在各处都缺时才报
    for name, rec in RECORDS.items():
        base = FILES[name]
        top = sc.props(sc.doc(base), base)
        side_fields, side_flat = {}, {}
        for side in rec.side.values():
            side_fields.update(side.fields)
            side_flat.update(side.flat)
        mapped = set(rec.cols) | set(rec.notes) | set(rec.flat) | set(rec.fixed) | {e for e in rec.extra_ok if '.' not in e} \
            | set(side_fields) | set(side_flat) | {k.split('.')[0] for k in rec.kids}
        if 'merged_into' in rec.kids:
            mapped.add('merged_basis')   # 与 merged_into 合成一行 id_map
        for k in sorted(top):
            if k.startswith('_'):
                continue
            if k not in mapped:
                errors.append('%s.%s：schema 有，映射没有' % (name, k))
        for k in sorted(mapped - set(top)):
            warns.append('%s.%s：映射有，schema 没有' % (name, k))
        # 拆平的对象
        flats = dict(rec.flat)
        flats.update(side_flat)
        for k, fl in flats.items():
            if k not in top:
                continue
            sub = sc.props(*top[k])
            known = set(fl.fields) | {kk.split('.', 1)[1] for kk in rec.kids if kk.startswith(k + '.')} \
                | {e.split('.', 1)[1] for e in rec.extra_ok if e.startswith(k + '.')}
            for kk in sorted(set(sub) - known):
                errors.append('%s.%s.%s：schema 有，映射没有' % (name, k, kk))
            for kk in sorted(set(fl.fields) - set(sub)):
                warns.append('%s.%s.%s：映射有，schema 没有' % (name, k, kk))
        # 明细项
        for key, kid in rec.kids.items():
            if '.' in key:
                head, _, tail = key.partition('.')
                if head not in top:
                    continue
                node = sc.props(*top[head]).get(tail)
            else:
                node = top.get(key)
            if node is None:
                continue
            _check_kid(sc, name, key, kid, node, rec, errors, kid_missing)
    for (_, label), flags in sorted(kid_missing.items(), key=lambda x: x[0][1]):
        if all(flags):
            warns.append('%s：映射有，schema 没有' % label)
    return errors, warns


def _check_kid(sc, name, key, kid, node, rec, errors, kid_missing):
    if kid.mode == 'list':
        it = sc.items(*node)
        if it is None:
            return
        node = it
    elif kid.mode == 'dict':
        return   # 键值对表，子键开放
    sub = sc.props(*node)
    if not sub or not kid.fields:
        return
    known = set(kid.fields) | set(kid.sub) | set(kid.extra_ok)
    for kk in sorted(set(sub) - known):
        errors.append('%s.%s[].%s：schema 有，映射没有' % (name, key, kk))
    if kid.table != 'id_map':   # merged_into＋merged_basis 合成的项，不比
        for kk in kid.fields:
            kid_missing.setdefault((id(kid), '%s[].%s（%s）' % (key, kk, kid.table)), []).append(kk not in sub)
    for sk, skid in kid.sub.items():
        if sk in sub:
            _check_kid(sc, name, key + '[].' + sk, skid, sub[sk], rec, errors, kid_missing)


__all__ = ['check', 'C', 'N', 'Flat']
