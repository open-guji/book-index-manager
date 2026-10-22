# B-修 错挂核对 收口小结（LA 2026-10-13）

卡 #583；执行人 Silas；核对对象＝体检 dupx「同题异作者」605 url／1,372 条记录。

## 一、做了什么（已合并）
| 批 | PR | 站点 | 文件页／页面 | 摘除 resources（Work 数） | 独立抽样 |
|---|---|---|---|---|---|
| 1 | book-index#209 | commons | 200 | 243 | Sloane 30/30 |
| 2 | book-index#210 | commons | 94（机器 16＋人核 78） | 118 | Sloane 29/30（异议 1 条四川總志已剔除，保持 unknown） |
| 3 | book-index#250 | wikisource | 14 | 15 | Sloane 14/14（全量） |
| **合计** | | | **308** | **376** | |

做法：只在页面「作者栏」内匹配记录作者，命中恰一条记录者保留，其余记录上的同一 url 摘除（规则 v2，机器规则对 Sol 盲样 27/30＝90%）；只动 `resources`，每个改动 Work 小版本＋1、`revised_at`、`ai_note`；`resources` 变空的写 `[]`，verify --strict 通过；每批单站点、附原站核对表、排班先登记、Marlowe 逐文件核后合并。

## 二、保持不动的各类及原因
| 类 | 数量 | 原因／去向 |
|---|---|---|
| commons 机器 keep_all | 26 | 页面作者栏同时含两条记录的作者（多为丛书、合订）。不是错挂，不动 |
| 人核 keep_all（commons） | 24（其中约 8 条丛书／四库册合订） | 同上；约 16–18 条是「同书被拆成两三个 Work」，已转 Sabine 的 P10 去重线（清单 `转Sabine去重线-同书拆多Work清单.tsv`）；去重后是否并 Work 须先报 Marlowe，并后由我调挂接 |
| wikisource keep_all | 3 | 雲南圖經志書、史載之方、義門讀書記：同书两 Work，同转去重线 |
| commons 仍 unknown | 64＋四川總志 1 | 61 条页面责任者与库内两边 Work 都不符（多为民国／他朝另一版本，库里没有对应 Work），**不是错挂**，建议另开「补 Book／Work」线；3 条页面无责任者信息；四川總志 Sloane 与 Sasha 对库内两条作者判断分歧，无页面证据，不动 |
| wikisource／archive.org unknown | 19 | 作者栏取不到或与两边都不符，人核仍无法确证 |
| 识典 | 60 | 见下节：云端取不到数据，未核 |
| 非 dupx 本块范围 | — | 「一方无作者」60 url（补作者后再判）、同题同作者 13 url（疑似重复 Work，去重线）、不同题名共用（保留）不是 B-修 |

## 三、识典（shidianguji）取不到数据——后续建议
- 事实：识典书页是 JS 渲染，服务端只返回站点框架；用 playwright chromium 能开页，但数据接口返回 "Data exception"（云端出口被拒或需特定来源），Sasha 与我各自实测相同。
- 影响：dupx 里识典 72 url（试点 12＋其余 60）全部无法核对，保持 unknown，没有猜。
- 建议（按成本由低到高，均需 Marlowe／用户定，我不自行动手）：
  1. 在美国云服务器 `43.162.109.111`（机器清单有）上用 chromium 再试一次，看出口 IP 是否不同（不跑重算，仅 60 页轻量取证）；
  2. 由有本地浏览器的人（用户／Windows 本地）导出这 72 页的作者栏文字，再套 cuowa_verdict_v2；
  3. 若识典有公开书目接口，请用户给出处。
  无论哪条，后续只需对 72 url 跑一遍 v2＋人核＋Sloane 抽样，约 1 个批次。

## 四、副产物与待续
- 体检 §五：链接抽检 200 条无确认死链；26 条未确认（429×8、wikisource 编码 bug×7、npm-rarebooks URLError×11）待重测，不挡收口。
- 水蜜桃譜 d59f2mtzx2bk 的 nlc-312001036010 缺 edition：不猜，人核补。
- 规则 v2 的 unknown 占比：commons 40.5%（刚过线，Marlowe 知情）。

## 五、文件索引（均在 `项目进展/馆藏资源挂接/计划/`）
`B修-commons批1/批2-v2初判.tsv`、`B修-commons批1/批2-PR核对表.tsv`、`B修-其余站点批3-PR核对表.tsv`、`B修-commons-unknown人核结论.tsv`、`B修-其余站点-人核结论.tsv`、`B修-commons抽样30-Sloane.tsv`、`B修-commons抽样30-批2-Sloane.tsv`、`B修-其余站点-复核-Sloane.tsv`、`体检结论.md`（§五、§六）。脚本：`scripts/馆藏资源挂接/cuowa_fetch.py`、`cuowa_verdict_v2.py`。
