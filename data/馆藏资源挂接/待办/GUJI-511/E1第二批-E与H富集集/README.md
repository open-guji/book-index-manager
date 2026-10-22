# E1 第二批：E／H 层规则富集集（Rhea 版，176 行）
- 来源：旧存疑 6,257 对照表，T∧A∧U 规则（设计稿见 archive 包1 `E1-二审表/E1第二批-E与H层规则富集-设计-Rhea.md`）。E 138＋H 38。
- `Rhea圈集-176.tsv`：stratum、source_record_id、rule_work_id、国图 url、站方题名/责任者（Everett 用来对齐口径差）。
- `Rhea已抓国图页-175.tsv`：已抓取的国图页面文字（序号、source_record_id、题名、责任者、版本项…），供人核；少 1 行待补。
- 负责人：Rhea；Everett 对口径；清理条件：E1 第二批补丁合并后归档。

## 占用剔除（Everett，2026-10-15 洛杉矶）
输入：`Rhea圈集-176.tsv`（Rhea 口径为准，Everett 复现 181 条、差异不扩集）。工具：`tools/馆藏资源挂接/e1b_occupancy.py`（match_engine exclusions：R2/R3/R7 台账＋dupx；R1 缺失/并条/升级；已落库；K9 每 Work≤3 条 nlc 藏本）。Work 库：book-index main e5248cb205d9。
- `圈集-占用剔除后-144.tsv`：保留 144 行（进 Rhea 人核）。
- `圈集-占用剔除-32.tsv`：剔除 32 行，原因列：K9超容 28、R7 2、R2 2。
- **K9 说明**：此处按「库内 nlc 藏本数＋本批同 Work 按记录号序累计 >3」标超容，**未按取舍序（影像＞版本明确＞卷数）排名**；超容 28 行里同 Work 多条（穆參軍集、道園學古錄、新刊補注釋文黃帝內經素問 等）最终取哪 3 条由进 write_plan 时 writeplan.rank_key 定，Rhea 人核时可对这些 Work 挑选。
- 未出 write_plan（待人核＋Ruth 盲抽过闸）。

## 人核与盲核结论（Rhea，2026-10-15 晚）
- 人核 144 行：同 140、存疑 4（`Rhea人核结论-144.tsv`）。
- Ruth 盲核 80 行（`E1b-盲核用-80.tsv`）：同 46、异 1、存疑 33。异 1 行（2642）是我已判存疑的朝代冲突行（元 vs 明），**我判同的行里无一被判异**；存疑 33 全是页题名多前缀/异体字/库朝代空/页责任者截断，未被证伪。
- 严格判据（页题名＝库题名或别名、库朝代非空、库责任者全在页责任者内）在盲核样本里完全预测 Ruth：满足者 43 行全同，不满足者 33 存疑＋3 同。
- 建议写入 71 行（`E1b-建议写入-71.tsv`）：严格判据全满足 68（盲核 43 同＋未入样 25）＋盲核同但不满足严格判据 3。暂缓 73 行（`E1b-暂缓-73.tsv`）：留二轮用页面内容补证。
- 写库须用户放行；本表不改 Work/Book。

## write_plan 草案（Everett，2026-10-16 洛杉矶）
输入：`E1b-建议写入-71.tsv`（draft main 4016cf3b7e；2642 不在内）。脚本：`tools/馆藏资源挂接/e1b_mkplan.py`（writeplan.make_item／rank_key，同第一批形状）。Work 库 book-index main 174d897db429。
- `E1b_write_plan.jsonl`：**71 行／53 Work**，plancheck.check_item 零错，每 Work 最多 3 条（含库内已有 nlc 藏本）。
- `E1b_剔除与超容.tsv`：已落库、R1 缺失/并条、R2/R3/R7 占用、同 group 已在、K9 超容的行——**本次 0 行**（71 行全部通过）。K9 取舍序＝影像＞版本明确＞卷数＞记录号（writeplan.rank_key），本次无 Work 超容，无需取舍。
- 终稿待 Rhea 25 行补盲核（Ruth 异 0 才写；有异则剔该行后重出）与用户放行；本草案不写库。

## write_plan 终稿（Everett，2026-10-16 洛杉矶）：69 行／51 Work
Ruth 补 25 盲核异 0，但 1560（d59f27x68n43）、1700（d59f2nl8dkow）两行存疑，按 Milo 条件①存疑行必排除，由 71 行剔除，**终稿 69 行**（`E1b_write_plan.jsonl`，sha 前缀 627b615ccdd9，plancheck.check_item 零错，每 Work≤3）。剔除登记在 `E1b_剔除与超容.tsv`。
**不在 plan 内**：2642（朝代冲突存疑）、`E1b-暂缓-73.tsv` 的 73 行、1560、1700。
