"""校驗電池：每批整理之後必跑，比對基線數字。
用法：在庫根目錄執行 python3 .claude/skills/hanzhi-curation/scripts/chk.py"""
import json,os,glob
def li(k):
    d={}
    for s in '0123456789abcdef': d.update(json.load(open(f'index/{k}s/{s}.json')))
    return d
IW,IB=li('work'),li('book'); IC=json.load(open('index/collections.json'))
IE=li('entitie')
# Production ID ↔ Draft ID：庫中之互指有用 Production ID 者，比對前兩側俱須正規化。
# 不正規化則 Book→Work、Work→Book 之單向數全為假象（曾誤判二次）。
_PR=json.load(open('promotions.json'))['promotions']
# 歸一之向取 **draft → production**，不可反。
# 反向（production → draft）不是函數：併條之後一個 production id 可有數個 draft
# 記錄指之（甲併入乙、甲之 production 檔刪去而其墓碑改指乙——見 SKILL 坑 30
# 「一對多不必是撞號」），字典遂只留最後一個，於是同一個 Book 的 work_id 與
# Work 的 books 歸一到兩個不同的 draft id 上，〈Work→Book 單向〉平白報一批。
# 2026-08-25 遼金元輪實見五條，皆此型（讀易考原、易學變通、星命總括、易精蘊大義）。
# 正向則必是函數：一個 draft 只升一次。
D2P={k:v['production_id'] for k,v in _PR.items()}
def nz(i): return D2P.get(i,i)
def shard(i):
    h=0
    for c in i: h=((h*31)+ord(c))&0xFFFFFFFF
    return '%x'%(h%16)
SW={s:set(json.load(open(f'index/works/{s}.json'))) for s in '0123456789abcdef'}
SB={s:set(json.load(open(f'index/books/{s}.json'))) for s in '0123456789abcdef'}
print('索引 Work',len(IW),'Book',len(IB),'Collection',len(IC))
print('分片錯置 Work',sum(1 for k in IW if k not in SW[shard(k)]),
      ' Book',sum(1 for k in IB if k not in SB[shard(k)]))
# 目錄分片（`{Type}/{c1}/{c2}/{c3}/{ID}-{題}.json`，c1-c3 即 id 前三字元）。
# 與上一行之「分片錯置」不是一回事——那查的是 index/ 之雜湊分片。
# 立此驗之由：2026-08-23 查出五個 Work 檔落在 Work/1/e/v/ 而其 id 起首 1ewo，
# 正位是 1/e/w；《后蒼孝經說》更是記錄檔在 1/e/v 而 fragments 目錄在 1/e/w，
# 一條記錄裂在兩處。索引裡記的正是那個錯位置，故「索引欄位不符」比不出來，
# 一直是綠的；而 qa_work 由 id 推路徑去找，遂報「兩倉都找不到」。
_misdir=[p for t in ('Work','Book','Collection','Entity')
         for p in glob.glob(t+'/*/*/*/*.json')
         if list(os.path.basename(p).split('-',1)[0][-3:])!=p.split('/')[1:4]]
print('目錄分片錯置',len(_misdir),'　基線 0（id 前三字元須即其 c1/c2/c3 目錄）')
for x in _misdir[:8]: print('  錯位',x)
print('索引指向不存在檔案',sum(1 for v in list(IW.values())+list(IB.values())+list(IC.values())+list(IE.values()) if not os.path.exists(v['path'])),'　基線 0（含 entities；人物併池退役後索引殘留即現於此）')
prod={v['production_id'] for v in json.load(open('promotions.json'))['promotions'].values()}
ents=set()
for p in glob.glob('Entity/*/*/*/*.json'):
    try: ents.add(json.load(open(p))['id'])
    except Exception: pass
allids=set(IW)|set(IB)|set(IC)|prod|ents
selfref=nullrel=0; dang=[]; notidx=[]; mism=[]; parse=[]; derived=[]; rwdrift=[]; rwdup=[]
# 權威題名：draft 之 Work／Collection 索引，加 production 兩類記錄檔。
_TITLE={k:v.get('title') for k,v in IW.items()}
_TITLE.update({k:v.get('title') for k,v in IC.items()})
_PR_ROOT=next((r for r in ('../book-index','book-index') if os.path.isdir(r+'/Work')),None)
if _PR_ROOT:
    for _t in ('Work','Collection'):
        for _p in glob.glob('%s/%s/*/*/*/*.json'%(_PR_ROOT,_t)):
            try: _d=json.load(open(_p))
            except Exception: continue
            if isinstance(_d,dict) and _d.get('id') and _d.get('title'):
                _TITLE.setdefault(_d['id'],_d['title'])
b2w={}; w2b={}
_WKB={}   # work id → 其 books 欄是否有值（Book→Work 單向之墓碑判別用）
for kind,pat,idx in (('W','Work/*/*/*/*.json',IW),('B','Book/*/*/*/*.json',IB)):
    for p in glob.glob(pat):
        try: d=json.load(open(p))
        except Exception as e: parse.append((p,str(e))); continue
        i=d.get('id'); e=idx.get(i)
        if e is None: notidx.append(p); continue
        if e['path']!=p: mism.append(('path',i,e['path'],p))
        if e.get('title')!=d.get('title'): mism.append(('title',i,e.get('title'),d.get('title')))
        if d.get('authors') and e.get('author')!=d['authors'][0].get('name'):
            mism.append(('author',i,e.get('author'),d['authors'][0].get('name')))
        # 索引其餘可機械推出之欄，規則照抄 book-index-manager 的 build_index_entry：
        # 空值不入索引，故一律以「或 None」比對。2026-08-22 實測：只比 path/title/
        # author 時，全庫尚有 2,666 條索引與記錄檔不符而無人知——dynasty 1,882、
        # original_title 680、work_id 45 皆在盲區。凡改記錄檔而未重建索引即生此漂移，
        # 修法：以本工具重建（見 .claude/plans/並行作業總表.md S2 條）。
        _a0=(d.get('authors') or [{}])[0]
        _a0=_a0 if isinstance(_a0,dict) else {}
        _want2={'dynasty':_a0.get('dynasty') or d.get('dynasty') or None,
                'role':_a0.get('role') or None,
                'original_title':d.get('original_title') or None}
        if kind=='B': _want2['work_id']=d.get('work_id') or None
        for _k,_v in _want2.items():
            if (e.get(_k) or None)!=_v: mism.append((_k,i,e.get(_k),_v))
        # 派生欄位（底線起首）：重新生成後比對，不一致以生成值為準（issue #10）。
        # has_text 曾是「有的對、有的錯、大半沒有」——欄名與手寫欄無別，遂無人知其該不該在。
        _ts=set()
        for _r in d.get('resources') or []:
            if isinstance(_r,dict): _ts.update(_r.get('types') or ([_r['type']] if _r.get('type') else []))
        _want={'_has_text':'text' in _ts,'_has_image':'image' in _ts,
               '_has_collated':bool(i) and os.path.isdir(os.path.join(os.path.dirname(p),i,'collated_edition'))}
        for _k,_v in _want.items():
            if (d.get(_k) or False)!=_v: derived.append((p,_k,d.get(_k),_v))
        if kind=='W':
            _rwseen=set()
            for r in d.get('related_works') or []:
                if not r or not r.get('id') or not r.get('relation'): nullrel+=1; continue
                if r['id']==i: selfref+=1
                if r['id'] not in allids: dang.append((p,r['id'],r.get('title')))
                # related_works[].title 靠人工同步，必然漂移；不改結構，只報其數。
                # 目標可以是 draft Work、production Work，或 Collection（collected_in
                # 之對象即彙編）。原先只查 `r['id'] in IW`，於是 production 目標整條跳過
                # ——《老子》正名《道德經》後 48 處舊題一條也沒報出來（2026-08-23 查出並修）。
                elif r.get('title'):
                    _t=_TITLE.get(r['id'])
                    if _t and _t!=r['title']:
                        rwdrift.append((p,r['id'],r['title'],_t))
                # 同一 (id, relation) 出現兩次即冗餘。以 id 為鍵會誤報——《尚書大傳》
                # 既 contains_text_of 又 studies《尚書》，二者俱真，關係不同即是兩件事。
                _k=(r.get('id'),r.get('relation'))
                if _k in _rwseen: rwdup.append((p,r.get('id'),r.get('relation')))
                _rwseen.add(_k)
            _WKB[i]=bool(d.get('books'))
            for b in d.get('books') or []: w2b.setdefault(b,set()).add(i)
        else:
            if d.get('work_id'): b2w[i]=d['work_id']
