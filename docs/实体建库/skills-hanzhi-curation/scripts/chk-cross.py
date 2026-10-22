"""chk-cross：**跨倉**校驗電池——文本（整理本／輯佚）與元資料之間的繫連。

立此檔之由
──────────
`book-text` 拆分後，「整理本節 → work_id → Work 條目 → `_has_collated` →
整理本目錄」這條雙向鏈跨了兩個 checkout，`chk.py` 只在一個倉裡跑，驗不了。
故把凡屬跨倉之驗自 `chk.py` 抽出，別立一檔，令其**兩端之根皆可指定**：

    今日（未拆分）  --text-root ../book-index   --meta ../book-index --meta .
    拆分之後        --text-root ../book-text    --meta ../book-index

如此則此檔於拆分前後跑的是同一套邏輯，只換根——**拆分之正確與否，即以
拆分前後此檔之數是否相同為據**。

**用法**（於 book-index-draft 根執行，預設即今日之配置）：

    python3 .claude/skills/hanzhi-curation/scripts/chk-cross.py
    python3 .claude/skills/hanzhi-curation/scripts/chk-cross.py --text-root ../book-text --meta ../book-index
    python3 .claude/skills/hanzhi-curation/scripts/chk-cross.py --json   # 供 CI 比對

**寫此檔時查出者三**（皆「靜默空驗」之型，看著全綠而其實空掃）：

1. 〈整理本節之 work_id 實指 Collection〉—— `_COLL` 誤併 `prod`，報 101,466，
   已於 chk.py 修正（2026-08-26）。
2. 〈輯佚檔之驗〉—— `_FRAG_FILES` 只掃 draft，而 draft 之輯佚已清盡（0 檔），
   production 之 1,250 檔**自清理之日起無人校驗**。此檔補之。
3. 〈整理本 section 級磁鐵〉—— 判 `w in IW`（draft 索引），而節之 work_id 今皆
   production id，遂無一入數。其旁之「附屬部帙／別本／一書兩著」三數不依 IW，
   照舊非零，於是主數為 0 看著像「全清」而非「空掃」。此檔補之。

通則二，記此備忘：
- **存在性之集可寧濫勿缺，分類性之集不可。**（第 1 條之因）
- **凡驗必先問其掃了幾檔。** 掃 0 檔之驗與全過之驗，輸出一模一樣。
  故本檔每驗必印其掃檔數，且 `--json` 之輸出含 `scanned`，`--self-test`
  即據以判其是否空掃。
"""
import argparse
import collections
import glob
import json
import os
import re
import sys

# ── 參數 ────────────────────────────────────────────────────────────
ap = argparse.ArgumentParser(add_help=True)
ap.add_argument('--text-root', default='../book-index',
                help='文本資產之根（其下有 Work/*/*/*/*/collated_edition|fragments）')
ap.add_argument('--meta', action='append', default=None,
                help='元資料之根，可給多次；預設 ../book-index 與 .（draft）')
ap.add_argument('--json', action='store_true', help='以 JSON 輸出，供 CI 比對')
ap.add_argument('--self-test', action='store_true',
                help='自檢：造斷鏈於記憶體中，覈各驗是否報得出來')
A = ap.parse_args()
TEXT_ROOT = A.text_root.rstrip('/')
META_ROOTS = [r.rstrip('/') or '.' for r in (A.meta or ['../book-index', '.'])]

R = {}          # 結果：名 → 數
SCAN = {}       # 每驗掃了幾檔／幾節——空掃之唯一痕跡
DETAIL = collections.defaultdict(list)


def note(k, n, scanned, *ex):
    R[k] = n
    SCAN[k] = scanned
    for e in ex:
        DETAIL[k].append(e)


# ── 元資料側：兩倉之 Work／Book／Collection ──────────────────────────
def _load_index(root, kind):
    """讀 index/{kind}/*.json 之十六片；無索引者退而掃檔。"""
    out = {}
    d = os.path.join(root, 'index', kind)
    if os.path.isdir(d):
        for s in '0123456789abcdef':
            p = os.path.join(d, f'{s}.json')
            if os.path.exists(p):
                out.update(json.load(open(p, encoding='utf-8')))
    return out


