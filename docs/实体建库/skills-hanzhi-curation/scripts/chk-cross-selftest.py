"""chk-cross 之自檢：造一個微型假倉，逐驗人為弄斷，覈 chk-cross 是否報得出來。

**為何必須有此檔。**
對得上數不算過關——掃 0 檔之驗與全過之驗，輸出一模一樣。寫 chk-cross 之際，
在既有 `chk.py` 裡查出三處正在空掃（`_COLL` 誤併 prod 而報 101,466、輯佚之驗
只掃已清空之 draft、磁鐵之驗判 `w in IW` 而節之 id 皆 production），三處都
**看著是綠的**。故拆分動手之前，每一驗都得在人造之斷鏈上響一次。

**此檔不重實現 chk-cross 之邏輯**——那只會證明「副本與副本相符」。
它造盤上之假倉，以 subprocess 跑**真的 chk-cross**，讀其 `--json` 之輸出。

用法：python3 .claude/skills/hanzhi-curation/scripts/chk-cross-selftest.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'chk-cross.py')

W_GOOD = 'aaaaaaaaaaaa'     # 被繫之 Work
W_OWN = 'bbbbbbbbbbbb'      # 整理本所屬之書目 Work
W_FRAG = 'cccccccccccc'     # 有輯佚檔之 Work
C_ONE = 'dddddddddddd'      # 一個 Collection
C_FC = 'eeeeeeeeeeee'       # 一部輯佚叢書整理本之 Work
GONE = 'zzzzzzzzzzzz'       # 必不存在之 id


def _w(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def _shard(i):
    t = i.rjust(3, '_')[-3:]
    return t[0], t[1], t[2]


def build(root):
    """造一個乾淨的微型倉：元資料與文本同根（今日之形）。"""
    def wp(i, title):
        c = _shard(i)
        return f'{root}/Work/{c[0]}/{c[1]}/{c[2]}/{i}-{title}.json'

    _w(wp(W_GOOD, '甲書'), {
        'id': W_GOOD, 'type': 'work', 'title': '甲書', '_has_collated': False,
        'indexed_by': [{'source': '乙志', 'source_bid': W_OWN}]})
    _w(wp(W_OWN, '乙志'), {
        'id': W_OWN, 'type': 'work', 'title': '乙志', '_has_collated': True})
    # 丙書亦為乙志所著錄——不寫 indexed_by 則乾淨之倉本身就報一處斷鏈
    _w(wp(W_FRAG, '丙書'), {
        'id': W_FRAG, 'type': 'work', 'title': '丙書', '_has_collated': False,
        'indexed_by': [{'source': '乙志', 'source_bid': W_OWN}]})
    c = _shard(C_ONE)
    _w(f'{root}/Collection/{c[0]}/{c[1]}/{c[2]}/{C_ONE}-丁叢書.json',
       {'id': C_ONE, 'type': 'collection', 'title': '丁叢書'})

    # 索引（十六片只寫用得著的那幾片即可，讀者以 setdefault 併之）
    for i, t in ((W_GOOD, '甲書'), (W_OWN, '乙志'), (W_FRAG, '丙書')):
        cc = _shard(i)
        p = f'{root}/index/works/{i[0]}.json'
        d = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
        d[i] = {'id': i, 'title': t, 'type': 'Work',
                'path': f'Work/{cc[0]}/{cc[1]}/{cc[2]}/{i}-{t}.json'}
        _w(p, d)
    _w(f'{root}/index/collections.json', {C_ONE: {'id': C_ONE, 'title': '丁叢書'}})

    # 整理本：乙志之下一部，一卷檔兩節
    cd = _shard(W_OWN)
    ce = f'{root}/Work/{cd[0]}/{cd[1]}/{cd[2]}/{W_OWN}/collated_edition'
    _w(f'{ce}/collated_edition_index.json',
       {'work_id': W_OWN, 'type': 'catalog', 'juan_files': ['juan001.json'],
        'total_juan': 1})
    _w(f'{ce}/juan001.json', {
        'title': '卷一',
        'sections': [
            {'type': '書', 'title': '甲書十卷', 'work_id': W_GOOD, 'level': 3},
            {'type': '書', 'title': '丙書二卷', 'work_id': W_FRAG, 'level': 3},
        ]})
    # 丙書之輯佚檔
    cf = _shard(W_FRAG)
    _w(f'{root}/Work/{cf[0]}/{cf[1]}/{cf[2]}/{W_FRAG}/fragments/丙書.json', {
        'work_id': W_FRAG, 'schema_version': 2, 'loss_status': 'lost',
        'coverage': {'level': 'catalog', 'fragments_recorded': 0},
        'collectors': [{'collector': '馬國翰', 'work': '玉函山房輯佚書'}],
        'fragments': []})
    # 另造一部輯佚叢書整理本（type: fragment_collection），否則該驗掃 0 檔，
    # 於乾淨之倉即被判成空掃——fixture 不備此型，那一驗就從未被跑過。
    _w(wp(C_FC, '戊輯佚叢書'), {
        'id': C_FC, 'type': 'work', 'title': '戊輯佚叢書', '_has_collated': True,
        'indexed_by': []})
    ci = _shard(C_FC)
    p = f'{root}/index/works/{C_FC[0]}.json'
    d = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    d[C_FC] = {'id': C_FC, 'title': '戊輯佚叢書', 'type': 'Work',
               'path': f'Work/{ci[0]}/{ci[1]}/{ci[2]}/{C_FC}-戊輯佚叢書.json'}
    _w(p, d)
    fc = f'{root}/Work/{ci[0]}/{ci[1]}/{ci[2]}/{C_FC}/collated_edition'
    _w(f'{fc}/collated_edition_index.json',
       {'work_id': C_FC, 'type': 'fragment_collection',
        'coverage': {'level': 'toc'}, 'juan_files': ['子編·儒家類.json']})
    _w(f'{fc}/子編·儒家類.json', {
        'title': '子編·儒家類',
        'sections': [{'type': 'reconstruction', 'title': '丙書', 'work_id': W_FRAG,
                      'coverage': {'level': 'toc'}, 'level': 3}]})


def run(root):
    r = subprocess.run(
        [sys.executable, TARGET, '--text-root', root, '--meta', root, '--json'],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'chk-cross 執行失敗：{r.stderr[-800:]}')
    return json.loads(r.stdout)


def edit(root, rel, fn):
    p = os.path.join(root, rel)
    d = json.load(open(p, encoding='utf-8'))
    fn(d)
    _w(p, d)


# ── 各案：（驗名, 說明, 弄斷之法） ───────────────────────────────────
cd = _shard(W_OWN)
CE = f'Work/{cd[0]}/{cd[1]}/{cd[2]}/{W_OWN}/collated_edition'
cg = _shard(W_GOOD)
WG = f'Work/{cg[0]}/{cg[1]}/{cg[2]}/{W_GOOD}-甲書.json'
cf = _shard(W_FRAG)
FR = f'Work/{cf[0]}/{cf[1]}/{cf[2]}/{W_FRAG}/fragments/丙書.json'

CASES = [
    ('整理本繫連落空 section', '節之 work_id 指一個不存在之 id',
     lambda r: edit(r, f'{CE}/juan001.json',
                    lambda d: d['sections'][0].__setitem__('work_id', GONE))),
    ('整理本節之 work_id 實指 Collection', '節之 work_id 指一個 Collection',
     lambda r: edit(r, f'{CE}/juan001.json',
                    lambda d: d['sections'][0].__setitem__('work_id', C_ONE))),
    ('整理本繫連而 work 側無記錄', '去被繫 work 之 indexed_by',
     lambda r: edit(r, WG, lambda d: d.pop('indexed_by', None))),
    ('整理本 section 級磁鐵（異題共指一 work 之題數）', '二異題節共指一 work',
     lambda r: edit(r, f'{CE}/juan001.json',
                    lambda d: d['sections'][1].__setitem__('work_id', W_GOOD))),
    ('輯佚檔不合', '輯佚檔之 coverage.level 用舊中文詞',
     lambda r: edit(r, FR, lambda d: d['coverage'].__setitem__('level', '著錄層'))),
    ('輯佚檔不合', '輯佚檔之 collectors[].collector 為空',
     lambda r: edit(r, FR, lambda d: d['collectors'][0].__setitem__('collector', ''))),
    ('輯佚檔不合', 'fragments_recorded 與實錄不符',
     lambda r: edit(r, FR, lambda d: d['coverage'].__setitem__('fragments_recorded', 7))),
    ('_has_collated 與文本倉不符', '有整理本目錄而 _has_collated 為假',
     lambda r: edit(r, f'Work/{cd[0]}/{cd[1]}/{cd[2]}/{W_OWN}-乙志.json',
                    lambda d: d.__setitem__('_has_collated', False))),
    ('清單所列之卷檔不在盤上', '刪一份清單所列之卷檔',
     lambda r: os.remove(os.path.join(r, CE, 'juan001.json'))),
    ('盤上有而清單未列之卷檔（僅計有 juan_files 者）', '增一份清單未列之卷檔',
     lambda r: _w(os.path.join(r, CE, 'juan002.json'),
                  {'title': '卷二', 'sections': []})),
    ('清單檔無 type（選本與書目志今混處，驗無從分流）', '去清單檔之 type',
     lambda r: edit(r, f'{CE}/collated_edition_index.json',
                    lambda d: d.pop('type', None))),
    ('清單檔無 juan_files（搬遷後無從覈其完整）', '去清單檔之 juan_files',
     lambda r: edit(r, f'{CE}/collated_edition_index.json',
                    lambda d: d.pop('juan_files', None))),
]


def main():
    base = tempfile.mkdtemp(prefix='chkcross-selftest-')
    try:
        clean = os.path.join(base, 'clean')
        build(clean)
        base_r = run(clean)

        print('── 基準：乾淨之假倉，諸驗當全零，且無一空掃 ──')
        bad = []
        for k, v in base_r['counts'].items():
            s = base_r['scanned'][k]
            flag = ''
            if v:
                flag = '  ✗ 當為 0'
                bad.append(f'{k} 於乾淨倉報 {v}')
            elif s == 0:
                flag = '  ✗ **空掃**'
                bad.append(f'{k} 空掃（掃 0）')
            print(f'  {k} {v}（掃 {s}）{flag}')
        print()

        print('── 逐案弄斷，覈其是否報得出來 ──')
        for name, how, mut in CASES:
            d = os.path.join(base, 'case%d' % CASES.index((name, how, mut)))
            shutil.copytree(clean, d)
            mut(d)
            r = run(d)
            got = r['counts'].get(name)
            before = base_r['counts'].get(name)
            if got is None:
                print(f'  ✗ {name}：輸出裡無此驗（名改過？）')
                bad.append(f'{name}：輸出裡無此驗')
            elif got > (before or 0):
                print(f'  ✓ {name}　←　{how}　（{before} → {got}）')
            else:
                print(f'  ✗ {name}　←　{how}　**弄斷了而不報（{before} → {got}）**')
                bad.append(f'{name}：{how} 而不報')

        print()
        if bad:
            print('自檢未過：')
            for b in bad:
                print('   ', b)
            return 1
        print('自檢全過——諸驗於乾淨倉皆零且皆非空掃，弄斷之後皆報得出來。')
        return 0
    finally:
        shutil.rmtree(base, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
