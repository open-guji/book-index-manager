# R1-E1：国图存疑的引擎侧重算（小设计，Everett，2026-10-15 洛杉矶）→ Milo 评审；与 Rhea（R2）已对口径

## 一、目标与边界
- 目标：在“加责任者别名＋更新后的朝代键表”之后，引擎对国图 25,574 条的档位如何变，出三档对照表交 Rhea 人审（R2-1 步 2）。
- 不做：不写 book-index；不新建 Entity（Milo 已定，别名只读现有 Entity／CBDB）；升确定仍须口径 K11（题名全等＋责任者相交＋朝代无冲突＋唯一 Work）；仅别名相合（A_ALIAS_ONLY）不由我升档，由 Rhea 试点测精度后再定；合刻丛书不升；本仓多 Work 等去重线。人审抽样由 Rhea／Remy 做，我不抽。

## 二、已做的预估（只为定范围，不是交付；/tmp 实验，不推）
| 配置 | 确定 | 存疑 | 无 | A_ALIAS_ONLY | A_DIFF | ERA_CONFLICT |
|---|---|---|---|---|---|---|
| 现行 nlc（含 R1-A4 字体表） | 10,909 | 7,082 | 7,583 | 0 | 1,755 | 319 |
| nlc＋alias=True（只读 Entity 现有别名） | 10,909 | 7,082 | 7,583 | **102** | 1,657 | 319 |
结论：别名只把 102 条从“责任者不合”重分到“仅别名相合”（仍是存疑，不升）；**引擎侧自动升档数≈0**。E1 的价值在于给 Rhea 一张分层更准的表，不是自动多出确定。另注意：引擎当前存疑 7,082，不同于旧匹配表的 6,257（引擎更严、口径已变），对照表两列都给。

## 三、与 Rhea 对口径的四点（她的答复，原样落实）
1. **列**：source_record_id／旧档（旧匹配表）／新档（引擎）／升档原因码（tier.py 码，含 A_ALIAS_ONLY、ERA_*）／work_id／candidates／lib_title／lib_author／lib_version／work_title／work_authors／work_dynasty／url／excluded（exclusions.py 的 R1／R2／R3／R7 命中码）／旧主类。旧主类用 Rhea 的 9 类（缺责任者／近似题名／责任者不合／合刻丛书／方志前缀／朝代／本仓多Work／装饰词／其他），按旧 reasons 归并，我用她的规则脚本逻辑，不另造；引擎侧分类（reason_codes）并列保留。表头写：旧匹配表路径＋行数＋sha、Work 库 commit、DYNASTY_KEYS sha、引擎 commit、alias 配置。
2. **标准**：K11 不变；A_ALIAS_ONLY 单列不升；合刻丛书、本仓多 Work 不升；抽样与盲标由 Rhea／Remy。
3. **别名来源**：引擎 workindex 已有 `load_entities`（读 Work 引用的 Entity 的 `primary_name`＋`alt_names`，国書／NDL／内閣在用）。**实验配置 nlc_alias＝在 tier.py 加一个 profile（alias=True，其余同 nlc），不改 nlc 本身，不动已有指纹**。CBDB 字号：目前引擎不读 CBDB，只用 Entity 现有 alt_names；是否要补 CBDB 字号，待 Rhea 试点看 E 类可升比例再定（需要时我另读 CBDB 只读副本）。
4. **朝代键表**：用“更新后的 #580 键表”。我现有键表由 bi-7e72 的 `build/build_derived.py` 生成（sha 前缀 9726ab13417d）。**待确认：#580 之后有无新的键表产出（路径／sha）**——Milo／Rhea 指给我，或我按当前 book-index main 重建后先跑 eracmp 对比，差异报给 Rhea。ERA_CONFLICT（现 319，旧 333）在键表重跑核对完成前一律不升档。

## 四、步骤（每步输入／验收）
| 步 | 输入 | 做 | 验收 | 估时 |
|---|---|---|---|---|
| E1-1 钉输入 | 旧匹配表 `_匹配/國圖數字古籍/匹配表.tsv`；Work 库当前 main；键表（见三.4） | 记指纹；重建键表并跑 eracmp，出 ERA_CONFLICT 变化表 | 指纹齐；eracmp 一致率与差异清单；ERA_CONFLICT 变化有逐条理由 | 0.5 小时 |
| E1-2 alias 配置 | tier.py | 加 `nlc_alias` profile＋单测（别名相合→A_ALIAS_ONLY，不升） | 原 nlc 四源指纹不变（回归同 A5）；新配置 pytest 全过 | 0.5 小时 |
| E1-3 出表 | E1-1／2 | 引擎跑 nlc_alias，与旧匹配表逐行对照，加旧主类、exclusions 码；放 `_匹配/國圖數字古籍/二审/E1-三档对照表.tsv`（不进 overview），汇总 md 进计划目录 | 25,574 行逐行有旧档／新档；分档计数与 stats 一致；档位变化矩阵附汇总；plancheck 0 错 | 1 小时 |
| E1-4 交接 | 对照表 | 通知 Rhea；她做步 2 试点；我答疑、按她的结论改规则 | Rhea 确认可用 | 随她 |

## 五、风险与待 Milo 定
- 自动升档≈0（见二）：请 Milo 知悉，E1 的收益靠 Rhea 人审，不靠引擎。
- 键表版本待确认（三.4）。CBDB 字号是否纳入，待试点数据。
- 本设计评审过我再动手（E1-1 起）；评审前只读不写。
