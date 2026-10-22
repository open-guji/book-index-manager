# R1-E6 小设计：把「链接内容判据」接进引擎 plancheck（Everett，2026-10-15 洛杉矶）

**状态**：设计稿，待 Reid 判据库（LA 03:30 前）后实现；不抢 Reid 的站点判据逻辑，本块只做“接口＋接线＋验收”。需求来自 Milo：任何 write_plan 自动对 nlc／ndl／kokusho／早稲田等站做**内容判据**校验（不是状态码），不过判据则 plancheck 报错。

## 1 背景
HTTP 状态码对 nlc／ndl／kokusho／识典／npm 无判别力（假 url 也 200，见 Reid GUJI-335 评论 11569、口径 K10 更正）。现有 `plancheck.py` 只校验 resources[] 形状、每 Work≤3、linked_draft 一致，**不看链接真假**。早稲田实测：假 id `he13_99999` → 404 且页内无 `archive.wul.waseda.ac.jp` 入口；真 id → 200 且有入口（可区分，纳入 waseda 判据）。

## 2 接口（与 Reid 判据库的契约）
Reid 库对每站提供一个纯函数（我只依赖这一个形状，站点细节归他）：
```
judge(site: str, url: str, record_id: str, fetch) -> Verdict
Verdict = {status: 'ok' | 'dead' | 'unknown', reason: str, evidence: {...}}   # evidence 含状态码、字节数、命中标记、API 字段
```
- `fetch(url, headers)` 由接线层注入（限速、缓存、离线重放都在这层，判据本身不联网），便于单测。
- 若 Reid 库形状不同，我在 `match_engine/linkcheck.py` 里写一层适配，不要求他改。
- 缺站：Reid 库没有的站点，回退 Silas 方案 §二（ndl `api/item/search/info:ndljp/pid/<pid>`；kokusho `api/biblioDetail/<bid>`，bid 与请求一致）；仍没有的标 `unknown`（需人眼抽样），**不写“200”**。

## 3 接线（plancheck 新增，默认开启）
`plancheck.py --source S --works-root R --dir D [--verify-content] [--sample N|--all] [--cache FILE] [--offline] [--min-interval 2.0]`
1. 取 `write_plan.jsonl`（及 `linked_draft.jsonl`）每项的 `resource.url`＋站点＋记录号（metadata 里的 *_fid／*_bid／ndl_record／waseda_id）。
2. 站点∈已有判据 → 调 `judge`；`dead` → 记 `item_errors['CONTENT_FAIL']`，`unknown` → 记 `warnings['NEED_HUMAN']`；`ok` 通过。
3. 抽样：默认 `--sample 150`（K10 要求的 150，种子固定写入输出头）；`--all` 全量；每站按各自 host 限速（复用 `link_audit.HostLimiter`，间隔 ≥2.0s，不同 host 并行）。
4. 输出 `content_check.tsv`（站点,记录号,URL,verdict,reason,字节/字段证据）与 plancheck 汇总 JSON 里的 `content`: {checked, ok, dead, unknown, by_site}。
5. **退出码**：有任何 `dead` → 非零（CI／PR 描述里的“内容判据通过”由它机器可证）；`unknown` 不拦但必须在汇总里列出，且 PR 描述需写“需人眼抽样 ≥30 条”。
6. `--cache FILE`：判据结果缓存（键＝站点＋URL＋判据版本），重复跑不重复打站；`--offline` 只读缓存（单测与 CI 用）。

## 4 验收标准与测试
| 项 | 验收 | 方法 |
|---|---|---|
| 零误报 | 已写入 453 项（#583：nlc 54／kokusho 28／ndl 371）全部 `ok` 或有记录的 `unknown`，**无 `dead`** | 从 book-index 取这 453 个 resources 项构造 write_plan 形，跑 `--all`（约 1 小时，限速 2s） |
| 拦假 | Reid 的假 url 样例 **100% 判 `dead`** | 用 Reid 给的真／假对照样例做 fixtures（离线缓存），断言逐条 |
| 单测 | 每站 ≥6 条（真 3／假 3），含：404、200 假页（小字节）、API 字段不一致、限流 429（判 unknown 不判 dead）、缓存命中、离线模式 | `tests/test_linkcheck.py`；全部不联网（fixtures） |
| 回归 | 现有 232 测试＋plancheck 对四源的输出不变（不加 `--verify-content` 时） | 全套 pytest＋四源 plancheck 对比 |
| 限速 | 实际相邻间隔 ≥2.0s，出“请求间隔自检”一行 | 沿用 link_audit 的自检 |

## 5 输入／产出
输入：Reid 判据库（LA 03:30 前）、他的真／假样例、Silas 的 ndl／kokusho API 判据（已实测）、`link_audit.py`（限速与分类）。
产出：`match_engine/linkcheck.py`（适配＋注入式 fetch＋缓存）、`plancheck.py` 接线、`tests/test_linkcheck.py`、`content_check.tsv` 样例、453 项零误报报告。
预估：判据库到手后 4 小时（接线 2＋测试 1＋453 项实跑 1，实跑为限速后台）。

## 6 要 Milo／Reid 定的
1. Reid 判据库的函数形状（上面 §2 的 Verdict 是否可接受，不接受请给签名）。
2. nlc 的“页面大小＋标记”阈值由 Reid 定，我只引用；若他的标记依赖会话 cookie，请在判据里封装好。
3. `unknown` 是否允许进写入 PR：我的建议“允许但必须人眼抽样 ≥30 条并在 PR 描述写明”。
4. 453 项实跑放在判据库到手后立即做，还是等 Silas 的 593 条补验第一轮出来后对读（避免重复打 ndl／kokusho）：建议**共用同一份缓存**，谁先跑谁落缓存。
