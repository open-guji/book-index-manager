"""JSON 记录 ⇄ 表行（纯 Python，不连库）。

shred(rec, doc) → {表: [行]}；restore(rec, rows) → {id: doc}。行是 {列: 值}，值为 Python 原生类型（jsonb 列放原对象）。
装不进列的值原样进该行 extra，几个保留记号：
  extra['@']        项本身装不进（明细项是标量、或标量不合列类型）
  extra['_obj']     项既可为标量又可为对象（additional_titles），这一项是对象
  extra[k]['_present']  拆平的对象 k 没有一个子键落列（如写了 {}），还原时据此补回
  extra['_nofixed'] 记录缺了固定键（如没写 type）
比对口径：解析后的对象相等（不比键序）。
"""
import datetime
from collections import defaultdict

from .mapping import ENUMS, C, N
from .tables import TABLES


def fits(v, type):
    """值能否无损放进该类型的列。"""
    if v is None:
        return False
    if type == 'text':
        return isinstance(v, str) and '\x00' not in v
    if type == 'int':
        return isinstance(v, int) and not isinstance(v, bool) and -2 ** 31 <= v < 2 ** 31
    if type == 'bool':
        return isinstance(v, bool)
    if type == 'date':
        if not (isinstance(v, str) and len(v) == 10):
            return False
        try:
            return datetime.date.fromisoformat(v).isoformat() == v
        except ValueError:
            return False
    if type == 'jsonb':
        return True
    if type == 'text[]':
        return isinstance(v, list) and bool(v) and all(isinstance(x, str) and '\x00' not in x for x in v)
    if type == 'int2':
        return isinstance(v, list) and len(v) == 2 and all(fits(x, 'int') for x in v)
    if type == 'char1':
        return isinstance(v, str) and len(v) == 1
    if type in ENUMS:
        return isinstance(v, str) and v in ENUMS[type]
    raise ValueError(type)


def _norm(v):
    """库里读回的值还原成 JSON 值。"""
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    return v


def _kid_ok(kid, v):
    if kid.mode == 'list':
        return isinstance(v, list) and bool(v)
    if kid.mode == 'dict':
        return isinstance(v, dict) and bool(v)
    return v is not None and v != {} and v != [] and not isinstance(v, list)


def _shred_fields(fields, obj, row, notes, extra):
    """对象按 fields 拆进 row（列）／notes；装不下的进 extra。回 True 表示至少有一个子键落列或进 notes。"""
    got = False
    for k, v in obj.items():
        spec = fields.get(k)
        if spec is N:
            notes[k] = v
            got = True
        elif isinstance(spec, C) and fits(v, spec.type):
            row[spec.col or k] = v
            got = True
        elif isinstance(spec, tuple) and isinstance(v, list) and len(v) == len(spec) \
                and all(fits(x, s.type) for x, s in zip(v, spec)):
            row.update((s.col, x) for s, x in zip(spec, v))
            got = True
        else:
            extra[k] = v
    return got


def _restore_fields(fields, row, notes):
    o = {}
    for k, spec in fields.items():
        if spec is N:
            if k in notes:
                o[k] = notes[k]
        elif isinstance(spec, C):
            v = row.get(spec.col or k)
            if v is not None:
                o[k] = _norm(v)
        elif isinstance(spec, tuple):
            vs = [row.get(s.col) for s in spec]
            if all(x is not None for x in vs):
                o[k] = vs
    return o


def _apply_extra(o, extra):
    for k, v in extra.items():
        if k not in ('_obj', '_present', '_nofixed', '@'):
            o[k] = v
    return o


class Rows:
    def __init__(self):
        self.t = defaultdict(list)

    def add(self, table, row):
        self.t[table].append(row)


