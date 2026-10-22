# R1 分块设计：①日文新字体表补全　②内閣文庫第 3 批匹配表（Everett，2026-10-15 洛杉矶；待 Milo 评审）

> 原则：我（R1）只出引擎侧产物（对照表、三档表）；人审与写入归 Rowan（R3）；不写 book-index(-draft)，不动引擎已有指纹。先读：`总计划.md` E4／E5、`内閣文庫适配器回归报告.md`、`match_engine/README.md`、`data/jp_variants.tsv`。

## 先更正两个数字（实测，overview 当前树 + bi-7e72@7e7247c8fa）
- **字体表现状不是“约 80 字”**：`data/jp_variants.tsv` 已有 **364 条**（N1，2026-09-27，源自 opencc JPVariants，只收一对一无歧义项）。E5 要补的是它**没覆盖的**：被剔除的歧义项（如 弁←瓣／辨／辯）、opencc 未收的日本新字体／异体、国書／早稲田语料里高频但表里没有的字。
- **内閣“第 3 批约 3,890”按引擎复算**：naikaku 12,551 组，确定 4,509／存疑 3,866／无 4,176（与回归报告一致）。其中确定里已落库 543（linked）、被排除 222；**可写入候选 write_plan 3,119 组，因每 Work≤3 藏本上限被丢的 cap_dropped 573**。“3,890”与 3,119＋573＝3,692 或 3,744（确定未链未排除）都对不上，需 Milo／Rowan 说明该数的来源口径，否则以引擎实数为准。

## 块 A：日文新字体表补全（E5 前置）
| 步 | 做什么 | 输入 | 验收 |
|---|---|---|---|
| A1 | 盘点缺口：对 kokusho（15,126）、早稲田（62,912）、NDL、内閣题名／责任者字段统计“表外高频非繁体字”（CJK 字符集合差，对照 OpenCC t2s 与繁体规范字集） | `library_data/` 的 kokusho／waseda／ndl／naikaku、`jp_variants.tsv` | 产出缺口字频表 tsv（字、频次、样例题名、候选繁体） |
| A2 | 候选对照：每个缺口字给 1 个或多个候选繁体，分“一对一确定／多对一歧义／仅日本异体无对应”三类；歧义项给上下文消歧规则而不是硬映射（沿用现表对 弁 的处理：不收） | A1 | 三类分表；一对一类每条有语料证据（繁体语料出现次数 vs 日文语料出现次数，学 N1 对“遥/遙”的做法） |
| A3 | 人审：文献学者（Rowan）看歧义与异体表，拍板 | A2 | 逐条结论（收／不收／带规则） |
| A4 | 合入：新行追加到 `jp_variants.tsv`（不改旧行），`normalize.py` 仍 `jp=True` 才生效（国图中文源不受影响） | A3 | 单测：新增字逐字对照；全套 pytest 绿（现 199） |
| A5 | **零回退校验**：重跑 nlc／kokusho／ndl／naikaku，指纹、档位、write_plan 与现权威值逐项比 | A4、overview 固定在引擎提交 a1be6aba 以外的最新树时只比除 `excluded` 外各列 | nlc 25574／kokusho 15126 `8d6700c860fa66e0`／ndl 3232 `197cb61e324a1965` 指纹不变；对内閣／NDL 已写入 453 项（及 naikaku 543）group／id／label 全一致；字数新增数报告 |
- 风险：新增映射会让原“无→存疑／确定”的升档，这是预期收益，但必须与“指纹不变”分开叙述——**指纹不变指的是对既有三源的重算**，新增字若改变了既有源的某行结果就算回退，要么退出该字要么单列差异表交 Milo。
- 合入前提：A5 通过；早稲田适配器与罗马字剥离属 E5 本体，不在本块（我另报）。

## 块 B：内閣文庫第 3 批三档表（E4）
| 步 | 做什么 | 输入 | 验收 |
|---|---|---|---|
| B0 | **与 Rowan 对口径**（GUJI-335 已 @，等回）：每 Work≤3 藏本的取舍顺序（册数全／版本新旧／has_image？）；存疑档他要看哪些列；抽检比例；“3,890”口径 | 总计划 §关键问题 5、本文数字 | Rowan 书面确认（GUJI-335 评论即可） |
| B1 | 跑引擎出表：`engine.py --source naikaku --emit-write-plan`，overview 固定提交、Work 库固定 book-index commit、DYNASTY_KEYS sha 前缀 9726ab13417d；按口径排除已落库 543 与 excluded 222 | 同上 | 指纹、档位数、plancheck（item_errors 0、超 3 藏本 Work 0）贴出 |
| B2 | 交付给 Rowan：`naikaku-第3批-确定.tsv`（write_plan 对应表，含 group_key／work_id／label／url）、`-存疑.tsv`（按 reason_code 分栏：A_DIFF 1381、A_MISSING 1000、T_AUTHOR_NEAR 737、MULTI_WORK 804、ERA_CONFLICT 167、DUP_WORK_SUSPECT 103、COLLECTION 912…，附候选 Work）、`-无.tsv`（不作处理，仅备查） | B1 | 表头说明文件＋行数对账；确定行与 write_plan 一一对应 |
| B3 | 留已知风险清单给人审：别名链（喩世明言→古今小說 须人核）、ERA_CONFLICT 6 条朝代键口径（劉昫“晋”）待 #580 后 eracmp 重跑 | 回归报告 §四 | 清单进表头文件，人审必看 |
| B4 | 配合 Rowan 抽检：我只提供复现命令与答疑，不参与抽检结论 | — | Rowan 抽检≥200 条全对（R3 验收） |
- 我不做：人审、写入 book-index、正式库写入（需用户放行）、网站发布。

## 顺序与预计
A1–A2 约 1.5 小时（可与 B0 并行）；B1 约 0.5 小时（跑在 B0 口径确认后）；A3 等 Rowan；A4–A5 约 1 小时。B 可先于 A 出：B 用当前表，A 合入后若改变 naikaku 结果则 B 表需重出（A5 含 naikaku 对比，如有变动在差异表里标明，避免 Rowan 审到旧表）。

## 需 Milo／Rowan 定
1. “3,890”口径（见上）。 2. 每 Work≤3 藏本取舍顺序。 3. 若 A 与 B 并行，B 表以 A 合入前还是后为准（我建议先出 B，A 合入后只在差异时重出）。
