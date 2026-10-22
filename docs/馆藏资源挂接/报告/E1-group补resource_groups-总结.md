# E1 总结：Work 层 group 补 resource_groups.label

卡：open-guji-core/overview#583　执行：Edwin　审并合：Marlowe　完成：2026-10-13（洛杉矶）

## 全量前后
| | 缺项 group | 涉及记录 |
|---|---|---|
| 开工前（原始 dry-run） | 3,787 | 3,692 |
| 全部合入后（重跑 dry-run，book-index main） | **1** | **1** |

剩余 1 条＝水蜜桃譜 `Work/2/b/k/d59f2mtzx2bk-水蜜桃譜.json` 的 `nlc-312001036010`：无 `metadata.edition`，不猜不写；Silas 已记入后续「人核补 edition」清单。
新增 3,786 组／3,691 条记录＝3,787−1／3,692−1，对得上。

## 各批 PR（book-index，均由 Marlowe 读 diff 后合并）
| 批 | PR | 记录 | 新增组 | 合并 commit |
|---|---|---|---|---|
| 1（试点） | #187 | 200 | 202 | 3e83c128 |
| 2 | #188 | 400 | 414 | 1140a79f |
| 3 | #189 | 400 | 414 | 2d562cf4 |
| 4 | #190 | 400 | 407 | 0a4df27d |
| 5 | #191 | 400 | 417 | e2930e88 |
| 6 | #192 | 400 | 406 | 74b17186 |
| 7 | #193 | 400 | 410 | c556d4fa |
| 8 | #194 | 400 | 412 | cdd5fb74 |
| 9 | #195 | 400 | 407 | f797d615 |
| 10 | #206 | 291 | 297 | 447442df |
| 合计 | | 3,691 | 3,786 | |

## 规则与边界
- nlc：`國圖藏本：{edition}`；kokusho：`國書·{holder}藏{edition}`；不加「摘抄／局部」后缀（元数据推不出）；旧式 label（國書藏本 65 条）不动。
- 只动 `resource_groups`、`revision`（次版本+1、patch 归 0）、`revised_at`；`resources`（url、group 值）逐字不变；已有组键不覆盖。每条写前脚本断言，抽样（Sol）214/214 对。

## 校验
每个 PR 均附 `check_schema`、`check_v2`、`verify.py --strict` 原始输出，全 0 错误。全部合入后在 main 上重跑 `verify.py --strict`：OK，exit 0（裁決賬 7328，未变）。

## 工具
`scripts/馆藏资源挂接/group_labels.py`（dry-run）、`group_labels_apply.py`（分批写入，幂等）。
