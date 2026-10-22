"""matches.tsv 指纹：去掉 engine_version 列后整表 sha256 前 16 位，用于 E 块独立复跑核对。
用法：python3 matches_digest.py matches.tsv"""
import csv
import hashlib
import sys

r = list(csv.reader(open(sys.argv[1], encoding='utf-8'), delimiter='\t'))
i = r[0].index('engine_version')
t = '\n'.join('\t'.join(x for j, x in enumerate(row) if j != i) for row in r)
print(len(r) - 1, hashlib.sha256(t.encode()).hexdigest()[:16])
