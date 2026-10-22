# 分块设计：朝代年号录入 ／ F 键表与回挂接口

> 块负责人：Edwin　｜　项目主力：Sasha　｜　状态：评审通过（2026-10-12 洛杉矶 约 16:10）
> 对应总计划：`项目进展/朝代年号录入/计划/总计划.md` 第四节第 F 行

## 一、本块目标与边界
目标：块 C 的数据进正式库后，保证 `_build/dynasty_reign_keys.json` 对**新数据**正确、稳定，并把文本侧（#574）按键表回挂时的两类缺口——「纪年→公元」算错、朝代／年号名未命中——逐个给出处置。
**先说一个与总计划不同的事实**：键表的生成器早已实现，在 `book-index/build/names.py`（F6-5b，`products()` 产出 `dynasty_reign_keys.json`，测试 `tests/test_build_names.py::test_keys_files`）。所以本块**不重写生成器**，也不改它的契约；总计划写的"重生成键表"在这里就是"C 合入后跑 build 并验证"。
不做：不改 `build/names.py`（属 book-index 的构建代码，改它是契约变动，须先在 #458 通知网站经理并升契约版本，本块若发现必须改则停下提需求）；不改 schema；不裁决（归 C）；不建人物（归 Soren）；不发布；不碰文本侧 span 匹配（归 #574 P7）。
交付物：①`scripts/keys_check.py`（键表体检）；②`测试集/纪年换算.tsv`＋`scripts/reign_year.py`（年号＋年数→公元的参考实现与测试）；③`朝代年号未命中处置.tsv`；④C 合入后重生成键表的验证记录（贴在 #580）。

## 二、Schema／数据格式
### 2.1 键表（不新增，沿用契约）
文件 `_build/dynasty_reign_keys.json`，格式见 `专名建档/P4-升格/dynasty_reign_keys-交接.md` 与 `book-index/schema/derived.md`（〈九〉末，契约版本 3）：`{version, count:{keys,dynasty,reign}, normalize, keys:{名:[候选…]}}`；候选字段 `id, subtype, primary_name, via, ambiguous?, start?, end?`，年号另有 `dynasty_id, dynasty, ruler?`，朝代另有 `parent_id?`。排序：朝代在前，再按起年、id。本块**只读**这个文件。
### 2.2 `测试集/纪年换算.tsv`（本块新建，只放 overview，不进数据仓）
列：`用例号｜文本写法｜年号｜年数｜朝代提示｜期望公元｜依据｜类型`，UTF-8，`#` 注释行写取数时刻。
- 年数：整数；`元`＝1。公元＝`start + 年数 − 1`（改元当年算元年，交接档 §二·4）。
- `期望公元` 一律由**人工依据**得出（依据列写传世纪年表的卷／页或学界通行表述，**不是**拿键表自己算出再贴回去——自循环不算金标）。
- 类型：`正常｜改元年｜公元前｜重名消歧｜越界｜不存在`。样例：`T001	萬曆十年	萬曆	10	明	1582	明史本紀；萬曆元年=1573	正常`；`T0xx	太平三年	太平	3	孫吳	258	孫亮太平元年=256	重名消歧`。
### 2.3 `朝代年号未命中处置.tsv`
列：`名｜出处(span 数／样本位置)｜类别｜处置｜去向`。类别 ∈ `朝代·歧义｜朝代·无条｜年号·无条｜非朝代年号(地名等)｜异体`；处置 ∈ `补别名｜补条(转块 C)｜不建档(理由码)｜归 A 侧消歧`；去向写卡号／块。数据来源是 Tamsin 的命中统计（`项目进展/专名识别与链接/` 下的 `entity_coverage` 产物；**以她给的最新文件为准，不用总计划引的 10-08 快照**）。

## 三、程序架构
```
scripts/keys_check.py   读 dynasty_reign_keys.json（可选再读库根，对账条目）→ 体检报告；退出码＝是否有 FAIL
scripts/reign_year.py   纯函数 lookup(keys, 年号, 年数, 朝代提示=None) → 候选[(公元, id, 消歧依据)]；run_tests 读 纪年换算.tsv 逐条断言
scripts/guji_norm.py    复用块 B 的归一（与键表的 normalize 同表）
```
入口：`python3 scripts/keys_check.py --keys <_build/dynasty_reign_keys.json> --root <book-index>`；`python3 scripts/reign_year.py --keys … --cases 测试集/纪年换算.tsv`。生成键表：在 book-index 工作树 `python3 build/build_derived.py --text-index <book-text/index/texts>`（只读；产物在 `_build/`，不进 git）。**读不到 `--text-index` 目录时**，退路：用 `gen_dynasty_reign_keys.py`（原型）产出同形文件做体检，并在报告里写明"原型产出，非 build"。
运行在云端会话；不改任何仓。

