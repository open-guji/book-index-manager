# 目录库同步任务（美国服务器常驻库）

方案：ai-team `domain/目录与资源/设计/2026-11-目录库常驻部署方案-美国服务器.md`。Jira GUJI-775。

- `catalog-sync.sh`：fetch 两仓 → 有新提交才建库（增量）→ `db check`。唯一写库者。
- `catalog-sync.service` / `.timer`：systemd 用户服务，每 15 分钟一次，内存上限 1.5G。

## 装机步骤（需登录服务器，Ops 做；令牌不进仓、不进聊天）
1. 在已有的 Postgres 18 里建两个库账号与库（名字可改，要和 env 对上）：
   `catalog_rw`（同步任务用，库属主）、`catalog_ro`（只读，`GRANT pg_read_all_data`）；库 `catalog_latest`。只听 127.0.0.1，不改 pg_hba 对外。
2. 克隆（专用目录 `~/catalog/`）：
   - `git clone --filter=blob:none https://github.com/open-guji/book-index.git`
   - book-text 取元数据、不取正文：`git clone --filter=blob:none --no-checkout …`，再 `git sparse-checkout set --no-cone '/*' '!*.md' '!/scripts/'` 后 `git checkout main`（同 db-nightly.yml）
   - `git clone https://github.com/open-guji/book-index-manager.git`
3. `pip install --user "psycopg[binary]"`。
4. 写 `~/.config/guji/catalog.env`（chmod 600），只含 `CATALOG_DSN=…`（读写账号）。
5. 首次全量建库先手动跑一次并看内存峰值：
   `systemd-run --user --scope -p MemoryMax=3G ~/catalog/book-index-manager/deploy/catalog-sync/catalog-sync.sh`
   全量在 GitHub 运行机上约 20 分钟；若在服务器上被内存上限杀掉，改为在 Actions 建好后 `pg_dump` 再还原（先报给 A11）。
6. 通过后装 systemd 单元：把 `.service`、`.timer` 复制到 `~/.config/systemd/user/`，`systemctl --user enable --now catalog-sync.timer`。
7. 验收（方案 P1）：全量还原 0 不一致；合并一个 PR 后 15 分钟内库跟上；记下内存峰值与 swap，relay 无异常。