def _put_kid(rec, kid, oid, items, out, parent=None):
    t = TABLES[kid.table]
    shared = 'owner_type' in t.cols
    for pos, it in items:
        row, notes, extra = {}, {}, {}
        subs = []
        if kid.sub and isinstance(it, dict):
            subs = [(sk, it[sk]) for sk in kid.sub if isinstance(it.get(sk), list) and it[sk]]
            if subs:
                it = {k: v for k, v in it.items() if k not in dict(subs)}
        if kid.scalar is not None and (not kid.fields or not isinstance(it, dict)):
            if fits(it, kid.scalar.type):
                row[kid.scalar.col] = it
            else:
                extra['@'] = it
        elif not isinstance(it, dict):
            extra['@'] = it
        else:
            if kid.scalar is not None:
                extra['_obj'] = True
            _shred_fields(kid.fields, it, row, notes, extra)
        row[kid.owner] = oid
        if shared:
            row['owner_type'] = rec.owner_type
        row.update(kid.fixed)
        if parent is not None:
            row[kid.parent] = parent
        if kid.mode == 'list':
            row['seq'] = pos
        elif kid.mode == 'one' and 'seq' in t.cols:
            row['seq'] = 0     # 与 list 用途共表（entity_relation），单值占 seq 0
        elif kid.mode == 'dict':
            row[kid.dictkey] = pos
        if kid.table == 'id_map':
            row['live_id'] = row.get('direct_into')
        if notes:
            row['notes'] = notes
        if extra:
            row['extra'] = extra
        out.add(kid.table, row)
        for sk, sv in subs:
            _put_kid(rec, kid.sub[sk], oid, list(enumerate(sv)), out, parent=pos)


def _shred_flat(key, fl, v, row, notes, extra, later, kids):
    sub_row_notes = {}
    sub_extra = {}
    rest = {}
    got = False
    for kk, vv in v.items():
        kk_full = '%s.%s' % (key, kk)
        if kk_full in kids and _kid_ok(kids[kk_full], vv):
            later.append((kk_full, vv))
            got = True
        else:
            rest[kk] = vv
    got = _shred_fields(fl.fields, rest, row, sub_row_notes, sub_extra) or got
    for kk, vv in sub_row_notes.items():
        notes['%s.%s' % (key, kk)] = vv
    if not got:
        sub_extra['_present'] = 1
    if sub_extra:
        extra[key] = sub_extra


def shred(rec, d, out=None):
    """一条记录拆成行，追加进 out（Rows）。"""
    out = out or Rows()
    if isinstance(d.get('merged_into'), str) and isinstance(d.get('merged_basis', {}), dict):
        d = dict(d)
        d['merged_into'] = dict({'into': d.pop('merged_into')}, **(d.pop('merged_basis', None) or {}))
    row, notes, extra, later = {}, {}, {}, []
    side = rec.side.get(d.get('subtype'))
    srow = {}
    missing = [k for k in rec.fixed if k not in d]
    if missing:
        extra['_nofixed'] = missing
    for k, v in d.items():
        if k in rec.fixed:
            if v != rec.fixed[k]:
                extra[k] = v
        elif side is not None and k in side.fields:
            spec = side.fields[k]
            if spec is N:
                notes[k] = v
            elif fits(v, spec.type):
                srow[spec.col or k] = v
            else:
                extra[k] = v
        elif side is not None and k in side.flat and isinstance(v, dict):
            _shred_flat(k, side.flat[k], v, srow, notes, extra, later, rec.kids)
        elif k in rec.notes:
            notes[k] = v
        elif k in rec.cols and fits(v, rec.cols[k].type):
            row[rec.cols[k].col or k] = v
        elif k in rec.flat and isinstance(v, dict):
            _shred_flat(k, rec.flat[k], v, row, notes, extra, later, rec.kids)
        elif k in rec.kids and _kid_ok(rec.kids[k], v):
            later.append((k, v))
        else:
            extra[k] = v
    if notes:
        row['notes'] = notes
    if extra:
        row['extra'] = extra
    out.add(rec.table, row)
    if side is not None:
        srow['id'] = d['id']
        out.add(side.table, srow)
    for k, v in later:
        kid = rec.kids[k]
        if kid.mode == 'one':
            items = [(None, v)]
        elif kid.mode == 'dict':
            items = list(v.items())
        else:
            items = list(enumerate(v))
        _put_kid(rec, kid, d['id'], items, out)
    return out


