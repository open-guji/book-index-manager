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
| `build.py` | 建库：全量或按 git diff 增量；id_map 合进台账与升格表，`live_id` 沿链解到现行记录 |
| `booktext.py` | book-text 元数据（manifest、版本 index.json、辑佚）读文件、补 id，供建库与还原比对 |

## 命令

```bash
python -m book_index_manager.db ddl > ../book-index/schema/db/schema.sql
python -m book_index_manager.db ddl --constraints > ../book-index/schema/db/constraints.sql
python -m book_index_manager.db coverage --schema ../book-index/schema/json
python -m book_index_manager.db roundtrip --root ../book-index                 # 只在内存里
python -m book_index_manager.db roundtrip --root ../book-index --dsn "host=… dbname=gj" --create --keep
python -m book_index_manager.db build --root ../book-index --dsn "host=… dbname=gj" [--full] [--verify] [--text-root ../book-text]
```

## 建库（`build`）

- `build_meta` 一行记上次建到的提交（`git_commit`）、表结构指纹（`ddl_sha`）、`mode`。没有记录、指纹变了或给了 `--full` 就全量（删 schema 重建）；
  否则只把 `git diff 上次..HEAD` 里改动的四类记录按 id 删了重灌，一个事务里做完，外键 `DEFERRABLE`，提交时才查。
- 增量要求 book-index 工作区在 HEAD 且四类目录、`promotions/`、台账目录干净。
- `id_map` 四个来源，主键 `(old_id, kind, src, direct_into)`：

  | src | kind | 来自 |
  |---|---|---|
  | `tombstone` | merged | 记录里的墓碑（随记录灌） |
  | `purge-*`、`history-*`、`draft-retarget-*` | merged | `.claude/qa/purge-tombstones/ledger/*.tsv` |
  | `promotions` | promoted | `promotions/*.json`（草稿 id → 正式 id） |

  链上同一旧号有几处去向时：墓碑 > 台账（文件名大者优先）> 升格表。旧号本身现行就指自己；解不到 `live_id` 留空，`checks.sql` 报。
- 主表多一列 `file_name`：源文件名 `{id}-{题名}.json`。题名部分是建档时的，约 45 万条和今天的题名对不上，只能原样记。
- `--text-root` 时 book-text 一起进库（19 张表，`bt_` 前缀与 `fragment*`）：`manifest.json`、各版本 `index.json`（章目录、标题层级）、
  辑佚 `fragments/*.json`、整理本各章 `NNN.json`（每节一行，content 也进）、original 专名层 `NNN.entity.json`（每处专名一行）。
  正文 `NNN.md`、标点／字形／坐标等逐格数据不进。这些文件没有 id，装库时补（条目id、`条目id/版本key`、`Work id/文件名`、
  `条目id/版本key/NNN`）；两万来份，每次整批重灌，`build_meta.text_commit` 记建到的提交。指向目录的引用只出悬空检查、不加外键。
  视图 `bt_mention`：实体（或作品）× 文本条目 × 册 × 出现次数，出处反查用。
- 明细项里的对象可以用 `Flat` 拆平成列（专名的 `target.entity_id` → `target_id`），装不下的子键进该行 `extra[键]`。
  jsonb 存不了 `\u0000`，含它的值整体转成 JSON 字符串包一层（键 `\x01nul`），读回时拆开。
- `--verify` 把库里四类记录全部还原，与工作区文件逐条比对，文件名也比（门禁，应为 0）。
- `read_records(dsn)` 从库还原四类记录（带相对路径）；book-index `build/build_derived.py --from-db DSN` 用它产出 `_build/`，与从文件产出逐字节一致。

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
映射先于 schema 落地（两仓 CI 互等时）：先合映射，并把字段记进 `mapping.PENDING_SCHEMA`（coverage 测试放过它的 WARN），schema PR 合并后再删掉。
改表结构前先告诉专名（A12）、文本（A33）、搜索（A42）。
