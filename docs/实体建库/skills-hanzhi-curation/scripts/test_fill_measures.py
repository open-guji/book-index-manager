#!/usr/bin/env python3
"""fill_measures.py 的回归测试：单位不能被写丢。

2026-09-09 juan-unit 道补——根因原是「不分单位一律塞进 juan_count.number」
（《羋子》「十八篇」被写成 juan_count.number=18、又被前端当卷渲染）。
本测试在隔离的临时目录里跑一遍真实脚本（--go 全流程），断言：
  1. 「篇」与「卷」两种单位都要被原样写进 juan_count.unit，不能都变成同一个值；
  2. measures／measure_info 仍如常填写；
  3. 索引分片里的 juan_count 同步带上 unit。
不碰任何真实仓库数据——全部在临时目录里跑。

用法：python3 test_fill_measures.py
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'fill_measures.py')

# 与 fill_measures.py 的 shard() 同一算法，用来算测试用 work_id 落在哪个索引分片。
def shard(i):
    h = 0
    for c in i:
        h = ((h * 31) + ord(c)) & 0xFFFFFFFF
    return '%x' % (h % 16)


def setup_fixture(root):
    """搭一个最小的「兵書略」式整理本 + 索引 + 两条待填的 Work 档：一篇、一卷。"""
    lue = '測試略'
    hz_dir = os.path.join(root, 'Work/1/e/u/1euhm19a23jsw/collated_edition')
    os.makedirs(hz_dir, exist_ok=True)

    cases = [
        ('testwid0001', '測試書甲十八篇', 18, '篇', '十八篇'),
        ('testwid0002', '測試書乙十卷', 10, '卷', '十卷'),
    ]

    sections = [{"type": "category", "title": "○○測試類"}]
    for wid, title, _num, _unit, _mi in cases:
        sections.append({"type": "book", "title": title, "work_id": wid})
    json.dump({"sections": sections}, open(os.path.join(hz_dir, f'{lue}.json'), 'w'),
               ensure_ascii=False)

    os.makedirs(os.path.join(root, 'index/works'), exist_ok=True)
    shards = {s: {} for s in '0123456789abcdef'}

    for wid, title, _num, _unit, _mi in cases:
        work_path = f'Work/0/0/1/{wid}-{title}.json'
        os.makedirs(os.path.dirname(os.path.join(root, work_path)), exist_ok=True)
        json.dump({"id": wid, "title": title, "type": "work"},
                   open(os.path.join(root, work_path), 'w'), ensure_ascii=False)
        shards[shard(wid)][wid] = {"path": work_path}

    for s, content in shards.items():
        json.dump(content, open(os.path.join(root, 'index/works', f'{s}.json'), 'w'),
                   ensure_ascii=False)

    return lue, cases


def main():
    with tempfile.TemporaryDirectory(prefix='fill_measures_test_') as root:
        lue, cases = setup_fixture(root)

        r = subprocess.run(
            [sys.executable, SCRIPT, lue, '--go'],
            cwd=root, capture_output=True, text=True,
        )
        if r.returncode != 0:
            print('脚本执行失败：')
            print(r.stdout)
            print(r.stderr)
            sys.exit(1)

        ok = True
        units_seen = []
        for wid, title, num, unit, mi in cases:
            work_path = f'Work/0/0/1/{wid}-{title}.json'
            x = json.load(open(os.path.join(root, work_path)))
            jc = x.get('juan_count')
            if jc != {"number": num, "unit": unit}:
                print(f'✗ {title}：juan_count 应为 {{"number": {num}, "unit": "{unit}"}}，'
                      f'实际为 {jc}')
                ok = False
            units_seen.append(jc.get('unit') if isinstance(jc, dict) else None)

            if x.get('measure_info') != mi:
                print(f'✗ {title}：measure_info 应为 "{mi}"，实际为 "{x.get("measure_info")}"')
                ok = False
            ms = x.get('measures')
            if ms != [{"unit": unit, "number": num}]:
                print(f'✗ {title}：measures 应为 [{{"unit": "{unit}", "number": {num}}}]，'
                      f'实际为 {ms}')
                ok = False

            si = shard(wid)
            idx = json.load(open(os.path.join(root, 'index/works', f'{si}.json')))
            ie = idx.get(wid)
            if not ie or ie.get('juan_count') != {"number": num, "unit": unit}:
                print(f'✗ {title}：索引分片里的 juan_count 未同步带上 unit，实际为 '
                      f'{ie.get("juan_count") if ie else None}')
                ok = False

        # 两条单位必须不同——回归测试真正要防的就是「两种单位被写成同一个值」。
        if len(set(units_seen)) != len(units_seen):
            print(f'✗ 「篇」与「卷」两个用例被写成了同一个 unit（{units_seen}）——根因未修好')
            ok = False

        if ok:
            print('通过：fill_measures.py 按各自著录的单位写 juan_count.unit，不再一律当卷。')
        else:
            sys.exit(1)


if __name__ == '__main__':
    main()
