# 链接巡检用法与周监控（Reid，R4，2026-10-15）
脚本：`scripts/馆藏资源挂接/link_audit.py`（只读，不写库）。判据见 `链接内容判据库说明-Reid.md`。**在 book-index 仓根运行**，用 `python3 -I`。

## 周监控（nlc＋npm 各 5% 分层，按 ISO 周换种子）
```
cd <book-index 仓根>
python3 -I <overview>/scripts/馆藏资源挂接/link_audit.py --monitor --out <输出目录>/$(date +%G%V)
```
- 约 1,500 次请求，≈ 1 小时（同 host 2 秒/次，两站并行）。
- 看 `统计.tsv`：dead 非 0 → 看 `死链表.tsv`（已隔 `--confirm-gap` 秒二次确认）；blocked／error 多＝站点或出口问题，不是死链，隔天重跑。
- 看 `请求间隔自检.txt`：必须全 PASS，否则脚本退出码 1；贴卡时附此文件原始内容。
- 监控只报不改；死链交 Silas／Marlowe 决定摘除或改挂。

## 全量某站
`--hosts <host1,host2> --out DIR`（可断点续跑：同目录重跑会跳过已测）；例：`--hosts zh.wikisource.org`、`--hosts kokusho.nijl.ac.jp`、`--hosts dl.ndl.go.jp`、`--hosts commons.wikimedia.org`。
- commons／wikisource 走 MediaWiki API 批查（50 标题/次）；出口常被 429，脚本按 Retry-After 退避，仍 429 记 blocked（不判死）。
- 识典恒 `unjudged`（匿名下真假不可区分）；其余站点无内容判据时走状态码，**不要把它当"有效"证据**。

## 定向重测
`--urls-file 文件`（每行一个 url，或 tsv 首列），用于重测清单。

## 红线
同 host 间隔 ≥2 秒（脚本拒绝更小值）；429 退避；无凭据；不下载影像；死链只报不改；线程崩溃会在日志显式报错并非零退出（先看 `*.log`）。
