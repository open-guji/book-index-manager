# 分块设计：馆藏与在线资源挂接 ／ E1 group 补 resource_groups

> 块负责人：Edwin　｜　项目主力：Silas　｜　状态：待评审（Marlowe 已批立项，附条件；本设计通过前只做 dry-run）
> 对应来源：`体检结论.md`「group 3,787」行及第 19 行；`口径.md` K7、样例 8

## 一、本块目标与边界
目标：给 Work 层 nlc／kokusho 资源里 `group` 不在本记录 `resource_groups` 的 3,787 个组补上 `resource_groups[<组>].label`。
不做：不动 `resources`（含 url、group 值、types）、不新增字段、不动 schema；不碰已有的 `resource_groups` 键；内閣／NDL 本次无缺项，不处理；取不出 edition 的不猜，只列出。
交付物：脚本 `scripts/馆藏资源挂接/group_labels.py`；dry-run 清单 `group补label-dryrun.tsv`；分批 PR（book-index）；抽样核对表。

## 二、Schema／数据格式
- 只写 `resource_groups.<组>.label`（字符串），与库内既有记录同形，例：`"nlc-411999011854": {"label": "國圖藏本：明崇禎[1628-1644]"}`。
- label 规则（用库内已有正确 label 反推，复现率）：
  - nlc：`國圖藏本：{metadata.edition}`（7716/7718＝99.97%）
  - kokusho：`國書·{metadata.holder}藏{metadata.edition}`（1932/2061＝93.7%）；库内另有旧式「國書藏本：{edition}（{holder}）」65 条、带「（摘抄／局部）」后缀 64 条，均无法从元数据推出，本批统一用主格式，不加后缀。
- 同记录同组多条 resource 时，取先出现者的 edition（dry-run 已按组去重）。
- 记录级：`resource_groups` 为空（3,528 条）则新建对象；部分存在（164 条）则只补缺的键，既有键原样保留。
- 版本字段：`revision` 次版本 +1、patch 归 0（1.0.1→1.1.0，1.1.0→1.2.0）；`revised_at` 改当日。

## 三、程序架构
- `group_labels.py`（已写，只读）：`--root` 传库根，扫 `Work/`，输出缺项清单与未取出原因；`--learn` 用已有 label 复现规则。
- 写入脚本 `group_labels_apply.py`（待评审后写）：读 dry-run TSV 的指定批次行，只改 `resource_groups` 与 `revision`／`revised_at`，JSON 序列化沿用库内缩进与键序，二次运行幂等（组已有即跳过）。
- 运行在云端会话；book-index 工作树用分支，不直接写 main。

## 四、步骤流程
| 步 | 做什么 | 输入标准 | 产出 | 验收标准 | 谁验 | 估时 |
|---|---|---|---|---|---|---|
| 1 | dry-run 全量 | book-index main，只读 | 清单 3,787 行 | 缺项 3,787（nlc 3301／kokusho 486）；可生成 3,786；取不出 1（水蜜桃譜，无 edition） | 已完成，Silas 对数 | 已做 |
| 2 | 设计评审 | 本文 | 评审记录 | Marlowe 通过 | Marlowe | 评审方定 |
| 3 | 抽样核对 | dry-run 清单 | 抽样表 ≥185 条 | 见第五节，全对；有错则查规则、修后全量重跑 dry-run 并重抽 | **Sol 或 Sage（不得自核）** | 1h |
| 4 | 登记排班 | 步 2、3 过；先问 Silas 与 commons B-修错开 | 排班 §一 一行 | 与 Silas 的 commons PR 写域无时间重叠 | Silas | 5 分钟 |
| 5 | 分批出分支 PR | 步 4 完成 | 3,692 条记录 / ≤200 条每批 ≈ 19 个 PR | 每 PR：①改动文件数≤200；②diff 只含 `resource_groups`／`revision`／`revised_at`（脚本统计「其他字段改动＝0」）；③check_schema、check_v2 --paths、build_derived 0 错，附原始输出；④附前后 diff 统计 | Marlowe（我不合） | 每批 ≈15 分钟，机器几分钟 |
| 6 | 全部合入后复核 | 19 个 PR 合完 | 复跑 dry-run | 缺项 0（仅余步 1 里无 edition 的 1 条）；体检 group 行 3,787→1 | Edwin 跑、Silas 对数 | 15 分钟 |

