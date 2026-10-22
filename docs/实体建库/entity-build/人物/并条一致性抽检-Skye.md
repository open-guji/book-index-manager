# 并条一致性抽检（Skye，只读）

- 抽检对象：book-index origin/main 全部墓碑（`merged_into` 非空）共 202 条，即 #339 起异写批与 variant 批的墓碑，也含更早 D4 清账留下的墓碑；全量而非抽样，满足 ≥60 条。
- 五处核对：① 墓碑→survivor 存在且非墓碑；② survivor 的 `merged_in` 反指墓碑；③ `index/entities` 中墓碑与 survivor 均有索引项；④ `Work/`、`Book/` 下 `authors[].entity_id` 不指向墓碑；⑤ 反向：survivor 的 `merged_in` 每项对应一个存在的墓碑且指回。`merge_history` 只读其存在，未逐条比对文字。
- 结果：墓碑 202 条中，①③④ 全部一致；② 有 1 例不一致；⑤ 有 324 个唯一墓碑 id（共 325 条 `merged_in` 项）在 Entity 与 index 中均无文件，属悬空。

## 一、不一致清单

### 1. 单向不一致（墓碑指向 survivor，但 survivor 的 merged_in 缺此项）

| 墓碑 id | 名 | survivor id | 说明 |
|---|---|---|---|
| hixhd2h9blyf | 成無巳 | hixhd2h9biza（成無己） | 2026-09-06 qa-sweep 改 authors[0] 时未补 merged_in；Work 中 authors 已指 survivor，无 entity_id 指墓碑 |

### 2. 悬空 merged_in（survivor 的 merged_in 指向的墓碑文件不存在）

共 325 项、324 个唯一 id。按批次：D4-Entity清账 共 321 项，P4b 共 4 项。Work/Book 的 `entity_id` 字段**无一指向这些 id**；仅 22 个 Work 文件的正文或说明文字中提到，属历史记录，不影响引用。

