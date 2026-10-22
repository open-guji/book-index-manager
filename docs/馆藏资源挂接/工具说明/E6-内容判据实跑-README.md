# R1-E6 实跑记录（Everett，2026-10-15 洛杉矶）
代码：`match_engine/linkcheck.py`＋`plancheck.py --verify-content`（判据归 Reid `link_audit.judge`）。用法：`python3 plancheck.py --source S --works-root R --dir D --verify-content [--sample N|--all] --cache <缓存目录或.jsonl> [--offline]`；库内/清单直接跑：`python3 linkcheck.py --urls-file <资源id\turl> --cache 项目进展/馆藏资源挂接/计划/判据缓存 --out X.tsv`。dead 隔 600s 二次确认；429/403/超时退避 30/60/120s 后仍不行记 unknown，不判死；有 dead 退出码 2。
| 实跑 | 结果 |
|---|---|
| Silas 补验 nlc 54 条（#583） | **54/54 ok，0 dead**（间隔自检 min_gap 2.0s） |
| 早稲田首批 500 项 plancheck 抽样 150 | 150 ok，0 dead/unknown |
| 库内 nlc 抽样 38＋ndl 2 | nlc 38 ok；ndl 2 条遇 429 → unknown（不判死） |
| 假样例（Reid 式：nlc fid 全 9／ndl pid 全 9／早稲田 id 99999） | 3/3 dead（二次确认） |
单测 `tests/test_linkcheck.py` 31 项全离线（真假各站、404/小字节/429/超时/异常、二次确认与恢复、缓存命中/版本失效/离线、共享目录缓存 dead≥2 条规则、限速间隔、抽样可复现）；全套 264 通过。
ndl／kokusho 的 #583 清单由 Silas 脚本在跑（同判据），本块读其结果，不重打。缓存文件不提交进仓。