print('解析失敗',len(parse),'檔案未入索引',len(notidx),'索引欄位不符',len(mism))
print('派生欄位與重算不符',len(derived),'　基線 0（不符即以重算值為準）')
for x in derived[:8]: print('  派生',x)
print('related_works[].title 漂移',len(rwdrift),'　基線 0（含 production／Collection 目標）')
for x in rwdrift[:8]: print('  漂移',x)
print('related_works (id,relation) 重複',len(rwdup),'　基線 0')
for x in rwdup[:8]: print('  重複',x)
for x in notidx[:10]: print('  未入索引',x)
for x in mism[:15]: print('  不符',x)
print('自我關聯',selfref,'空關聯',nullrel,'懸空關聯',len(dang))
for x in dang[:10]: print('  懸空',x)
# 兩側俱經 promotions 正規化
_w2b={}
for b,ws in w2b.items(): _w2b.setdefault(nz(b),set()).update(nz(x) for x in ws)
# 升格後 draft 只留五欄墓碑（無 books），本文記錄在 production。只掃 draft 之 books
# 會把「Book 指向已升格之 Work」全報成單向——2026-08-23 實測 342 條中 339 條是此假陽性，
# 真單向只 3 條（道德經漏收之三 Book），而假陽性把它們埋了。故併讀 production 之 books。
_PROD_ROOT=next((r for r in ('../book-index','book-index') if os.path.isdir(r+'/Work')),None)
# production 之 Work id 集。IW 只由 draft 索引建，而升格之後庫中互指多已改為
# production id（sweep-promoted-refs 之所為），只查 IW 便把它們全報成「不存在」。
# 2026-08-25 無斷代輪：輯佚檔 collectors.work_id 經 sweep 改指已升格之輯本
# （玉函山房輯佚書 → d59f2mua7w8y），遂誤報一條。
PW=set()
if _PROD_ROOT:
    for _p in glob.glob(_PROD_ROOT+'/Work/*/*/*/*.json'):
        try: _d=json.load(open(_p))
        except Exception: continue
        if not isinstance(_d,dict) or not _d.get('id'): continue
        PW.add(_d['id'])
        for _b in (_d.get('books') or []):
            _w2b.setdefault(nz(_b),set()).add(nz(_d['id']))
    # Book 側同理：production 有自己的 Book 檔（升格時一併遷入），
    # 只掃 draft 之 Book 會把它們全報成 Work→Book 單向。
    for _p in glob.glob(_PROD_ROOT+'/Book/*/*/*/*.json'):
        try: _d=json.load(open(_p))
        except Exception: continue
        if isinstance(_d,dict) and _d.get('id') and _d.get('work_id'):
            b2w.setdefault(_d['id'],_d['work_id'])
_b2w={nz(b):nz(w) for b,w in b2w.items()}
ow=[(b,w) for b,w in _b2w.items() if w not in _w2b.get(b,set())]
ww=[(b,w) for b,ws in _w2b.items() for w in ws if _b2w.get(b)!=w]
# 未掛 production 倉時，升格之 work 在 draft 只餘五欄墓碑（無 books），
# 其 Book 之 work_id 仍指之，遂全報成單向。此非缺陷，是本文不在此倉——
# 而 promotions.json 就在庫內，足以逐條認出，不必真掛 production。
# 2026-08-24 實測：342 條單向**無一例外**皆此型，真單向 0。
if not _PROD_ROOT:
    _tomb={k for k,v in _PR.items() if v.get('type')=='work'}
    _sup=[(b,w) for b,w in ow if w in _tomb and not _WKB.get(w)]
    ow=[x for x in ow if x not in set(_sup)]
    if _sup:
        print(f'  ※ 未見 production 庫（../book-index）；'
              f'Book→Work 單向中 {len(_sup)} 條指向已升格之墓碑，本文在 production，'
              f'不計入（憑 promotions.json 認出）')
print('Book→Work 單向',len(ow),' Work→Book 單向',len(ww))
for x in ow[:5]: print('  B→W',x)
for x in ww[:5]: print('  W→B',x)

# 人物 ↔ 作品之雙向：entity.works 指向作品，不代表作品回指該人物
#
# 2026-08-26 改：**本驗一度成空驗**。2026-08-25 entity 全量升格之後，draft 的
# `Entity/` 只剩五欄墓碑（無 works），此處若仍只讀 draft，`ent` 全是墓碑，
# e_only/w_only 結構上恆為零——照樣印 0，卻什麼也沒驗。實測其時兩倉尚有
# 三十二處單向而本驗報零。今改讀 production 之 entity，work 則兩倉並取。
ent={}
for _r in ([_PR_ROOT] if _PR_ROOT else []) + ['.']:
    for p in glob.glob(_r+'/Entity/*/*/*/*.json'):
        try: e=json.load(open(p))
        except Exception: continue
        if e.get('_promoted_to'): continue        # 墓碑無 works，不入計
        ent[e['id']]=e
w2e={}
for _r in ['.'] + ([_PR_ROOT] if _PR_ROOT else []):
    for p in glob.glob(_r+'/Work/*/*/*/*.json'):
        try: d=json.load(open(p))
        except Exception: continue
        # 墓碑（已升格者）不計：其 authors 是升格當時之凍結快照，而 Entity 之 works
        # 已由 promote 之 rewrite_references 改指 production id——Entity 不再 claim 墓碑
        # 是對的，不是單向缺失。不濾則每升一條就多兩行假警報（實測升三條即現二條）。
        #
        # 又：draft 之 work 已入 promotions.json 而其檔尚未 stub 化者（升格與 stub
        # 化分兩步，其間可長達數時），亦當比照墓碑不計——否則每升一批 work
        # 就多出成千上萬條假單向（實測 32,576 條）。
        if d.get('_promoted_to') or (_r=='.' and d.get('id') in _PR): continue
        w2e[d.get('id')]={a.get('entity_id') for a in (d.get('authors') or []) if a.get('entity_id')}
e_only=sum(1 for i,e in ent.items() for x in (e.get('works') or [])
           if x.get('work_id') in w2e and i not in w2e[x['work_id']])
w_only=sum(1 for w,es in w2e.items() for i in es
           if i in ent and not any(x.get('work_id')==w for x in (ent[i].get('works') or [])))
print('人物→作品 單向',e_only,' 作品→人物 單向',w_only)
# work 之 authors[].entity_id 指向已不存在（多是併池退役而未隨遷）之 entity。
# 2026-08-24 立此驗：舊法只在該 entity 一側亦宣稱其書時，才由上一行間接照出；
# 若兩側俱未宣稱，則全無人知。實測查出二條（古文官書衛敬仲撰、萬譏論）。
# entity 升格之後，work 之 authors[].entity_id 改指 production id；
# 該 id 不在 draft 之 index/entities 中，若不備此集則盡報為「已退役」。
_PENT=set()
if _PROD_ROOT:
    for _p in glob.glob(_PROD_ROOT+'/Entity/*/*/*/*.json'):
        try: _PENT.add(json.load(open(_p))['id'])
        except Exception: pass
_PENT |= {v['production_id'] for v in _PR.values() if v.get('type')=='entity'}
_deadent=[]
# 2026-08-25 補：舊法 `for _w,_e in IW.items()` 只掃 **draft 之 works 索引**，
# production 側之 Work 根本不在其列。而斷代諸輪畢後正身盡在 production、
# draft 側只剩墓碑，此驗遂名存實亡——實測 production 有 52 處懸空而此驗報 0
# （2026-08-24 entity 品質清整退役一批「…等」與含缺字符之 entity，draft 側
# 隨之改繫／撤繫而 production 未跟）。今兩庫之 Work 與 Book 一併掃。
_entfiles=set()
for _r in ['.'] + ([_PROD_ROOT] if _PROD_ROOT else []):
    for _p in glob.glob(_r+'/Entity/*/*/*/*.json'):
        _entfiles.add(os.path.basename(_p).split('-',1)[0])
