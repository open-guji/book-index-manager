# 10% 分层抽样（新内容判据）结果（Reid，洛杉矶 2026-10-15 04:00 前后跑完）
- 范围：book-index main 浅克隆，去重 url 按 host×类型分层各取 10%，固定种子 20261015；脚本 `scripts/馆藏资源挂接/link_audit.py`（commit ≥ f45ebd97），判据见 `计划/链接内容判据库说明-Reid.md`。
- 结果（`统计.tsv`）：ndl 60（59 ok，1 条 429 被限流，随后用 API 直测为 200 ⇒ ok）｜kokusho 258/258 ok｜npm 1755/1755 ok｜nlc 1108/1108 ok。共 3181 条，**确认死链 0**。
- 限速自检（`请求间隔自检.txt` 原始）：ndl 65 次、kokusho 258 次、npm 1978 次（含重试）、nlc 1108 次，各 host 最小间隔均 2.000s，PASS。
- 注意：识典（恒 unknown）、commons／wikisource（API，已另测 26 条）不在本抽样内；本抽样只说明"这 4 站的抽样链接内容判据下可达"，不等于全库无死链。npm 抽样的 223 次额外请求是 Connection reset 的自动重试。
