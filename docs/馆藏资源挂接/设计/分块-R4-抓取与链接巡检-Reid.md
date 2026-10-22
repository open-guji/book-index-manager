# 分块设计 R4：抓取与链接巡检（Reid，2026-10-15，待 Milo 评审）

> 评审过之前不动手。全程只读：不写 book-index／-draft，不写正式库；产出（脚本、tsv）放 overview，本设计不涉及排班登记。
> 红线：同一站点（host）请求间隔 ≥2 秒；不同站点可并行；凭据不进仓；遇 429／验证码不硬冲，退避并记录。

## 0. 事实底数（book-index main 浅克隆，排除 merged_into，我跑的原始输出）
全库 resources 去重 url **73,982**。按 host：commons 19,038｜rarebooks-maps.npm 17,547｜read.nlc 11,078｜zh.wikisource 9,746｜shidianguji 9,628｜archive.org 3,036｜kokusho 2,575｜dl.ndl 601｜digital.archives.go.jp 546｜ctext 57｜其余长尾约 150。
按 2 秒/次逐条探测，最大的 commons 单站约 10.6 小时，故 commons 用 MediaWiki API 批量查（每次 ≤50 个标题，一次请求验 50 条，仍 ≥2 秒/次），wikisource 同理。其余站点逐条 HEAD→GET 兜底。环境实测：云端能连 npm 主机、commons（HEAD 200）。

## 1. 步骤与验收
| 步 | 做什么 | 输入 | 验收 |
|---|---|---|---|
| 1 | **26 条重测**（429×8、wikisource 编码×7、npm URLError×11） | 体检结论 §五；原 26 条 url 清单**未入仓**（在 Silas 抽检的临时目录）——向 Silas 要 tsv，要不到就从原抽样种子复现 | 26 条每条有结论：ok／确认死链／仍限流（带退避重试≥3 次后再报）／其他；wikisource 用 `urllib.parse.quote` 转义；npm URLError 先在本环境复现，判定是脚本、代理还是站点问题；结果 tsv 入 overview |
| 2 | **巡检脚本 `link_audit.py`**（overview `scripts/馆藏资源挂接/`） | book-index 仓根；host 规则表 | 见 §2；先 `--sample 25/站` 小跑与 §五旧结果对得上，再全量 |
| 3 | **全库跑一次**，出死链表 | 步 2 | 一次跑通（可断点续跑）；输出 `死链表.tsv`（file、res_index、site、url、status、证据、判定、时间）；统计每 host 200／3xx／4xx／5xx／429／超时数；**限速自检：日志里任一 host 相邻请求间隔最小值 ≥2.0s** |
| 4 | **死链判定与交接** | 步 3 | 只报不改：确认死链（连续两次不同时间 404／410，且非限流）列清单交 Silas／Marlowe；任何摘除走正常 PR，不由我写库 |
| 5 | **接手 bookget-py**（open-guji/bookget-py，已核：公开仓，37 个适配器，py≥3.10，有 CLAUDE.md、tests） | Everett 交接说明 | 本机跑 `pytest` 通过数如实报；列出适配器清单与站点方针对照（暂停新站、灰色站只存元数据、≥2 秒）；不改行为，只出现状报告 |
| 6 | **接手 book-index-crawler**（私仓 open-guji/book-index-crawler，**我这里 add_repo 当前被拒：无权限**，需 Milo／Marcus 授权或另给路径） | 同上 | 授权后出现状报告；改产出字段格式前先在 GUJI-335 报 Everett |

## 2. link_audit.py 设计
- 输入：遍历 Work／Book（同 health_check.py 口径，跳过 merged_into），抽 url＋所在文件＋res_index＋id。
- 每 host 独立限速器（默认 2.0s，可调大不可调小，低于 2 直接报错退出）；host 间并发（线程池，按 host 分队列）。
- 探测策略：HEAD；405／403／异常再 GET（只取首个字节，不下载影像，灰色站不下文件）。commons／wikisource 走 API `action=query&titles=…&prop=info`（批 50，`missing` 即缺页）。
- 分类：ok(2xx)｜redirect(3xx，记终点)｜dead(404/410 且二次确认)｜blocked(429/403/验证码，退避 30s 起指数，最多 3 次，仍不过标 unknown)｜error(DNS／超时／TLS，标 unknown 不判死)。**限流与网络错一律不判死链**（体检结论已立的口径）。
- URL 先 `quote`，保留 `%`；User-Agent 如实标明。无登录、无 cookie、无凭据；nlc 若需登录页（#15）只记 status，不登录。
- 断点：每 200 条落盘一次 jsonl，重跑跳过已完成。
- 自测：对 25／站小样与旧 §五（nlc／ndl／kokusho 等 25/25 通）比对；单测覆盖编码、限速器（假时钟）、分类。
- 全量时长估算：并行下瓶颈是 npm 17.5k×2s≈9.7h、nlc 11k≈6.2h；commons／wikisource 经批量约 1 小时。总计约 10 小时（挂美国服务器或分段续跑；云端容器会回收，进度必须每批 push 到 overview）。**需 Milo 定：npm／nlc 全量还是先 10% 分层抽样**（建议先抽样 10% 看死链率，再决定是否全量）。

## 3. 风险
| 风险 | 对策 |
|---|---|
| 云端容器回收、长跑中断 | 断点文件每批 push；或迁美国服务器（须 Milo 同意） |
| 429／封 IP | 严守 ≥2s、退避、host 级熔断（连续 10 次 429 停该 host 并报） |
| 原 26 条清单找不到 | 向 Silas 要；兜底按旧抽样规则重抽并如实说明不是同一批 |
| crawler 仓无权限 | 已在卡上报，等授权，不卡步 1–5 |

## 4. 需 Milo 评审/决定
1. 全量 vs 10% 抽样（npm／nlc）；2. 长跑落在云端分段还是美国服务器；3. crawler 仓授权；4. 26 条原清单谁给。