W_TITLE = {}        # work id → 題（兩倉合）
W_PATH = {}         # work id → 檔路徑（用於讀 indexed_by 等本文）
B_IDS = set()
C_IDS = set()

for root in META_ROOTS:
    for i, e in _load_index(root, 'works').items():
        W_TITLE.setdefault(i, e.get('title'))
        if e.get('path'):
            W_PATH.setdefault(i, os.path.join(root, e['path']))
    for i in _load_index(root, 'books'):
        B_IDS.add(i)
    cp = os.path.join(root, 'index', 'collections.json')
    if os.path.exists(cp):
        C_IDS |= set(json.load(open(cp, encoding='utf-8')))
    # 索引之外，另掃實檔——production 之 Collection 於 2026-08-26 全量升格，
    # 其 id 未必盡在任一 index。凡「此 id 是不是 Collection」之判斷，
    # 寧可據實檔，不可據 promotions（見 chk.py `_COLL` 之坑）。
    for t, S in (('Book', B_IDS), ('Collection', C_IDS)):
        for p in glob.glob(f'{root}/{t}/*/*/*/*.json'):
            S.add(os.path.basename(p).split('-', 1)[0])
    for p in glob.glob(f'{root}/Work/*/*/*/*.json'):
        i = os.path.basename(p).split('-', 1)[0]
        W_TITLE.setdefault(i, None)
        W_PATH.setdefault(i, p)

W_IDS = set(W_TITLE)

# draft → production 之歸一。**只可正向**：一個 draft 只升一次，是函數；
# 反向則併條之後一對多，不是函數（chk.py 開頭已詳其誤判之例）。
D2P = {}
for root in META_ROOTS:
    p = os.path.join(root, 'promotions.json')
    if os.path.exists(p):
        for k, v in json.load(open(p, encoding='utf-8'))['promotions'].items():
            D2P.setdefault(k, v['production_id'])


def nz(i):
    return D2P.get(i, i)


# ── 文本側：整理本與輯佚 ────────────────────────────────────────────
def _assets(sub, leaf='*.json'):
    """**兩種深度都要掃。** 歸一之後卷檔入 `collated_edition/juan/NNN.json`，
    比舊制深一層；glob 是固定深度的，只寫一條則歸一當日此檔即靜默空掃——
    2026-08-26 歸一後實見掃檔數由 138,829 跌至 247，四驗齊齊顯 0 而看著全綠，
    是 `scanned` 那一欄把它逮住的。凡改目錄層級，先問哪些 glob 會落空。"""
    return sorted(set(glob.glob(f'{TEXT_ROOT}/Work/*/*/*/*/{sub}/{leaf}'))
                  | set(glob.glob(f'{TEXT_ROOT}/Work/*/*/*/*/{sub}/juan/{leaf}')))


_ASSET_DIRS = {'collated_edition', 'fragments', 'juan', 'text', 'source',
               '_working'}


def _owner(f):
    """owner id = 自檔往上走，越過一切資產目錄名，所遇之第一個目錄。

    **不可寫死上溯幾級。** 舊法取 `dirname(dirname(f))` 之名，只對
    `…/{id}/collated_edition/卷.json` 這一種深度成立；歸一把卷檔挪進
    `…/{id}/collated_edition/juan/NNN.json` 之後，上溯兩級只到
    `collated_edition`，於是**全部 owner 塌成同一個**——是 `scanned`
    由 30 跌至 1 把它逮住的（2026-08-26）。亦不可由路徑分段數推：
    draft 是相對路徑而 production 是絕對路徑，段數不同（chk.py 曾因此而誤）。"""
    d = os.path.dirname(f)
    while os.path.basename(d) in _ASSET_DIRS:
        d = os.path.dirname(d)
    return os.path.basename(d)


CE_ALL = _assets('collated_edition')
CE_IDX = [f for f in CE_ALL
          if os.path.basename(os.path.dirname(f)) == 'collated_edition'
          and os.path.basename(f) in ('collated_edition_index.json', 'index.json')]
