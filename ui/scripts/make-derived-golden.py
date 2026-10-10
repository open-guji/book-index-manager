#!/usr/bin/env python3
"""
从 book-index 的 build 产物（`build_derived.py --out <dir>` 写出的 `entry/<id>.json`、`_hubs.json`）
挑一批真实条目，写成详情页「金样」对照测试的夹具：

    tests/unit/fixtures/derived-golden/entries.json   {id: 条目}（样本主条目＋页面会再取的关联条目）
    tests/unit/fixtures/derived-golden/hubs.json      _hubs.json
    tests/unit/fixtures/derived-golden/cases.json     [{key, id}]（要渲染的样本，key 形如 work:<id>）

用法（在 ui/ 下）：
    python3 scripts/make-derived-golden.py /path/to/_build

关联条目按页面实际会 getItem 的口径收：
    Work   → 各版本 Book（版本数 > 60 只收前 12 个；带 version_graph 的全收）、著录志书
    Book   → 所属 Work、同作品其他版本（> 40 个只收前 8 个）、所属丛编、源流引用的版本
    丛编   → 子目前 5 条（FULL_CLOSURE 里的收前 16 条）、上级丛编
    专名   → 著录作品前 5 部（FULL_CLOSURE 里的收前 16 部）
关联条目只留页面读到的键（slim），让夹具控制在几百 KB；样本主条目一字不动。
"""
import json
import sys
from pathlib import Path

WORKS = [
    'd59f2870u874',  # 文選：版本 109 个（>60，只解析前 12）、_related 满 200
    'd59df01avcw0',  # 紅樓夢：version_graph，25 版本
    'd59f2nj2yq69',  # 金瓶梅：version_graph，12 版本
    'd59f2nkfchz7',  # 封神演義：version_graph，6 版本
    'd59dh3vo9af4',  # 欽定四庫全書總目：志书（_member_catalog），丛编枢纽
    'd59f20aowb9c',  # 史記：35 版本，_related 89
    'd59f2htd9e68',  # 西臺集：8 版本，2 个枢纽丛编
    'd59f2ndpfh1d',  # 玉環廳志：源档 related_works 11 条（被 _related 取代）
    'd59f5ilweo6h',  # 補晉書藝文志：_related 里有枢纽
    'd59fxe4tgstm',  # 隋代藝文志：什么都没有
    'd59f28no5v5v',  # 原道：收入 3 部枢纽选本（collected_in 枢纽）
    'd59f28npq1vl',  # 晉書：_related 里有 4 个枢纽（text_carried_by）
    'd59f2nh28f7k',  # indexed_by 有、_catalogs 空
    'd59f27x5xeki',  # 高士傳：15 家著录
]
BOOKS = [
    '988fyztvri',  # 僧寶傳：文淵閣本，枢纽丛编＋sub
    '988fxodt6s',  # 周曰校重刊本：同作品 50 版本
    '96kzk3xvk0',  # 紅樓夢己卯本一带：_derived_by
    '96kzii6z28',  # 脂硯齋重評石頭記：_related 8
    '96kzkdm8e8',  # 程甲本：_derived_by 8、源流
    '988g943tou',  # 春秋集解：两个枢纽丛编
    '988g8qddsb',  # 百衲本五代史記：vol 为字符串
    '988lj3vsi0',  # 春秋經解：vol 为数组
    '98ji05um80',  # 司馬法：同作品 3 版本
    '988mkgxd71',  # 史記四庫全書文溯閣本：related_books
    '988g70vmrl',  # 續日本後紀：physical 资源
    '988g7jlvdc',  # 兩宋名賢小集：physical＋provenance
    '98yblo4lc0',  # 文選：同作品 109 版本
]
COLLECTIONS = [
    '8rlcsybg2hhf',  # 武英殿聚珍版叢書：288 子目，上级丛编
    '8rld0tpplp8g',  # 先秦典籍：Work 成员 207
    '8rlb6yi1ecqo',  # 文淵閣本：3736 成员，_related
    '8rlcsybg2hhl',  # 故宮善本舊籍：有 _children
    '8rlcsybg2hht',  # 四遊全傳：Work 3＋Book 1 混合
    '8rlcsybg2hih',  # 出土簡帛：无成员，13 个子丛编
    '8rldhjfpv8cg',  # 存目叢書：无成员，有 _related
    '8rlcsybg2hhi',  # 二十四史（Work 成员 24）
    '8rlcsybg2hhe',  # 二十四史（Book 成员，两个上级）
    '8rlcsybg2hhg',  # 武英殿十三經注疏：两个上级
    '8rlcsybg2hhm',  # 十三經：14 个 Work
    '8rlb6yj1lvr4',  # 文瀾閣本：Book 1＋Work 1
]
ENTITIES = [
    'hixhd2h9bdye',  # 歐陽修：306 部
    'hixhjhaunrb4',  # 李業興：12 部
    'hixi23ur76rt',  # 鄒美中：1 部
    'hixi23up0iz6',  # 翁承贊：0 部
    'hixi1ubjgowc',  # 十六國：dynasty，_children
    'hixi1ubqbwuy',  # 宣統：reign
    'hixhd2h9bv3v',  # 國史館：collective，40 部
    'hixi1ubqbwv2',  # 禮部：collective，_subordinates/_members
]

