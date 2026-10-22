# wikisource 602 死链处置方案（Silas，草案，不动正式库）

输入：Reid `死链表.tsv`（602，全为「API missing」二次确认）。离线预分见 `死链-离线预分-Silas.tsv`（不调 API）。

## 一、离线预分（602）
| 类 | 条数 | 做法 |
|---|---|---|
| A redlink | 6 | URL 本身是 `action=edit&redlink=1`，页面从未存在 → **摘除该 wikisource 资源**（弔漢武帝文并序、弔道殣文并序、弔樂生文并序(栁州本作毅)、晁錯論_(蘇軾)、弔萇弘文、弔夷齊文） |
| D 简体题名 | 118 | 如 叠山集、小学绀珠、事类赋：zh.wikisource 以繁体立题，**拟改挂繁体 URL**（OpenCC s2t 先出候选，须 API 验存在） |
| B IDS 造字占位 `{艸諼}` 类 | 14 | 库内 URL 用 IDS 描述字，wiki 正名多为 Unicode 造字或异体，须 API/人读定正名 |
| C 括注消歧 | 12 | 如 勉齋遺稿_(鄭滿)、靈{艸諼}閣集_(版本)：试无括注主页／wiki 实际消歧名 |
| F 繁体普通题名 | 452 | 简繁无差，多半 wiki 无此页或页名异（异体字、副题、卷次）；需 API 候选（opensearch） |

## 二、新 URL 候选与判据（放行后，用 `scripts/ws_resolve_Silas.py` 结果）
候选来源：①s2t/t2s 变体页存在（redirects=1 取终点）；②opensearch 前 8。
**采纳为改挂新 URL 的判据（缺一不可）：**
1. 候选页存在且非消歧／非重定向到无关页；
2. 候选标题 = 原题名经 OpenCC 简繁归一后全等，或仅差括注（作者／版本）且括注与本 Work 著者／版本一致；
3. 页面首段（action=parse 取 extract）含本 Work 著者名或书名，或所属 Index 页著者吻合。
不满足 3 的只算「候选待人读」，不自动改。
**摘除：** 候选为空，且 F 类题名在 wikisource 全站搜索（srsearch）无同名同著者页 → 摘除该资源（保留其余资源；若该 Work 仅此一条资源，Work 不受影响）。

## 三、抽检（≥100）
- 改挂新 URL：按类分层随机抽 ≥60（D 40／B+C 20），用 API 打开新 URL 核首段与著者；
- 摘除：随机抽 ≥40（含全部 A 6 条＋F 类 34），隔时间再用 srsearch 复核确无页；
- 任一层错误率 >1% 即整层回查。

## 四、补丁形态
独立于追加批：修改既有 Work 的 `resources[]`（wikisource 条）：改 `url`（保 id、组名）或摘除；revision patch/minor 按口径，走 draft 库 PR → Sylvie 复放 → §五裁定后才入正式库。草稿库方案先行，不动正式库。

## 状态
API 解析被出口 429 限流，Reid 会话放行待用户；我会话后台带退避继续跑（`scripts/ws_resolve.jsonl`），结果到后按 §二 分类并补抽检结果。