_alive=set(IE) | _PENT | _entfiles
_scan=[(_w,_e['path']) for _w,_e in IW.items()]
for _r in ([_PROD_ROOT] if _PROD_ROOT else []):
    for _t in ('Work','Book'):
        for _p in glob.glob(f'{_r}/{_t}/*/*/*/*.json'):
            _scan.append((os.path.basename(_p).split('-',1)[0], _p))
for _w,_path in _scan:
    try: _d=json.load(open(_path))
    except Exception: continue
    for _a in (_d.get('authors') or []):
        if not isinstance(_a,dict): continue
        _i=_a.get('entity_id')
        if isinstance(_i,str) and _i and _i not in _alive:
            _deadent.append((_w,_a.get('name'),_i))
print('作品之 entity_id 指向已退役者',len(_deadent),'　基線 0'
      + ('（production entity %d 條不計——已升格者之 id 正當如此）' % len(_PENT) if _PENT else ''))
for x in _deadent[:8]: print('  ',x)

# 整理本 section 之 work_ids ↔ work 之 emendated_by
# 母條升格後 CE 目錄留在 draft（路徑仍以 draft id 為鍵），而 sweep 已把子條之
# source_bid 改寫為 production id——故 source_bid 等於母條之 production id 亦合。
# 2026-08-25 宋輪（漢藝文志考證／新唐書藝文志升格）踩過：不認映射則假報 87。
import ast
_pm={}
try:
    for _k,_v in json.load(open('promotions.json'))['promotions'].items():
        _pm[_k]=_v.get('production_id')
except Exception: pass
desync=0; _desync_seen=0
# 2026-08-26：資產諸驗原只 glob draft 之相對路徑。draft 側之整理本於本日清去
# （升格時已整體拷入 production，兩份逐檔比對唯 production 多 revision 一欄），
# 若不改則此諸驗盡掃 0 檔而**靜默顯 0**——看著全綠而其實空驗，是最危險的壞法。
# 今兩倉並掃。owner id 不可再取 `_ce_owner(f)`：那只對 draft 之相對路徑成立，
# production 是絕對路徑而段數不同。取資產目錄之父目錄名，兩者皆準，
# 且對 collated_edition／fragments 兩種資產一體適用。
# 2026-08-26 文本拆分：整理本／輯佚／全文已遷入 book-text，本倉（book-index）
# 之下再無此類資產。不加此根則凡掃資產之驗齊齊空掃——拆分當日實見附屬部帙
# 396→0、別本 7→0、一書兩著 117→0，其 0 是空掃而非全清。
_TEXT_ROOT=next((r for r in ('../book-text','book-text')
                 if os.path.isdir(r+'/Work')), None)


def _assets(sub, leaf='*.json'):
    # **兩種深度都要掃。** 2026-08-26 歸一後卷檔入 `collated_edition/juan/`，
    # 比舊制深一層；glob 是固定深度的，只寫一條則歸一當日此諸驗即靜默空掃
    # （實見附屬部帙 396→0、別本 7→0、一書兩著 117→0）。凡改目錄層級，
    # 先問哪些 glob 會落空。
    _r = []
    _roots = [''] + [f'{_x}/' for _x in (_PROD_ROOT, _TEXT_ROOT) if _x]
    for _pre in _roots:
        _r += glob.glob(f'{_pre}Work/*/*/*/*/{sub}/{leaf}')
        _r += glob.glob(f'{_pre}Work/*/*/*/*/{sub}/juan/{leaf}')
    return sorted(set(_r))


_ASSET_DIRS = {'collated_edition', 'fragments', 'juan', 'text', 'source',
               '_working'}


def _ce_owner(_f):
    """owner id = 自檔往上走，越過一切資產目錄名，所遇之第一個目錄。
    **不可寫死上溯幾級**——歸一把卷檔挪深一層之後，上溯兩級只到
    `collated_edition`，全部 owner 塌成同一個。2026-08-26 改。"""
    _d = os.path.dirname(_f)
    while os.path.basename(_d) in _ASSET_DIRS:
        _d = os.path.dirname(_d)
    return os.path.basename(_d)


_CE_FILES = _assets('collated_edition')
# fragments 之驗其內部集合是 draft 口徑（`IW[wid]['path']`），production 之
# fragments 餵進去盡報「work 不存在」（實測 1250）。故此驗仍只掃 draft
# ——而 draft 側之 fragments 已由 clean-promoted-fragments 清盡，此驗實已空。
# **production 側之 fragments 當另立驗**，記於 known-issues，非本輪之事。
_FRAG_FILES = glob.glob('Work/*/*/*/*/fragments/*.json')
# draft 側之輯佚早已清盡，故此驗在本檔恆空掃；production 側者今在 book-text，
# 其驗歸 chk-cross（實掃 1,250 檔）。存此變數以免下游 KeyError，勿以其 0 為據。
# 清單檔 2026-08-26 更名 index.json；舊名暫存以容未及改者
_CE_IDX = [f for f in _CE_FILES
           if os.path.basename(os.path.dirname(f)) == 'collated_edition'
           and os.path.basename(f) in ('index.json', 'collated_edition_index.json')]


for f in _CE_FILES:
    # **不可寫作 `'index' in f`。** production 之根是 `../book-index`，
    # 其名本身即含 "index"，於是**每一個 production 之整理本檔都被跳過**；
    # 而 draft 側整理本已清盡（0 檔），此迴圈遂長跑在零檔之上，
    # 報的 0 是空掃而非乾淨（chk-cross 於同一資料實得 655）。2026-08-26 查出。
    # 凡以子字串判路徑者，先問倉名、目錄名會不會自己撞上去。
    if os.path.basename(f) in ('index.json', 'collated_edition_index.json'): continue
    try: cd=json.load(open(f))
    except Exception: continue
    if not isinstance(cd,dict): continue
    src=_ce_owner(f)
    ok_bids={src}
    if _pm.get(src): ok_bids.add(_pm[src])
    for sec in cd.get('sections',[]):
        if not isinstance(sec,dict): continue
        v=sec.get('work_ids'); ids=ast.literal_eval(v) if isinstance(v,str) else (v or [])
        for i in ids:
            e=IW.get(i)
            if not e: continue
            try: dd=json.load(open(e['path']))
            except Exception: continue
            # 升格墓碑只留骨架欄（indexed_by 在 production 本文），此驗不及；
            # 併條墓碑同理。2026-08-25 宋輪墓碑 stub 化後立此例外。
            if dd.get('_promoted_to') or dd.get('merged_into'): continue
            _desync_seen+=1
            if not any(y.get('source_bid') in ok_bids for y in (dd.get('emendated_by') or [])
                       +(dd.get('indexed_by') or [])): desync+=1
# **此數已不足據，真驗在 chk-cross.py。** 上面 `IW.get(i)` 只查 draft 索引，
# 而節之 work_id 今皆 production id，遂無一入數；升格既竟，此驗在本檔恆為 0
# 而其實一節未看。同一資料 chk-cross 實得 655（另 1,979 出於選本與輯佚叢書，
# 其節指所選之篇或所輯之原書，本不是「著錄」，是驗之前提不合彼型）。
# 存此行以誌其目，並印所掃之節數——0 掃之 0 與全過之 0，輸出一模一樣。
print('整理本繫連而 work 側無記錄',desync,
      f'　（本檔只查 draft 索引，實掃 {_desync_seen} 節；真驗見 chk-cross.py）')

