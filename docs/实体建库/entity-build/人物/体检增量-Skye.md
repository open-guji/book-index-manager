# 常备体检增量（Skye，只读）

- 对象：book-index origin/main **af28f6c255**（含 #353 批C1、#334），2026-10-14 取数。
- 基线：上次体检（P-人物/体检-异体字与年号-Skye.tsv、体检-併池与alt-Skye.tsv；悬空 merged_in 分类 de6c0b0892）。
- 只读，未改任何数据。

## 一、结论摘要

| 项 | 基线 | 现状 | 增量 |
|---|---|---|---|
| 悬空引用（parent_id／dynasty_id／dynasty_ids／merged_in／merged_into） | 325 条 | 325 条（324 个唯一墓碑 id） | 无变化 |
| 墓碑一致性（墓碑 → 存在的留存方；留存方 merged_in 回指） | — | 0 问题 | 无 |
| 異體字（人名含 嶽隱恆爲脩） | 214 条 | 129 条仍在；81 条本名已改正；4 条已墓碑化 | 消除 85；**新增 0** |
| 年號同名（人名与 reign 同名） | 14 条 | 16 条 | 新增 3，消除 1（见下） |
| 併池 alt | 31 条 | 31 条全部存在、未墓碑化 | 无变化（仅查存在与墓碑状态，未重核生卒籍） |
| 批C1 新增实体（26 条） | — | 悬空引用 0 | 无新增问题 |

## 二、新增／消除明细

- **年號同名新增 3 条**（需人审是否年号误作人物本名）：
  - `hixi1ubjrxfp` 太平天國
  - `hixi1ubjrxfm` 大順
  - `hixi4ugstvk7` 紹興
- **年號同名消除 1 条**：`hixho5puw1if` 致和，已并入 `hixhgyrw4x7v`（墓碑化）。
- **異體字消除 85 条**：81 条本名已改正（不再含 嶽隱恆爲脩），4 条已墓碑化。

## 三、方法与限制

- 悬空：遍历 Entity/*.json 的 parent_id、dynasty_id、dynasty_ids、merged_in[].id、merged_into，目标在 Entity 与 index/entities 中均无记录即计。
- 墓碑：merged_into 目标须存在；目标 merged_in 须回指墓碑；留存方 merged_in 指向的记录须以 merged_into 回指。
- 異體字检测只覆盖基线所用的五个字（嶽隱恆爲脩），未覆盖其他异体字；新增 0 仅指这五字范围。
- 年號同名按 primary_name 与 subtype=reign 的记录完全相同判定，与基线口径一致；新增三条是否为真误作，待人审。
- 併池 alt 只核存在与墓碑状态，未对 CBDB 重取生卒籍。

## 四、待办（提议）

1. 人审三条新增年號同名（太平天國、大順、紹興）。
2. 併池 alt 的生卒籍复核若需要，另起一轮 CBDB 取数。

## 五、年號同名（新增 3 条，自判）

判定依据：三条的 subtype 并非 person（太平天國、大順为 dynasty／政權，紹興为 place），同名的 reign 各自属于不同政權或朝代；按「同名年號在不同政權並存」为合法，不判重复。只读核查 book-index af28f6c255 的 Entity（subtype、dynasty_id、dates）。

| id | 本名 | 本条类型与依据 | 同名 reign（id · 政權 · 年份） | 判定 |
|---|---|---|---|---|
| hixi1ubjrxfp | 太平天國 | dynasty，洪秀全所建政權，1851–1864 | hixi1ubqbwuv · 太平天國（洪秀全，dynasty hixi1ubjrxfp）· 1851–1864 | **合法并存**：政權名与年號名同名，同一政權的年號，类型不同，非重复 |
| hixi1ubjrxfm | 大順 | dynasty，李自成所建政權，1644–1645 | hixi1ubqbwug · 大順（張獻忠，大西 hixi1ubjrxfl）· 1644–1647；hixi1ubo5926 · 大順（李曄，唐 hixi1ubjgowi）· 890–891 | **合法并存**：三个政權各自使用「大順」，朝代不同 |
| hixi4ugstvk7 | 紹興 | place，無 dates／description | hixi1ubpe784 · 紹興（趙構，南宋 hixi1ubk35zp）· 1131–1162；hixi1ubpe78f · 紹興（耶律夷列，西遼 hixi1ubjrxgl）· 1151–1164 | **合法并存**：地名與年號；两个年號分屬南宋、西遼 |

**疑重复：0 条**，无需交 Soren 判并。

附注：hixi4ugstvk7（紹興·place）无 dates 与 description，若要收口可补，非重复问题。
