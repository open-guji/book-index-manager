# 链接内容判据库说明（Reid，R4，洛杉矶 2026-10-15）

**核心结论：对 SPA／壳页站点，HTTP 200 不能当"链接有效"的证据。** 凡判可达，必须用下表的内容判据；判据一律先用「真 url vs 编造的不存在 url」对照证明可区分才上线。代码：`scripts/馆藏资源挂接/link_audit.py`（`judge()` 对外函数；`python3 -I link_audit.py --out DIR …` 批跑）；单测 `test_link_audit.py`。

## 站点判据（2026-10-15 实测，UA 标明，同 host ≥2 秒）
| 站 | 判据 | 真样例 → 特征 | 假样例 → 特征 | 状态 |
|---|---|---|---|---|
| nlc read.nlc.cn | GET 正文大小：< 3000B ＝ 空壳 ＝ 不存在 | fid=411999008984 → 200／28~31KB | fid=000000000000 → 200／747~798B | 已验证 1 对＋抽样；**Remy 补满 ≥5 对中** |
| ndl dl.ndl.go.jp | 不看页面（SPA 壳，真假逐字节同 4298B），改查 API `https://dl.ndl.go.jp/api/item/search/info:ndljp/pid/<pid>` | pid 14209237 → API 200／1647B JSON | pid 99999999 → API 404／113B | 已验证 1 对；出口偶发 API 429（按 blocked 退避，不判死） |
| npm rarebooks-maps.npm.edu.tw | **必须带会话 cookie**（先 GET index.php）；GET 搜索 url：正文含「沒有查詢結果」＝不存在；被 302 回 `act=Landing/index`／标题「古籍輿圖檢索系統-首頁」＝会话失效，记 blocked 不判死 | 11 条旧 26 条中的 URLError 条目＋样例 → 200／67~78KB，标题「古籍查詢」 | 编造 CmnNumber=ZZZ999999-999999 → 200／65KB，含「沒有查詢結果」 | 已验证；偶发 Connection reset（站点/出口），自动退避重试 5/10/20s |
| 识典 shidianguji | **暂无判据**：真/假 id 皆 200，页面 725KB vs 243KB 皆为壳 | book/7428573169323081747/… → 200/725KB | book/9999999999999999999/… → 200/243KB | 标 unjudged；待找 JSON/XHR 接口（Remy 在查） |
| 国書 kokusho | 页面是壳（真假皆200/≈4.9KB），改查 Remy 找到的接口 `https://kokusho.nijl.ac.jp/api/biblioDetail/<bid>`：200 JSON＝存在，404＝不存在 | bid 100385351 → 200/3597B JSON | bid 999999999 → 404/6586B HTML | 已验证（Remy 5 对＋我复测 1 对） |
| 早稲田 waseda（www.wul.waseda.ac.jp/kotenseki/…） | **状态码有效**：200＝存在，404＝不存在（页面静态 HTML） | ya09_00239 → 200/6946B | ya09_99999 → 404/239B | 已验证（Remy 5 对＋我复测 1 对） |
| archive.org | 状态码有效：不存在 id → 404 | details/02091248.cn → 200/238KB | details/zzzznotexist98765 → 404 | 已验证 |
| commons／wikisource | MediaWiki API `titles=…`（`missing` 即缺）；二次确认**直查页面**（API 不解析简繁重定向，会把 301 的「普济方」误判 missing） | — | — | 已验证；commons API 出口常 429，Retry-After 退避 |
| 内閣文庫 www.digital.archives.go.jp/file/<id> | **状态码有效，仅 curl**：200＝存在（≈100-160KB），404/431B＝不存在；headless 浏览器对真假都 403（CloudFront），不能用 | file/1069435 → 200/98630B | file/9999999 → 404/431B | 已验证（Remy 5 对＋我复测）。**更正**：我先前说的「真假都 404」是测了库里唯一一条 `/das/meta/F1000000000000107735.html` 异形 url（545 条中仅此 1 条，curl 复测 404/431B，疑似本身即死链，待人核），不代表该站。 |

## judge() 接口（给 Everett 的 plancheck）
`judge(site, url, record_id=None, fetch=None) -> {'status': 'ok'|'dead'|'unknown', 'reason', 'evidence': {...}}`
- `site` ∈ nlc｜ndl｜npm｜shidianguji｜kokusho｜waseda（可传 None，按 url 域名自动识别）；`fetch(url)->(code|None, final_url, body_text)` 由调用方注入，**调用方负责同 host ≥2 秒与 UA**；npm 的 fetch 须带持久 cookie。
- `dead` 只表示"单次判据命中"，调用方要隔开时间二次确认；429／403／超时／连接重置一律 `unknown`。识典／国書恒 `unknown`（见上）。
- 本函数不联网，纯判定＋拼 ndl API url；单测覆盖。

## 对旧结论的影响
体检结论 §五「抽样 200 条无确认死链」中 nlc／ndl／kokusho／npm 的"200"不构成可达证据；已作废，需用本判据重跑（见 GUJI-335）。

## 对照样例 tsv
各站 ≥5 对的真假样例（含页面特征）由 Remy 落 `计划/判据对照/<站>.tsv`；格式见 GUJI-335。
