# R1→R4 交接：bookget-py、book-index-crawler（Everett → Reid，2026-10-15 洛杉矶）

更新（10-15）：我 add_repo 成功并浅克隆了 crawler（Reid 那边被拒，权限需 Milo／用户授权）。仓内实情（我读过 README，未改动）：
- 结构：`sites/<站>/`（脚本＋README＋qc/state）、`common/`（限速 http：429／验证码即停、断点 state、统一记录与写出）、`crawler/`（`python -m crawler qc|sample`）、`tests/`（pytest，含 4 站回归）、`docs/抓取规范.md`·`统一字段表.md`·`新站上手.md`、`_tasks/`。
- 已有站：ndl、waseda(62,912)、kanseki、kokusho(15,126)、bodleian、kansai、harvard(云端429未抓成)、npm-rarebooks(18,089+1,437)、naikaku(203,713)、japansearch、shlib。
- 注意：爬虫不要写进公开仓 bookget-py；数据写 `book_index_json/library_data/`。
我没维护过这两仓；以下为 overview 里原有事实：
- `open-guji/book-index-crawler`（私仓）：爬虫脚本。抓取产物放 `open-guji-core/book_index_json` 的 `library_data/`，不进 crawler 仓。
- `bookget-py`：下载工具，原归目录总管（见 `项目进展/总调度/总管任务书/目录小总管-R.md`）；备份方案里它标为体量小（约 1.2）。
- 方针（09-27 用户定）：已开始的馆刷完即止，暂停新站；灰色授权站只存元数据与链接，不下载影像；限速 ≥2 秒/次；凭据不进仓。
- 与我相关的：match_engine 读 `library_data/`（`scripts/馆藏资源挂接/match_engine/adapters/`），crawler 改字段格式前请先在 GUJI-335 报我，我同步适配器单测。
- 我已出的结论：`ndl无档52.5%澄清-Everett.md`（ndl 无档为库内本无，非抓取问题）。
