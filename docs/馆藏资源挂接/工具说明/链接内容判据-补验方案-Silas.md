# 链接「内容判据」补验方案（只评估，不动库）

作者：Silas｜2026-10-15（洛杉矶）｜依据：Reid 在 GUJI-335 的发现（评论 11569），Milo 要求的 ①体检结论更正 ②K10 改口径 ③补验评估。①②已改（体检结论 §五 更正注记、口径 K10 更正）。

## 一、哪些已写入数据可能受影响
「受影响」＝写入时把「HTTP 200」当作链接有效的依据，且链接站点为 nlc／ndl／kokusho／识典／npm。
| 批次（已合并 book-index main） | 条数 | 链接依据 | 风险判断 |
|---|---|---|---|
| #583 补挂确定档影像（#263）：nlc 54／kokusho 28／ndl 371 | 453 | 条目 id 取自站点自身元数据导出＋人核；PR 描述附的链接抽检按 K10 原为 150/150 HTTP 200 | **抽检证据作废；条目本身来自站点目录，真实性风险低但未经内容验证** |
| #583 补挂 ndl 非全网公开影像（#265）：147 条 | 147 | 同上，且「送信／館內限定」，API 能给出公开状态 | 同上，另可借 API 复核限定标注 |
| K2 Book 层 resources：47 条（nlc 1／kokusho 13／ndl 33） | 47 | 人工判挂，逐条看过站点页面 | 低 |
| 版本批1（#485）：nlc 1／kokusho 1 | 2 | kokusho 用 biblioDetail API 取回记录（**内容证据**）；nlc fid 页面书志未核（已在 ai_note 注明待核） | kokusho 无；nlc 1 条待补验 |
| 版本批2a（#487 及其后续）：kokusho 25／ndl 2 | 27 | 全部用 biblioDetail／NDL item API 取回记录（**内容证据**），不是状态码 | 无 |
| 库内更早的存量（E1 之前挂接、全库 Work 的 nlc／ndl／kokusho 资源） | 约 数万级（未统计） | 当时的体检用状态码 | 不在本方案范围，另议（见 §四） |

对 Marcus 的回复（已发）：我的批次（版本批1／2a）链接依据均为站点 API 回取的记录内容，**无受状态码误导的已合并数据**；#583 与 K2 批次不是我写入，风险评估如上。

## 二、可用的判据（我已用真／假对照实测，限速 ≥2 秒）
| 站点 | 判据 | 真 | 假 |
|---|---|---|---|
| ndl | `https://dl.ndl.go.jp/api/item/search/info:ndljp/pid/<pid>` | 200，JSON 含 `item.pid` | **404** `{"success":false,"message":"指定されたPIDに対応するデータが存在しません。"}` |
| kokusho | `https://kokusho.nijl.ac.jp/api/biblioDetail/<bid>` | 200，JSON 含 `bid` 且与请求相同 | **404**（HTML 错误页） |
| nlc | 页面大小＋标记（Reid：真 ≈31KB／假 ≈0.8KB）；API 不可用 | 待 Reid 判据 | 待 Reid 判据 |
| 识典／npm | 以 Reid 判据为准（npm 需会话 cookie＋「沒有查詢結果」） | — | — |
注：ndl 的 API 还给出出版年、書肆、册数等，可顺带核 `metadata.edition` 是否与目录吻合；kokusho 的 API 给 刊／写 与 collection。

## 三、补验方案（只读，成本）
1. **第一轮（优先，约 1 小时）**：#583 的 ndl 371＋147、kokusho 28，加 K2 的 ndl 33／kokusho 13，加批1 的 nlc 1：共约 593 个 URL。ndl／kokusho 走 API，2 秒一条，ndl 约 520 条≈17 分钟，kokusho 约 42 条≈1.5 分钟。输出 tsv：`站点,id,URL,API状态,pid/bid一致,出版信息是否与metadata.edition一致`。
2. **第二轮（等 Reid 的 nlc 判据）**：#583 的 nlc 54＋K2 nlc 1＋批1 nlc 1，共约 56 条，按页面大小＋标记判。
3. **验收口径**：全部「API 404／不一致」＝缺失，列清单交 Marlowe 决定摘除／改挂（**不由我动库**）；API 无法判定的站点标「需人眼抽样」，抽 ≥30 条人看。
4. 工具复用：Reid 的判据库出来后，我的脚本只做「读库取资源 → 调判据 → 出 tsv」，不另写站点逻辑，避免两套判据分叉。

## 四、存量全库（建议另立任务，不在本次评估内）
库内所有 nlc／ndl／kokusho 资源条数大（数万），逐条 API 以 2 秒/条需数十小时，建议：先按 Reid 的 10% 抽样（用新判据）估计死链率；若死链率 <0.5%，只抽样监控；若更高，再分站点全量。ndl／kokusho 有公开 API，可在 Reid 限速规则内夜间跑。

## 五、请 Milo 拍板
①先做第一轮（只读 ~593 条）可否，现在开始；②第二轮 nlc 是否等 Reid 判据；③存量全库是否按 §四另立。
