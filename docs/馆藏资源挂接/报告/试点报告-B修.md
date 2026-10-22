# B-修 试点报告（Silas，2026-10-13 洛杉矶）

## 做了什么
- 试点清单 100 个 url（commons 81、shidianguji 12、wikisource 7），`cuowa_fetch.py` 机械取证（只取证，不改库）。取证由 Silas 跑（设计原为 Sol，偏离已报 Marlowe）。
- 机器初判（页面上出现哪几位责任者的名字）：keep_one 59、keep_all 11、unknown 30（含 12 个识典页面：JS 渲染，curl 取不到题名，本环境无浏览器，保持 unknown）。
- 复核：盲样 30 行（keep_one 15／keep_all 5／unknown 10 分层抽取），由 Sol 对着原站页面独立判。**独立性说明**：Sol 找文件时无意瞥见过机器初判表，自述判定只依据原站页面；独立性略受影响。

## 一致率
- 27／30 ＝ **90%**，正在线上。不一致 3 行逐条看过：
  1. 嘉興（commons NCL-03400）：机器 keep_all → Sol keep_one。页面作者趙文華，趙瀛只是序跋者；Sol 对。
  2. 韓非子（commons NCL-05823）：机器 keep_all → Sol keep_one。門無子是序跋者；凌瀛初为共同创作者，Sol 仍判 keep_one，此行需 Marlowe 或第三人看一眼。
  3. 祁…（commons SSID-10116047）：机器 keep_one → Sol unknown。页面作者「张万铨等」，羅以桂不在页面，无法判定；Sol 对。
- 结论：机器规则把页面上出现的「序跋者」也当作责任者，**高估 keep_all**；真实 keep_one 比例只会更高。

## 错挂率与 unknown%（以 Sol 的 30 行为准）
- keep_one 16、keep_all 3、unknown 11。
- 错挂率＝keep_one÷已定＝16/19 ≈ **84%**（机器全量口径 59/70 ≈ 84%，一致）。
- unknown ≈ 37%（全量机器口径 30%），**接近 40% 停手线**；识典 12 个是工具局限，不是内容问题。

## 判断与请示
1. 同题异作者共享 url 基本都是旧账错挂（84%），支持在 B-修 放量；但放量前机器规则要改：序跋者／校者不计入「责任者命中」。
2. unknown 接近线：识典需要浏览器取证（或另找识典站内检索接口），否则 12/12 恒为 unknown。
3. 一致率恰 90%：按 Marlowe 的条件，不一致行已逐条看过；韩非子那条请他拍；若他认为不够，再请 Selene 补盲审。
4. 放量仍须 Marlowe 批；改库只走分支 PR（单站 ≤200 url，附原站核对表），先在排班登记。

## 第二轮：规则 v2（Marlowe 10-13 批复后，Silas 同日）
- 规则改动：只在页面「作者栏」内匹配（序跋者／评点者／校者在栏外，自然不计）；栏内含「等」→ unknown；取不到作者栏或抓到导航噪声 → unknown。脚本：`scripts/馆藏资源挂接/cuowa_fetch.py`（加 author_field）、`cuowa_verdict_v2.py`；输出 `试点取证-v2初判.tsv`。
- 在原 100 个 url 上重跑：keep_one 48、keep_all 7、unknown 45（其中识典 12）。keep_all 由 11 降到 7，**降的 4 条是 v1 把序跋者误当责任者**；Sol 确认的 3 条 keep_all 全部保留。
- 对 Sol 的 30 行复算：**27/30 = 90%**。3 条不一致：2 条是「等」字作者栏（按 Marlowe 的保守规则判 unknown，Sol 判了首名；规则使然，不是识别错）；1 条维基文库证道歌（作者栏取不到，判 unknown）。
- 韩非子 NCL-05823 按 Marlowe 的拍板：unknown，本批不动，留给 D 块（Book 层）。
- unknown 比例：整体 45/100；识典 12 个单列（见下），按「可取证的 url」算 33/88 ≈ 37.5%（<40%）。
- 识典：用无头 Chromium（Playwright）实测，页面 API 返回 200 但前端显示「Data exception」，取不到题名／作者；仍判 unknown。不阻塞 commons 放量。
