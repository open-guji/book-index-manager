# 国書责任者闸（K13 硬规则，Milo 2026-10-15；Rowan R3-4c 抽核、Silas 三档建议后改版）

证据层次：**本册责任**＝详情页 `detail.author`（页面「責任表述」）；**著作层著者**＝`detail.work[].author`。列表层 `author` 是 Work 层、会借同 wid 他册，不再作依据（九章算經 100350462 列表层＝劉徽，本册责任＝梁萬方考訂，引擎因此漏拦）。

分档码（`authorgate.py`；引擎对 kokusho 确定档逐行判并落盘 `kokusho_确定档责任者闸分档证据.tsv`，含 本册责任／著作层著者／题名全等／有影像 字段；G3 自动排除出 write_plan，plancheck `--data-root` 回扫 G3 命中 rc=3）：
- **G1_BOOK_AUTHOR_OK**：本册责任非空且与 Work 著者相交 → 通过
- **G1_WORK_LAYER_OK**：本册责任空，`work[]` 恰一条且著者与 Work 著者相交 → 通过（Rowan 60/60 的情形）
- **G2_TITLE_EXACT_NOAUTH**：本册责任空，work[] 无著者，书名（题名／kshomei）与 Work 题名集全等且有影像 → 放行；每批分层抽核 ≥100，错挂 >1% 停批（Silas ②）
- **G3_NOT_IN_WORK**：本册责任非空而不含 Work 著者 → 拦
- **G3_WORK_AUTHOR_DIFF**：本册责任空，work[] 单条但著者不含 Work 著者 → 拦
- **G3_MULTI_WORK**：本册责任空，work[] 多条（多著作册）→ 拦
- **G3_EMPTY_NO_EVIDENCE**：本册责任空、work[] 无著者，且书名非全等或无影像 → 拦

全量（kokusho 确定档 4135）：G1_BOOK 1766、G1_WORK_LAYER 1919、G2 36、G3_NOT_IN_WORK 320、G3_EMPTY_NO_EVIDENCE 94；其余 G3 码 0。拦 414（`kokusho_责任者闸命中.tsv`）。已落库 1253 条中：G1/G2 放行的与 Silas 的追认一致；仍拦的 253（NOT_IN_WORK 237＋EMPTY_NO_EVIDENCE 16）见命中表 already_linked=1。
write_plan：旧 9 行回扫——通过 6（100242785、100236310、300070910、100442475 为 G1_BOOK；100385579、200043173 为 G1_WORK_LAYER），拦 3（100350462 G3_NOT_IN_WORK；200010628、300092842 G3_EMPTY_NO_EVIDENCE）。引擎新出 write_plan 8 行（拦掉 3 行后因 K9 每 Work ≤3 补位新进 300093587、300106651）。批3 里那 4 行空责任：200043173、100385579 转通过，200010628、300092842 仍拦。本次只出列表，不改 #529。
