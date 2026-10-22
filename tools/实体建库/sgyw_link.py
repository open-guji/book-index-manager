#!/usr/bin/env python3
"""《三國藝文志》整理本：補繫未繫之節，並回填部類

前輪（2026-08-07）留 96 條「未繫種」，其判是「整理本本身覆蓋不全」。今覆按：

  一、**舊清單已陳**。以今日之資料重算，96 之中 12 條早已繫上，實餘 84。
  二、**整理本尚有 42 節未繫 work_id**，非全然無主——以「撰人＋題名」歸一後
      比對全庫，得 12 節可繫（杜恕《體論》、王肅《毛詩義駮》《毛詩奏事》
      《孝經解》《論語釋》、王基《毛詩駮》、韋昭朱育等《毛詩答雜問》、徐整
      《毛詩譜》、嚴畯《孝經傳》、孫熙《孝經注》、張昭《論語注》、項峻《始
      學篇》）。前輪只得 3，是比對未歸一異體、未剔卷數與「某始末見某類」之
      附註所致。
  三、**部類可自整理本推得**，不必人定：一節之類，是其前最近之「结语」而不
      以「右」起、不以「總說」終者。以既繫之 399 節驗之，合 399、不合 0。
      據此回填 work 側 `indexed_by[].section` 之闕。
"""
import os as _os, sys as _sys
def _find_sectype():
    """自本檔往上尋 `book-index-draft/.claude/.../scripts`。

    **不可用 `expanduser('~/...')`**：本環境之 $HOME 是 /root 而工作區在
    /home/user，`~` 展開即落空，一跑就 ImportError。亦不可寫死相對層數——
    諸腳本散在不同深度。故自本檔之目錄逐級上溯尋之。"""
    d = _os.path.dirname(_os.path.abspath(__file__))
    for _ in range(8):
        for c in (_os.path.join(d, '.claude', 'skills', 'hanzhi-curation', 'scripts'),
                  _os.path.join(d, 'book-index-draft', '.claude', 'skills',
                                'hanzhi-curation', 'scripts')):
            if _os.path.exists(_os.path.join(c, 'sectype.py')):
                return c
        nd = _os.path.dirname(d)
        if nd == d:
            break
        d = nd
    raise ImportError('尋不著 sectype.py——工作區佈局變了？')
_sys.path.insert(0, _find_sectype())
import sectype   # 節之 type 新舊兩制之歸一（2026-08 英文枚舉遷移期）
import json, glob, re, ast, os, sys, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jyk_triage import nz, load_index

SRC = '1eve1eig5jn5s'
DIR = f'Work/1/e/v/{SRC}/collated_edition'


def label_map():
    idx = json.load(open(f'{DIR}/collated_edition_index.json'))
    return {g['files'][0]: re.sub(r'^卷[一二三四]（|）$', '', g['label'])
            for g in idx['juan_groups']}


def cls(secs, i):
    """一節之類：其前最近之「结语」而不以「右」起、不以「總說」終者"""
    for j in range(i - 1, -1, -1):
        s = secs[j]
        if not sectype.is_tally(s.get('type')):
            continue
        t = (s.get('title') or '').strip()
        if t.startswith('右') or t.endswith('總說'):
            continue
        return t
    return None


def sec_ids(s):
    v = s.get('work_ids')
    ids = ast.literal_eval(v) if isinstance(v, str) else (v or [])
    return ([s['work_id']] if s.get('work_id') else []) + list(ids)


def clean(t):
    t = re.sub(r'[一二三四五六七八九十百]+餘?[卷篇巻]', '', t or '')
    t = re.sub(r'[\s　].*?始末.*$', '', t)
    return nz(re.sub(r'[\s　]+', '', t))


def main():
    apply = '--apply' in sys.argv
    works = load_index('works')
    lab = label_map()
    by_title = collections.defaultdict(list)
    for v in works.values():
        by_title[nz(v.get('title'))].append(v)

    files = {}
    for f in glob.glob(f'{DIR}/*.json'):
        if 'index' in f:
            continue
        files[f] = json.load(open(f))

    # 一、42 未繫節 → 全庫
    link = []
    for f, cd in files.items():
        secs = cd['sections']
        for i, s in enumerate(secs):
            if not sectype.is_book(s.get('type')) or sec_ids(s):
                continue
            ct = clean(s['title'])
            best = []
            for k, ws in by_title.items():
                if not k or len(k) < 2 or not ct.endswith(k):
                    continue
                pre = ct[:-len(k)]
                for w in ws:
                    au = nz(w.get('author') or '')
                    if not pre or (au and (pre == au or au.endswith(pre) or pre.endswith(au))):
                        best.append((w, len(k)))
            if not best:
                continue
            best.sort(key=lambda x: -x[1])
            top = [b for b in best if b[1] == best[0][1]]
            if len(top) == 1:
                link.append((f, i, top[0][0], f"{lab.get(f.split('/')[-1], '?')}／{cls(secs, i)}"))

    # 二、既繫而 work 側無 section 者
    fill = []
    for f, cd in files.items():
        secs = cd['sections']
        for i, s in enumerate(secs):
            if not sectype.is_book(s.get('type')):
                continue
            for wid in sec_ids(s):
                w = works.get(wid)
                if not w:
                    continue
                d = json.load(open(w['path']))
                for e in (d.get('indexed_by') or []):
                    if e.get('source_bid') == SRC and not e.get('section'):
                        c = cls(secs, i)
                        if c:
                            fill.append((w['path'], wid, f"{lab.get(f.split('/')[-1], '?')}／{c}"))
                        break
    print(f'可繫之節 {len(link)}；既繫而部類闕者 {len(fill)}')
    for f, i, w, c in link:
        print(f"  [{f.split('/')[-1]}] {files[f]['sections'][i]['title'][:28]} → "
              f"《{w['title']}》{w.get('author')} {w['id']}  類：{c}")
    if not apply:
        print('（乾跑。加 --apply 方寫檔）')
        return

    touched = collections.defaultdict(list)
    for f, i, w, c in link:
        files[f]['sections'][i]['work_id'] = w['id']
        touched[w['path']].append((w['id'], c))
    for p, wid, c in fill:
        touched[p].append((wid, c))

    for f, cd in files.items():
        with open(f, 'w', encoding='utf-8') as fh:
            json.dump(cd, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    n = 0
    for p, items in touched.items():
        d = json.load(open(p))
        idx = d.setdefault('indexed_by', [])
        e = next((x for x in idx if x.get('source_bid') == SRC), None)
        c = items[0][1]
        if e is None:
            idx.append({'source': '三國藝文志', 'source_bid': SRC,
                        'title_info': f"《{d['title']}》", 'section': c,
                        'section_basis': '類目自整理本推得——一節之類是其前最近之'
                                         '「结语」而不以「右」起、不以「總說」終者；'
                                         '以既繫之 399 節驗之，合 399、不合 0'})
        elif not e.get('section'):
            e['section'] = c
            e['section_basis'] = ('類目自整理本推得——一節之類是其前最近之「结语」'
                                  '而不以「右」起、不以「總說」終者；以既繫之 399 節'
                                  '驗之，合 399、不合 0')
        else:
            continue
        with open(p, 'w', encoding='utf-8') as fh:
            json.dump(d, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        n += 1
    print('已改 work', n)


if __name__ == '__main__':
    main()
