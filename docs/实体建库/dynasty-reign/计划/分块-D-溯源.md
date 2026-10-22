# 分块设计：朝代年号完整录入 ／ 块 D 溯源补全
> 负责人：Haiku×2（实习生，Marcus 开）｜带教：Sasha｜状态：已评审（事后补记，见 §六）（2026-10-12 洛杉矶，Sasha 补写；原总计划缺此文件）

## 一、目标与边界
把**已有裁决账行**的条目（`verdict=adopt`，及 `reject` 中"保持库内现状"且 sources 含史书者）的出处写进数据：补 `description.sources`、把 `dates.basis` 写具体。**机械转录，不做史学判断**：每条补的内容必须逐字可在裁决账同 `diff_id` 行的 `sources`／`note` 里找到。
不做：不改 `dates.start/end`、不改 `ruler`、不升 `review.status`（须 Sylvie 抽检）、不新建条目、不存外部库 id（CBDB／DILA／CHGIS 等），不整段搬运外部文字（CC0）；账外条目（约 860 条无裁决行的）本期不碰。
## 二、输入与格式
- 输入：`裁决/verdicts*.jsonl` 里 `entity_ids` 非空、`verdict∈{adopt,reject}` 且 `sources` 含 `book:`前缀的行；各行已是 `verdict_check` 0 错。
- 补入形状：`description.sources` 元素用**字符串**，写「书名卷次」（例：`宋史·夏國傳下卷四百八十六`）；`dates.basis` 写一句话，格式「取S–E（口径一句）；据〈书·卷〉」，只引账内已有史书；维基／DILA 只可在 `basis` 里写"zhwp／DILA 一致"，不入 `description.sources`。
- 同条两个 `diff_id` 冲突时不补，列入 `D-待人.md`。
## 三、步骤（每步输入／验收）
| 步 | 做什么 | 输入 | 产出 | 验收 | 谁验 | 估时 |
|---|---|---|---|---|---|---|
| 0 | 读本文件、`裁决/接手项处置.md` 规则头、`来源可信度表.md` | — | notes 一行"已读" | 能复述"哪些字段不许动" | Sasha | 15 分钟 |
| 1 | 样例：#168 已合的 3 个西夏条（hixi1ubp2yoq／yow／yox）+ 清 ai_note「列未决」 | 账本对应行 | 草稿 diff（不推库） | 只改 sources／basis／ai_note；`git diff` 无 dates 改动 | Sasha 逐字核 | 30 分钟 |
| 2 | 批量：账内全部合格条目（先 C3 已入账者） | 步 1 通过 | book-index PR（≤30 条/PR） | `check_v2` ERROR 0／WARN 不增；`verify --strict` 过；PR 描述附"字段→账本 diff_id"对照表；逐条 sources 可在账本找到 | Sasha 抽 10 条，Mirren 审合 | 每批 60 分钟 |
## 四、测试与反例
故意在草稿里写一个账外书名，Sasha 的抽检必须能发现；每批 PR 前跑 `scripts/d_check.py`（待写：校验"补入书名⊂账本 sources"，由 Sasha 写）。
## 五、风险
最可能出错：Haiku 为"补全"自行补出处。对策：只许转录；账本无书名则留空。
## 六、评审
| 日期 | 评审人 | 结论 | 意见 |
|---|---|---|---|
| 2026-10-12 | Mirren | 过（事后补记） | 执行已按总计划附四放宽完成：笼统 basis 134→0（#181），有账 sources 补齐（#171、#182）；无账条不编出处，余量挂 #589。最可能出错处：把"库内原有，未经本期复核"当成已核对，后续勿据此升 reviewed。 |

---
已按总计划附四放宽执行，见 #580 收口记录。
