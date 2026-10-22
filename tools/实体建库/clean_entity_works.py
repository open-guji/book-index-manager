#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清 entity.works 之重複與懸空。**每次大批升格之後都要跑。**

其所以生：升格之際 rewrite_references 把 works[] 中之 draft id 改為
production id；本條若原已兼有二者，改後遂成重複。所指之 work 若在升格前
已併去，則改無可改而成懸空。chk.py 之「人物→作品 單向」查不到此二者
——其查只及於現存之 draft work。
"""
import json, glob, os, sys

PROD = next((r for r in ('../book-index', '/home/user/book-index')
             if os.path.isdir(os.path.join(r, 'Work'))), None)
NOW = '2026-08-25T00:00:00+00:00'


def main():
    apply_ = '--apply' in sys.argv
    IW = set()
    for s in '0123456789abcdef': IW |= set(json.load(open(f'index/works/{s}.json')))
    prod = {v['production_id'] for v in json.load(open('promotions.json'))['promotions'].values()}
    PW = set()
    if PROD:
        for p in glob.glob(os.path.join(PROD, 'Work/*/*/*/*.json')):
            try: PW.add(json.load(open(p))['id'])
            except Exception: pass
    live = IW | prod | PW
    nd = ndup = nfile = 0
    for p in glob.glob('Entity/*/*/*/*.json'):
        d = json.load(open(p))
        if not isinstance(d, dict) or d.get('_promoted_to'): continue
        ws = d.get('works')
        if not isinstance(ws, list): continue
        seen = set(); new = []; dang = dup = 0
        for w in ws:
            if not isinstance(w, dict) or not w.get('work_id'): continue
            wid = w['work_id']
            if wid in seen: dup += 1; continue
            if wid not in live: dang += 1; continue
            seen.add(wid); new.append(w)
        if not (dang or dup): continue
        nd += dang; ndup += dup; nfile += 1
        if not apply_: continue
        d['works'] = new; d['updated_at'] = NOW
        d['ai_note'] = (d.get('ai_note', '') + ('\n\n' if d.get('ai_note') else '') +
            f'2026-08-25 清 works：去重複 {dup}、去懸空 {dang}。'
            '升格之際 works 中之 draft id 改為 production id，本條原已兼有二者者遂重；'
            '所指之 work 若升格前已併去，則改無可改而懸空。').strip()
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
    print(f'{"已清" if apply_ else "擬清"}：涉 entity {nfile} 人，去重複 {ndup}、去懸空 {nd}')
    if not apply_: print('（只驗未寫；加 --apply 方清）')


if __name__ == '__main__':
    main()