CE_JUAN = [f for f in CE_ALL if f not in set(CE_IDX)]
FRAG = _assets('fragments')


def _read(f):
    try:
        return json.load(open(f, encoding='utf-8'))
    except Exception:
        return None


def _sections(cd):
    """卷檔之節。**顶层 dict 與 list 兩制并存**（實測 1,220 : 2），
    兩者皆須認——只認 dict 則那兩檔靜默漏掉。"""
    if isinstance(cd, list):
        return [s for s in cd if isinstance(s, dict)]
    if isinstance(cd, dict):
        return [s for s in (cd.get('sections') or []) if isinstance(s, dict)]
    return []


def _sec_works(sec):
    ws = [sec['work_id']] if isinstance(sec.get('work_id'), str) else []
    v = sec.get('work_ids')
    if isinstance(v, list):
        ws += [x for x in v if isinstance(x, str)]
    return ws


# 預讀卷檔，諸驗共用（1,222 檔、13 萬節，不宜逐驗重讀）
JUAN = [(f, _owner(f), _sections(_read(f))) for f in CE_JUAN]
# **清單檔亦可內嵌 sections**（第四種形態）：《七家後漢書》《後漢書補逸》
# 二部無卷檔，其節（17 條）直接寫在 collated_edition_index.json 裡。
# 只掃 CE_JUAN 則此十七節無一驗觸得著——寫此檔時即先漏之，是自己造的空洞。
for f in CE_IDX:
    s = _sections(_read(f))
    if s:
        JUAN.append((f, _owner(f), s))
NSEC = sum(len(s) for _f, _o, s in JUAN)


# ── 驗一：整理本繫連落空 section ─────────────────────────────────────
dang = collections.Counter()
dang_ids = set()
dang_is_book = 0
sec2coll = 0
coll_ids = set()
for f, own, secs in JUAN:
    for sec in secs:
        for w in _sec_works(sec):
            # 叢書當用 collection_id，不得用 work_id；另立一數以存其目，
            # 不併入「存在」之集——併之則此事自此隱沒。
            if w in C_IDS:
                sec2coll += 1
                coll_ids.add(w)
                continue
            if w in W_IDS or nz(w) in W_IDS:
                continue
            dang[own] += 1
            dang_ids.add(w)
            if w in B_IDS:
                dang_is_book += 1
        for k, S in (('collection_id', C_IDS), ('book_id', B_IDS)):
            v = sec.get(k)
            if isinstance(v, str) and v not in S and nz(v) not in S:
                dang[own] += 1
                dang_ids.add(v)
        v = sec.get('target_bid')
        if isinstance(v, str) and v not in B_IDS and v not in W_IDS \
                and nz(v) not in B_IDS and nz(v) not in W_IDS:
            dang[own] += 1
            dang_ids.add(v)
note('整理本繫連落空 section', sum(dang.values()), NSEC,
     *[f'{k} {v}' for k, v in dang.most_common(6)])
note('整理本節之 work_id 實指 Collection', sec2coll, NSEC,
     *sorted(coll_ids)[:6])


# ── 各整理本之 type（清單檔） ────────────────────────────────────────
# `catalog`（書目）／`kaozhen`（考證）／`fragment_collection`（輯佚叢書）／
# `collated_edition`／`placeholder`。**實測 48 部中 24 部無此欄**，
# 且無欄者裡選本（文選、古文觀止）與真書目志（宋史藝文志）混處，
# 故凡以 type 分流之驗今皆不可全信，見〈清單檔無 type〉一驗。
CE_TYPE = {}
CE_IDXDATA = {}
for f in CE_IDX:
    d = _read(f)
    if isinstance(d, dict):
        CE_TYPE[_owner(f)] = d.get('type')
        CE_IDXDATA[_owner(f)] = d


