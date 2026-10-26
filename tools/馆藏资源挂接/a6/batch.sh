#!/bin/bash
# 用法: batch.sh <批号 1..N> [每批Book数=1400]
set -e
K=$1; N=${2:-1400}
BI=/home/user/book-index; W=/home/user/work; BIM=/home/user/book-index-manager
A6="/home/user/book_index_json/library_data/_匹配/上海圖書館藏書/A6-研究-20261025/匹配表.tsv"
RAW="/home/user/book_index_json/library_data/_整理/上海圖書館藏書"
cd $BI
for i in 1 2 3 4; do git fetch -q --depth 1 origin main && break || sleep $((2**i)); done
git checkout -q -B a6-shlib-book-$K origin/main
BASE=$(git rev-parse --short HEAD)
python3 $W/mkplan.py $BI "$A6" "$RAW" $W/plan-full.jsonl $W/skip-full.tsv
python3 - "$K" "$N" <<'PY'
import json,sys
k,n=int(sys.argv[1]),int(sys.argv[2])
L=[json.loads(l) for l in open('/home/user/work/plan-full.jsonl')]
books=sorted({x['work_id'] for x in L})
sel=set(books[(k-1)*n:k*n])
with open('/home/user/work/plan-b%d.jsonl'%k,'w') as f:
    for x in L:
        if x['work_id'] in sel: f.write(json.dumps(x,ensure_ascii=False)+'\n')
print('batch',k,'books',len(sel),'of',len(books))
PY
FILES_OUT=$W/files-b$K.txt python3 $BIM/tools/馆藏资源挂接/write_plan_apply_r3.py --root $BI --plan $W/plan-b$K.jsonl --revised-at 2026-10-26 --tag A6续-上圖 --kind 书目页 --basis "book-index-manager docs/馆藏资源挂接/报告/A6续-上图Book层挂接-20261026.md" --write | grep -v '^  skip' || true
git -c core.quotepath=off diff --name-only > $W/changed-b$K.txt
echo changed $(wc -l < $W/changed-b$K.txt)
python3 schema/check_schema.py --paths - --quiet-warn < $W/changed-b$K.txt | tail -3
python3 .claude/qa/check_v2.py --paths $(cat $W/changed-b$K.txt) --errors-only --summary 2>&1 | tail -3
python3 .claude/qa/verify.py --strict 2>&1 | tail -3
sha256sum $W/plan-b$K.jsonl | cut -c1-16 > $W/plansha-b$K.txt
echo BASE $BASE PLANSHA $(cat $W/plansha-b$K.txt)
