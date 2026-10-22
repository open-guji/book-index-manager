# commons.wikimedia.org 全量链接巡检结果（Reid，R4，洛杉矶 2026-10-15）
- 范围：book-index main 浅克隆（排除 merged_into）去重 url **19,038** 条；脚本 `tools/馆藏资源挂接/link_audit.py`（MediaWiki API 每次 50 标题批查，**POST**；API 判缺失者隔 10 分钟**直查页面**二次确认）。
- 结果：**ok 18,977｜确认死链 11 个 url（涉及 16 条记录）｜待判定 50**（持续 429，见 `待判定.tsv`，不判死）。死链表见 `死链表.tsv`（file／res_index／res_id／url／证据／检测时间 LA），**只报不改**，摘除或改挂由 Silas／Marlowe 决定。抽查 4 个死链用 curl 复测均 404（含 `Category:Wenyuange_Siku_Quanshu` 与《续修四库全书》第 0914–0916 册 PDF——后者与 GUJI-370「Commons 续修四庫 pdf 改 djvu」相关）。
- 过程（如实）：主跑覆盖全部 19,038 条，其中 1,150 条因 **HTTP 414（50 个中文标题的 GET URL 过长）**报 error、202 条 429；我把批查改为 POST 后对这 1,358 条（含 6 条待确认缺失）补测，再对仍 429 的 100 条、50 条各补测一轮（出口对 commons API 限流严重，第三轮 50 条全 429，停止重试）。主跑进程在收尾前意外消失（无最终统计文件，故无主跑的自检输出），但它所有结果已逐条落盘。
- 限速：脚本内对同 host 强制 ≥2s（进程内限速器）。补测自检（原始见 间隔自检-补测*.txt）：补测1 47 次最小间隔 2.000s PASS；补测2 6 次 2.000s PASS；补测3 4 次 30.448s（429 退避）PASS。**主跑无自检输出，不能出具其最小间隔证明**；主跑期间同时还有 wikisource 的并行进程（不同 host，不构成对 commons 的叠加）。
- 缓存：`tools/馆藏资源挂接/data/判据缓存/commons.jsonl`（引擎读取处；GUJI-361 迁入）（dead 条目均有 API 缺失＋直查 404 两条不同时间记录；blocked 记 unknown）。
