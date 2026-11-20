# 目录库同步任务（美国服务器常驻库）

方案：ai-team `domain/目录与资源/设计/2026-11-目录库常驻部署方案-美国服务器.md`。Jira GUJI-775。

- `catalog-sync.sh`：fetch 两仓 → 有新提交才建库（增量）→ `db check`。唯一写库者。
- `catalog-sync.service` / `.timer`：systemd 用户服务，每 15 分钟一次，内存上限 1.5G。

## 装机步骤（需登录服务器，Ops 做；令牌不进仓、不进聊天）
1. 在已有的 Postgres 18 里建两个库账号与库（名字可改，要和 env 对上）：
   `catalog_rw`（同步任务用，库属主）、`catalog_ro`（只读，`GRANT pg_read_all_data`）；库 `catalog_latest`。只听 127.0.0.1，不改 pg_hba 对外。
2. 克隆（专用目录 `~/catalog/`）。**一律 `--depth 1` 浅克隆**（`--filter=blob:none` 会逐个取 154 万文件、卡死，11-20 实测；浅克隆约 12 分钟）：
   - `git clone --depth 1 https://github.com/open-guji/book-index.git`
   - book-text 取元数据、不取正文：`git clone --depth 1 --no-checkout …`，再 `git sparse-checkout set --no-cone '/*' '!*.md' '!/scripts/'` 后 `git checkout main`（同 db-nightly.yml）
   - `git clone --depth 1 https://github.com/open-guji/book-index-manager.git`
   增量建库要「上次建到的提交」做 `git diff`，浅克隆里没有它时 bim 会自己 `git fetch --depth 1 origin <sha>` 取回，不用深克隆。
3. `pip install --user "psycopg[binary]"`。
4. 写 `~/.config/guji/catalog.env`（chmod 600），只含 `CATALOG_DSN=…`（读写账号）。
5. **首次全量不在服务器上建**（11-20 实测：3G 上限下堆峰值 3049MB 被杀）。改在 GitHub Actions 建好、`pg_dump` 成 artifact，服务器还原：
   - A11 触发 book-index 的 workflow `db-dump`（Actions 页面或 API），跑完得 artifact `catalog-dump`（含 `catalog.dump`、`meta.txt` 记两仓提交）。
   - 服务器取回：`gh run download <run_id> -R open-guji/book-index -n catalog-dump -D ~/catalog/dump`（令牌从 guji-dev-secret 取，要 actions:read）。
   - 还原（catalog_rw 是库属主）：`psql "$CATALOG_DSN" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`，
     再 `pg_restore --no-owner --no-acl -j 2 -d "$CATALOG_DSN" ~/catalog/dump/catalog.dump`；然后 `GRANT USAGE ON SCHEMA public TO catalog_ro; GRANT pg_read_all_data TO catalog_ro;`（已授过可略）。
   - 还原完把三个克隆 `git fetch --depth 1 origin <meta.txt 里的提交>` 并 `git reset --hard` 到 `meta.txt` 记的提交，再手动跑一次 `catalog-sync.sh`（应是增量，看内存峰值）。
   - 表结构（ddl_sha）一变，下一轮同步会判成全量重建、在服务器上又会撞内存：这种情况再触发一次 `db-dump` 还原。
6. 通过后装 systemd 单元：把 `.service`、`.timer` 复制到 `~/.config/systemd/user/`，`systemctl --user enable --now catalog-sync.timer`。
7. 验收（方案 P1）：全量还原 0 不一致；合并一个 PR 后 15 分钟内库跟上；记下内存峰值与 swap，relay 无异常。