# 輯佚檔 fragments/*.json
fbad=[]
for f in _FRAG_FILES:
    wid=_ce_owner(f)
    try: fd=json.load(open(f))
    except Exception as e: fbad.append((f,'解析失敗')); continue
    if fd.get('work_id')!=wid: fbad.append((f,'work_id 與路徑不符'))
    if wid not in IW: fbad.append((f,'work 不存在')); continue
    # 受控詞彙一律英文（2026-08 遷移）。輯佚檔本作中文三層而整理本作 toc/text，
    # 同一概念兩套詞，今並歸英文；專名與散文說明仍中文。
    _LV={'catalog','titles','text','text_partial'}
    if (fd.get('coverage') or {}).get('level') not in _LV:
        fbad.append((f,"coverage.level「%s」不在三層之內"%(fd.get('coverage') or {}).get('level')))
    for _fr in (fd.get('fragments') or []):
        # 篇目層之條：有 piece_title 而 text 為 null，須明記 text_status
        if _fr.get('text') is None and _fr.get('piece_title') and not _fr.get('text_status'):
            fbad.append((f,'fragments 有篇題而無 text_status，未錄與無文無從分辨'))
    _LS={'lost','partially_extant','extant','undetermined'}
    if 'loss_status' in fd and fd['loss_status'] not in _LS:
        fbad.append((f,f"loss_status「{fd['loss_status']}」不在枚舉內"))
    cov=fd.get('coverage') or {}
    rec=sum(1 for x in (fd.get('fragments') or []) if (x.get('text') or '').strip())
    if cov.get('fragments_recorded')!=rec:
        fbad.append((f,f"fragments_recorded {cov.get('fragments_recorded')} ≠ 實錄 {rec}"))
    if cov.get('level')=='著錄層' and rec and cov.get('level')!='文本層' and rec>0 and not cov.get('note'):
        fbad.append((f,'著錄層而有錄文，未說明'))
    # collection_attested：確有輯本而未詳其輯家者。此亦是據，不得作空檔論。
    if not (fd.get('collectors') or fd.get('fragments') or fd.get('collection_attested')):
        fbad.append((f,'既無輯家亦無佚文'))
    # 受控詞彙殘留中文者，是遷移未盡或新寫者未依例
    for _k,_ok in (('text_status',{'recorded','not_recorded'}),('confidence',{'certain','uncertain'})):
        for _fr in (fd.get('fragments') or []):
            if _fr.get(_k) and _fr[_k] not in _ok:
                fbad.append((f,f'{_k}「{_fr[_k]}」不在枚舉內（受控詞彙須英文）')); break
    if fd.get('provenance') and fd['provenance'] not in {'secondary','primary'}:
        fbad.append((f,f"provenance「{fd['provenance']}」不在枚舉內"))
    for _x in (fd.get('collectors') or []):
        # collectors 之一條即斷言「某人輯過此書」；無其人則此斷言落空
        if not (_x.get('collector') or '').strip():
            fbad.append((f,'collectors 有條而輯家為空'))
        _wk=_x.get('work'); _wi=_x.get('work_id')
        if _wi and _wi not in IW and _wi not in PW: fbad.append((f,f'輯本 work_id {_wi} 不存在'))
    try: wd=json.load(open(IW[wid]['path']))
    except Exception: wd={}
    if 'fragments/' not in (wd.get('ai_note') or ''):
        fbad.append((f,'work 側未記本檔'))
print('輯佚檔',len(glob.glob('Work/*/*/*/*/fragments/*.json')),'不合',len(fbad))
for x in fbad[:12]: print('  ',x)

# 題名互為子串而撰人相容之 work 對——「同一部書兩種題名」之重出。
# 立此驗之由：曾據《玉函山房輯佚書》目錄新建 work，以「題名精確相等」比對，
# 而庫中題名不規範（《六藝論》庫作「鄭玄六藝論」「六藝論鄭玄撰」），
# 精確比對必落空，遂誤建三十條。八輪之後方因他事偶然撞見。
# 判準取其準者，不取其備者——只認「長題恰為 撰人+短題 / 短題+撰人(+役)」一式：
#   兩側俱須有撰人且相容。一方無撰人則不取——《歸藏》(無撰人) 與《歸藏薛貞注》(薛貞)
#   是原典與注本之別，本為二物（注家有其創作），非重出。
#   短題為庫中多見者（《算經》《詩集》《兵法》之屬）不取，通名撞而不實。
from opencc import OpenCC as _OCC
_t2s=_OCC('t2s'); _N=lambda x:_t2s.convert((x or '').strip())
_byt={}
for _i,_e in IW.items():
    _t=_N(_e.get('title'))
    if _t: _byt.setdefault(_t,[]).append(_i)
_ROLE=('撰','注','傳','疏','集解','注疏','述','說','解','章句','集注','集註')
_dupt=set()
for _i,_e in IW.items():
    _t=_N(_e.get('title')); _au=_N(_e.get('author'))
    if not _t or len(_t)<3 or not _au or len(_au)<2: continue
    _cd=set()
    if _t.startswith(_au) and len(_t)>len(_au): _cd.add(_t[len(_au):])
    if _t.endswith(_au) and len(_t)>len(_au): _cd.add(_t[:-len(_au)])
    for _r in _ROLE:
        if _t.endswith(_au+_r) and len(_t)>len(_au)+len(_r): _cd.add(_t[:-(len(_au)+len(_r))])
    for _s in _cd:
        if len(_s)<2: continue
        _js=_byt.get(_s,())
        if len(_js)>2: continue
        for _j in _js:
            if _j==_i: continue
            _a2=_N(IW[_j].get('author'))
            if not _a2: continue
            if _a2!=_au and _a2 not in _au and _au not in _a2: continue
            _dupt.add((min(_i,_j),max(_i,_j)))
print('題名重出（長題＝撰人＋短題，撰人相容）',len(_dupt),'　基線 70（2026-08-08 batch16 連書省撰人合併消解其中 2 組）')
for _a,_b in sorted(_dupt)[:6]:
    print(f"   《{IW[_a].get('title')}》({IW[_a].get('author')}) ←→ 《{IW[_b].get('title')}》({IW[_b].get('author')})")

# 整理本 section 之 work_id / target_bid 是否落空
# （匯入時每條都鑄了 id，而 Work 檔只生成了一部分，故有懸空；索引側查不到這一類）
try: IB
except NameError:
    IB={}
    for _s in '0123456789abcdef':
        try: IB.update(json.load(open(f'index/books/{_s}.json')))
        except Exception: pass
import collections as _c
dang=_c.Counter(); dang_is_book=0; dang_ids=set()
# 升格之後，整理本節之 work_id 由 rewrite_references 改指 production id，
# 而 IW 只有 draft。只查 IW 則每升一條就把它的節全算成「落空」——
# 實測升三條，落空由 312 漲到 336。故存在性以兩倉合計判。
# _TITLE 已在前面建好（draft 索引 + production Work／Collection 之記錄檔）。
#
# 2026-08-23 補：**未掛 production 倉時，以 promotions.json 補其證**。
# 本容器不掛 `../book-index`，_TITLE 之 production 部分遂為空，於是每升一條
# 其節即全算落空——實測 08-19 升者致 200 節、08-20 致 87 節、08-23 致 190 節，
# 落空由 322 漲到 475，而其中 438 節（58 個相異 id）所繫皆已升格之 production
# id，非真損壞。`promotions.json` 即「彼倉確有此記錄」之在庫憑證，chk 之
# 「懸空關聯」一驗其 allids 早已併入 prod（見上文），落空一驗未併，同一情形
# 兩驗異判。今補之——掛了 production 倉時 _TITLE 自足，此項不過多一層保險。
_EXIST_W=set(IW)|set(_TITLE)|prod
# 2026-08-26 補 production 實有之 Work：原式取 draft 之 id 與 promotions 之
# production_id，而 production 內**另立**者（非自 draft 升格，如「新立 Work 56 條」）
# 不在 promotions，遂盡報落空——實測 3 處。Book 側早已備此（見下 _EXIST_B），
# 此處漏之。
if _PROD_ROOT:
    for _p in glob.glob(_PROD_ROOT+'/Work/*/*/*/*.json'):
        _EXIST_W.add(os.path.basename(_p).split('-',1)[0])
