# 分块设计：P-人物 批A（史部／子部出现≥3 部的未建档作者，103 人）

> 块负责人：Soren　｜　协作：Simone（CBDB 取数，GUJI-174）、Sidney（读原书核对，GUJI-175）、Skye　｜　经理：Mirren　｜　卡：GUJI-114　｜　日期：2026-10-13（洛杉矶）
> 批准：Mirren 10-13 15:59（批A 同意开工）。

## 一、目标与边界
把 `批A-01…`、`批A-02…` 的 103 个作者逐个落成 book-index people Entity（或登记「不建＋理由」），交对照表给目录块回挂。
不做：不改 Work 的 `authors[]`（回挂归目录块 Elias，走草稿 PR→Sylvie 抽检→Elias 审合）；不建机构／无名氏；不改 schema；不发布。

## 二、步骤（每步输入／验收）
| 步 | 做什么 | 输入 | 验收 | 谁 |
|---|---|---|---|---|
| 1 | CBDB 候选取数（A-01 共 40 人先行，A-02 63 人随后） | 名单 TSV | 每行有状态：有候选／CBDB无／接口失败；抽检≥20% 一致率≥85% | Simone；Soren 抽检 |
| 2 | 逐人判定：唯一候选＋朝代不冲突＋≥1 旁证→填 `cbdb_id`；同名同朝代但无旁证→不填；多候选→标歧义，不挂 | 候选表＋Work 书名／总目责任者原文 | 判定表每行有结论＋依据；歧义项单列 | Soren／Skye |
| 3 | 需读原书的歧义项取证 | 判定表歧义行 | 证据卡含原书引文＋第二独立来源＋把握 | Sidney |
| 4 | 铸 id、写 Entity JSON（字段按 `schema/entity/people.md`、`_common.md`；`alt_names[].type` 限 23 值；`ai_note` 写依据；生卒空不写0）、同步 `index/entities/*.json` | 判定表 | `verify --strict` entities 漂移 0；`check_v2` 0/0/0；`check_schema --paths -` 过 | Soren |
| 5 | 出对照表 TSV：人名｜Work/Book id｜entity_id｜置信／依据（含同名消歧结论与版本 commit） | 已合 Entity | 行数＝挂靠 Work 数；歧义项不列 | Soren |
| 6 | PR（≤1 个写 PR 在途，一批一提交）；Mirren 审合；排班登记 | — | 门禁输出贴 PR | Soren |

## 三、判据（宁缺毋滥）
- 同名＋同朝代不足以并／填号；无 CBDB 号的也可建档（`cbdb_match` 记 none），不硬凑。
- 总目朝代与 CBDB 朝代冲突→标「朝代冲突」，转 Sidney 或不建。
- 僧人名（釋X）：CBDB 常有多个同名，必须有 Work 书名旁证。

## 四、风险
CBDB 接口断连（低并发＋重试）；同名异代误填号（抽检把关）；与 F道／G道／Sasha 清单人物重复（建档前先在三张清单与现库去重）；与回挂脚本的 id 对应（对照表格式先与 Elias 定）。