# ── 驗二：整理本繫連而 work 側無記錄（反向） ─────────────────────────
# owner（整理本所屬之書目 Work）之 id，於被繫之 Work 本文中當見於
# indexed_by[]／emendated_by[] 之 source_bid。
#
# **此驗之前提只對「著錄型」整理本成立。** 選本（《文選》《古文觀止》
# 《唐詩三百首》《正續古文辭類纂》之屬）之節指其所選之篇章，被選入總集
# **不是著錄**，`indexed_by` 本就不當有——實測此五部斷數與繫數**完全相等**
# （705/705、558/558、320/320、222/222、174/174），是驗之前提錯，非資料斷鏈。
# 真書目志之斷率則在百分之一上下（宋史藝文志 110/9946、國史經籍志 37/16175）。
# 二者今無從以 type 分（那 24 部無 type 者正含此五部），故**分兩數並列**，
# 待 type 補齊後再論。source_bid 亦須歸一——不歸則 draft／production 兩制之
# id 對不上，全報斷鏈。
# 豁免二型，其節本不是「著錄」：
# - `anthology` 選本（文選、古文觀止、唐詩三百首之屬）：節指所選之**篇章**，
#   被選入總集不是著錄。實測五部斷數與繫數完全相等（705/705、558/558……）。
# - `fragment_collection` 輯佚叢書：節指**所輯之原書**，某書之佚文被某人輯出，
#   不是那部叢書著錄了它。
#
# 2026-08-26 補齊 24 部之 type 後，此二型皆有明確之 type 可據。此前只能以
# 「全繫皆斷即選本」之啟發法權且分之——那法要設下限（繫數少者全斷可以是
# 巧合，《千頃堂書目》1/1 即誤入），今已不必倚仗。
DESYNC_SKIP_TYPE = {'anthology', 'fragment_collection'}
DESYNC_BOOK_TYPES = {'书', '書'}
desync = collections.Counter()
desync_nonbook = collections.Counter()
desync_tot = collections.Counter()
desync_ex = []
for f, own, secs in JUAN:
    # **`type` 一欄未必說全。** 《七家後漢書》《後漢書補逸》之 `type` 作
    # `collated_edition`，而其真正的體例記在 `collated_edition_type`
    # （= `fragment_collection`）。只看 `type` 則此二部漏豁免，8/8 全報斷鏈。
    # 凡分類之判，二欄俱須看。
    _idx = CE_IDXDATA.get(own) or {}
    if CE_TYPE.get(own) in DESYNC_SKIP_TYPE \
            or _idx.get('collated_edition_type') in DESYNC_SKIP_TYPE:
        continue
    ok = {nz(own), own}
    for sec in secs:
        for i in _sec_works(sec):
            p = W_PATH.get(i) or W_PATH.get(nz(i))
            if not p:
                continue
            d = _read(p)
            if not isinstance(d, dict):
                continue
            # 升格墓碑只留骨架欄（indexed_by 在 production 本文），此驗不及。
            if d.get('_promoted_to') or d.get('merged_into'):
                continue
            desync_tot[own] += 1
            sb = {nz(y.get('source_bid'))
                  for y in (d.get('indexed_by') or []) + (d.get('emendated_by') or [])
                  if y.get('source_bid')}
            if not (sb & ok):
                # **書條與非書條分計。** `indexed_by` 之義是「某志著錄了此書」，
                # 故此驗只對書條成立。非書條偶帶 work_id 者有二型，皆非著錄：
                # `结语`（「已上《禮記》。」之類小結句）、`考证`（考證之文，
                # 當入 `emendated_by` 而非 `indexed_by`，是另一欄之事）。
                # 混計則回補做完之後總數不歸零，看不出還剩什麼。
                if sec.get('type') in DESYNC_BOOK_TYPES:
                    desync[own] += 1
                    if len(desync_ex) < 6:
                        desync_ex.append(f'{own} → {i}')
                else:
                    desync_nonbook[sec.get('type')] += 1
# 全繫皆斷者，是驗之前提不合此部（選本），另計。
# **須設下限**：繫數少者「全斷」可以是巧合（實測《千頃堂書目》只 1 節繫得上
# Work，1/1 而入此桶，非選本），二十為界，以下仍算真斷鏈。
_allbad = {o for o in desync if desync[o] == desync_tot[o] and desync_tot[o] >= 20}
note('整理本繫連而 work 側無記錄', sum(v for o, v in desync.items() if o not in _allbad),
     NSEC, *desync_ex)
