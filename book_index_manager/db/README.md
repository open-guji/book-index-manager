# 目录库（规范化 PostgreSQL）

git 里的 JSON 是唯一真源。本目录把它拆进 PostgreSQL 的规范化表，再按需还原。
设计全文见 Claude Doc《规范化目录数据库设计 v2》（2026-11-04，用户 11-05 定）。

## 文件

| 文件 | 做什么 |
|---|---|
| `mapping.py` | **唯一真源**：每个 JSON 键进哪张表、哪一列，或进 `notes`／`extra` |
| `tables.py` | 由映射推出每张表的列、主键、外键 |
| `ddl.py` | 生成建表语句与外键（book-index 的 `schema/db/schema.sql`、`constraints.sql` 是它的输出） |
| `shred.py` | JSON ⇄ 表行，纯 Python，不连库；`roundtrip()` 是还原门禁 |
| `pg.py` | COPY 进库、读回（要 `psycopg` 3，bim 本身不依赖） |
| `coverage.py` | 「schema 有、映射没有」检查 |

## 命令

```bash
python -m book_index_manager.db ddl > ../book-index/schema/db/schema.sql
python -m book_index_manager.db ddl --constraints > ../book-index/schema/db/constraints.sql
python -m book_index_manager.db coverage --schema ../book-index/schema/json
python -m book_index_manager.db roundtrip --root ../book-index                 # 只在内存里
python -m book_index_manager.db roundtrip --root ../book-index --dsn "host=… dbname=gj" --create --keep
```

## 表设计规矩

1. 每类记录一张主表；数组对象进明细表，`owner + seq` 保序；多类共用的明细表带 `owner_type`（W/B/C/E）。
2. 只给要展示、要查、要连的字段建列。依据（`*_basis`）、判断备注（`*_note`）、`ai_note`、`original_name` 这些审计字段进该行 `notes jsonb`，键名照源文件；拆平对象里的审计字段记成 `对象.子键`（如 `dating.basis`）。
3. 同一种东西一张表：四类的异名都在 `alt_name`（`kind`：null＝异名、`附刻`、实体别名类型），相关版本／相关丛书都在 `related_record`。
4. 不到一千行、也没人按它查的长尾，放主表的 jsonb 列（Entity 的 `images`、`locations`、`todo`、`appears_in`，Work 的 `additional_works`），或干脆进 `extra`（在映射里登记为 `extra_ok`）。
5. 数据为 0 的字段不建列，并从 JSON schema 删掉。
6. 值装不进列（类型不对、不在枚举里、不合法日期）就原样进 `extra`，还原无损。还原门禁：四类全库拆了再还原，逐条比对 0 不一致。
7. 墓碑的 `merged_into`＋`merged_basis` 合成 `id_map` 一行（`kind='merged'`、`src='tombstone'`）；`live_id` 在增量建库时沿链解到现行记录。

## 改 schema 时

加字段：在 `mapping.py` 给它一个去处（列、`N`、明细表或 `extra_ok`），否则 coverage 报 ERROR（bim CI 会取 book-index 的 schema/json 跑这一条）。
删字段：从映射里删，否则 coverage 报 WARN。表结构有变，重新生成 book-index 的 `schema/db/schema.sql`。
改表结构前先告诉专名（A12）、文本（A33）、搜索（A42）。