# 子目／著录作品多的丛编、专名，只在这几个样本里收满页面会解析的前 16 条，其余样本收前 5 条
FULL_CLOSURE = {'8rlcsybg2hhf', 'hixhd2h9bdye', '8rld0tpplp8g'}

# 关联条目（页面只拿来取名称、年代、馆藏、分类、版本数等）只留页面读到的键，其余去掉，让夹具控制在几百 KB。
# 主条目（上面各表里的样本）一字不动。
SECONDARY_KEEP = {
    'work': ('id', 'type', 'title', 'authors', 'description', 'juan_count', 'measure_info', 'subtype', 'dynasty',
             '_books', '_edition_count', '_classifications', '_has_image', '_has_text', '_has_collated',
             'resources', 'resource_groups', 'loss_status'),
    'book': ('id', 'type', 'title', 'edition', 'work_id', 'authors', 'dating', 'publication_info', 'current_location',
             'lineage', 'measure_info', 'juan_count', 'edition_type', 'resources', 'contained_in', '_collections',
             '_has_image', '_has_text', '_has_collated'),
    'collection': ('id', 'type', 'title', 'subtype', 'contained_in', '_member_count', '_member_type', '_members',
                   'books', 'contained_works', 'count', 'juan_count', 'measure_info'),
    'entity': ('id', 'type', 'subtype', 'primary_name', 'dynasty'),
}
SECONDARY_RESOURCES = 2   # 资源只留前几项（版本表的馆藏／影印只看头几项）
SECONDARY_BOOK_CARD = ('id', 'title', 'edition', 'y')


def slim(d: dict) -> dict:
    out = {k: d[k] for k in SECONDARY_KEEP[d['type']] if k in d}
    if isinstance(out.get('resources'), list):
        out['resources'] = [{k: v for k, v in r.items() if k not in ('volumes', 'metadata', 'coverage', 'structure')}
                            for r in out['resources'][:SECONDARY_RESOURCES]]
    if isinstance(out.get('_books'), list):
        out['_books'] = [{k: b[k] for k in SECONDARY_BOOK_CARD if k in b} for b in out['_books']]
    if isinstance(out.get('_members'), list):
        out['_members'] = out['_members'][:3]
    if isinstance((out.get('description') or {}).get('text'), str):
        out['description'] = {'text': out['description']['text'][:160]}
    return out


def main(build: Path, out: Path) -> None:
    def load(i):
        p = build / 'entry' / f'{i}.json'
        return json.loads(p.read_text('utf-8')) if p.exists() else None

    store = {}
    main_ids = set(WORKS + BOOKS + COLLECTIONS + ENTITIES)
    need = set(main_ids)

    for i in main_ids:
        d = load(i)
        assert d, f'build 产物里没有 {i}'
        store[i] = d
        t = d['type']
        if t == 'work':
            ids = [b['id'] for b in d.get('_books', [])]
            if not d.get('version_graph') and len(ids) > 60:
                ids = ids[:12]
            need.update(ids)
            need.update(c['bid'] for c in d.get('_catalogs', []) if c.get('bid'))
            need.update(x['source_bid'] for x in d.get('indexed_by', []) if x.get('source_bid'))
        elif t == 'book':
            if d.get('work_id'):
                need.add(d['work_id'])
                w = load(d['work_id'])
                if w:
                    sib = [b['id'] for b in w.get('_books', [])]
                    sib = sib if len(sib) + len(d.get('related_books', [])) <= 41 else sib[:8]
                    need.update(sib)
            need.update(d.get('related_books', []))
            need.update(c['id'] for c in d.get('contained_in', []))
            lin = d.get('lineage') or {}
            need.update(x['ref'] for x in lin.get('derived_from', []) if x.get('ref_type') == 'book')
            need.update(x.get('book_id') for x in lin.get('related_to', []) if x.get('book_id'))
        elif t == 'collection':
            need.update(m['id'] for m in d.get('_members', [])[:16 if i in FULL_CLOSURE else 5])
            need.update(c['id'] for c in d.get('contained_in', []))
        elif t == 'entity':
            need.update(w['work_id'] for w in d.get('_works', [])[:16 if i in FULL_CLOSURE else 5])

    for i in need:
        if i in store:
            continue
        d = load(i)
        if d is None:
            continue
        store[i] = slim(d)

    out.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    (out / 'entries.json').write_text(dump(store), 'utf-8')
    (out / 'hubs.json').write_text(dump(json.loads((build / '_hubs.json').read_text('utf-8'))), 'utf-8')
    cases = [{'key': f'{store[i]["type"]}:{i}', 'id': i} for i in WORKS + BOOKS + COLLECTIONS + ENTITIES]
    (out / 'cases.json').write_text(dump(cases), 'utf-8')
    size = sum((out / f).stat().st_size for f in ('entries.json', 'hubs.json', 'cases.json'))
    print(f'{len(cases)} 个样本，{len(store)} 条目，夹具 {size / 1024:.0f} KB')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(__file__).resolve().parent.parent / 'tests/unit/fixtures/derived-golden')
