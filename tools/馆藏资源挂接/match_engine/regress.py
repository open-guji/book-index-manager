"""块 D 步 6：新引擎 vs 旧匹配表（同一 Work 基线下重跑的旧表）端到端回归 + 金标评估。
python3 regress.py --source nlc --new DIR/matches.tsv --old 旧表.tsv [--gold gold/nlc.tsv] [--out DIR]
输出：回归摘要（stdout，json）、DIR/{new_confirmed_not_old.tsv, lost_confirmed.tsv, transitions.tsv, gold_eval.tsv}
金标按 sha1(source_record_id) 奇偶分两半：偶＝开发半（步 2–4 允许看），奇＝验证半（步 6 的主指标）。"""
import argparse
import collections
import csv
import hashlib
import json
import os


def read(path):
    return list(csv.DictReader(open(path, encoding='utf-8'), delimiter='\t'))


def half(rid):
    return 'dev' if int(hashlib.sha1(rid.encode()).hexdigest(), 16) % 2 == 0 else 'val'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--new', required=True)
    ap.add_argument('--old', required=True)
    ap.add_argument('--gold')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    new = {r['source_record_id']: r for r in read(a.new)}
    old = {r['source_record_id']: r for r in read(a.old)}
    summ = dict(source=a.source, n_new=len(new), n_old=len(old), only_new=len(set(new) - set(old)), only_old=len(set(old) - set(new)))
    common = sorted(set(new) & set(old))
    trans = collections.Counter((old[k]['tier'], new[k]['tier']) for k in common)
    summ['tiers_old'] = dict(collections.Counter(r['tier'] for r in old.values()))
    summ['tiers_new'] = dict(collections.Counter(r['tier'] for r in new.values()))
    summ['transitions'] = {f'{o}->{n}': c for (o, n), c in sorted(trans.items())}
    oc = [k for k in common if old[k]['tier'] == '确定']
    kept = [k for k in oc if new[k]['tier'] == '确定']
    same_work = [k for k in kept if new[k]['work_id'] == old[k]['work_id']]
    summ['old_confirmed'] = len(oc)
    summ['old_confirmed_still_confirmed'] = len(kept)
    summ['retention'] = round(len(kept) / len(oc), 4) if oc else None
    summ['kept_but_different_work'] = len(oc and kept) - len(same_work)
    lost = [k for k in oc if new[k]['tier'] != '确定']
    summ['lost_codes'] = dict(collections.Counter(c for k in lost for c in (new[k]['reason_codes'] or '').split(';')).most_common(12))
    gained = [k for k in common if new[k]['tier'] == '确定' and old[k]['tier'] != '确定']
    summ['new_confirmed_not_old'] = len(gained)

    def dump(name, keys, cols):
        with open(os.path.join(a.out, name), 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f, delimiter='\t')
            w.writerow(['source_record_id', 'old_tier', 'new_tier', 'old_work', 'new_work', 'lib_title', 'lib_author', 'lib_version', 'work_title', 'new_codes', 'old_reasons', 'url'])
            for k in keys:
                n, o = new[k], old[k]
                w.writerow([k, o['tier'], n['tier'], o['work_id'], n['work_id'], n['lib_title'], n['lib_author'], n['lib_version'], n['work_title'],
                            n['reason_codes'], o.get('reasons', ''), n['url']])
    dump('new_confirmed_not_old.tsv', gained, None)
    dump('lost_confirmed.tsv', lost, None)
    summ['new_confirmed_not_old_by_old_tier'] = dict(collections.Counter(old[k]['tier'] for k in gained))
    if a.gold:
        g = read(a.gold)
        ev = collections.Counter()
        rows = []
        for r in g:
            k = r['source_record_id']
            if k not in new:
                ev[('missing_in_new',)] += 1
                continue
            for name, tab in (('new', new), ('old', old)):
                if k not in tab:
                    continue
                t, wid = tab[k]['tier'], tab[k]['work_id']
                h = half(k)
                if r['label'] == '同':
                    if t == '确定' and (wid == r['work_id'] or not r['work_id']):   # B 半金标多数无 work_id：只能验“同”，不能验指向
                        res = 'ok'
                    elif t == '确定':
                        res = 'wrong_pass'             # 判确定但 Work 不是金标 Work＝放行错
                    else:
                        res = 'missed'
                else:                                  # 异／存疑：不应放行
                    res = ('manual' if not r['work_id'] else 'wrong_pass') if t == '确定' else 'ok_hold'   # 无 work_id 的 B 半标签对应旧候选，Work 变了要人看
                ev[(name, h, res)] += 1
                ev[(name, 'all', res)] += 1
                rows.append((name, h, k, r['label'], r['work_id'], t, wid, res, new[k]['lib_title'], new[k]['reason_codes'] if name == 'new' else ''))
        summ['gold'] = {'|'.join(k): v for k, v in sorted(ev.items())}
        with open(os.path.join(a.out, 'gold_eval.tsv'), 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f, delimiter='\t')
            w.writerow(['engine', 'half', 'source_record_id', 'gold_label', 'gold_work', 'tier', 'work', 'result', 'lib_title', 'new_codes'])
            w.writerows(rows)
    with open(os.path.join(a.out, 'transitions.tsv'), 'w', encoding='utf-8') as f:
        for (o, n), c in sorted(trans.items()):
            cc = collections.Counter(c2 for k in common if old[k]['tier'] == o and new[k]['tier'] == n and o != n for c2 in (new[k]['reason_codes'] or '').split(';'))
            f.write(f'{o}\t{n}\t{c}\t{dict(cc.most_common(6))}\n')
    json.dump(summ, open(os.path.join(a.out, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(summ, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