note('（附）非書條而繫連未記者——结语／考证之屬，不當入 indexed_by',
     sum(desync_nonbook.values()), NSEC,
     *[f'{k} {v}' for k, v in desync_nonbook.most_common(5)])
# 此數之「掃」取**納入考量之整理本部數**，不可取 `len(_allbad)`——
# 那是結果之數，乾淨之庫本就為 0，於是每次都被判成「空掃」而虛驚。
# 派生之數，其掃檔數當取其分母。
note('（附）整部全斷者之節數——多為選本，驗之前提不合，非斷鏈',
     sum(desync[o] for o in _allbad), len(desync_tot),
     *[f'{o}（{W_TITLE.get(nz(o)) or W_TITLE.get(o)}）{desync[o]}/{desync_tot[o]}'
       for o in sorted(_allbad, key=lambda x: -desync[x])[:8]])


# ── 驗三：整理本 section 級磁鐵（異題共指一 work） ───────────────────
# 此表只用於「二節之題是否同題」之比對，**不改資料**——整理本之字形當存
# 其所據之本，不得歸一。
_VAR = str.maketrans({'説': '說', '録': '錄', '歴': '歷', '爲': '為', '畧': '略',
                      '别': '別', '吴': '吳', '眞': '真', '敎': '教',
                      '牋': '箋', '隠': '隱'})


def _nzt(t):
    return re.sub(r'[《》\s]', '', (t or '').translate(_VAR))


SKIP_KIND = {'附屬部帙', '別本', '一書兩著'}   # 依 SCHEMA 與母條共繫，是裁定之果
secmag = collections.Counter()
secskip = collections.Counter()
mag_ex = []
for f, own, secs in JUAN:
    m = collections.defaultdict(set)
    for sec in secs:
        k = sec.get('section_kind')
        if k in SKIP_KIND:
            secskip[k] += 1
            continue
        w = sec.get('work_id')
        if not (isinstance(w, str) and sec.get('title')):
            continue
        # **不可寫作 `w in IW`**（chk.py 之舊法）：節之 work_id 今皆 production
        # id，而 IW 是 draft 索引，遂無一入數，此驗實為空掃。今取兩倉合集。
        if w in W_IDS or nz(w) in W_IDS:
            m[nz(w)].add(_nzt(sec['title']))
    for w, ts in m.items():
        if len(ts) > 1:
            secmag[own] += len(ts)
            if len(mag_ex) < 6:
                mag_ex.append(f'{own} → {w}（{W_TITLE.get(w)}）: {sorted(ts)[:4]}')
note('整理本 section 級磁鐵（異題共指一 work 之題數）', sum(secmag.values()), NSEC,
     *([f'不計之節：{dict(secskip)}'] + mag_ex))


# ── 驗四：輯佚檔 ────────────────────────────────────────────────────
# chk.py 之此驗只掃 draft，而 draft 之輯佚已清盡，故**自清理之日起空掃**。
_LV = {'catalog', 'titles', 'text', 'text_partial'}
_LS = {'lost', 'partially_extant', 'extant', 'undetermined'}
fbad = []
for f in FRAG:
    wid = _owner(f)
    d = _read(f)
    if d is None:
        fbad.append((f, '解析失敗'))
        continue
    if d.get('work_id') not in (wid, nz(wid)):
        fbad.append((f, 'work_id 與路徑不符'))
    if wid not in W_IDS and nz(wid) not in W_IDS:
        fbad.append((f, 'work 不存在'))
        continue
    cov = d.get('coverage') or {}
    if cov.get('level') not in _LV:
        fbad.append((f, f"coverage.level「{cov.get('level')}」不在四層之內"))
    if 'loss_status' in d and d['loss_status'] not in _LS:
        fbad.append((f, f"loss_status「{d['loss_status']}」不在枚舉內"))
    for fr in (d.get('fragments') or []):
        if fr.get('text') is None and fr.get('piece_title') \
                and not fr.get('text_status'):
            fbad.append((f, 'fragments 有篇題而無 text_status，未錄與無文無從分辨'))
            break
    rec = sum(1 for x in (d.get('fragments') or []) if (x.get('text') or '').strip())
    if cov.get('fragments_recorded') != rec:
        fbad.append((f, f"fragments_recorded {cov.get('fragments_recorded')} ≠ 實錄 {rec}"))
    for c in (d.get('collectors') or []):
        if not (c.get('collector') or '').strip():
            fbad.append((f, 'collectors[].collector 為空——一條即斷言某人輯過此書'))
            break
        w = c.get('work_id')
        if isinstance(w, str) and w not in W_IDS and nz(w) not in W_IDS:
            fbad.append((f, f'collectors[].work_id 落空 {w}'))