| 悬空 id | 名 | survivor id | by | at | rule |
|---|---|---|---|---|---|
| hixhjtdb4hdu | 太宰長史庾蒨 | hixhd2h9bq8z | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhindjkrnm | 宋齊丘 | hixhd2h9bq2a | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhgyrw4vtw | 徐允禄 | hixhd2h9bqkm | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixhd2h9bj4o | 張廕桓 | hixhd2h9bqhm | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjtdmo9hc | 汝南太守應碩 | hixhd2h9bqpb | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhjtdmzi0x | 御史中丞郝默 | hixhindwoqgx | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhgyrw4ycd | 黄孔昭 | hixhd2h9bibh | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yd6 | 黄正憲 | hixhd2h9biqb | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhjhapnym9 | 闞駰 | hixhd2h9biig | D4-Entity清账 | 2026-10-08 | keeper 取 A：兩方皆無 cbdb、朝代相容（北涼入北魏），A 帶 07-26 併條鏈與已核朝代；B 著作數多但只 |
| hixhjtdczwn4 | 索綏 | hixhd2h9bix9 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1ja | 道藏 | hixhd2h9bim9 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhiif2yfid | 張昇 | hixhd2h9bi6t | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4yel | 黄雲 | hixhd2h9bi6z | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhiigwi9kw | 張琦 | hixhd2h9bi6y | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bl5l | 魯世逹 | hixhd2h9bitk | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1fz | 方囘 | hixhd2h9bini | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bmb0 | 應詹 | hixhd2h9bigv | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bn5w | 顧瑛 | hixhd2h9bi0k | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9blsx | 甄鸞 | hixhd2h9bizz | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bsk3 | 祖沖之 | hixhd2h9bizy | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4w6n | 李仲畧 | hixhd2h9biyp | D4-Entity清账 | 2026-09-26 | D4-三档BC39条-空壳并入正主 |
| hixho5puw1gg | 李仲畧 | hixhd2h9biyp | D4-Entity清账 | 2026-09-26 | D4-链式纠正-stale单向边并入真实作者 |
| hixhgyrw4x1h | 秦畧 | hixhd2h9biyu | D4-Entity清账 | 2026-09-26 | D4-三档BC39条-空壳并入正主 |
| hixho5puw1i4 | 秦畧 | hixhd2h9biyu | D4-Entity清账 | 2026-09-26 | D4-链式纠正-stale单向边并入真实作者 |
| hixhiifwaqkj | 李琪 | hixhd2h9bi4d | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhjh40dipu | 褚淵 | hixhiify65tt | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bv13 | 曾景修 | hixhgyrw4w39 | D4-Entity清账 | 2026-10-08 | C 判准（目录经理 10-07）：同名＋无作品方无 cbdb 或同 cbdb＋朝代相容＋无冲突字段 |
| hixho5puw1g7 | 曾于拱 | hixhgyrw4w32 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1gb | 朱士稚 | hixhgyrw4w3y | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1g9 | 曾翬 | hixhgyrw4w3d | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1gn | 李恒 | hixhgyrw4w89 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ha | 沈孟 | hixhgyrw4wm4 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4wkh | 汪昌朝 | hixhgyrw4wkg | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixhd2h9bv4x | 禮部太常寺 | hixi1ubqbwv6 | D4-Entity清账 | 2026-10-07 | overview#464 方案 B（S 6045342156） |
| hixho5puw1h3 | 楊豳 | hixhgyrw4wh3 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1hh | 湯紹思 | hixhgyrw4wpn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1h9 | 沈之 | hixhgyrw4wlm | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1h8 | 汪顯 | hixhgyrw4wlf | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1gw | 梁應 | hixhgyrw4weh | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1gk | 李希 | hixhgyrw4w7t | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1g3 | 施弘 | hixhgyrw4w0y | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1i0 | 盛鳴 | hixhgyrw4wzn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhindjkrnn | 王思 | hixhgyrw4wu8 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bs7m | 王循吉 | hixhgyrw4wu0 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bufm | 隂秉衡 | hixhgyrw4xxa | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1j2 | 譚允 | hixhgyrw4xjw | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1j1 | 謝紹 | hixhgyrw4xjn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ii | 萬夀 | hixhgyrw4x9f | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1i8 | 程用 | hixhgyrw4x2j | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1i7 | 程慶 | hixhgyrw4x26 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1jf | 錢潤 | hixhgyrw4xvy | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ix | 許大 | hixhgyrw4xhn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1iv | 蘇宇 | hixhgyrw4xfl | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1it | 薛承 | hixhgyrw4xf0 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1jb | 郭茂 | hixhgyrw4xpy | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1j8 | 車清 | hixhgyrw4xnl | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ie | 胡用 | hixhgyrw4x7c | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1i2 | 祁班孫 | hixhgyrw4x0v | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1jp | 陳擇 | hixhgyrw4xzk | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1je | 金廷韶 | hixhgyrw4xu0 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ij | 葉東 | hixhgyrw4xab | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ik | 葉聯 | hixhgyrw4xav | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1iq | 蔣仙 | hixhgyrw4xdj | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1is | 蔣敬 | hixhgyrw4xdt | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1i6 | 程啟充 | hixhgyrw4x1w | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1i5 | 程全 | hixhgyrw4x1u | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhiifhbchv | 梁震 | hixhindj9j49 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bv8f | 黃休復 | hixhd2h9bm9h | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhineo5m9s | 盧文度 | hixhinblnm6d | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bv77 | 劉實 | hixhd2h9bmt4 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buwi | 黄尊素 | hixhd2h9bmkv | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bl5f | 顔彪 | hixhd2h9bmv2 | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhd2h9bv7j | 孫汝聽 | hixhd2h9bmfj | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4y3m | 陸嘉頴 | hixhd2h9bmfp | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhjtdg4a2q | 楊元鳳 | hixhd2h9bmn9 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bv7h | 嚴用和 | hixhd2h9bmgu | D4-Entity清账 | 2026-10-02 | T64同人異條 |
| hixhgyrw4ye5 | 黄芹 | hixhd2h9bmec | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9btpa | 郝沖 | hixhd2h9bm04 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bojd | 陳羣 | hixhd2h9bmao | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhjtdbqyh2 | 右軍參軍孔璠 | hixhihtny9s0 | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhgyrw4xfw | 蘇鑑 | hixhd2h9bt8e | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4xna | 趙鳳翔 | hixhd2h9btm3 | D4-Entity清账 | 2026-09-26 | D4-三档BC39条-空壳并入正主 |
| hixho5puw1j7 | 趙鳳翔 | hixhd2h9btm3 | D4-Entity清账 | 2026-09-26 | D4-链式纠正-stale单向边并入真实作者 |
| hixhindjkrno | 袁准 | hixhd2h9bt9j | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bmfm | 郭勳 | hixhd2h9btpv | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhjf62wlq8 | 釋法通 | hixhd2h9btyz | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhgyrw4xs1 | 鄭景岫 | hixhd2h9btui | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhindj9j47 | 徐霖 | hixhd2h9bo3y | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhiigv9beo | 王安國 | hixhiifxjoqs | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4xhp | 許孚逺 | hixhd2h9bofq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9beks | 袁黃 | hixhd2h9bofd | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bljt | 京里先生 | hixhd2h9bop8 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjtdnlz41 | 建安太守丁纂 | hixhd2h9bon0 | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhgyrw4xd9 | 蔡立身 | hixhd2h9boee | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| 1jb8icg2rni11 | 晁冲之 | hixhd2h9bo4j | P4b | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| hixhjvgwqlts | 董勛 | hixhd2h9bkqj | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjeg82xvk | 沈不害 | hixhiigm8kqr | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bufo | 隂長生 | hixhd2h9bkq1 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bl86 | 叚弘 | hixhd2h9bk8l | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhgyrw4y4w | 隂秉暘 | hixhd2h9bkii | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhjtdkhloi | 巴西太守郤正 | hixhd2h9bkon | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhgyrw4w7d | 李士濓 | hixhd2h9bkvn | D4-Entity清账 | 2026-09-26 | D4-三档BC39条-空壳并入正主 |
| hixho5puw1gj | 李士濓 | hixhd2h9bkvn | D4-Entity清账 | 2026-09-26 | D4-链式纠正-stale单向边并入真实作者 |
| hixhgyrw4ybz | 黄元暉 | hixhd2h9bkv7 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1ih | 莊榖 | hixhd2h9bkv4 | D4-Entity清账 | 2026-09-26 | D4-stale單向邊并入真实作者 |
| hixhgyrw4ych | 黄履康 | hixhd2h9bkhg | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bmt5 | 謝嶠 | hixhd2h9bkcb | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhd2h9bkcm | 陰弘道 | hixhd2h9bkld | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bl68 | 袁折 | hixhd2h9bk7w | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhd2h9btxx | 釋慧皎 | hixhd2h9bkuv | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bmdo | 郭義恭 | hixhd2h9bkar | D4-Entity清账 | 2026-10-08 | C 判准（目录经理 10-07）：同名＋无作品方无 cbdb 或同 cbdb＋朝代相容＋无冲突字段 |
| hixhd2h9blb6 | 徐宣瑜 | hixhd2h9bkrv | D4-Entity清账 | 2026-10-08 | C 判准（目录经理 10-07）：同名＋无作品方无 cbdb 或同 cbdb＋朝代相容＋无冲突字段 |
| hixho5puw1ed | 劉浴 | hixhgyrw4v3a | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ep | 吳為 | hixhgyrw4v8b | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bub7 | 陳竒 | hixhd2h9bv8a | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bmfu | 馬令 | hixhd2h9bv8d | D4-Entity清账 | 2026-10-08 | M1 裁定（10-07）：keeper 取 B，朝代定宋 |
| hixho5puw1fv | 徐與 | hixhgyrw4vwh | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4vwu | 徐達 | hixhgyrw4vws | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1fw | 應棐 | hixhgyrw4vxr | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1f9 | 宋心 | hixhgyrw4vjq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4yft | 宋魯珍 | hixhd2h9bv27 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1ej | 史原 | hixhgyrw4v61 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bqju | 彭汝寔 | hixhgyrw4vt9 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1fj | 張恒 | hixhgyrw4voz | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1fb | 尹東郊 | hixhgyrw4vkx | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1f1 | 夏雲蛟 | hixhgyrw4vfq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1f0 | 夏錫 | hixhgyrw4vfo | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1fk | 張應武 | hixhgyrw4vp9 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1fh | 張士 | hixhgyrw4vnm | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1fg | 張名由 | hixhgyrw4vne | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhinc8r668 | 周祚 | hixhgyrw4vcq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1fc | 岑用賔 | hixhgyrw4vl9 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1f3 | 姚翔 | hixhgyrw4vgw | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1f2 | 姚光 | hixhgyrw4vgf | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ez | 嚴紹 | hixhgyrw4vey | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1fo | 張邦 | hixhgyrw4vsb | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhjtd8ml1f | 秦州刺史張輔 | hixhinc9ovsw | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhd2h9bmgs | 傅霖 | hixhd2h9bv76 | D4-Entity清账 | 2026-10-08 | M1 裁定（10-07）：keeper 取 B，朝代定宋 |
| hixho5puw1e6 | 劉世 | hixhgyrw4v0q | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1g1 | 方學 | hixhgyrw4vzz | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1g0 | 方夢 | hixhgyrw4vzu | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4vzv | 方夢龍 | hixhgyrw4vzu | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixho5puw1ft | 徐宗 | hixhgyrw4vuf | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4vue | 徐守綱 | hixhgyrw4vud | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixho5puw1et | 周世 | hixhgyrw4vat | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bgmw | 劉黃裳 | hixhgyrw4v4k | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1ey | 唐景 | hixhgyrw4vdq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bl2g | 韋安居 | hixhd2h9bhqp | D4-Entity清账 | 2026-10-04 | T66-name-fix |
| hixhiigmjtae | 張植 | hixhd2h9bh5g | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9brxs | 清 世宗 | hixhd2h9bhwk | D4-Entity清账 | 2026-09-26 | D4-名多空格 |
| hixhd2h9brxt | 清 高宗 | hixhd2h9bhwp | D4-Entity清账 | 2026-09-26 | D4-名多空格 |
| hixhjxs364n6 | 潘嶽 | hixhd2h9bhx7 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9buxf | 黄瓚 | hixhd2h9bhtw | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buvx | 黄仲昭 | hixhd2h9bhvs | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bdqi | 杜光庭 | hixhd2h9bhhb | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhiif2byf9 | 杜光庭 | hixhd2h9bhhb | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1jt | 陳鑒之 | hixhd2h9bhpj | D4-Entity清账 | 2026-09-26 | D4-stale單向邊并入真实作者 |
| hixhgyrw4ycx | 黄景昉 | hixhd2h9bhnv | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1g4 | 日用 | hixhd2h9bheo | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bnpz | 劉孝標 | hixhd2h9bhs1 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixho5puw1jz | 雷伯 | hixhd2h9bh0x | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4x82 | 艾儒畧 | hixhd2h9bhz6 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9biwy | 楊義 | hixhd2h9bhzy | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhgyrw4ye8 | 黄衷 | hixhd2h9bhrm | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4ydu | 黄異 | hixhd2h9bh4u | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yc1 | 黄公望 | hixhd2h9bh1q | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yci | 黄希憲 | hixhd2h9bf33 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhiifwx7np | 胡宿 | hixhd2h9bfbf | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4ybx | 黄傅 | hixhd2h9bfqx | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1hy | 白玉蟾 | hixhd2h9bf8z | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buvr | 黄一正 | hixhd2h9bf5i | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1jh | 鍾城 | hixhd2h9bfmt | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4yc0 | 黄元會 | hixhd2h9bf2b | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yc9 | 黄奐 | hixhd2h9bf2e | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yeh | 黄金 | hixhd2h9bft4 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4ye0 | 黄福 | hixhd2h9bfox | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1fe | 張佳允 | hixhd2h9bfv3 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4x0l | 石洞 | hixhd2h9bfn0 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1hg | 温純 | hixhd2h9bfn4 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9blp5 | 業觀 | hixhd2h9bfcb | D4-Entity清账 | 2026-10-07 | overview#409 F11／P4-patch-业观并秦观.jsonl（A 复核 46917d81） |
| hixhgyrw4ydg | 黄淮 | hixhd2h9bflm | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1gu | 柯潜 | hixhd2h9bfly | D4-Entity清账 | 2026-09-26 | D4-stale單向邊并入真实作者 |
| hixho5puw1e1 | 倪朴 | hixhd2h9bfeq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhii3ygykj | 杜牧 | hixhd2h9bfam | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhiif2byf6 | 趙鼎 | hixhd2h9bfda | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhgyrw4ydi | 黄溥 | hixhd2h9bf19 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1eb | 劉廸 | hixhd2h9bp3a | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bsxb | 荀世之 | hixhjtdbfpxf | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bq0t | 宋凌萬頃 | hixhd2h9bp0i | D4-Entity清账 | 2026-10-04 | T66-entity-dup |
| hixhi4q5zr46 | 劉和 | hixhd2h9bp1y | D4-Entity清账 | 2026-10-08 | 罕名同代同目（補宋書藝文志）；keeper 照 P4b 判准 |
| hixhd2h9bnqy | 王德信 | hixhd2h9bnq8 | D4-Entity清账 | 2026-10-02 | T64同人異條 |
| hixhd2h9bo09 | 孔頴達 | hixhd2h9bnqd | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bo08 | 孔頴逹 | hixhd2h9bnqd | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bhu6 | 顔之推 | hixhd2h9bn8p | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人-cbdb确证 |
| hixhgyrw4ydo | 黄瑜 | hixhd2h9bn29 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhjf69gl4w | 天監八年皇太子 | hixhd2h9bno2 | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhd2h9bqll | 徐嶽 | hixhd2h9bnkb | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhjeq3m8le | 徐岳 | hixhd2h9bnkb | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhgyrw4yc6 | 黄堅 | hixhd2h9bnhd | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buwh | 黄容 | hixhd2h9bnfg | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yc2 | 黄卿 | hixhd2h9bncy | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhiifji0au | 孟逹 | hixhd2h9bnel | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1ev | 周憲王 | hixhd2h9bns3 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4ydq | 黄璿 | hixhd2h9bn03 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhjf6a3280 | 簡文（拆分：簡文談疏歸此） | hixhd2h9bny4 | D4-Entity清账 | 2026-09-26 | D4-簡文晉梁二帝拆分 |
| hixhjtd8xtl0 | 簡文帝（簡文帝集+簡文談疏歸此） | hixhd2h9bny4 | D4-Entity清账 | 2026-09-26 | D4-簡文晉梁二帝拆分 |
| hixhd2h9buxy | 黄鐘 | hixhd2h9bnah | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhjtdouxaf | 殿中將軍傅綽 | hixhincabcwa | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhiiglxc76 | 陳鼎 | hixhd2h9bcuy | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixho5puw1g6 | 書林 | hixhd2h9bcrn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9blhz | 九仙苦 | hixhd2h9bljs | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhjtdo8g75 | 豫章太守王恪 | hixhincamlfk | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhd2h9bosg | 何晦 | hixhd2h9blps | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id（全平局取较早 id） |
| hixhjhtc5pfk | 祖暅之 | hixhd2h9blru | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjtd8ml1h | 鄱陽太守虞溥 | hixhd2h9bld2 | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixho5puw1jw | 陶澂 | hixhd2h9bg34 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bq5x | 崔實 | hixhd2h9bgby | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bkrg | 習 齒 | hixhd2h9bgbr | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bks0 | 習齒 | hixhd2h9bgbr | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| 1jb8icg2h1fk8 | 陳巖肖 | hixhd2h9bg8s | P4b | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| hixhgyrw4ydh | 黄清老 | hixhd2h9bgx3 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buwx | 黄景昌 | hixhd2h9bgxb | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4ybt | 黄以謙 | hixhd2h9bgxr | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bjue | 龐迪我 | hixhd2h9bgj7 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1i3 | 祖心 | hixhd2h9bgol | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4yen | 黄鳳翔 | hixhd2h9bgkg | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1ee | 劉醇 | hixhd2h9bgf6 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1j3 | 趙古則 | hixhd2h9bgff | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1j5 | 趙簡王 | hixhd2h9bgne | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bu8b | 陳嶽 | hixhd2h9bgcd | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixho5puw1eu | 周定王 | hixhd2h9bgls | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buxk | 黄積慶 | hixhd2h9bge8 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1ib | 竹林嬾仙 | hixhd2h9bgsn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4w1c | 明太祖 | hixhd2h9bgd5 | D4-Entity清账 | 2026-09-26 | D4-三档BC39条-空壳并入正主 |
| hixhd2h9buvw | 黃仲元 | hixhd2h9be3d | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4yec | 黄訓 | hixhd2h9bebj | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhii40cdts | 袁袠 | hixhd2h9beqn | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixho5puw1id | 聞人銓 | hixhd2h9bejx | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buxh | 黄省曾 | hixhd2h9bemm | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bux6 | 黄淳耀 | hixhd2h9bem6 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1i9 | 章品 | hixhd2h9be2c | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buxt | 黄諫 | hixhd2h9be68 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1go | 李文鳯 | hixhd2h9behn | D4-Entity清账 | 2026-09-26 | D4-stale單向邊并入真实作者 |
| hixhgyrw4ycb | 黄姬水 | hixhd2h9befb | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1jy | 陽明先生 | hixhd2h9benx | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4yd8 | 黄汝亨 | hixhd2h9becm | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人-cbdb确证 |
| hixhgyrw4x3r | 章頴 | hixhd2h9bee9 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhii3xuhhd | 方鵬 | hixhd2h9beev | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4xt2 | 釋伯臺 | hixhd2h9be76 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buvu | 黄乾行 | hixhd2h9be0x | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buvy | 黄佐 | hixhd2h9be0e | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4y6v | 顧亮 | hixhd2h9berc | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixho5puw1hd | 浚川 | hixhd2h9ber7 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhjtczvxtx | 衞隆景 | hixhjxrqdede | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhindjkrnk | 王回 | hixhd2h9bs58 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjhtty8e9 | 王堪 | hixhd2h9bs5j | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bt9c | 衞協 | hixhjtcx2sxs | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhjtdmd0xu | 御史中丞熊遠 | hixhd2h9bs2a | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhd2h9bi22 | 公孫崇 | hixhjhapz75u | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjtdo8g76 | 零陵太守陶混 | hixhindwzz0i | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhd2h9bnfm | 鄭冲 | hixhjvgtazuo | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1kh | 鮑光 | hixhgyrw4ybg | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1kg | 魏方烐 | hixhgyrw4yb1 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1kb | 馬汝 | hixhgyrw4y8h | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1ka | 馬時 | hixhgyrw4y8c | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bfv5 | 馮皋謨 | hixhgyrw4y9i | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人-cbdb确证 |
| hixho5puw1jv | 陶寅 | hixhgyrw4y2z | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9beu7 | 黃承昊 | hixhgyrw4ycp | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| 1jb8icg2jjbwk | 黃媛貞 | hixhgyrw4ycc | P4b | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| hixhd2h9biae | 黃居中 | hixhgyrw4ycg | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yc4 | 黄哲 | hixhgyrw4yg5 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bha0 | 黃鍾 | hixhgyrw4yej | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| 1jb8icg2dx24k | 黃輝 | hixhgyrw4yeg | P4b | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| hixho5puw1k9 | 顧玘 | hixhgyrw4y7j | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixho5puw1k8 | 顧文昱 | hixhgyrw4y7a | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bgeb | 黃汝良 | hixhgyrw4yda | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bh4s | 黃河清 | hixhgyrw4ydd | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1js | 陳舜仁 | hixhgyrw4y1j | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9be7q | 黃光昇 | hixhd2h9buw2 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1dv | 何益 | hixhgyrw4uwd | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9beho | 黃洪憲 | hixhd2h9bux5 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bgq7 | 黃綰 | hixhd2h9buxm | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bn66 | 黃焯 | hixhd2h9buxe | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bhks | 黃淵 | hixhd2h9bux7 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9beee | 黃潤玉 | hixhd2h9buxa | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yea | 黄裳 | hixhd2h9buxr | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1fx | 文貞 | hixhh6magum8 | D4-Entity清账 | 2026-10-08 | C 判准（目录经理 10-07）：同名＋无作品方无 cbdb 或同 cbdb＋朝代相容＋无冲突字段 |
| hixhindibthc | 餘安行 | hixhd2h9buks | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9buw0 | 黄俊 | hixhd2h9busg | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1e2 | 倪立 | hixhgyrw4uz7 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bi5n | 黃鼎 | hixhd2h9buy6 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1e0 | 侯瀞 | hixhgyrw4uy4 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4yd9 | 黄汝和 | hixhd2h9buu4 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhgyrw4yd5 | 黄樞 | hixhd2h9buu1 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bu1i | 金寔 | hixhd2h9bu1j | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2j3sw7e | 鄭玄 | hixhd2f8wajv | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhii0iuzgk | 蔡邕 | hixhd2f8wam9 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9bm6r | 胡天游 | hixhd2f8wao1 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhd2h9bkco | 裴松之 | hixhd2f8walw | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhd2h9blvm | 簡文市 | hixhd2f8wal1 | D4-Entity清账 | 2026-09-26 | D4-幽灵entity并入正主 |
| hixhjf6a3280 | 簡文（拆分：莊子義歸此） | hixhd2f8wal1 | D4-Entity清账 | 2026-09-26 | D4-簡文晉梁二帝拆分 |
| hixhd2h9buwe | 黄宗炎 | hixhd2f8wagw | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9brbw | 杜元頴 | hixhd2h9brbv | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhihto9ibm | 李建勛 | hixhd2h9br50 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhiifwaqki | 林光 | hixhd2h9brdi | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4w6m | 李仲僎 | hixhd2h9br1t | D4-Entity清账 | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixhjtd6r5s0 | 衞恒 | hixhjvgw44qq | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjtdphedc | 廬江太守殷遵 | hixhinenudq8 | D4-Entity清账 | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhd2h9bkcl | 元行沖 | hixhd2h9bdq9 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1fn | 張江陵 | hixhd2h9bdxx | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buxx | 黄鎮成 | hixhd2h9bdxg | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1gs | 東阜老人 | hixhd2h9bdxe | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9buxg | 黄百家 | hixhd2h9bd2e | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1he | 涇野 | hixhd2h9bdtm | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhgyrw4yc3 | 黄周星 | hixhd2h9bdof | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bt9g | 袁 通 | hixhd2h9bdo0 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixho5puw1eg | 千頃堂 | hixhd2h9bdor | D4-Entity清账 | 2026-09-26 | D4-stale單向邊并入真实作者 |
| hixhgyrw4ydm | 黄琮 | hixhd2h9bdlv | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buxu | 黄道周 | hixhd2h9bdst | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9buxc | 黄澤 | hixhd2h9bds1 | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bod9 | 范世勳 | hixhd2h9bd7c | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id |
| hixhgyrw4ycs | 黄文煥 | hixhd2h9bdzd | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixho5puw1jg | 錢秉鐙 | hixhd2h9bdaj | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |
| hixhd2h9bl53 | 方寔孫 | hixhd2h9bdrq | D4-Entity清账 | 2026-09-26 | D4b-异体字显然同人 |
| hixhd2h9bgew | 孫予 | hixho5puw1f6 | D4-Entity清账 | 2026-10-08 | keeper: cbdb>朝代生卒>作品数>较早id |

## 二、判断与建议（交 Mirren 定）

- 悬空项看似是 D4 清账时墓碑文件被删而 merged_in 留存，未另建墓碑。无活引用，但与「被并方留墓碑」的规矩不符。是否补墓碑文件、或仅删 merged_in 项，请 Mirren 定；我未改任何数据。
- 成無巳 一例：可补 survivor 的 merged_in 一项。

## 三、抽样方法

全量读取 Entity（37292 文件）与 index/entities（37292 项），只读，来自 origin/main 的 git archive 快照。脚本未写入仓库。
