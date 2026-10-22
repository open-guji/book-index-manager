# 馆藏资源挂接（文档）

由 overview `项目进展/馆藏资源挂接/` 迁入（GUJI-361 拆空，第一批：规范与设计文档，2026-10-15）。原文内的相对链接与路径（`计划/…`、`进度/…`）仍指向 overview 旧位置，随后续批次迁入后再统一；引擎数据文件（dupx 清单、合刻组白名单、判据缓存）暂留 overview，待引擎路径参数化后切换。

- `规范/`：口径（K1–K13）、先后规则（R1–R9）、总计划、体检结论、合刻组白名单说明。引擎与人核共用，视为现行规范。
- `设计/`：分块设计（A/B/C/D/E1/R1–R5/B修）。属历史设计记录，现状以 Jira 卡与口径为准。

后续批次：已落库批次证据（打包 `archive/`）、引擎数据与脚本（`tools/馆藏资源挂接/`）。

## 第二批（GUJI-361）
- `匹配/`：资源搜索匹配（来自 overview `项目进展/古籍目录/资源搜索匹配/`）——README 为各源覆盖总表，另有批量匹配方案、维基文库三份、Commons、Internet Archive、四库存目丛书目录。
- `tools/馆藏资源挂接/stat-work-resources.py`：Work 资源覆盖统计脚本。文件内的用法行仍写旧路径 `古籍索引网站/…`，实际用法：`python tools/馆藏资源挂接/stat-work-resources.py [--index-root PATH] [--by-juan]`。

## 第四批（GUJI-361）
- `报告/`：D 块历史（步2–7、基线清单、独立复跑任务书）、B 修与 #583 收口、E1 group 补 label 总结、R1/R3 各馆数据统计与首批核对报告。
- `工具说明/`：Reid／Everett 的巡检、判据库、crawler、bookget-py、内閣适配器说明，及抽样 10% 新判据统计。文件名前缀为原目录名。
- `判据对照/`：各站内容判据对照表（nlc、kokusho、ndl、waseda、digital-archives-jp、npm、shidianguji）。
- Reid 的 `全量-commons-Reid/`、`全量-wikisource-Reid/`（含 `ws_resolve_Silas.py`）整目录因脚本运行中且依赖相对路径，暂不迁，留 `data/馆藏资源挂接/待办/GUJI-370/`。
