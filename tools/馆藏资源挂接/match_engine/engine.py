"""块 D 引擎入口。
  python3 engine.py --source nlc|kokusho|ndl --works-root <book-index 根> --data-root <library_data 根> --out DIR
        [--overview-root <overview 根>] [--limit N] [--keys <dynasty_reign_keys.json>]
输出 DIR/{matches.tsv,stats.json,config_used.json}。只读，不写任何库。
"""
import argparse
import collections
import csv
import dataclasses
import hashlib
import importlib
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import era                                  # noqa: E402
import roots                                # noqa: E402
import exclusions                           # noqa: E402
import groups                               # noqa: E402
import tier                                 # noqa: E402
import workindex                            # noqa: E402
import writeplan                            # noqa: E402
from tier import JPC1                        # noqa: E402  A9：C1 日本诸馆第二批（adapters/jpc1.py）

COLS = ['source', 'source_record_id', 'group_key', 'tier', 'work_id', 'work_title', 'lib_title', 'lib_author', 'lib_version', 'url',
        'image_url', 'has_image', 'existing_res', 'already_linked', 'excluded', 'reason_codes', 'reasons_text', 'candidates', 'evidence',
        'engine_version']


def engine_version(pol):
    try:
        h = subprocess.check_output(['git', '-C', HERE, 'rev-parse', '--short=10', 'HEAD'], text=True).strip()
    except Exception:
        h = 'nogit'
    ph = hashlib.sha256(repr(pol).encode()).hexdigest()[:8]
    return f'{h}+{ph}'