### 3.1 体检项（keys_check，逐项 PASS/FAIL）
1. `count` 与库对账：`count.dynasty / reign` = 库内未升格条数；`count.keys` = `len(keys)`。
2. 每条库内 dynasty／reign 的 `primary_name` 及非"全稱"别名，在 `keys` 里都能反查到该 id（含 normalize 后的写法）。
3. `ambiguous` 对账：别名带 `ambiguous` 的候选，键表里都带；单独拿出来不唯一的名字（如「宋」「漢」），候选 ≥2 且全带 `ambiguous`。
4. 无悬空：所有候选 `dynasty_id` 都能在 dynasty 候选里找到；无 `promoted_to` 草稿 id 混入。
5. 起讫：reign 候选 `start ≤ end`（end 缺则只查 start 存在）；无 0 年；公元前为负。
6. 排序与确定性：同一输入两次产出（若有）`sha256` 相同；候选排序符合"朝代在前、起年升序"。
7. **重名年号的消歧力**：对每个 ≥2 候选的年号键，所有候选的（`dynasty`,`start`）两两不同——否则文本侧无法区分（同朝代同起年的重名条目视为数据问题，报给 C）。
8. 不含外部 id：`keys` 的值中无 `cbdb`／`dila`／`chgis` 字样的字段名。

## 四、步骤流程
> 前置：本块的步 1–3 可立即做（基于**当前**正式库），步 4–5 要等块 C 的数据 PR 合入。

| 步 | 做什么 | 输入标准 | 产出 | 验收标准（命令＋预期） | 谁验 | 估时 |
|---|---|---|---|---|---|---|
| 1 | 取当前键表基线 | 本设计评审通过；book-index 工作树在手（指纹 `389bb3f483` 起）；`book-text/index/texts` 可得或确认走原型退路 | `基线/键表基线.json`（不进库，仅留 sha 与 count）、基线记录 | 报出 `count.keys／dynasty／reign`，与库内 139／734 对账，**不符则停下**；贴 `sha256` | 自验 | 20 分钟 |
| 2 | `keys_check.py`（§3.1 八项） | 步 1 | `scripts/keys_check.py` | 在基线上八项全部有结果；已知应 FAIL/WARN 的项逐个核实原因（预期：第 7 项会因"重名条目同朝代同起年"有 0～若干条，**如实报数，不预设为 0**）；用故意改坏的键表夹具验证每项都能变红（夹具入 `scripts/tests/`） | 自验＋Sasha 抽 | 60 分钟 |
| 3 | `reign_year.py` ＋ `纪年换算.tsv` | 步 1；Sasha 或 Sylvie 提供金标年表依据（见下） | `scripts/reign_year.py`、`测试集/纪年换算.tsv`（≥60 行：正常 20、改元年 10、公元前 8、重名消歧 12、越界 5、不存在 5） | `python3 scripts/reign_year.py --keys … --cases …` 全 PASS；"重名消歧"用例必须带朝代提示才能唯一，无提示时返回全部候选且不抛错；期望值每行的"依据"列非空（`awk -F'\t' '$7==""' … | wc -l` 为 0） | Sylvie 抽 15 行对原表 | 75 分钟 |
| 4 | C 合入后重生成与体检 | 块 C 的某批数据 PR 已合入正式库（或在 draft 且带 `--ref-root`）；步 2、3 通过 | `验证记录`（#580 评论） | 重生成后 `keys_check` 无 FAIL；`count.reign` 对账新库条数；与基线 diff：新增键数、消失键数列表（消失的键逐个说明理由，不得有未说明的消失） | 自验＋Sasha | 每批 20 分钟 |
| 5 | 未命中名处置 | Tamsin 的最新命中统计文件；步 4 至少一批 | `朝代年号未命中处置.tsv` | 统计里朝代／年号 `new_candidate` 与 `ambiguous` 的**每个不同名**都有一行；未处置行数 0（`awk -F'\t' '$4==""'` 为 0）；其中"补条／补别名"逐条转 C，"归 A 侧消歧"的与 Tamsin 对表确认 | Tamsin 确认去向 | 45 分钟 |
| 6 | 收口复核 | C、D 全部合入、升格完成 | 最终验证记录 | 总计划验收 7：键冲突检查与交接档一致；#574 vol02／03 样本上朝代／年号 `new_candidate` 清零或有去向（用 Tamsin 的 `entity_coverage` 复跑，贴原始输出） | Sasha | 30 分钟 |

