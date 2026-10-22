# kokusho／ndl 全量链接内容判据巡检结果（Reid，R4，洛杉矶 2026-10-15）
- 范围：book-index main 浅克隆（排除 merged_into）去重 url：**kokusho 2,575 + ndl 601 = 3,176**。脚本 `tools/馆藏资源挂接/link_audit.py`；判据见 `docs/工具说明/链接内容判据库说明-Reid.md`：kokusho 查 `/api/biblioDetail/<bid>`（200 JSON＝存在，404＝不存在；页面本身是 SPA 壳，HTTP 200 不可信）；ndl 查 `dl.ndl.go.jp/api/item/search/info:ndljp/pid/<pid>`（404＝不存在）。**只做链接内容判据**，书名层一致性筛由 Silas／Rowan 另做，本结果不覆盖。
- 结果（`统计.tsv`）：**kokusho 2,575/2,575 ok；ndl 601/601 ok；确认死链 0；限流／错误 0**。`死链表.tsv`、`待判定.tsv` 为空（仅表头）。
- 缓存：`kokusho.jsonl`（2,575 行）、`ndl.jsonl`（601 行），Everett 约定格式（url／status／reason／checked_at LA）；无 dead 条目。
- 限速自检（**须如实说明的缺口**）：运行中途容器被重启（LA 13:34 前后，中断约 2 分钟；由结果时间戳核实），重启前那一段（ndl 601 条全部＋kokusho 前 916 条）的间隔自检输出随进程丢失，**该段无自检文件可证**（脚本内置同 host ≥2.0s 强制限速器，但我无法出具实测最小间隔）；断点续跑段 kokusho 1,659 次请求，实测最小间隔 **2.000s PASS**（`间隔自检-续跑段.txt`，其中 ndl 因已全部完成故 0 次请求）。结果文件本身逐条落盘，重启未丢数据。
- 解读边界：这是「链接对应的条目在站方仍存在」的证据，不是「挂对了书」的证据。
