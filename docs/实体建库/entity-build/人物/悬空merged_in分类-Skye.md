# 悬空 merged_in 分类（Skye，只读）

- 对象：book-index origin/main（book-index origin/main de6c0b0892，2026-10-14 取数）中，survivor 的 `merged_in` 指向、但 Entity 与 index 中**均无文件**的记录：325 条，324 个唯一墓碑 id（hixhjf6a3280 在两个 keeper 下各一条）。
- 只读，未改任何数据；未提交脚本。

## 一、按来源计数

| 来源（by） | 条数 | 唯一 id | 备注 |
|---|---|---|---|
| D4-Entity清账 | 321 | 320 | 2026-09-26 起 132 条，2026-10-02～10-08 余 189 条 |
| P4b | 4 | 4 | 全部 2026-10-07 |

D4 清账下按 `rule` 细分（前六）：

| rule 前缀 | 条数 |
|---|---|
| keeper: cbdb>朝代生卒>作品数>较早id | 99 |
| D4b-异体字显然同人 | 89 |
| keeper: cbdb>朝代与CBDB相容/生卒>作品数>较早id | 35 |
| keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） | 33 |
| D4-官职黏名后entity重出并入正主 | 11 |
| D4-幽灵entity并入正主 | 10 |

## 二、每类样例（各 5 条）

### D4-Entity清账

| 悬空 id | 名 | keeper（survivor） | 时间 | rule |
|---|---|---|---|---|
| hixhjtdb4hdu | 太宰長史庾蒨 | hixhd2h9bq8z | 2026-09-26 | D4-官职黏名后entity重出并入正主 |
| hixhindjkrnm | 宋齊丘 | hixhd2h9bq2a | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhgyrw4vtw | 徐允禄 | hixhd2h9bqkm | 2026-10-08 | 罕名同代同目（千頃堂書目）；keeper 照 P4b 判准 |
| hixhd2h9bj4o | 張廕桓 | hixhd2h9bqhm | 2026-10-08 | keeper: cbdb>朝代/生卒相容>著作数>较早id（P4b 判准） |
| hixhjtdmo9hc | 汝南太守應碩 | hixhd2h9bqpb | 2026-09-26 | D4-官职黏名后entity重出并入正主 |

### P4b

| 悬空 id | 名 | keeper（survivor） | 时间 | rule |
|---|---|---|---|---|
| 1jb8icg2rni11 | 晁冲之 | hixhd2h9bo4j | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| 1jb8icg2h1fk8 | 陳巖肖 | hixhd2h9bg8s | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| 1jb8icg2jjbwk | 黃媛貞 | hixhgyrw4ycc | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |
| 1jb8icg2dx24k | 黃輝 | hixhgyrw4yeg | 2026-10-07 | 自查：草稿库 P4 批新建条与正式库条同人 |

## 三、git 历史

- Entity 路径历史（`git log origin/main -- Entity`，全部 124 个提交的 name-status）中，324 个 id **从未以任何 Entity 文件路径出现过**（同法对照：墓碑已存在的 hixhd2h9bqwr 出现 2 次，可证方法有效）。即：这些墓碑文件**从未入库**，不是删除而来。
- index/entities 历史：对 324 个 id 做一次性 `git log -G`（index 路径），0 个提交涉及。
- 结论：不是「有意清账删除」或「误删」，而是 D4／P4b 写 survivor.merged_in 时，被并方墓碑文件没有写入（或从未提交）。
- 未做：逐条定位引入 merged_in 的提交（Entity 全量 -G 太慢，超时中止）。如需精确到提交，需另行分批。

## 四、引用检查

- book-index 本仓 Work／Book／Collection 全部 JSON：324 个 id 中有 22 个文件的文本命中，字段仅为 `ai_note`(19)、`authors[].name_basis`(10)、`merged_in[].why`(8)、`period_basis`(1)，均为历史说明文字。**`entity_id` 字段 0 处指向这些 id。**
- book-index 本仓 `index/`：0 处引用。
- 草稿库 open-guji/book-index-draft（只读浅克隆，depth 1，HEAD 72b9e90ad）：当前树 0 处引用。注意：浅克隆只看当前树，未查草稿库历史。

## 五、交 Elias 判定的问题

1. 这 324 个墓碑是否补建（按规矩「被并方留墓碑」，补建需从 survivor 的 merged_in 信息生成墓碑，且 id 须与 merged_in 一致）？
2. 若不补建，是否删除 survivor 的悬空 merged_in 项？二者择一，无活引用，两种做法都不影响线上引用。
3. 另有一例单向不一致（成無巳 hixhd2h9blyf，见 并条一致性抽检-Skye.md），可随本批一并处理。

完整 325 条明细见 `/home/user/scratchpad/bingtiao/dangling.json`（未入库）。