合计约 **4 小时**（比总计划估的 2 小时多，因为多了体检脚本和换算测试集；步 4、6 分批，机器耗时每次 <2 分钟）。

## 五、测试数据与金标
- 纪年换算测试集：人工依据，不得从键表自循环；Sasha／Sylvie 是年表依据的把关人（块 A 的源表只作交叉参照，**不作为期望值的唯一依据**，以免继承源错误）。
- 夹具：`scripts/tests/` 里手造小键表（含歧义键、坏起讫、悬空 dynasty_id、外部 id 字段），每项体检各一个正例一个反例。
- 评测口径：体检按"项"计 PASS/FAIL；换算测试按"用例"计，要求全过，失败项逐条列出而不是改期望值迁就实现。

## 六、与其他块的接口
| 方向 | 对方块／负责人 | 文件／格式 | 何时交接 | 对方已确认？ |
|---|---|---|---|---|
| 入 | C／Sasha | 已合入的 dynasty／reign 数据（正式库或 draft+ref-root） | 每批 C PR 合入后 | 待（请 Sasha 在每批合入时叫我） |
| 入 | Tamsin（#574） | 最新 `entity_coverage` 命中统计中朝代／年号 new_candidate、ambiguous 名清单 | 步 5 前 | 待 |
| 出 | C／Sasha | 未命中名中"补条／补别名"的清单 | 步 5 | 待 |
| 出 | Tamsin | `纪年换算.tsv`（可供文本侧测试"某年号+年数→公元"）；"归 A 侧消歧"名单 | 步 3、5 | 待 |
| 出 | 网站经理 | 若发现必须改 `build/names.py` 的契约问题 | 发现即报，不自改 | — |

## 七、风险与未决
- **最可能出错的一处**：把"键表算出来的值"当金标，使换算测试变成自证。对策：期望值只许来自年表依据，依据列必填，Sylvie 抽查。
- 本块依赖 book-text 的 `index/texts`（build 的必填参数）；若会话读不到，退路是原型 `gen_dynasty_reign_keys.py`，但原型与 build 的 normalize 表曾不一致（原型 6 字，build 7 字含「淸→清」）——已把 `guji_norm.py` 对齐 build 的 7 字；用原型时必须在报告里标明并补「淸」。
- 同朝代同起年的重名年号（体检第 7 项）若存在，属数据问题（文本侧无法消歧），转 C；不在本块改数据。
- 未决（默认值照做，不阻塞）：`测试集/纪年换算.tsv` 是否应同步给 Tamsin 做文本侧回归——默认给；她不要则只留在本仓。
- 与总计划不一致处（需 Sasha 知悉）：①"重生成键表"并非写代码；②块 F 估时由 2 小时改为约 4 小时（含体检与换算集）。

## 八、评审
| 日期 | 评审人 | 结论 | 意见 |
|---|---|---|---|
| 2026-10-12 | Sasha | **通过（附 4 条意见，不阻塞）** | ①同意不重写生成器、不改 `build/names.py`，估时改 4 小时认可。②公元前跨 0 年必须有用例：公元＝start+年数−1 在跨越公元前 1 年→公元 1 年时要跳过 0（如前2年起的年号第 3 年应为公元 1 年），请在「公元前」8 条里至少放 2 条跨界、2 条同年改元（一年内换号，元年同年）。③金标依据分工：公元前与重名消歧的依据由我给（取自 DILA＋纪年表，不以维基为唯一依据），正常与改元年由 Sylvie 给；Edwin 先写代码和夹具，依据到了再填，不得自填。④步 4 每批合入我会叫你。**最可能出错处**：期望值被键表自循环（你已写明对策）；其次是原型与 build 的 normalize 差异（6 字 vs 7 字「淸→清」），用原型退路时务必在报告标明。 |
