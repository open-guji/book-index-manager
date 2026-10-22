# book-index-crawler 现状报告＋各站限速清单（Everett，2026-10-15 洛杉矶，给 Reid／R4）

> 来源：我浅克隆 `open-guji/book-index-crawler`（HEAD 68daac9），读 README、docs/抓取规范.md、common/http.py、各站 README。**未实跑、未抓站，限速数字均为各站 README 记录值，以仓内为准。**

## 一、仓现状
- 私仓；一站一目录 `sites/<站>/`（脚本＋README＋qc/＋state/），公用 `common/`（限速 http、断点 state、统一记录与写出）、`crawler/`（`python -m crawler qc|sample`）、`tests/`（pytest，含 4 站与旧脚本逐字段回归）、`docs/`、`_tasks/`。
- 数据不放本仓：写 `book_index_json/library_data/<馆名>.json`（>50MB 拆 part）；总账 `library_data/总账.md`（机器生成）为数字真源。
- 不要把爬虫写进公开仓 bookget-py、guji-resource-index。bookget-py 是公开下载工具（Reid 已核，37 适配器）。
- 抓取规范 §四：默认每秒≤1 请求，站方有规定从严；带可识别 UA（common 默认 UA 含联系邮箱，勿删）；验证码／反爬墙（Anubis、Cloudflare）即停不绕；429 最多退避 3 次（≥60 秒且逐次加倍）仍 429 即停写 pit；robots／条款禁止的不抓（ctext 不抓）；被封站点记入 overview `古籍目录/资源搜集/被封站点待研究.md`。
- `common/http.py`：`Client(rate=1.0)`；429→`RateLimited`、反爬页→`BlockedError`（均为 `StopCrawl`，脚本不得吞）；5xx／网络错误指数退避，用尽抛 `FetchError`（可单条跳过）；时钟可注入便于测试。**链接巡检脚本应直接复用它。**

## 二、各站限速与反爬
| 站（sites/…） | 间隔（README 记录） | 反爬／登录情况 | 入口脚本 | 状态 |
|---|---|---|---|---|
| ndl | 云端出口共用，429 不全由本脚本决定；退避顶 120 秒、重试 12 次，持续失败当前桶回栈安全退出（state.json 可续） | 无登录；偶发 429／503 判为瞬时（手动重试 200） | `fetch_ndl.py`／`enrich_detail.py`／`fetch_dignl.py` | 快照，R2a 在跑 |
| waseda | 列表 `--sleep 0.6`；详情 0.5～0.6 秒＋服务器延迟≈1.4～1.8 秒/次 | 无登录；5～6% 请求 Connection reset（服务器侧，重试） | `fetch_list.py`／`fetch_detail.py`（`run_detail_loop.sh`） | 已完成 62,912 |
| kanseki | 列表 1.5 秒；详情 `enrich_details.py` 3 秒/条（两者可同跑，合计≈1 req/s） | 列表慢查询约 62 秒被掐断（IncompleteRead），退避重试≤3 次 | `fetch_kanseki.py`／`enrich_details.py` | 快照，R3b 在跑 |
| kokusho | `RATE=1.0`（旧 0.8 秒） | 无登录；偶发瞬时 429（手动重试即 200），`enrich_detail.py` 脚本层有限退避（≤3 次、≥60 秒加倍） | `fetch_kokusho.py`／`enrich_detail.py` | 已完成 15,126 |
| bodleian | `RATE=1.0` | 题名责任者所在 east-asian.bodleian.ox.ac.uk 全站 **Anubis 工作量证明墙**（不绕，`BlockedError`）；serica.bodleian 503 疑下线 | `fetch_bodleian.py` | 已完成 2,013（仅 198 有题名） |
| kansai | `RATE=1.0`（全量约 20 请求） | 无 | `fetch_kansai.py` | 已完成 1,455 |
| harvard | `--sleep 8`＋0～2 秒随机，**不要调低**；429 即停（退出码 3） | **云端出口整域 429**（curiosity／iiif.lib.harvard.edu，疑 IP 级）；需换出口本地跑，先探测 200 再跑 | `fetch_harvard.py` | 未抓成 |
| npm-rarebooks（台北故宫） | 1.05 秒/请求；善本 18,089 部×2 请求≈10 小时，輿圖 1,437 行≈26 分钟 | robots 404；无登录；推送数据仓偶发 `cannot lock ref`（run_all 重试 8 次） | `crawl.py`／`run_all.sh`；輿圖 `crawl_drawing.py`／`run_all_drawing.sh` | 已完成 |
| naikaku（内閣文庫） | 经 jpsearch 的 `fetch_naikaku.py`≈1 req/s；**原站 file 级富化受 `Crawl-delay: 30`（30 秒/次，约 2 小时）**，同域名无捷径 | 无登录 | `fetch_naikaku.py`／`enrich_file_level.py`（`autopush.sh`） | 已完成 203,713 |
| japansearch | `RATE=1.0` | 无；未遇 429 | `scan_databases.py`／`scan_signals.py`／`sample_fetch.py` | 已完成（候选库普查，不落 library_data） |
| shlib（data.library.sh.cn） | SPARQL 批量每页几秒；详情 `Client(rate=1.0)` | 无反爬、云端可直连；**请求须带特定头（见该站 README 坑）** | `dump_gj_sparql.py`／`fetch_detail.py` | O2 在跑 |
| shlib-gj（gj.library.sh.cn） | 列表页间隔≥1.2 秒；详情≥1.05 秒/次；单进程串行（多进程用 `--shard`） | **瑞数 JS 反爬**（国内机器也 412）；用户 10-04 在 overview#383 例外：只按普通浏览器加载，不破解，不提速；429 等 60／120／240 秒仍 429 退出码 3 | `crawl_list.js`／`fetch_detail.js`（`run_all.sh`，需 xvfb＋node） | 在跑，另查 #383 |

## 三、对 R4（链接巡检）的提示
- 巡检的是 url 可达性，不同于抓元数据，但沿用同规矩：同 host ≥2 秒（Milo 任务单），commons／wikisource 走 API 批查；遇 429／验证码即停。
- 云端出口 IP 共用：harvard 整域 429、ndl／kokusho 偶发瞬时 429，巡检时 429 先手动复核再下结论，别直接判死链。
- bodleian、npm、nlc 的 url 巡检要先看对应站 README 的“坑”再动手；npm 全量≈10 小时（与 Reid 建议的 10% 抽样一致）。
- 用户放行后 Reid 自行 `add_repo`，本报告足以先写设计。
