# 早稲田全量确定档扣减表（Everett，2026-10-15 洛杉矶）

- **基线**：book-index main `a9ef3f9d0983`；引擎 2a0a44ae 版 `--source waseda --emit-write-plan`（`alt_sibling_brake` 开、`lead_brake` 关，按 Profile 默认）；keys sha `1a03d95750ad`。plancheck 含占用检查：item_errors 空、占用 0、超 3 为 0。
- **文件**：`waseda_确定档扣减表.tsv`、`waseda_write_plan_扣首批.jsonl`（**632 行／532 Work，sha256 前12位 `fd8085e96579`**，已扣首批 484 与 K13④ 的 ro13_03014）、`waseda_plancheck输出.txt`（引擎全表 1,117 行）。

## 确定 1,702 条去向（合计 1,702；Milo 说 1,701，差 1 条，引擎现版为 1,702）
早稲田口径 K12：不要求 image_url，故无「无影像」项（matches.tsv 的 has_image 对早稲田恒为站方图链接有无，不用于扣减）。
| 去向 | 条数 |
|---|---|
| 已落库 | 0 |
| K13④ 排除 | 1（ro13_03014） |
| R2／R3／R7 占用 | 197（R7 52、R2 27、R2+R7 1、WASEDA_ANNOT_SUSPECT 116、R2+ANNOT 1；含傅子 ro13_03004 的 R2） |
| 首批 484（已出终表，另案） | 484 |
| K9 超 3 | 160 |
| 同 Work 同顶层册去重（已有更优一条，写入单位是顶层册） | 228 |
| **真实可写（扣首批后）** | **632** |

- 首批 484 全部在全量确定内（484/484）。
- WASEDA_ANNOT_SUSPECT（116 条）是引擎对「站方注记疑似」的排除，按口径不写，待另案人核。
- 写入前须按当时基线重跑 plancheck；复杂数据 PR 走 Sylvie 重放，Rhea 开 PR，Marlowe 合并，正式库写入待用户放行。

## 2026-10-15 多册书 URL 修正（Rhea 发现）
多册书顶层页 `.../html/<pre>/<gid>/index.html` 实测 404，只有分册页 `<gid>_NNNN` 200。`writeplan.make_item` 改为：所选记录自身是分册（record_id≠gid）时 url 用该记录自己的页面，group／waseda_id 仍按顶层册 gid。受影响：`waseda_write_plan_扣首批.jsonl` 136 行（新 sha 5d0360a2c6be，行数 632 不变）、`waseda_write_plan_放行13Work补挂.jsonl` 2 行（新 sha 251f84421dbe）；首批 `batch1_write_plan_final.jsonl` 484 行（无分册，不受影响）；库内现有 waseda 资源仅 1 条且非分册，不涉及。

### 补挂 15 行 URL／题名核对（Milo/Ruth，10-15）
ro12_00478_0360、ro13_00963_0063 两条分册页实测均 200（ro12_00478_0001 亦 200）；Ruth 看到的 404 应为修正前文件里的顶层页 URL（已于 628c235f 替换）。15 行题名比对表：`waseda_write_plan_放行13Work补挂_题名比对.tsv`（Work 题名／站方题名／站方责任者／url）。