def _restore_item(kid, row):
    extra = row.get('extra') or {}
    if '@' in extra:
        return extra['@']
    if kid.scalar is not None and (not kid.fields or not extra.get('_obj')):
        return _norm(row[kid.scalar.col])
    o = _restore_fields(kid.fields, row, row.get('notes') or {})
    return _apply_extra(o, extra)


def _match(kid, rec, row, shared):
    if shared and row.get('owner_type') != rec.owner_type:
        return False
    return all(row.get(c) == v for c, v in kid.fixed.items())


def restore(rec, rows):
    """rows：{表: [行]}（整表或任意子集）。回 {id: doc}。"""
    kidvals = {}
    for key, kid in rec.kids.items():
        shared = 'owner_type' in TABLES[kid.table].cols
        subs = {}
        for sk, sub in kid.sub.items():
            g = defaultdict(list)
            for r in rows.get(sub.table, ()):
                if _match(sub, rec, r, 'owner_type' in TABLES[sub.table].cols):
                    g[(r[sub.owner], r[sub.parent])].append((r['seq'], _restore_item(sub, r)))
            subs[sk] = g
        by = defaultdict(list)
        for r in rows.get(kid.table, ()):
            if not _match(kid, rec, r, shared):
                continue
            pos = r['seq'] if kid.mode == 'list' else r[kid.dictkey] if kid.mode == 'dict' else 0
            it = _restore_item(kid, r)
            for sk, g in subs.items():
                got = g.get((r[kid.owner], pos))
                if got and isinstance(it, dict):
                    it[sk] = [x for _, x in sorted(got, key=lambda y: y[0])]
            by[r[kid.owner]].append((pos, it))
        kidvals[key] = by
    sides = {st: {r['id']: r for r in rows.get(s.table, ())} for st, s in rec.side.items()}
    out = {}
    for row in rows.get(rec.table, ()):
        extra = dict(row.get('extra') or {})
        notes = row.get('notes') or {}
        d = dict(rec.fixed)
        for k in extra.pop('_nofixed', ()):
            d.pop(k, None)
        side = rec.side.get(row.get('subtype'))
        flats = list(rec.flat.items())
        if side is not None:
            sr = sides[row['subtype']].get(row['id'], {})
            for k, spec in side.fields.items():
                if spec is not N and sr.get(spec.col or k) is not None:
                    d[k] = _norm(sr[spec.col or k])
            flats += [(k, fl, sr) for k, fl in side.flat.items()]
        for k, spec in rec.cols.items():
            v = row.get(spec.col or k)
            if v is not None:
                d[k] = _norm(v)
        for f in flats:
            k, fl = f[0], f[1]
            src = f[2] if len(f) > 2 else row
            sub_notes = {kk[len(k) + 1:]: v for kk, v in notes.items() if kk.startswith(k + '.')}
            o = _restore_fields(fl.fields, src, sub_notes)
            if k in extra:
                _apply_extra(o, extra.pop(k))
                d[k] = o
            elif o:
                d[k] = o
        for k, v in notes.items():
            if '.' not in k:
                d[k] = v
        for key, kid in rec.kids.items():
            items = kidvals[key].get(row['id'])
            if not items:
                continue
            items.sort(key=lambda x: x[0])
            if kid.mode == 'one':
                v = items[0][1]
            elif kid.mode == 'dict':
                v = {p: it for p, it in items}
            else:
                v = [it for _, it in items]
            if '.' in key:
                a, b = key.split('.')
                d.setdefault(a, {})[b] = v
            else:
                d[key] = v
        _apply_extra(d, extra)
        if isinstance(d.get('merged_into'), dict):
            mb = d.pop('merged_into')
            d['merged_into'] = mb.pop('into')
            if mb:
                d['merged_basis'] = mb
        out[row['id']] = d
    return out


def roundtrip(rec, docs):
    """纯 Python 门禁：拆了再还原，回不一致的 [(id, 不同的键)]。"""
    rows = Rows()
    for d in docs:
        shred(rec, d, rows)
    back = restore(rec, rows.t)
    bad = []
    for d in docs:
        r = back.get(d['id'])
        if r != d:
            bad.append((d['id'], sorted(k for k in set(d) | set(r or {}) if d.get(k) != (r or {}).get(k))))
    return bad, rows