# Book 側同理——`book_id` 亦有指已升格之 production Book 者（《脂硯齋重評石頭
# 記》諸本之屬）。promotions.json 之 type 分 work／book，此處不分而全取：
# id 空間本不相犯，多取無害而少取則生誤報。2026-08-23 立。
_EXIST_B=set(IB)|prod
# 2026-08-26 補 production Collection：Collection 於本日全量升格（63 條盡入
# production），整理本節之 collection_id 隨 sweep 改指 production id（`8rl…`），
# 而此集原只取 draft 之 IC，遂盡報落空——實測 19 處，其目標**皆在
# production 且皆存在**，是驗之洞非資料之損。Work／Book 兩類早已備
# production 側之集（_EXIST_W／_EXIST_B 皆併 prod），此處漏之。
#
# **然不可照抄作 `set(IC)|prod`**（2026-08-26 當日即因此而誤，同日查出改正）。
# 二集性質不同：`_EXIST_B` 問「此 id 存在否」，寧多勿少，併 `prod`（全部升格
# id，work／book／collection 皆在內）無害；`_COLL` 問「此 id **是** Collection
# 否」，是**肯定性判斷**，併之則凡已升格之 work 皆被斷為叢書。且下方
# `if w in _COLL: … continue` 排在 `_EXIST_W` 之前，遂把正常情形整個遮住——
# 實測 `_COLL` 由當有之 126 膨脹至 122,877，此驗報 101,466（全庫 section 之
# 七成），真出一條亦淹沒其中，自立驗之日起即是瞎的。
# 通則：**存在性之集可寧濫勿缺，分類性之集不可**。
_COLL=set(IC)|{v['production_id'] for k,v in _PR.items() if k in IC}
if _PROD_ROOT:
    for _p in glob.glob(_PROD_ROOT+'/Collection/*/*/*/*.json'):
        _COLL.add(os.path.basename(_p).split('-',1)[0])
_sec2coll=0; _coll_ids=set()
if _PR_ROOT:
    for _p in glob.glob(_PR_ROOT+'/Book/*/*/*/*.json'):
        try: _d=json.load(open(_p))
        except Exception: continue
        if isinstance(_d,dict) and _d.get('id'): _EXIST_B.add(_d['id'])
for f in _CE_FILES:
    if f.endswith('collated_edition_index.json'): continue
    try: cd=json.load(open(f))
    except Exception: continue
    if not isinstance(cd,dict): continue
    for sec in cd.get('sections',[]):
        if not isinstance(sec,dict): continue
        ws=[sec['work_id']] if isinstance(sec.get('work_id'),str) else []
        v=sec.get('work_ids')
        if isinstance(v,list): ws+=[x for x in v if isinstance(x,str)]
        for w in ws:
            # 叢書當用 collection_id（SCHEMA 2026-08-23 增），不得用 work_id。此數當恆為 0。
            # 《中國通俗小說書目》卷九附錄二〈叢書目〉之節（《四大奇書》《前後
            # 七國志》《怡園五種》之屬）本是叢書，庫中以 Collection 記之，而
            # 節仍用 work_id 一欄。SCHEMA〈整理本 section 的三個指涉欄位〉只列
            # work_id／book_id／target_bid，無指 Collection 者——**當否立
            # collection_id 一欄是 SCHEMA 之事，屬單線車道**，故此處不併入
            # _EXIST_W（併之則此事自此隱沒），另立一數以存其目。2026-08-23 立。
            if w in _COLL: _sec2coll+=1; _coll_ids.add(w); continue
            if w in _EXIST_W: continue
            dang[_ce_owner(f)]+=1; dang_ids.add(w)
            if w in _EXIST_B: dang_is_book+=1
        # collection_id（SCHEMA 2026-08-23 增）之存在性
        _cid=sec.get('collection_id')
        if isinstance(_cid,str) and _cid not in _COLL:
            dang[_ce_owner(f)]+=1; dang_ids.add(_cid)
        b=sec.get('book_id')
        if isinstance(b,str) and b not in _EXIST_B:
            dang[_ce_owner(f)]+=1; dang_ids.add(b)
        b=sec.get('target_bid')
        if isinstance(b,str) and b not in _EXIST_B and b not in _EXIST_W:
            dang[_ce_owner(f)]+=1; dang_ids.add(b)
print('整理本繫連落空 section',sum(dang.values()),'相異 id',len(dang_ids),'其中實為 Book',dang_is_book)
print('整理本節之 work_id 實指 Collection',_sec2coll,'相異 id',len(_coll_ids),
      '　基線 0（叢書當用 collection_id，見 SCHEMA〈整理本 section 的四個指涉欄位〉）')
for k,v in dang.most_common(6): print('  ',k,v)

# 整理本 section 級磁鐵：同一檔內，數個異題 section 共指一 work
# （匯入時同名條目未分，如隋志四種卷數各異之《後漢書》皆繫一 id）
import re as _re
# 此表只用於本節「二節之題是否同題」之比對，**不改資料**——整理本之字形
# 當存其所據之本，不得歸一（N1 道 2026-08-24 之議）。
# 2026-08-24 補四字：眞敎牋隠。皆異體而非簡體，前此不在表中，遂使
# 《大洞眞經》／《大洞真經》、《眞敎元符》／《眞教元符》、《庸齋表牋》／
# 《庸齋表箋》、《易索隠》／《易索隱》四組偽成磁鐵。
_VAR=str.maketrans({'説':'說','録':'錄','歴':'歷','爲':'為','畧':'略','别':'別','吴':'吳',
                    '眞':'真','敎':'教','牋':'箋','隠':'隱'})
def _nz(t): return _re.sub(r'[《》\s]','',(t or '').translate(_VAR))
secmag=_c.Counter(); secmag_ex=[]; secpart=_c.Counter(); secalt=_c.Counter()
secdup=_c.Counter()
for f in _CE_FILES:
    if f.endswith('collated_edition_index.json'): continue
    try: cd=json.load(open(f))
    except Exception: continue
    if not isinstance(cd,dict): continue
    own=_ce_owner(f); m=_c.defaultdict(set)
    for sec in cd.get('sections',[]):
        if not isinstance(sec,dict): continue
        # 版本附屬部帙（外集、附錄之屬）依 SCHEMA 不別立 Work，本就與母條共繫，非磁鐵
        if sec.get('section_kind')=='附屬部帙': secpart[own]+=1; continue
        # 「別本」同此（SCHEMA 2026-08-24 增）：四庫別出之「別本某某」與其正條
        # 同指一書，共繫是裁定之果，非匯入未分之遺
        if sec.get('section_kind')=='別本': secalt[own]+=1; continue
        # 「一書兩著」同此（SCHEMA 2026-08-24 增）：書目自身一書兩出其目
        # （題同而卷數異，或題異而同指），與正條共繫是裁定之果。
        # SCHEMA〈別本〉節「不及者二」所指即此，今補其欄。
        if sec.get('section_kind')=='一書兩著': secdup[own]+=1; continue
        w=sec.get('work_id')
        if isinstance(w,str) and w in IW and sec.get('title'): m[w].add(_nz(sec['title']))
    for w,ts in m.items():
        if len(ts)>1:
            secmag[own]+=len(ts)
            if len(secmag_ex)<6: secmag_ex.append((own,w,IW[w]['title'],sorted(ts)[:4]))
print('整理本 section 級磁鐵（異題共指一 work 之題數）',sum(secmag.values()),
      '　附屬部帙節（依 SCHEMA 與母條共繫，不計）',sum(secpart.values()),
      '　別本節（同上）',sum(secalt.values()),
      '　一書兩著節（同上）',sum(secdup.values()))
for k,v in secmag.most_common(6): print('  ',k,v)
for x in secmag_ex: print('   例',x)

# Work 之 loss_status 須在枚舉內（SCHEMA「loss_status 枚舉」）
_LSW={'lost','partially_extant','extant','undetermined'}
lsbad=[]; lsc=_c.Counter()
for w,e in IW.items():
    try: d=json.load(open(e['path']))
    except Exception: continue
    if not isinstance(d,dict) or 'loss_status' not in d: continue
    v=d['loss_status']; lsc[v]+=1
    if v not in _LSW: lsbad.append((w,v))
print('Work loss_status',dict(lsc),'不合枚舉',len(lsbad))
for x in lsbad[:8]: print('  ',x)

