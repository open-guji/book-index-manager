#!/bin/bash
# 块 F 步 4：C 每批合入后一键重生成键表并体检（只读库根，产物写到 $OUT，不进仓）。
#   scripts/regen_keys.sh <book-index 库根> [输出目录=./keys_out] [基线键表.json]
# 有基线时输出键数增减与消失的键（消失的须逐个说明理由）。
set -e
ROOT=${1:?库根}; OUT=${2:-./keys_out}; BASE=$3
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT/ti"      # --text-index 对键表无影响，给空目录
python3 "$ROOT/build/build_derived.py" --root "$ROOT" --text-index "$OUT/ti" --out "$OUT" >/dev/null
python3 "$HERE/keys_check.py" --keys "$OUT/dynasty_reign_keys.json" --root "$ROOT" --out "$OUT/键表体检.md" || true
cat "$OUT/键表体检.md"
if [ -n "$BASE" ]; then
python3 - "$BASE" "$OUT/dynasty_reign_keys.json" <<'PY'
import json, sys
a, b = (json.load(open(p, encoding='utf-8'))['keys'] for p in sys.argv[1:3])
gone, new = sorted(set(a) - set(b)), sorted(set(b) - set(a))
print('键数 %d → %d；新增 %d，消失 %d' % (len(a), len(b), len(new), len(gone)))
print('消失的键：', gone)
print('新增的键（前 40）：', new[:40])
PY
fi
