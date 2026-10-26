# 匹配引擎（馆藏与在线资源挂接·块 D）

把各源馆藏记录与 book-index 的 Work 匹配，出统一的 确定／存疑／无 三档表和写入计划草案。**只读**：不写 book-index／draft，不抓站，只读已有 library_data。

## 依赖与运行
代码在 `open-guji/book-index-manager` 的 `tools/馆藏资源挂接/`（2026-10-22 随草稿库清空从 book-index-draft 迁来，与 draft `1a29e3b6c9^` 逐字节相同）。
```
pip install opencc-python-reimplemented pytest pypinyin   # pypinyin：A8 欧美馆拼音责任者
# 三个外部仓：放在与 book-index-manager 并列的 book-index／book_index_json／overview 目录即可自动找到，
# 或用环境变量 BOOK_INDEX、BOOK_INDEX_JSON、OVERVIEW_ROOT 指定（见 roots.py）
# 朝代键表（book-index 派生，约 4 分钟，_build 约 3 GB，只留键表即可）：
python3 <book-index>/build/build_derived.py --root <book-index> --text-index <空目录> --out <临时目录>
mkdir -p tools/馆藏资源挂接/.cache && cp <临时目录>/dynasty_reign_keys.json tools/馆藏资源挂接/.cache/   # 或 export DYNASTY_KEYS=<路径>
python3 engine.py --source nlc|ncltw|korcis|kokusho|ndl|naikaku|waseda|bnf|bsb|sbb|loc|cudl|onb --out DIR [--emit-write-plan] [--limit N] \
   [--works-root <book-index 正式仓根>] [--data-root <library_data 根>] [--overview-root <overview 根>] \
   [--ledger-dir DIR] [--plan-dir DIR] [--mapping 政权映射.tsv]
python3 plancheck.py --source X --dir DIR [--works-root …]   # 写计划校验与库内比对；默认含 R1–R3/R7 占用检查（命中退出码 3，--no-occupancy 跳过）
python3 regress.py --source X --new DIR/matches.tsv --old <旧匹配表> --gold gold/X.tsv --works-root <book-index> --out REG   # 新旧回归；--works-root 让金标 Work 沿并条链换 keeper
python3 matches_digest.py DIR/matches.tsv                    # 指纹（去 engine_version 列）
(cd .. && python3 -m pytest -q match_engine/tests test_link_audit.py)   # 297 过、1 跳过（test_step5 钉 book-index@7e7247c8fa，设 BOOK_INDEX_ROOT 才跑）
python3 ../ledger.py --out DIR                               # 各馆×档位×已挂／未挂总台账（跑 5 源引擎，约 15 分钟）
```
**works-root 必须是正式库 open-guji/book-index（不是 draft；ID 空间不同）。**
环境变量：`BOOK_INDEX`、`BOOK_INDEX_JSON`、`OVERVIEW_ROOT`、`DYNASTY_KEYS`（朝代键表）、`MATCH_VARIANTS`、`FILES_OUT`、`BOOK_INDEX_ROOT`（仅 test_step5）。
默认数据目录 `tools/馆藏资源挂接/data/`（dupx 同题异作者清单、合刻组白名单、朝代差集、冲突字对、K13④排除名单、判据缓存）；`--plan-dir`／`--ledger-dir` 可覆盖。plancheck 的 `--cache` 无默认值，传 `data/判据缓存`。

每源约 1–5 分钟（现库 26.7 万 Work；4 核以内，<8 GB）。输出：`matches.tsv`（列见 `engine.py` COLS）、`stats.json`、`config_used.json`（含 engine_version、Work 索引条数）、可选 `write_plan.jsonl`／`linked_draft.jsonl`。

## 模块
`titleparse`（题名切分、卷数、局部／丛书标记）· `normalize`（题名／责任者归一）· `era`（朝代判据，读键表）· `workindex`（Work 索引、`Resources`：existing_res／already_linked）· `tier`（纯函数 `judge`，三档＋reason_codes）· `groups`（同书成组）· `exclusions`（先后规则 R2/R3/R7）· `writeplan`（确定档→resources[] 草案，≤3 藏本）· `adapters/<源>.py`（读各源原始数据 → 统一 Record）。

## 确定档＝四条同时满足，缺一即降级
T_EXACT（题名全等）∧ A_EQ（责任者相合）∧ W_UNIQUE（唯一 Work）∧ ERA_OK；且无 COLLECTION／MULTI_TITLE／GAZETTEER_PREFIX／LOCAL_PART 等降级码。降级必有 reason_code（断言保证）。GLM 不参与判定。

## 加一个新源适配器（6 步）
1. 在 `tier.py` 的 `Policy.profile()` 加该源的 `Profile`（jp、题名风格、丛书词表 COLL_*、是否查别名、多题名模式等，照最像的源抄）。
2. 写 `adapters/<源>.py`，`load(data_root)` 返回 Record 列表：`source, source_record_id, group_key, title_raw, author_raw, version_raw, juan, class_raw, url, image_url, has_image, extra`；日系源另给 `parsed`（names、era_token、segs、juan、force）。
3. 在 `writeplan.SITES` 加站点 id／名称／group 前缀／label；`make_item` 里补该源的 `metadata` 键与记录号来源（按 `口径.md` K6–K8）；`workindex.RECORD_KEY`／`SITE_OF_SOURCE` 同步，保证 already_linked 能认。
4. `engine.py` 的 `--source` choices 加该源名。
5. 造金标 `gold/<源>.tsv`（确定档已验样本＋存疑人审＋边界对抗），用 `regress.py` 对旧表（若有）回归，放行错必须 0。
6. 写 `tests/`（适配器解析、每个降级码的用例），跑 `pytest`；在 #583 贴数字，让 E 块独立跑一遍、`matches.tsv` diff 为空。

## 约定与红线
不改 schema；匹配表等大文件不进仓；凭据不进仓；只写确定档，存疑不写。已有适配器：nlc／ncltw（C3 台湾国图古籍影像，记录号＝書號，url＝按書號 GET 检索）／korcis（C3 韩国 KORCIS，只取有原文影像且国中互联网公开者，url＝按国中控制号 GET 检索，见 `docs/馆藏资源挂接/报告/C3-KORCIS挂接-20261026.md`）／kokusho／ndl／naikaku／waseda；日本诸馆 utokyo／ioc／shoryobu／keio／arc／nagoya／kyoto 共用 `adapters/jpc1.py`（A9，见 `docs/馆藏资源挂接/报告/A9-日本诸馆C1挂接-20261026.md`、`A9续-京大贵重挂接-20261026.md`）；欧美六馆 bnf／bsb／sbb／loc／cudl／onb 共用 `adapters/euro.py`（A8，见 `docs/馆藏资源挂接/报告/A8-欧美六馆挂接-20261026.md`）；另有 `authorgate`（责任者闸）、`plancheck`（写计划校验与占用检查，K9 每 Work 最多 3 条藏本）。