回退办法：按路径还原。每个 PR 的改动文件清单即回退清单；`git revert` 该 PR 的合并提交，或对其清单里的路径 `git checkout <PR 前提交> -- <路径>`；只动 `resource_groups`，不会牵连其他字段，回退后重跑 dry-run 应回到该批缺项数。

## 五、抽样方案（≥185，分层，Sol／Sage 核）
总 200 条记录，每条核其全部新补的组。必含机器规则覆盖不到的边角类：
| 层 | 条数 | 看什么 |
|---|---|---|
| edition 缺失（水蜜桃譜） | 1（全查） | 确认不写、列入遗留 |
| 一记录多组（95 条中） | 25 | 各组 label 对应各自 edition，不串 |
| 部分存在 `resource_groups`（164 条中） | 25 | 既有键未被改，仅补缺的键 |
| 记录里已有旧式「國書藏本：」或带「（摘抄／局部）」label 的（若有交集，不足则全取） | ≥10 | 旧式未被改动；新补的组用主格式 |
| 同记录多个 nlc 组 | 含在“一记录多组”25 条内，至少 10 条 | 各组 edition 不串 |
| group 前缀异常 | 全量机检 | 缺项里前缀只有 nlc／kokusho 两种（已核），出现其他前缀即停并报 |
| 同一 label 多组（348 个重复 label 中） | 15 | 重复是否合理（同馆藏同版多册），不误并 |
| kokusho 主格式 | 60 | holder／edition 取值对；含 holder 带括号、全角数字、`［…］` 年份的边角 |
| nlc | 74 | edition 含 `[年份]` 格式与既有 label 一致；含年号带数字（崇禎3年 vs 崇禎三年）样例 |
核法：取原 resource 的 edition／holder 与拟 label 对照；kokusho 另按站方页面抽 10 条看藏本与版本说明；链接抽检不在本块范围（url 不动）。
金标说明：label 是机械规则生成物而非人裁真值，故抽样核的是「规则输出是否与元数据一致、边角是否被误处理」；规则本身的依据是库内既有 label 复现率，不是自算。

## 六、与其他块的接口
| 方向 | 对方块／负责人 | 文件／格式 | 何时交接 | 对方已确认？ |
|---|---|---|---|---|
| 写域 | Silas（commons B-修 PR 也写 book-index） | 排班 §一 | 步 4 | 待问 |
| 评审／合 | Marlowe | PR | 步 5 | 已批立项 |
| 抽样核 | Sol 或 Sage | 抽样表 | 步 3 | 待请 |

## 七、风险与未决
- 最可能出错：kokusho 主格式与旧式／摘抄后缀不一致造成新旧 label 风格混杂（486 条）。默认做法：用主格式，不加后缀，PR 描述注明；Silas 若给出摘抄／局部名单再补。
- 已定（Silas 10-13）：kokusho 统一主格式、不加摘抄／局部后缀，PR 描述注明；旧式 65 条不动；水蜜桃譜 1 条不猜，列 PR「未处理」并另报。写域顺序：本块先于 B-修，每个 PR 合并后告知 Silas。
- 待定：网站是否按 label 去重展示（同 label 多组 348 个，G 块）。
- 与 commons B-修在同一仓：已定本块先走（避免同一 Work 文件冲突），排班备注写“先于 B-修”。

## 八、评审
| 日期 | 评审人 | 结论 | 意见 |
|---|---|---|---|
| 2026-10-13 | Marlowe | 通过（带条件） | ①批量：第 1 个 PR 仍 ≤200 条作试点；试点合入且复核无误后，其余批放宽到≤400 条/批（机械改动、diff 只含 resource_groups/revision/revised_at），约 10 个 PR；②生产仓 PR 须另附 `verify --strict` 原始输出（draft 才可豁免）；③第 5 步“Marlowe（我不合）”按总规矩改为：我读 diff、CI 绿即合，并逐个记工作日志；④抽样 ≥185 由 Sol 或 Sage 核，抽样表入仓后才登记排班出 PR；⑤kokusho 统一主格式、不加摘抄/局部后缀、旧式 65 条不动、水蜜桃譜不猜，均认可；⑥revision 次版本+1/patch 归 0 认可；⑦写域顺序：本块先于 commons B-修，每个 PR 合并后告知 Silas。 |