note('輯佚檔不合', len(fbad), len(FRAG),
     *[f'{os.path.relpath(x[0], TEXT_ROOT)}：{x[1]}' for x in fbad[:6]])


# ── 驗五：輯佚叢書整理本（type: fragment_collection）雙向 ────────────
fcbad = []
fc_todo = 0
fc_n = 0
FC_LV = {'books_only', 'toc', 'text'}
for f in CE_IDX:
    d = _read(f)
    if not isinstance(d, dict) or d.get('type') != 'fragment_collection':
        continue
    fc_n += 1
    own = _owner(f)
    if (d.get('coverage') or {}).get('level') not in FC_LV:
        fcbad.append((own, f"coverage.level「{(d.get('coverage') or {}).get('level')}」不在三層之內"))
for f, own, secs in JUAN:
    idx = _read(os.path.join(os.path.dirname(f), 'collated_edition_index.json'))
    if not isinstance(idx, dict) or idx.get('type') != 'fragment_collection':
        continue
    for sec in secs:
        if 'coverage' not in sec:
            fcbad.append((own, 'section 無 coverage——「未錄入」與「無佚文」無從分辨'))
            break
    for sec in secs:
        w = sec.get('work_id')
        if not isinstance(w, str):
            continue
        p = W_PATH.get(w) or W_PATH.get(nz(w))
        if not p:
            continue
        wd = os.path.join(os.path.dirname(p),
                          os.path.basename(p).split('-', 1)[0], 'fragments')
        if not os.path.isdir(wd):
            fc_todo += 1
note('輯佚叢書整理本 不合', len(fcbad), fc_n,
     *[f'{x[0]}：{x[1]}' for x in fcbad[:6]],
     f'待辦（已繫而無輯佚檔）{fc_todo}')


# ── 驗六：`_has_collated` 派生欄位（元資料 ↔ 文本目錄） ──────────────
# 此欄是**唯一真指本地目錄**之派生欄。`_has_text`／`_has_image` 由
# `resources[].types` 推得，指的是**外部資源**，與本地檔無關，勿混
# （拆分時若據此二欄去找該搬之檔，會搬空）。
HAS_CE = {_owner(f) for f in CE_ALL}
HAS_CE |= {nz(x) for x in HAS_CE}
hcbad = []
nwork = 0
for root in META_ROOTS:
    for p in glob.glob(f'{root}/Work/*/*/*/*.json'):
        d = _read(p)
        if not isinstance(d, dict):
            continue
        # 墓碑不計。stub 化後只留骨架欄，其 `_has_collated` 說的是 draft 側
        # 有無目錄，而文本已隨升格遷入 production；不豁免則 48 個墓碑盡報不符
        # （寫此驗時即先誤報 49，實只 1）。與驗二之豁免同理。
        if d.get('_promoted_to') or d.get('merged_into'):
            continue
        nwork += 1
        i = d.get('id') or os.path.basename(p).split('-', 1)[0]
        want = i in HAS_CE or nz(i) in HAS_CE
        if bool(d.get('_has_collated')) != want:
            hcbad.append((os.path.relpath(p, root), d.get('_has_collated'), want))