def run(source, works_root, data_root, out, overview_root=None, limit=None, keys=None, emit_plan=False, alias=False, annot_release=None, ledger_dir=None, plan_dir=None, mapping=None):
    t0 = time.time()
    import normalize
    import authorgate
    normalize.enable_naikaku_fold(source == 'naikaku')
    os.makedirs(out, exist_ok=True)
    pol = tier.Policy()
    if alias:   # R1-E1 实验：只对该源开 Entity 别名（nlc 默认关；不改默认 Policy，既有指纹不变）
        pol.profiles[source] = dataclasses.replace(pol.profiles[source], alias=True)
    prof = pol.profile(source)
    n_names, n_map = era.load_keys(keys, mapping or (os.path.join(overview_root, '项目进展', '朝代年号录入', '政权映射.tsv') if overview_root else None))
    if source in tier.EURO:
        from adapters import euro
        recs = euro.load(data_root, source)
    else:
        adapter = importlib.import_module('adapters.' + source)
        recs = adapter.load(data_root)
    if limit:
        recs = recs[:limit]
    wi = workindex.build_from_root(works_root, jp=prof.jp, with_entities=prof.alias)
    res = workindex.Resources.scan(works_root)
    dupx = os.path.join(plan_dir, 'dupx-同题异作者清单.tsv') if plan_dir else None
    ex = exclusions.load_exclusions(overview_root, set(wi.works), ledger_dir, dupx)
    ver = engine_version(pol)
    rows = []
    for r in recs:
        j = tier.judge(r, wi, pol)
        rows.append(dict(rec=r, tier=j.tier, work_id=j.work_id, codes=list(j.codes), cands=j.candidates, ev=j.evidence,
                         group_key=r['group_key']))
    n_split = groups.apply_group_split(rows, source, groups.load_whitelist(overview_root, plan_dir)) if source in ('kokusho',) + JPC1 else 0
    n_plan = n_drop = 0
    for x in rows:
        wid = x['work_id']
        susp = bool(source == 'waseda' and wid and x['tier'] == '确定' and wi.works[wid]['juan'] is None and (x['rec']['juan'] or 0) >= 10)
        x['excluded'] = ','.join(sorted(ex.get(wid, ()))) if wid else ''
        if susp and annot_release and wid in annot_release:
            susp = False    # 目录线（Sabine）已判原典，放行
        if susp:    # R1-E5：水經注类疑似（Work 无卷数而早稲田卷≥10，责任者含注者）不进计划
            x['excluded'] = (x['excluded'] + ',' if x['excluded'] else '') + 'WASEDA_ANNOT_SUSPECT'
        if source == 'kokusho' and wid and x['tier'] == '确定':   # K13 责任者闸（分档码，见 authorgate.py）；G3 排除，G1/G2 放行并留证
            code, gev = authorgate.gate_rec(x['rec'], wi.works[wid]['authors'], wi.works[wid]['tkeys'])
            x['gate'] = (code, gev)
            if not authorgate.is_pass(code):
                x['excluded'] = (x['excluded'] + ',' if x['excluded'] else '') + code
        mk = writeplan.make_item(source, x['rec']) if source in writeplan.SITES else None
        x['already_linked'] = res.already_linked(source, x['rec']['source_record_id'], wid, mk[1] if mk else None) if wid else 0
    if source == 'kokusho':     # 闸证据落盘：每个确定档行的分档码与页面证据字段
        with open(os.path.join(out, 'gate_evidence.tsv'), 'w', encoding='utf-8') as gf:
            gf.write('bid\twork_id\twork_title\tgate_code\t本册责任(detail.author)\t著作层著者(detail.work[].author)\t题名全等\t有影像\talready_linked\n')
            for x in rows:
                if x.get('gate'):
                    c, v = x['gate']
                    gf.write('\t'.join([x['rec']['source_record_id'], x['work_id'], wi.works[x['work_id']]['title'], c, v['book_author'], v['work_layer'], str(v['title_exact']), str(v['has_image']), str(x['already_linked'])]) + '\n')
    if emit_plan and source not in writeplan.SITES:
        raise SystemExit(f'{source} 尚未登记 write_plan 站点，不能 --emit-write-plan')
    if emit_plan:
        plan, dropped, linked = writeplan.build(source, rows, res.existing_groups(source))
        n_plan, n_drop = len(plan), len(dropped)
        with open(os.path.join(out, 'write_plan.jsonl'), 'w', encoding='utf-8') as f:
            for p in plan:
                f.write(json.dumps(p, ensure_ascii=False) + '\n')
        with open(os.path.join(out, 'linked_draft.jsonl'), 'w', encoding='utf-8') as f:
            for p in linked:
                f.write(json.dumps(p, ensure_ascii=False) + '\n')
    cnt, codes_cnt = collections.Counter(), collections.Counter()
    with open(os.path.join(out, 'matches.tsv'), 'w', encoding='utf-8', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=COLS, delimiter='\t')
        wr.writeheader()
        for x in rows:
            r, wid = x['rec'], x['work_id']
            w = wi.works.get(wid) if wid else None
            cnt[x['tier']] += 1
            codes_cnt.update(x['codes'])
            ev = dict(x['ev'], group_size=None)
            wr.writerow(dict(source=source, source_record_id=r['source_record_id'], group_key=r['group_key'], tier=x['tier'], work_id=wid,
                             work_title=w['title'] if w else '', lib_title=r['title_raw'], lib_author=r['author_raw'], lib_version=r['version_raw'],
                             url=r['url'], image_url=r['image_url'], has_image=int(r['has_image']),
                             existing_res=res.existing_res(wid) if wid else 0,
                             already_linked=x['already_linked'],
                             excluded=x['excluded'], reason_codes=';'.join(x['codes']),
                             reasons_text='；'.join(tier.TEXT[c] for c in x['codes']), candidates=','.join(x['cands'][:8]),
                             evidence=json.dumps(ev, ensure_ascii=False), engine_version=ver))
    json.dump(dict(source=source, n=len(rows), tiers=dict(cnt), codes=dict(codes_cnt.most_common()), group_split_groups=n_split, write_plan=n_plan, cap_dropped=n_drop),
              open(os.path.join(out, 'stats.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(dict(engine_version=ver, works_root=works_root, n_works=len(wi.works), era_keys=era._loaded['path'], era_names=n_names,
                   era_mapping_added=n_map, policy=repr(pol), seconds=round(time.time() - t0)),
              open(os.path.join(out, 'config_used.json'), 'w'), ensure_ascii=False, indent=1)
    return cnt


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True, choices=['nlc', 'ncltw', 'kokusho', 'ndl', 'naikaku', 'waseda', 'bnf', 'bsb', 'sbb', 'loc', 'cudl', 'onb'] + list(JPC1))
    ap.add_argument('--works-root', default=roots.book_index(), help='正式库根；缺省 $BOOK_INDEX 或 ../book-index')
    ap.add_argument('--data-root', default=roots.library_data(), help='library_data 根；缺省 $BOOK_INDEX_JSON/library_data 或 ../book_index_json/library_data')
    ap.add_argument('--out', required=True)
    ap.add_argument('--overview-root', default=roots.overview(), help='缺省 $OVERVIEW_ROOT 或 ../overview')
    ap.add_argument('--ledger-dir', help='古籍目录进度台账根（ledger.json 所在）；缺省 <overview-root>/项目进展/古籍目录/进度')
    ap.add_argument('--plan-dir', help='放 dupx-同题异作者清单.tsv／合刻组白名单.tsv 的目录；缺省 <overview-root>/项目进展/馆藏资源挂接/计划')
    ap.add_argument('--mapping', help='政权映射.tsv；缺省 <overview-root>/项目进展/朝代年号录入/政权映射.tsv')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--keys')
    ap.add_argument('--emit-write-plan', action='store_true')
    ap.add_argument('--alias', action='store_true', help='R1-E1 实验：对该源开 Entity 别名（nlc 用）')
    ap.add_argument('--annot-release', help='放行 WASEDA_ANNOT_SUSPECT 的 Work id 文件（每行一个）')
    a = ap.parse_args()
    if not a.works_root or not a.data_root:
        ap.error('找不到 book-index 或 library_data：用 --works-root／--data-root 或环境变量 BOOK_INDEX／BOOK_INDEX_JSON')
    rel = {l.split()[0] for l in open(a.annot_release, encoding='utf-8') if l.strip()} if a.annot_release else None
    c = run(a.source, a.works_root, a.data_root, a.out, a.overview_root, a.limit, a.keys, a.emit_write_plan, a.alias, rel, a.ledger_dir, a.plan_dir, a.mapping)
    n = sum(c.values())
    print({k: f'{v} ({v / n:.1%})' for k, v in c.items()})
