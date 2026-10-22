# bookget-py 现状报告（Reid，R4 步 5，洛杉矶 2026-10-15）

只读核对，未改任何行为。仓：open-guji/bookget-py（公开），HEAD 8efde0c（PR #5 合并后）。
- 测试：`pip install -e ".[dev]"` 后 `pytest tests`＝**606 passed, 2 skipped, 28 deselected**（8.75 秒）；`ruff check bookget/`＝All checks passed。
- 适配器：`AdapterRegistry.list_adapters()`＝**37**（含 Generic IIIF、BSB、Bodleian、CUDL、e国宝、Harvard、HKU、Keio、khirin-a、Kokusho、Kyoto RMDA、NDL、ONB、Princeton、Ryukoku、Smithsonian、Stanford、Berkeley、Toyo Bunko、DigiVatlib、IA、CText、BnF、BL、Hanchi、HKUST、LoC、NCL rbook、中华古籍智慧化服务平台、NLC 读者云门户、识典、NPM Open Data、台湾华文电子书库、TNM、Commons、Wikisource）。
- **与站点方针的差距（发现，未改）**：`config.py` 默认 `request_delay=0.5`（秒）、`retry_delay=1.0`，低于方针「≥2 秒/次」。链接巡检不使用 bookget-py，不受影响；但若有人拿它批量取站，须显式把间隔设 ≥2。建议：把默认值提到 2.0 并加单测——这是改行为，须 Milo/Everett 同意后另开 PR，本报告不动。
- 方针（09-27 用户定，见 Everett 交接）：暂停新站；灰色授权站只存元数据与链接、不下载影像；凭据不进仓。本仓 CLAUDE.md 已记「签名 URL 不规范化」「站点接口版本号会变」等坑。
- 归属：Everett→Reid 交接（R1→R4）；不在 crawler 仓写爬虫，也不在本公开仓放爬虫（Everett 报告）。
