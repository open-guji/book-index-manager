#!/usr/bin/env bash
# 目录库同步任务（GUJI-775）：把 book-index、book-text 的 main 同步到服务器上的 latest 库。
# 方案：ai-team domain/目录与资源/设计/2026-11-目录库常驻部署方案-美国服务器.md
#
# 只有它能写库。流程：fetch 两仓 → 没有新提交就退出 → db build（增量；表结构变了会自己全量）→ db check。
# 检查不过就非 0 退出，库留在这次建到的状态，由 Ops／A11 看日志，不晋升。
# 配了 CATALOG_ADMIN_DSN 时，每轮最后（无论有没有新提交）尝试把 latest 晋升成新的 stable（db release promote：
# check 全 0、有新提交、距上次晋升满一小时才真做；晋升复制库时本任务持锁，latest 无人写）。
# 配置（~/.config/guji/catalog.env，chmod 600，令牌类不进仓）：
#   CATALOG_DSN   读写账号的 libpq 连接串，如 "host=127.0.0.1 port=5432 dbname=catalog_latest user=catalog_rw password=…"
#   CATALOG_ADMIN_DSN  可选。有建库权限的账号（CREATEDB），库名随意；不配就不晋升、不分 stable／latest
#   BI_DIR BT_DIR BIM_DIR   三个克隆的目录（默认 ~/catalog/{book-index,book-text,book-index-manager}）
set -euo pipefail
ENV_FILE="${CATALOG_ENV:-$HOME/.config/guji/catalog.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${CATALOG_DSN:?缺 CATALOG_DSN（见 $ENV_FILE）}"
BASE="${CATALOG_BASE:-$HOME/catalog}"
BI_DIR="${BI_DIR:-$BASE/book-index}"; BT_DIR="${BT_DIR:-$BASE/book-text}"; BIM_DIR="${BIM_DIR:-$BASE/book-index-manager}"
LOG_DIR="${LOG_DIR:-$BASE/log}"; mkdir -p "$LOG_DIR"

exec 9>"$BASE/.sync.lock"
flock -n 9 || { echo "上一次同步还在跑，跳过"; exit 0; }

sync_repo() {      # 专用克隆，只跟 origin/main，本地不留改动
  git -C "$1" fetch -q origin main
  git -C "$1" reset -q --hard origin/main
  git -C "$1" rev-parse HEAD
}
bim_new=$(sync_repo "$BIM_DIR")
bi_new=$(sync_repo "$BI_DIR")
bt_new=$(sync_repo "$BT_DIR")

promote() {
  [ -n "${CATALOG_ADMIN_DSN:-}" ] || return 0
  local contract; contract=$(grep -oP '^CONTRACT = \K\d+' "$BI_DIR/build/build_derived.py" 2>/dev/null || true)
  PYTHONPATH="$BIM_DIR${PYTHONPATH:+:$PYTHONPATH}" python3 -m book_index_manager.db release --dsn "$CATALOG_ADMIN_DSN" promote \
    ${contract:+--contract "$contract"}
}

STATE="$BASE/last-synced"
now="$bi_new $bt_new $bim_new"
if [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$now" ]; then
  echo "没有新提交（book-index ${bi_new:0:8}、book-text ${bt_new:0:8}、bim ${bim_new:0:8}），跳过"
  promote      # 上一轮因「不足一小时」没晋升的，这一轮补上
  exit 0
fi

echo "▶ 同步 book-index ${bi_new:0:8}、book-text ${bt_new:0:8}、bim ${bim_new:0:8}  $(date -u +%FT%TZ)"
cd "$BIM_DIR"
export PYTHONPATH="$BIM_DIR${PYTHONPATH:+:$PYTHONPATH}"
python3 -m book_index_manager.db build --root "$BI_DIR" --text-root "$BT_DIR" --dsn "$CATALOG_DSN" | tail -12
python3 -m book_index_manager.db check --dsn "$CATALOG_DSN"
echo "$now" > "$STATE"
promote
echo "✔ 完成  $(date -u +%FT%TZ)"
