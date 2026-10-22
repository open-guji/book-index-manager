# 分块设计：R3-4 國書（kokusho）确定档存量（Rowan，2026-10-14 洛杉矶晚；待 Milo 评审）

> 背景：Everett 统计（book-index 6d1c58f05357）：國書引擎单位 15,126，有影像 9,241，确定档 4,135，已写入藏本 2,575，粗差 ≈1,560。**这个差还没扣：无影像条（K3：國書无影像不写、不造 catalog）、K9 每 Work≤3、R1–R3/R7 占用与排除、已落库重叠。** 真正可写数要先算。
> 口径：K1–K13（含 K13 书目同一性）、先后规则 R1–R9；链接证据一律用 Reid 的内容判据 judge（國書 = `https://kokusho.nijl.ac.jp/api/biblioDetail/<bid>`：200 JSON=存在，404=不存在；**不用 HTTP 200 页面当证据**）。不探测新站；國書是已开始的馆，在方针内。

## 步骤、输入、验收
| 步 | 输入 | 做 | 验收 |
|---|---|---|---|
| R3-4a 摸底：真实可写数 | Everett 对 kokusho 跑 `engine.py --source kokusho --emit-write-plan` 的 plan＋plancheck（book-index main 当前基线）；国書 D3w 已写 2,482/885 Work 的清单 | 把「确定档 4,135」逐层扣减：无影像／已落库同 group／同 url／目标 Work 并条／K9 超容／排除名单(R2、R3、R7)，得 `可写 N` 与扣减表 | 扣减各层计数相加=4,135−N，无重叠漏计；产出 `R3-4-国書扣减表.tsv`（每条标扣减原因）；N 写进结论 |
| R3-4b 质量复核：既有 2,575 对照 | 已落库國書条（D3w 抽检 200/200 在旧口径下） | 用 K13 与 judge 对既有條**重新**抽 ≥185 条查页面（国書 API 取 title/著者），确认旧写入在新口径下仍同书 | 抽检全对；若有错立刻列出（改既有，另走补丁，不混入追加批） |
| R3-4c 子集与分层 | R3-4a 的可写集 | 沿用内閣做法：整 Work 入批、分层随机（朝代×部类）、≤500 行/批、种子写表头；剔除风险项（别名链/ERA_CONFLICT/Remy-Rhea 已知清单、国書 `holder` 缺失者） | 批文件表头含种子与分层；风险剔除清单可复现 |
| R3-4d 全检 | 批子集 | 逐条取国書 `biblioDetail/<bid>`（≥2 秒/次）：核 题名、责任者、holder、`iiif_manifest` 存在；再抽 ≥30 条打开详情页核题名 | 批内 N/N 题名一致（K13 归一后）、manifest 存在；任一错整批停 |
| R3-4e 出 write_plan＋本地 diff | Everett 按批文件过滤引擎 plan（同内閣流程） | `write_plan_apply_r3.py` 演练→写工作树→check_schema／check_v2／verify --strict | 三项 0 错；演练无意外跳过 |
| R3-4f PR＋Sylvie 重放 | 以上 | 开 book-index PR（描述附全检原始输出＋write_plan 指纹），请 Sylvie 字节级重放＋≥30 行页面核 | Sylvie PASS 点名 head；合并按 Milo 对 §五 的确认 |

## 风险与待决
1. 國書 metadata 键含 `holder`（藏馆）：`label`/去重需按 holder 区分同书多藏本（K9 取舍序：有全本影像＞版本明确＞卷数）。
2. 國書「著作 id」成组（`group_key`）与 Work 一对多时，先按 K13 判；存疑的不进批（K11）。
3. 旧批 2,482 条是 D3w 口径；R3-4b 若发现旧口径错配，改既有须另走补丁。
4. 全部只读+本地，写库一律经 PR；正式库合并按 Milo 确认。

## 估时
R3-4a 1h（等 Everett plan）；R3-4b 1h；R3-4c/d 每批 1.5h；e/f 与内閣同流程。
