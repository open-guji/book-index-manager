#!/usr/bin/env python3
"""生成 src/i18n/variant-chars.json（异体字 → 正字，overview#350）。方法见同目录 README.md。

用法（在 ui/ 下）：
  python3 scripts/variant-chars/build.py --book-text ../../book-text \\
      --unihan /path/to/Unihan --cjkvi /path/to/cjkvi-variants --out src/i18n/variant-chars.json
"""
import argparse, collections, glob, json, os, re, subprocess, tempfile
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
MIN_COUNT = 1000
# 人工复核剔除：本身另有读音／字义，或来源配对有误
EXCLUDE = set('嘅啇䍦卨籕')
# 来源优先级：教育部异体字字典最准，其后依次是汉语大字典、Unihan kZVariant、cjkvi、日本字形表
PRIORITY = ['twedu', 'hydzd', 'unihan', 'cjkvi', 'jp']
CJKVI_FILES = [('twedu-variants.txt', 'twedu'), ('hydzd-variants.txt', 'hydzd'), ('cjkvi-variants.txt', 'cjkvi'),
               ('jisx0213-variants.txt', 'jp'), ('koseki-variants.txt', 'jp'), ('joyo-variants.txt', 'jp'),
               ('jinmei-variants.txt', 'jp')]


def is_cjk(o):
    return 0x3400 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF or 0x20000 <= o <= 0x3FFFF


def count_file(path):
    c = collections.Counter()
    with open(path, encoding='utf-8', errors='ignore') as fh:
        for ch in fh.read():
            if is_cjk(ord(ch)):
                c[ch] += 1
    return c


def count_corpus(root):
    paths = [os.path.join(d, f) for d, _, fs in os.walk(root) if '/.git' not in d for f in fs if f.endswith(('.md', '.txt'))]
    total = collections.Counter()
    with Pool() as pool:
        for c in pool.imap_unordered(count_file, paths, chunksize=200):
            total.update(c)
    return total, len(paths)


def t2cn(chars):
    with tempfile.TemporaryDirectory() as d:
        inp, out = os.path.join(d, 'in.json'), os.path.join(d, 'out.json')
        json.dump(sorted(chars), open(inp, 'w'), ensure_ascii=False)
        subprocess.run(['node', os.path.join(HERE, 't2cn.mjs'), inp, out], check=True)
        return json.load(open(out))


def encodable(s, enc):
    try:
        s.encode(enc)
        return True
    except UnicodeEncodeError:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--book-text', required=True)
    ap.add_argument('--unihan', required=True, help='解压后的 Unihan 目录（Unihan_*.txt）')
    ap.add_argument('--cjkvi', required=True, help='github.com/cjkvi/cjkvi-variants 的本地副本')
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', help='另存一份按频次排的残留字清单（tsv）')
    a = ap.parse_args()

    # 通用规范汉字表（Unihan kTGH）＋ GB2312：视为「已是简体」
    tgh = set()
    for fn in glob.glob(os.path.join(a.unihan, 'Unihan_*.txt')):
        for line in open(fn, encoding='utf-8'):
            if '\tkTGH\t' in line:
                tgh.add(chr(int(line.split('\t')[0][2:], 16)))
    standard = lambda s: all(ch in tgh for ch in s) or encodable(s, 'gb2312')

    counts, nfiles = count_corpus(a.book_text)
    conv = t2cn(counts)
    residual = {c: n for c, n in counts.items() if not standard(conv[c])}

    src = collections.defaultdict(lambda: collections.defaultdict(set))  # 异体 -> 来源 -> 正字
    for fname, tag in CJKVI_FILES:
        for line in open(os.path.join(a.cjkvi, fname), encoding='utf-8'):
            p = line.rstrip('\n').split(',')
            if len(p) >= 3 and not p[1].startswith('<') and p[1].endswith('variant') and len(p[2]) == 1:
                src[p[2]][tag].add(p[0])
    for line in open(os.path.join(a.unihan, 'Unihan_Variants.txt'), encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        cp, field, val = line.rstrip('\n').split('\t')
        if field == 'kZVariant':
            for m in re.findall(r'U\+([0-9A-F]+)', val):
                src[chr(int(cp[2:], 16))]['unihan'].add(chr(int(m, 16)))

    cands = {r for c in residual for regs in src.get(c, {}).values() for r in regs if len(r) == 1} - set(conv)
    conv.update(t2cn(cands))

    table, report = {}, []
    for c, n in sorted(residual.items(), key=lambda x: -x[1]):
        chosen = None
        for tag in PRIORITY:
            regs = [r for r in src.get(c, {}).get(tag, ()) if r in conv and len(conv[r]) == 1 and standard(conv[r])]
            outs = {conv[r] for r in regs}
            if len(outs) == 1:
                chosen = (sorted(regs)[0], tag)
                break
            if len(outs) > 1:
                break  # 同一来源给出多个不同正字：有歧义，不收
        report.append((c, n, conv[c], chosen))
        if (chosen and n >= MIN_COUNT and c not in EXCLUDE
                and not encodable(c, 'big5')):  # Big5 常用繁体字多有独立字义，一律不收
            table[c] = chosen[0]

    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(table.items(), key=lambda kv: ord(kv[0]))), f, ensure_ascii=False, indent=1)
        f.write('\n')
    if a.report:
        with open(a.report, 'w', encoding='utf-8') as f:
            for c, n, t, ch in report:
                f.write(f"{c}\tU+{ord(c):04X}\t{n}\t{t}\t{ch[0] if ch else ''}\t{ch[1] if ch else ''}\n")
    total, res = sum(counts.values()), sum(residual.values())
    print(f'{nfiles} 个文件，{total} 字，简体模式残留 {res}（{res / total:.2%}），'
          f'收表 {len(table)} 条，覆盖残留的 {sum(residual[c] for c in table) / res:.1%}')


if __name__ == '__main__':
    main()
