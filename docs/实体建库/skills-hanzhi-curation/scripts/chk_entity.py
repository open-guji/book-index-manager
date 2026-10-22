#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Entity 品質校驗（升格前之閘）。

chk.py 驗全庫之骨架（索引、關聯、格式），其於 entity 只驗三事：
索引指向之檔存否、人物↔作品雙向、entity_id 是否指向已退役者。
entity 自身之品質——id 之位、名之是否成名、代之自洽、works 之懸空——皆不在其中。
本檔補之。

**升格之不可逆**：一條記錄升格即成墓碑，此後不得再 curate（見
`.claude/plans/升格並行方案.md`〈一〉）。故凡本檔所報之「甲」級（阻塞），
必須在該 entity 升格之前清盡；「乙」級為存疑，可帶病升格而記其疑；
「丙」級為體例之異，不阻塞。

用法：
    python3 .claude/skills/hanzhi-curation/scripts/chk_entity.py [--json 輸出檔]
"""
import json, glob, os, sys, collections, re, unicodedata

ROOT = os.getcwd()
PROD = next((r for r in ('../book-index', 'book-index', '/home/user/book-index')
             if os.path.isdir(os.path.join(r, 'Work'))), None)

SHIFT_STATUS, SHIFT_TYPE = 62, 59
DIG = '0123456789abcdefghijklmnopqrstuvwxyz'
PERIODS = {'pre-qin','qin-han','three-kingdoms','jin','nanbeichao','sui-tang',
           'five-dynasties','song','liao-jin-yuan','ming','qing','modern'}
SUBTYPES = {'people','collective'}

sys.path.insert(0, os.path.join(ROOT, 'scripts'))
try:
    from period_bounds import DYNASTY_PERIOD
except Exception:
    DYNASTY_PERIOD = {}

ANON = ('不著','不詳','未詳','無名','闕名','佚名','不知','無考','缺名','失名','名未詳')
SHI  = re.compile(r'^.{1,2}氏$')
# 名之三判：殘語（甲）、合例之消歧（丙）、外域之名（丙）
FRAG  = re.compile(r'[。．”“」』、；;，,！!？?]|&amp;|&#|[□■囗�]|等$|集解$|本書有傳')
PAREN = re.compile(r'^([^（）()]{2,8})[（(]([^（）()]{1,12})[）)]$')   # 名（別名／關係）
LATIN = re.compile(r'^[A-Za-zĀāĪīŪūṀṁṂṃŅņṆṇŚśṢṣṬṭḌḍḤḥÑñĖėŌō\s.\-]+$')
TEMPLE = re.compile(r'^(太祖|高祖|世祖|太宗|高宗|中宗|睿宗|玄宗|肅宗|代宗|德宗|憲宗|穆宗|'
                    r'敬宗|文宗|武宗|宣宗|懿宗|僖宗|昭宗|真宗|仁宗|英宗|神宗|哲宗|徽宗|'
                    r'欽宗|光宗|寧宗|理宗|度宗|世宗|孝宗|成祖|聖祖|景帝|煬帝|後主)$')

def shard(i):
    h = 0
    for c in i: h = ((h * 31) + ord(c)) & 0xFFFFFFFF
    return '%x' % (h % 16)

def main():
    A = collections.defaultdict(list)   # 甲：阻塞升格
    B = collections.defaultdict(list)   # 乙：存疑
    C = collections.defaultdict(list)   # 丙：體例之異

    # ── 載入 ──
    IE = {}
    for s in DIG[:16]:
        fp = f'index/entities/{s}.json'
        if os.path.exists(fp): IE.update(json.load(open(fp)))
    ents = {}; paths = {}
    # glob 在 Windows 回的是反斜杠（Entity\0\0\w\…），而下文兩處比對的對家
    # 都是正斜杠：want_dir 是字面量 f'Entity/{…}'，index 的 path 由
    # book-index-manager 寫入時已 replace('\\','/')。不歸一則「目錄分片錯置」
    # 與「索引 path 不符」兩項在 Windows 上必然全條報錯——2026-09-13 實測
    # 各 278 條全屬此類，資料本身反斜杠 0 條、path 全數有效。
    # Linux/WSL 下 glob 本就回正斜杠，故此症向來只在 Windows 現形。
    for p in (q.replace(os.sep, '/') for q in glob.glob('Entity/*/*/*/*.json')):
        try: d = json.load(open(p))
        except Exception as e:
            A['解析失敗'].append((p, str(e))); continue
        if not isinstance(d, dict):
            A['解析失敗'].append((p, '非 JSON 物件')); continue
        i = d.get('id')
        if not i: A['無 id'].append(p); continue
        if i in ents: A['id 重複'].append((i, paths[i], p)); continue
        ents[i] = d; paths[i] = p
    PRm = json.load(open('promotions.json'))['promotions']
    d2p = {k: v['production_id'] for k, v in PRm.items()}
    prodids = set(d2p.values())
    IW = {}
    for s in DIG[:16]: IW.update(json.load(open(f'index/works/{s}.json')))
    PW = set()
    if PROD:
        for p in glob.glob(os.path.join(PROD, 'Work/*/*/*/*.json')):
            try: PW.add(json.load(open(p))['id'])
            except Exception: pass

    # work → 其 authors 所繫之 entity
    w2e = {}
    for p in glob.glob('Work/*/*/*/*.json'):
        try: d = json.load(open(p))
        except Exception: continue
        if not isinstance(d, dict) or d.get('_promoted_to'): continue
        w2e[d['id']] = {a.get('entity_id') for a in (d.get('authors') or [])
                        if isinstance(a, dict) and a.get('entity_id')}
    wper = {k: v.get('period') for k, v in IW.items()}

    byname = collections.defaultdict(list)

    tombs = {i for i, d in ents.items() if d.get('_promoted_to')}
    for i, d in ents.items():
        p = paths[i]
        if i in tombs:
            # 墓碑只驗三事：id 之位、索引之 promoted_to、promotions.json 之相符。
            # 其內容已移 production，draft 側不再 curate，故不驗名、代、works。
            e = IE.get(i)
            if e is None: A['墓碑未入索引'].append((i, p))
            elif e.get('promoted_to') != d['_promoted_to']:
                A['索引之 promoted_to 與墓碑不符'].append((i, e.get('promoted_to'), d['_promoted_to']))
            if PRm.get(i, {}).get('production_id') != d['_promoted_to']:
                A['promotions.json 與墓碑不符'].append((i, d['_promoted_to']))
            continue
        # 一、id 之形與位
        if len(i) != 13 or any(c not in DIG for c in i):
            A['id 形制不合（須十三位 base36）'].append((i, p))
        else:
            v = int(i, 36)
            if (v >> SHIFT_STATUS) & 1 != 1: A['id 之 status 位非 Draft'].append((i, p))
            if (v >> SHIFT_TYPE) & 7 != 4:   A['id 之 type 位非 Entity'].append((i, p))
        # 二、檔名與目錄分片
        want_dir = f'Entity/{i[-3]}/{i[-2]}/{i[-1]}'  # 分片取尾 3 字元
        if os.path.dirname(p) != want_dir:
            A['目錄分片錯置'].append((i, p, want_dir))
        base = os.path.basename(p)
        nm = d.get('primary_name')
        if nm and base != f'{i}-{nm}.json':
            A['檔名與 id／primary_name 不符'].append((i, base, f'{i}-{nm}.json'))
        # 三、索引
        e = IE.get(i)
        if e is None: A['未入索引'].append((i, p))
        else:
            if e.get('path') != p: A['索引 path 不符'].append((i, e.get('path'), p))
            for k in ('primary_name','subtype','dynasty','period'):
                if (e.get(k) or None) != (d.get(k) or None):
                    A['索引欄位不符'].append((i, k, e.get(k), d.get(k)))
        # 四、必備欄位與枚舉
        if d.get('type') != 'entity': A['type 非 entity'].append((i, d.get('type')))
        st = d.get('subtype')
        if st not in SUBTYPES: A['subtype 不合枚舉'].append((i, st))
        if not nm: A['primary_name 空'].append((i, p))
        if d.get('period') and d['period'] not in PERIODS:
            A['period 不合詞表'].append((i, d['period']))
        # 五、名之品質
        if nm:
            byname[nm].append(i)
            m = PAREN.match(nm)
            if LATIN.match(nm):
                C['primary_name 是外域之名（拉丁字母）'].append((i, nm))
            elif m and not FRAG.search(m.group(1)):
                C['primary_name 帶括注以消歧（合例）'].append((i, nm))
            elif FRAG.search(nm): A['primary_name 是殘語（含句讀、缺字或「等」「集解」之屬）'].append((i, nm))
            elif re.search(r'[A-Za-z0-9]', nm): A['primary_name 雜拉丁或數字'].append((i, nm))
            elif any(x in nm for x in ANON): A['primary_name 是匿名之語'].append((i, nm))
            elif SHI.match(nm) and len(nm) <= 3 and st == 'people':
                B['primary_name 是某氏泛稱（非specific之人）'].append((i, nm))
            elif TEMPLE.match(nm): B['primary_name 是廟號（未繫其實名）'].append((i, nm))
            if unicodedata.normalize('NFC', nm) != nm:
                C['primary_name 未正規化（NFC）'].append((i, nm))
        # 六、代之自洽
        dy, per = d.get('dynasty'), d.get('period')
        if dy and per and DYNASTY_PERIOD.get(dy) and DYNASTY_PERIOD[dy] != per:
            A['dynasty 與 period 不自洽'].append((i, dy, per, DYNASTY_PERIOD[dy]))
        if dy and not per: B['有 dynasty 而無 period'].append((i, dy))
        if per and not d.get('period_basis'): C['有 period 而無 period_basis'].append((i, per))
        if dy and not d.get('dynasty_basis'): C['有 dynasty 而無 dynasty_basis'].append((i, dy))
        # 七、works
        ws = d.get('works')
        if ws is None: B['無 works（孤懸，無 work 繫之）'].append((i, nm))
        else:
            seen = set()
            for w in ws:
                if not isinstance(w, dict): A['works 元素非物件'].append((i, repr(w)[:40])); continue
                wid = w.get('work_id')
                if not wid: A['works 元素無 work_id'].append((i,)); continue
                if wid in seen: A['works 之 work_id 重複'].append((i, wid))
                seen.add(wid)
                if not w.get('role'): C['works 元素無 role'].append((i, wid))
                live = wid in IW or wid in prodids or wid in PW
                if not live:
                    A['works 指向不存在之 work'].append((i, nm, wid))
                elif wid in IW and wid in w2e and i not in w2e[wid]:
                    A['人物→作品 單向（work 側未回指）'].append((i, wid))
            if ws == []: B['works 為空陣列（孤懸）'].append((i, nm))
            # 代相斥
            if per:
                ps = {wper.get(x.get('work_id')) for x in ws if isinstance(x, dict)}
                ps = {x for x in ps if x}
                far = [x for x in ps if x != per]
                if far: C['其代與所繫 work 之代不一'].append((i, nm, per, sorted(far)))
        # 八、alt_names
        al = d.get('alt_names')
        if al is not None:
            if not isinstance(al, list): A['alt_names 非陣列'].append((i,))
            else:
                seenn = set()
                for a in al:
                    an = a.get('name') if isinstance(a, dict) else a
                    if not isinstance(an, str) or not an:
                        A['alt_names 元素無名'].append((i, repr(a)[:30])); continue
                    if an == nm: C['alt_names 含 primary_name 自身'].append((i, an))
                    if an in seenn: C['alt_names 重複'].append((i, an))
                    seenn.add(an)
        # 九、格式
        raw = open(p, encoding='utf-8').read()
        if not raw.endswith('\n'): A['JSON 缺檔尾換行'].append((i,))
        if '\n  "' not in raw and len(raw) > 60: C['JSON 縮排疑非 2'].append((i,))

    # 十、索引殘留與排序
    for s in DIG[:16]:
        fp = f'index/entities/{s}.json'
        if not os.path.exists(fp): continue
        o = json.load(open(fp))
        for k, v in o.items():
            if k not in ents: A['索引指向不存在之 entity'].append((k, v.get('path')))
            elif v.get('promoted_to') and k not in tombs:
                A['索引標 promoted_to 而記錄檔非墓碑'].append((k,))
            if shard(k) != s: A['索引分片錯置'].append((k, s, shard(k)))
        if list(o) != sorted(o): A['索引檔鍵未按 id 排序'].append((fp,))

    # 十一、同名同代疑重出
    for nm, ids in byname.items():
        if len(ids) < 2: continue
        g = collections.defaultdict(list)
        for i in ids: g[ents[i].get('period')].append(i)
        for per, xs in g.items():
            if len(xs) > 1:
                B['同名同代（疑重出）'].append((nm, per, xs))

    # 十二、升格狀態
    ent_pr = [k for k, v in PRm.items() if v.get('type') == 'entity']
    if PROD and not os.path.isdir(os.path.join(PROD, 'Entity')) and ent_pr:
        A['promotions.json 有 entity 而 production 無 Entity 目錄'].append((len(ent_pr),))

    # ── 報 ──
    def emit(title, bucket):
        tot = sum(len(v) for v in bucket.values())
        print(f'\n{title}　{tot} 條')
        for k in sorted(bucket, key=lambda x: -len(bucket[x])):
            v = bucket[k]
            print(f'  {len(v):6d}  {k}')
            for x in v[:4]: print(f'            {x}')
            if len(v) > 4: print(f'            …餘 {len(v)-4}')
    print(f'entity 檔 {len(ents)}　索引 {len(IE)}　'
          f'production 掛載 {"是" if PROD else "否"}　已升格 entity {len(ent_pr)}')
    emit('【甲】阻塞升格——升格不可逆，必須清盡', A)
    emit('【乙】存疑——可帶病升格而記其疑', B)
    emit('【丙】體例之異——不阻塞', C)
    print(f'\n甲 {sum(len(v) for v in A.values())}　'
          f'乙 {sum(len(v) for v in B.values())}　'
          f'丙 {sum(len(v) for v in C.values())}')
    if '--json' in sys.argv:
        out = sys.argv[sys.argv.index('--json') + 1]
        with open(out, 'w', encoding='utf-8') as f:
            json.dump({'甲': {k: v for k, v in A.items()},
                       '乙': {k: v for k, v in B.items()},
                       '丙': {k: v for k, v in C.items()}}, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'（詳情已寫 {out}）')
    return 1 if A else 0

if __name__ == '__main__':
    sys.exit(main())
