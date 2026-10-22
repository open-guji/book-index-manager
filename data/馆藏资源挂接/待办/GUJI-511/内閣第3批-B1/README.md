# 内閣文庫第 3 批·引擎三档表（B1，Everett，2026-10-15 洛杉矶）→ 交 Rowan（R3）人审与写入

## 口径（表头约定）
- 取舍序（每 Work≤3 藏本）：Milo 默认“有影像＞册数完整＞库内顺序”，Rowan 未回前按此出表；引擎实现为“**已挂者先占额** → 有全本影像 → 版本信息明确 → 卷数 → record_id”（writeplan.py，比默认多一层“版本明确”，不冲突）。Rowan 要改取舍序，改后重出本目录。
- 输入钉死：引擎 overview main（match_engine 逻辑自 a1be6aba 起未改，仅新增扫描脚本）；Work 库 book-index@7e7247c8fa（131,696 Work）；DYNASTY_KEYS sha 前缀 9726ab13417d；数据 book_index_json/library_data（当前）。
- 指纹 `12551 dd7265962241237d`（不同于回归报告的 aa05d1cb…，仅因 `excluded` 列随 overview 排除名单内容变；档位与回归报告完全一致：确定 4,509／存疑 3,866／无 4,176）。
- plancheck：item_errors 0（超容 0、新增超容 0）；已落库 543 条 group／id／label／metadata 全一致（full_same 543）。

## 文件
| 文件 | 行数 | 说明 |
|---|---|---|
| 确定-写入计划.tsv | 3,119 | **待写入**：确定档、未落库、未被排除、在每 Work≤3 藏本内；含 label（写入时显示名）。覆盖 1,998 个 Work，单 Work 最多 3 条 |
| 确定-超容被舍.tsv | 573 | 确定但超出每 Work 3 藏本被舍（reason 含 CAP_DROPPED），需要时由 Rowan 决定是否调序／调上限 |
| 确定-已落库.tsv | 545 | 已在库（543 linked＋2 同时被排除），备对账，不写 |
| 确定-被排除.tsv | 221 | 命中排除名单（R2／R3／R7），不写 |
| 存疑.tsv | 3,866 | 人审用，按主因排序：MULTI_WORK 741／A_DIFF 817／A_MISSING 687／T_AUTHOR_NEAR 672／COLLECTION 485／ERA_CONFLICT 167／T_FUZZY 138／DUP_WORK_SUSPECT 103／A_ALIAS_ONLY 56；列含候选 Work（candidates，逗号分隔）与 reasons_text |
| 无-仅备查.tsv | 4,176 | 题名未命中，不处理 |

## 人审必看（已知风险）
1. 喩世明言→古今小說 是别名链，写入前请人核。
2. ERA_CONFLICT 167（含劉昫“晋”＝后晋 等朝代键口径）：#580 键表更新后需 eracmp 重跑，期间不要升档。
3. 无→确定 13、确定→存疑 7 的旧差异清单见《内閣文庫适配器回归报告.md》§三。
4. 汇总口径对账：旧“约 3,890”已过时，以本目录行数为准（待写入 3,119＋超容被舍 573）。
## 我提供
复现命令（`engine.py --source naikaku … --emit-write-plan`，见 `D块-E块独立复跑任务书.md` §二）、任何列/口径的调整（改完重出）。抽检≥200 条由 Rowan／独立检查人做，我不参与结论。
