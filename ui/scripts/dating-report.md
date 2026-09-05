# dating 迁移工具（一次性）

方案见 `overview/项目进展/古籍索引网站/整体设计/2026-09-刊刻年代方案.md`。

## 两步走

**第一步：算，不写。** 生成 `dating.json`（`{id: DatingInfo}`）与一份统计报告。
脚本是临时的 vitest 用例（复用现成工具链，不引 tsx 依赖），跑完即删：

```bash
# tests/unit/_gen-dating.test.ts —— 见本次提交的 git 历史
DATING_ROOT=D:/workspace/book-index   npx vitest run tests/unit/_gen-dating.test.ts --testTimeout=600000
```

**第二步：批量写入。**

```bash
python scripts/apply-dating.py            # 预演，不写文件
python scripts/apply-dating.py --apply    # 真写
```

`dating.json`（约 3.6 MB）是派生产物，不入库；要重跑就重新生成。

## 为什么直接写文件而不走 `book-index save`

`save` 是覆盖式写入 + 逐条更新索引，20k 条很慢。而索引条目
（`entry_extractor.build_index_entry`）只取 id/title/type/path/author/
year/holder/... —— **其中 year 只读 `publication_info`，不读 dating**。
新增 dating 字段完全不影响索引，直接改 JSON 是安全的。

实测：19,604 个文件 **9.4 秒**写完；`index/` 零改动；
`check-index` 未报任何 Book 未索引（58 条未索引全是 Entity/Work/Collection，
本次改动之前就存在）。

## 安全措施

- 默认预演，必须显式 `--apply`
- `source=manual` 的人工订正不覆盖
- 不动 `revision` / `revised_at`（不 bump 版本）
- 键序稳定：dating 插在 `publication_info` 之后
- 写入前逐条比对，除 dating 外有任何差异就跳过并报错
- 写完全量校验：19,604 个文件与 HEAD 版本剥掉 dating 后**逐条相等**

## 2026-09-05 首次迁移结果

```
扫描 Book     20853
  生成 dating 19604 (94.0%)
  跳过·推不出 1249 (6.0%)   —— 「鈔本」「稿本」「江西圖」这类本就无年代
  有确切年份  13293 (63.7%)
  有年代区间   3340 (16.0%)
  有底本         273 (1.3%)
  有后修         140 (0.7%)
certainty     inferred 78.0% / uncertain 13.5% / attested 2.5%
与人工著录冲突  0 条
```