# 輯佚叢書整理本（type: fragment_collection）之雙向對查
fc=[]; todo=0
for f in _CE_IDX:
    try: ci=json.load(open(f))
    except Exception: continue
    if ci.get('type')!='fragment_collection': continue
    base=f.rsplit('/',1)[0]; owner=_ce_owner(f)
    fwd={}
    for g in glob.glob(base+'/*.json'):
        if g.endswith('collated_edition_index.json'): continue
        for i,sec in enumerate(json.load(open(g)).get('sections') or []):
            w=sec.get('work_id')
            if isinstance(w,str): fwd.setdefault(w,[]).append((g.split('/')[-1],i))
            if 'fragments' in sec and (sec.get('coverage') or {}).get('level') is None:
                fc.append((g,i,'section 有 fragments 而無 coverage.level——空陣列之歧義未消'))
    for w,locs in fwd.items():
        # 兩倉合計判存在：升格後 section 之 work_id 改指 production，只查 IW 會誤報。
        if w not in _EXIST_W: fc.append((f,w,'section 所繫 work 不存在')); continue
        if w not in IW: continue      # 已升格者，其輯佚檔隨資產目錄遷至 production，此處不再查
        fr=glob.glob('Work/*/*/*/%s/fragments/*.json'%w)
        if not fr: todo+=1; continue      # 非損壞，是待辦：目錄既言馬氏輯之，該 work 當有輯佚檔
        cs=json.load(open(fr[0])).get('collectors') or []
        mine=[x for x in cs if x.get('work_id')==owner]
        if not mine: todo+=1; continue          # 輯佚檔尚無此輯家之條，目錄為新知，待補
        if not any(x.get('sections') or x.get('section_file') for x in mine):
            fc.append((f,w,'整理本繫之而輯佚檔未記其 section_file'))
print('輯佚叢書整理本 不合',len(fc),'　待辦（已繫而無輯佚檔）',todo)
for x in fc[:8]: print('  ',x)

# 簡轉繁之過度轉換（over-conversion）
# 立此驗之由：析隋志注中亡書時撰人析出「幹寶」「硃育」「釧會」，覆按乃知某幾批匯入
# 之文本是由簡體回轉而來，一簡對多繁未擇而誤。此類欄位有值、非空、不觸發任何校驗，
# 而比對時永不相合，於是同書被判成「本庫沒有」而重建一遍——與「殘名撰人」同族之靜默缺陷。
# 只驗確係誤者。多數用例是對的，不可一律回轉：
#   洪範／師範大學／範圍／軌範——當作範；　徐幹／黃幹／張元幹——當作幹；
#   硃批（四庫之硃批）——本字；　毫髮／鬚髮／晞髮集——當作髮；
#   瞭若指掌／明瞭、纔、薝蔔——皆本字。故此處列詞不列字。
# 幹：徐幹、公幹、黃幹、張元幹、幹辦、才幹、幹羽皆本字，只此數詞誤
_OVER = ('幹寶', '幹子', '幹祿', '幹鑿', '十幹', '餘幹', '釧會', '錶',
         '捲髮明', '髮微', '麵部訣', '馬麵法式', '氣色麵圖')
# 鬆：本列為裸字，違本表「列詞不列字」之則——**鬆本是正字**（鬆弛、放鬆），
# 誤者只在該作「松」（松柏、松江、趙松雪）而轉成鬆。2026-08-24 實測全庫 424 處
# 皆本庫自撰案語之「鬆了一檔」（斷代收緊之語），無一真誤，遂改為排除式：
# 凡鬆而不在下列鬆弛義之詞者始報。
_SONG_OK = ('鬆了', '放鬆', '寬鬆', '鬆緊', '蓬鬆', '鬆散', '鬆動', '鬆懈', '鬆弛')
# 範／范：不列詞而立位置之判——範居姓位者誤，居名位者不誤。
# 姓位之判準：其前一字是界（引號、書名號、頓逗句號、括弧、空白、「案」）。
# 如此則「案范書」「《范泰集》」「"范德機"」皆得，而洪範、師範大學、桓範集、
# 陳祖範撰、帝範、家範、軌範、懿範皆不動——前一字非界故也。
_BOUND = set('"《「『、，。；：（）〔〕[]{}〈〉!?\n\t \u3000\'') | set('】》案')
# 官爵之後亦是姓位（「安北將軍范汪」「臨淮太守范作」），界判收不到，故並驗
_OFF2 = ('將軍', '太守', '刺史', '尚書', '侍郎', '議郎', '中郎', '參軍', '司馬',
         '長史', '郎中', '縣令', '太尉', '司徒', '司空', '僕射', '祭酒', '博士',
         '別駕', '從事', '校尉', '主簿', '舍人', '內史', '大夫', '常侍', '侍中',
         '中書', '學士', '給事', '功曹', '太常', '光祿', '諮議')
# 範衍：明錢一本書名，「衍《洪範》」之義，非姓——《經義考》掛源後始見（2026-08-23 補）
# 範通（明葉世奇）、範數贊詞（明包萬有）同此，皆《洪範》之書，在《經義考》書類
# 範軒（林大同《範軒文集》，齋號）、範東（劉隅《範東集》）、範秘（「陽明正範秘書」）
# ——《千頃堂書目》整理本之底本是維基文庫四庫本，原文照錄，此三處是本字非過度轉換；
# JSON 之引號正在姓位判準之界上，故凡 _title_only 以「範」起首者皆被收（2026-08-24 補）
_KEEP2 = {'範圍', '範式', '範例', '範疇', '範金', '範土', '範銅', '範模',
          '範衍', '範通', '範數', '範軒', '範東', '範秘'}
_ovc = _c.Counter()
# 整理本自陳 text_quality.grade == 'source' 者不驗——「原文照錄」謂其文未經
# 簡繁往返，本驗所捕之過度轉換無從發生，而原本自有之用字反落網：《經義考》
# 文淵閣本「日辰有十幹十二支」之幹是本字，「葉氏（世竒）範通」之範是洪範之
# 範，「王氏（範）交廣春秋」之範是名不是姓。2026-08-23 立。
_SRCDIRS = set()
for _i in glob.glob('Work/*/*/*/*/collated_edition/collated_edition_index.json'):
    try:
        if (json.load(open(_i)).get('text_quality') or {}).get('grade') == 'source':
            _SRCDIRS.add(os.path.dirname(_i))
    except Exception:
        pass
# ── 暫排除之整理本 ────────────────────────────────────────────────
# 《千頃堂書目》整理本 1ev3bb42sieww 曾暫排除於格式與簡轉繁二驗之外（2026-08-24
# 使用者裁定）。其三事今已收束：①生成之法已改為 indent=2＋檔尾換行；②卷30
# 「趙汝範奏疏一卷」之誤切已正，並查明此係名表法之一類系統性誤（三字名之前二字
# 恰為 CBDB 另一真人）；③校本 text_適園叢書本/ 之「范」姓誤作「範」143 字，
# 已據底本逐字改回。故排除撤銷，_SKIPDIR 置空。（2026-08-24）
_SKIPDIR = None
_skipped = {'簡轉繁': 0, '格式': 0}


def _isskip(_p):
    return bool(_SKIPDIR) and _p.replace('\\', '/').startswith(_SKIPDIR)


_FILES = (glob.glob('Work/*/*/*/*.json') + glob.glob('Book/*/*/*/*.json')
          + glob.glob('Entity/*/*/*/*.json') + glob.glob('Collection/*/*/*/*.json')
          + glob.glob('Work/*/*/*/*/fragments/*.json')
          + [_f for _f in glob.glob('Work/*/*/*/*/collated_edition/*.json')
             if os.path.dirname(_f) not in _SRCDIRS]
          + glob.glob('index/*.json') + glob.glob('index/*/*.json'))
for _f in _FILES:
    if _isskip(_f):
        _skipped['簡轉繁'] += 1
        continue
    try:
        _raw = open(_f).read()
    except Exception:
        continue
    for _w in _OVER:
        _n = _raw.count(_w)
        if _n:
            _ovc[_w] += _n
    # 硃須去其本字之用例（硃批之屬）而後計
    if '硃' in _raw:
        _t = _raw
        for _k in ('硃批', '硃墨', '硃筆', '硃砂', '硃卷', '硃絲', '硃書', '硃印', '硃點', '硃提'):
            _t = _t.replace(_k, '')
        if _t.count('硃'):
            _ovc['硃'] += _t.count('硃')
    for _i, _ch in enumerate(_raw):
        # 括中只此一字者是名不是姓——姓在括外（《經義考》標目「王氏（範）交廣
        # 春秋」即王範）。括號本在 _BOUND 之列，不除則此輩盡入。2026-08-23 立。
        if _raw[_i - 1:_i] == '（' and _raw[_i + 1:_i + 2] == '）':
            continue
        if _ch == '範' and _raw[_i:_i + 2] not in _KEEP2 \
                and ((_raw[_i - 1] if _i else '\n') in _BOUND
                     or _raw[max(0, _i - 2):_i] in _OFF2):
            _ovc['範（居姓位）'] += 1
        # 範書：范曄《後漢書》之省稱，姚之駰《後漢書補逸》案語中極多
        # （「范書作卭」「范書全襲」「范書不載」）。其前一字是上句之尾
        # （也、事、與、記、見、據……）而非界，故上一條之「姓位」判收不到
        # ——2026-08-24 實測漏收 125 處。只兩例是本字：《答桓範書》（桓範，
        # 魏人，書謂書信）、「禮學幼範書成」（《禮學幼範》書名）。
        elif _ch == '範' and _raw[_i + 1:_i + 2] == '書' \
                and _raw[_i - 1:_i] not in ('桓', '幼'):
            _ovc['範書（當作范書，范曄後漢書）'] += 1
        elif _ch == '鬆' and _raw[_i:_i + 2] not in _SONG_OK \
                and _raw[_i - 1:_i + 1] not in _SONG_OK:
            _ovc['鬆（疑當作松）'] += 1