note('_has_collated 與文本倉不符', len(hcbad), nwork,
     *[f'{x[0]}：記 {x[1]}，實 {x[2]}' for x in hcbad[:6]])


# ── 驗七：整理本清單檔所列之卷檔是否俱在 ────────────────────────────
# 拆分時檔名要歸一（juanNNN／類名兩制 → juan/NNN.json），清單之 `juan_files`
# 是唯一記得原名者。少一檔而無人知，是拆分最易出的錯。
missing = []
extra = []
nolist = []
notype = []
nidx = 0
nwithlist = 0
for f in CE_IDX:
    d = _read(f)
    if not isinstance(d, dict):
        continue
    nidx += 1
    own = _owner(f)
    if d.get('type') is None:
        notype.append((own, W_TITLE.get(nz(own)) or W_TITLE.get(own)))
    dr = os.path.dirname(f)
    listed = [x for x in (d.get('juan_files') or []) if isinstance(x, str)]
    # 卷檔今在 `{dr}/juan/` 下，比較須以**相對清單檔之路徑**為準，
    # 不可只比 basename——歸一後清單所列即 `juan/NNN.json`，
    # 只比 basename 則 1,221 份齊齊報「不在盤上」（實見）。
    on_disk = {os.path.relpath(x, dr) for x in CE_JUAN
               if os.path.commonpath([os.path.abspath(x), os.path.abspath(dr)])
               == os.path.abspath(dr)}
    if not listed:
        nolist.append((own, len(on_disk)))
        continue
    nwithlist += 1
    for x in listed:
        if x not in on_disk and os.path.basename(x) not in on_disk:
            missing.append((own, x))
    # **僅於有 juan_files 者比對。** 無此欄者（kaozhen／fragment_collection
    # 諸型不用之）若一併比，盤上之檔盡報「未列」——寫此驗時即先誤報 146，
    # 其中 143 出於此，真正多出者唯 3（總序／juan_groups／校勘記_缺字，
    # 皆非卷檔，本不當列）。
    _l = set(listed) | {os.path.basename(y) for y in listed}
    for x in sorted(on_disk - _l):
        if os.path.basename(x) in _l:
            continue
        extra.append((own, x))
note('清單所列之卷檔不在盤上', len(missing), nwithlist,
     *[f'{a}：{b}' for a, b in missing[:6]])
note('盤上有而清單未列之卷檔（僅計有 juan_files 者）', len(extra), nwithlist,
     *[f'{a}：{b}' for a, b in extra[:8]])
# 以下二數不是「錯」，是**拆分前該補齊之欠**：清單不列其檔，則搬遷之後
# 「少沒少一卷」無從覈；清單無 type，則凡以 type 分流之驗皆不可全信。
note('清單檔無 juan_files（搬遷後無從覈其完整）', len(nolist), nidx,
     *[f'{a}（盤上 {b} 檔）' for a, b in nolist[:8]])
note('清單檔無 type（選本與書目志今混處，驗無從分流）', len(notype), nidx,
     *[f'{a} {b}' for a, b in notype[:8]])


# ── 輸出 ────────────────────────────────────────────────────────────
if A.json:
    print(json.dumps({'text_root': TEXT_ROOT, 'meta_roots': META_ROOTS,
                      'counts': R, 'scanned': SCAN}, ensure_ascii=False, indent=2))
    sys.exit(0)

print(f'文本根 {TEXT_ROOT}　元資料根 {" ".join(META_ROOTS)}')
print(f'整理本 {len(CE_IDX)} 部／卷檔 {len(CE_JUAN)}／節 {NSEC}　'
      f'輯佚 {len(FRAG)}　Work {len(W_IDS)} Book {len(B_IDS)} Collection {len(C_IDS)}')
print()
empty = []
for k, v in R.items():
    print(f'{k} {v}　（掃 {SCAN[k]}）')
    for e in DETAIL[k]:
        print('   ', e)
    if SCAN[k] == 0:
        empty.append(k)
if empty:
    print()
    print('⚠ 下列驗掃了 0 檔——其 0 是空掃，不是全過：')
    for k in empty:
        print('   ', k)

sys.exit(0)
