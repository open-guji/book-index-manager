# 馆藏资源挂接 已落库批次证据存档（GUJI-361，2026-10-15）

`馆藏资源挂接-已落库批次证据-20261015.tar.zst`（sha256 `8abd50fba2663bbec78d4e00feb02fc3bea8f7750fd0bfae8f0b9b6e48c45c75`，约 0.5MB；解压后 62 文件、5.9MB）。逐文件路径、大小、sha256 见 `MANIFEST.tsv`。

注意：包内路径带前缀 `馆藏资源挂接/计划/`（如 `馆藏资源挂接/计划/E1-二审表/…`），MANIFEST.tsv 与下文列出的路径均为不带该前缀的相对路径。

内容（均为已落入 book-index 正式库的批次证据，路径为原 overview `项目进展/馆藏资源挂接/计划/` 下相对路径）：
- `E1-二审表/`：国图存疑二审全流程（对照表、盲标、盲抽、终审机械对照、E1-nlc-B1 写入计划与验收、合后线上核对），对应 book-index#542
- `内閣首批-batch1/`、`内閣第二批-batch2/`：內閣前两批 write_plan 与 README
- `E5-3-早稲田首批v2/`：早稲田首批终版（484 项，book-index#519）
- `R3-5-补挂定稿150行/`＋`R3-4-早稲田全量/` 放行 13 Work 补挂三件：内閣占用放行补挂与早稲田放行补挂（book-index#530）
- `R3-4b-国書既有全量筛/draft4新Work-国書挂接plan.jsonl`、`E1-抽样表.tsv`

解压：`python -c "import zstandard,sys; open('x.tar','wb').write(zstandard.ZstdDecompressor().decompress(open(sys.argv[1],'rb').read(), max_output_size=10**9))" <文件>` 后 `tar xf x.tar`；或 `zstd -d`。

## 包2（GUJI-361 第四批，2026-10-15）
`馆藏资源挂接-已落库批次证据-包2-20261015.tar.zst`（sha256 `2db90e0a73dcec6750c1ab2460b6e37e3dca966a3b28312e75cf525be9840eb0`，约 0.65MB；解压后 94 文件、6.0MB）。逐文件路径／大小／sha256 见 `MANIFEST-包2.tsv`（路径相对原 overview `项目进展/馆藏资源挂接/`，包内路径带前缀 `馆藏资源挂接/`）。
内容：B修（Commons／其余站点 PR 核对表、初判、人核、抽样）、内閣首批／第二批全检结果与写入子集、早稲田首批抽检／终表全检、内閣第 3 批（B1 已落库部分、批 3 子集／定稿／交叉复核／盲核结论）、占用放行补挂（README、全检比对、终审结论、write_plan）、合后核对、刹车四源回归、早稲田小样、E6 内容判据实跑、R3-1 ooc 核实与 NDL 限定公开批、R1 字体表数据与攷考重开差异表、写入对照与独立抽检、试点／补验、K2 Book 层资源草案、group 补 label dry-run 等已收口证据。Reid 的 `全量-commons-Reid/`、`全量-wikisource-Reid/` 整目录不在包内（运行中、相对路径依赖），留待办/GUJI-370。