print('簡轉繁過度轉換', sum(_ovc.values()), '　基線 0')
for _k, _v in _ovc.most_common(8):
    print('  ', _k, _v)

# period 之枚舉，並與索引對查
_PER = ('pre-qin', 'qin-han', 'three-kingdoms', 'jin', 'nanbeichao', 'sui-tang',
        'five-dynasties', 'song', 'liao-jin-yuan', 'ming', 'qing', 'modern')
_pbad = []
_pc = _c.Counter()
for _p in glob.glob('Work/*/*/*/*.json'):
    try:
        _d = json.load(open(_p))
    except Exception:
        continue
    _v = _d.get('period')
    if _v is None:
        _pc[None] += 1
        continue
    _pc[_v] += 1
    if _v not in _PER:
        _pbad.append((_d.get('id'), 'period 不合枚舉', _v))
    # 有 period 必有 period_basis——此軸是本庫之判，無據則不可用
    if not _d.get('period_basis'):
        _pbad.append((_d.get('id'), 'period 無 period_basis', _v))
    _e = IW.get(_d.get('id'))
    if _e is not None and _e.get('period') != _v:
        _pbad.append((_d.get('id'), '索引 period 不符', f"{_e.get('period')}≠{_v}"))
print('period', dict(_pc), '不合', len(_pbad), '　基線 0')
for _x in _pbad[:8]:
    print('  ', _x)

# JSON 書寫格式護欄（見 SCHEMA.md〈JSON 書寫格式〉、.claude/plans/升格並行方案.md §六）
# 格式不一致是並行時最大的機械衝突源：任一工具以自己的縮排整檔重寫，
# 就把「可自動合併的行級改動」變成「整檔衝突」。約定：indent=2、檔尾一換行、
# 鍵序不重排（索引檔另須按 id 有序）。修法：scripts/normalize_json_format.py
_JIND, _JNL, _JORD = [], [], []
for _p in glob.glob('**/*.json', recursive=True):
    if _p.startswith(('node_modules', 'book-index/', '.claude/', '.git/')):
        continue
    try:
        _raw = open(_p, encoding='utf-8').read()
    except Exception:
        continue
    if not _raw.strip():
        continue
    for _ln in _raw.split('\n')[1:]:
        _m = _re.match(r'^( +)\S', _ln)
        if _m:
            if len(_m.group(1)) != 2:
                _JIND.append((_p, len(_m.group(1))))
            break
    if _isskip(_p):
        _skipped['格式'] += 1
        continue
    if not _raw.endswith('\n'):
        _JNL.append(_p)
    if _p.startswith('index/'):
        try:
            _k = list(json.loads(_raw).keys())
            if _k != sorted(_k):
                _JORD.append((_p, len(_k)))
        except Exception:
            pass
print('JSON 縮排非 2', len(_JIND), '　基線 0（2026-08-21 全庫歸一化竣工；'
      '不為零即有工具用了別的縮排，修法：scripts/normalize_json_format.py）')
for _x in _JIND[:5]:
    print('  ', _x)
print('JSON 缺檔尾換行', len(_JNL), '　基線 0（同上）')
if any(_skipped.values()):
    print(f"  ※ 《千頃堂書目》整理本暫排除：簡轉繁 {_skipped['簡轉繁']} 檔、"
          f"格式 {_skipped['格式']} 檔（使用者 2026-08-24 裁定；"
          f"待辦見 known-issues/千頃堂書目整理本-待其主收束.json）")
# ── 內部鍵漏入落盤（2026-08-25 增） ─────────────────────────────
# 立此驗之由：本輪批量作業用 `iter_works()`，其所注之臨時鍵 `_path`
# （絕對路徑，屬腳本內部狀態）未剝而回寫落盤，draft 752 檔、production
# 749 檔（隨升格帶入），積了一整輪無人知——`_` 前綴之鍵先前不在任何
# 掃描之列，是靠肉眼撞見的。合法之 `_` 鍵只有下列五個（三個派生欄
# ＋ 兩個 tombstone 印記），此外皆為漏鍵。
_OKUS = {'_has_text', '_has_image', '_has_collated', '_promoted_to', '_promoted_at'}
_USTRAY = []
for _root in ([_PR_ROOT] if _PR_ROOT else []) + ['.']:
    for _t in ('Work', 'Book', 'Collection', 'Entity'):
        for _p in glob.glob('%s/%s/*/*/*/*.json' % (_root, _t)):
            try:
                _d = json.load(open(_p, encoding='utf-8'))
            except Exception:
                continue
            if not isinstance(_d, dict):
                continue
            for _k in _d:
                if _k.startswith('_') and _k not in _OKUS:
                    _USTRAY.append((_p, _k))
print('內部鍵漏入落盤', len(_USTRAY), '　基線 0（合法之 `_` 鍵唯 '
      '_has_text/_has_image/_has_collated/_promoted_to/_promoted_at；'
      '凡回寫 iter_*() 之產出者，先 d.pop("_path", None)）')
for _x in _USTRAY[:6]:
    print('  ', _x)

# ── 檔名之 id 與內容之 id 不符（2026-08-25 增） ─────────────────
# 立此驗之由：2026-08-25 遼金元輪查得**六檔被整個覆寫**——並行會話之合流
# commit `9db873c027` 把六條墓碑之內容落到了另外六個 work 的檔上，
# 《深衣圖說》《尚書說》《春秋不書即位說》《洪範五事說》《毛詩說略》
# 《詩傳演說》遂整條丟失（題、撰人、著錄、desc 皆非其物），而**無任何校驗會報**
# ——索引是按內容之 id 建的，於是索引、分片、雙向鏈全都自洽。
# 檔名之 id 與內容之 id 不符，是此型唯一留下的痕。
_IDMIS = []
for _root in ([_PR_ROOT] if _PR_ROOT else []) + ['.']:
    for _t in ('Work', 'Book', 'Collection', 'Entity'):
        for _p in glob.glob('%s/%s/*/*/*/*.json' % (_root, _t)):
            _fid = os.path.basename(_p).split('-', 1)[0]
            try:
                _d = json.load(open(_p, encoding='utf-8'))
            except Exception:
                continue
            if isinstance(_d, dict) and _d.get('id') and _d['id'] != _fid:
                _IDMIS.append((_p, _fid, _d['id'], _d.get('title') or _d.get('primary_name')))
print('檔名 id 與內容 id 不符', len(_IDMIS), '　基線 0（不符即有一檔被別條之內容覆寫——'
      '此型索引、分片、雙向鏈全都自洽，唯此一驗見得著）')
for _x in _IDMIS[:6]:
    print('  ', _x)

print('索引檔鍵未按 id 排序', len(_JORD), '　基線 0')
for _x in _JORD[:5]:
    print('  ', _x)

# ── production 之獨立一驗（2026-08-23 增） ─────────────────────────
# 立此節之由：production **從無任何校驗在管**——本工具自始只跑 draft。
# 遂積出三批各自無人知的缺陷，皆是靠人偶然發現的：
#   15 條 books 指向 draft 併池已刪之 Book（4ebc62fc0d7 文淵閣雙錄歸併未跟進）
#   51 處 related_works[].title 留著舊題（《老子》正名《道德經》等）
#   43 條 (id, relation) 重複
# 檢查項與 draft 同軸，只是換一個庫跑；production 記錄檔數少（六百餘），代價可忽略。
if _PR_ROOT:
    _pw={}; _pt=dict(_TITLE)
    for _t in ('Work','Book','Collection','Entity'):
        for _p in glob.glob('%s/%s/*/*/*/*.json'%(_PR_ROOT,_t)):
            try: _d=json.load(open(_p))
            except Exception: continue
            if isinstance(_d,dict) and _d.get('id'):
                _pw[_d['id']]=(_d,_p)
                if _d.get('title'): _pt.setdefault(_d['id'],_d['title'])
    _pdrift=[]; _pdup=[]; _pbk=[]; _pdir=[]; _pfmt=[]; _pdang=[]; _pent=[]; _pback=[]
    # production 之 entity 全表（2026-08-25 entity 全量升格後立）
    _pe={_i for _i,(_d,_) in _pw.items() if _d.get('type')=='entity'}
    for _i,(_d,_p) in _pw.items():
        if list(_i[-3:])!=_p.split('/')[-4:-1]: _pdir.append(_p)
        _raw=io.open(_p,encoding='utf-8').read() if 'io' in dir() else open(_p,encoding='utf-8').read()
        if not _raw.endswith('\n'): _pfmt.append((_p,'缺檔尾換行'))
        _seen=set()
        for _r in (_d.get('related_works') or []):
            if not isinstance(_r,dict): continue
            _t2=_pt.get(_r.get('id'))
            if _r.get('title') and _t2 and _t2!=_r['title']:
                _pdrift.append((_i,_r['id'],_r['title'],_t2))
            # 懸空：所指之 id 兩倉四類皆無（_pw 是 production 全類，_pt 兼含 draft 之題表）。
            # 2026-08-24 隋唐輪查得 108 條目 189 節靜默積欠——併條工具只掃 draft，
            # 而本驗先前只驗「題漂移」，id 不存在者反而無題可比而過。
            if _r.get('id') and _r['id'] not in _pw and _r['id'] not in _pt:
                _pdang.append((_i,_r.get('id'),_r.get('title')))
            _k=(_r.get('id'),_r.get('relation'))
            if _k in _seen: _pdup.append((_i,_k))
            _seen.add(_k)
        for _b in (_d.get('books') or []):
            if _b not in _pw and _b not in IB: _pbk.append((_i,_b))
        # 2026-08-25 增：production 之 work，其 authors[].entity_id 必指 production 之 entity。
        # 立此驗之由：entity 全量升格之時，查出 production 側積欠 120 處指向 draft
        # 之舊 id（其條早經併去而 production 未同步）——併條工具自來只掃 draft，
        # 此類靜默積欠遂無驗可見。修法：以名（必要時並以朝代）求之 production 而改繫，
        # 名不可復原者（缺字符、「某某等」之連書）但去 entity_id 而存其名。
        if _d.get('type')=='work':
            for _a in (_d.get('authors') or []):
                if isinstance(_a,dict) and _a.get('entity_id') and _a['entity_id'] not in _pe:
                    _pent.append((_i,_a.get('name'),_a['entity_id']))
    print('── production ──')
    print('  books 指向不存在之 Book',len(_pbk),'　基線 0')
    for x in _pbk[:6]: print('     ',x)
    print('  related_works 懸空（所指兩倉皆無）',len(_pdang),'　基線 0（2026-08-24 全清 189 節，修法：resweep_related 已兼掃 production）')
    for x in _pdang[:6]: print('     ',x)
    print('  related_works[].title 漂移',len(_pdrift),'　基線 0')
    for x in _pdrift[:6]: print('     ',x)
    print('  related_works (id,relation) 重複',len(_pdup),'　基線 0')
    for x in _pdup[:6]: print('     ',x)
    print('  work 之 authors[].entity_id 不指 production entity',len(_pent),'　基線 0（2026-08-25 entity 全量升格後全清 120 處）')
    for x in _pent[:6]: print('     ',x)
    # 2026-08-25 增：production 側之整理本與 source_bid 兩驗。
    # 立此二驗之由：本工具之整理本諸驗自來只 glob `Work/*/*/*/*/collated_edition/*.json`
    # ——**draft 相對路徑**，production 的整理本從不在掃描之列。一條 work 一旦升格，
    # 其 collated_edition 資產目錄隨之遷入 production，此後歷次併條只改 draft 的節，
    # production 的節遂靜默積欠。2026-08-25 全庫掃出 215 節、12 處 source_bid 落空，
    # 皆此故。修法見該日之提交：以「同目錄之 source_bid＋title_info 唯一相合」為主證，
    # 以 git 改繫鏈為旁證，二法所得五十八處無一相左。
    _pcol=[]; _pbid=[]
    for _f in glob.glob(_PR_ROOT+'/Work/*/*/*/*/collated_edition/*.json'):
        if _f.endswith('collated_edition_index.json'): continue
        try: _d=json.load(open(_f))
        except Exception: continue
        _secs=_d.get('sections') if isinstance(_d,dict) else (_d if isinstance(_d,list) else [])
        for _n,_s in enumerate(_secs or []):
            if not isinstance(_s,dict): continue
            _w=_s.get('work_id')
            if _w and _w not in _pw and _w not in IW and _w not in IB and _w not in IC:
                _pcol.append((os.path.relpath(_f,_PR_ROOT),_n,_s.get('title'),_w))
    for _i,(_d,_p) in _pw.items():
        for _k in ('indexed_by','emendated_by'):
            for _s in (_d.get(_k) or []):
                if not isinstance(_s,dict): continue
                _b=_s.get('source_bid')
                if _b and _b not in _pw and _b not in IW and _b not in IB and _b not in IC:
                    _pbid.append((_i,_k,_s.get('source'),_b))
    print('  整理本節之 work_id 落空',len(_pcol),'　基線 0（2026-08-25 全清 215 節；升格後整理本遷入 production，draft 的併條掃不到）')
    for x in _pcol[:6]: print('     ',x)
    print('  indexed_by/emendated_by 之 source_bid 落空',len(_pbid),'　基線 0（2026-08-25 全清 12 處）')
    for x in _pbid[:6]: print('     ',x)
    # 2026-08-26 增：Collection 全量升格之後的三驗。
    # 立此三驗之由：Collection 之引用面極廣（升格當日改繫 39,014 處、七種欄形），
    # 而其成員列表又用 draft 從未有過的欄名（contained_works[].id、books[]），
    # 一旦別的車道（Book／Work 升格、併條）不掃這幾欄，便是靜默積欠。
    # entity 那一輪已為此吃過三次虧（authors 120 處、整理本 215 節、source_bid 12 處）。
    _pcw=[]; _pci=[]; _pcb=[]
    for _i,(_d,_p) in _pw.items():
        if _d.get('type')=='collection':
            for _w in (_d.get('contained_works') or []):
                if isinstance(_w,dict) and _w.get('id') and _w['id'] not in _pw:
                    _pcw.append((_i,_d.get('title'),_w['id']))
            for _b in (_d.get('books') or []):
                _bi=_b.get('id') if isinstance(_b,dict) else _b
                if _bi and _bi not in _pw: _pcb.append((_i,_d.get('title'),_bi))
        for _c in (_d.get('contained_in') or []):
            _ci=_c if isinstance(_c,str) else (_c.get('id') if isinstance(_c,dict) else None)
            if _ci and _ci not in _pw: _pci.append((_i,_ci))
    print('  Collection.contained_works[].id 不指 production',len(_pcw),'　基線 0（2026-08-26 全量升格後立）')
    for x in _pcw[:6]: print('     ',x)
    print('  Collection.books[] 不指 production',len(_pcb),'　基線 0（同上；Book 升格器若不掃此欄即此處見之）')
    for x in _pcb[:6]: print('     ',x)
    print('  contained_in[].id 不指 production Collection',len(_pci),'　基線 0（同上；Book／Work 兩類合計三萬八千餘處）')
    for x in _pci[:6]: print('     ',x)
    print('  目錄分片錯置',len(_pdir),'　基線 0')
    print('  JSON 缺檔尾換行',len(_pfmt),'　基線 0（2026-08-23 production 格式歸一竣工，586 檔）')
