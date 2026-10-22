# 匹配引擎（馆藏与在线资源挂接·块 D）

把各源馆藏记录与 book-index 的 Work 匹配，出统一的 确定／存疑／无 三档表和写入计划草案。**只读**：不写 book-index／draft，不抓站，只读已有 library_data。

## 依赖与运行
```
pip install opencc-python-reimplemented pytest
export DYNASTY_KEYS=<dynasty_reign_keys.json 路径>          # 朝代键表（Edwin #580 维护；记版本）
python3 engine.py --source nlc|kokusho|ndl|naikaku|waseda \
   --works-root <book-index 正式仓根> --data-root <library_data 根> \
   [--overview-root <overview 根，仅在默认数据目录无文件时回退旧路径>] \
   [--ledger-dir DIR] [--plan-dir DIR] [--mapping 政权映射.tsv] \
   --out DIR [--emit-write-plan] [--limit N]
python3 plancheck.py --source X --works-root … --dir DIR     # 写计划校验与库内比对；默认含 R1–R3/R7 占用检查（命中退出码 3，--no-occupancy 跳过）
python3 regress.py --source X --new DIR/matches.tsv --old <旧匹配表> --gold gold/X.tsv --out REG   # 新旧回归
python3 -m pytest -q tests                                   # 280 条
```
**works-root 必须是正式库 open-guji/book-index（不是 draft；ID 空间不同）。**
环境变量：`DYNASTY_KEYS`（朝代键表）、`MATCH_VARIANTS`、`FILES_OUT`、`BOOK_INDEX_ROOT`。
默认数据目录 `tools/馆藏资源挂接/data/`（dupx 同题异作者清单、合刻组白名单、朝代差集、冲突字对、K13④排除名单、判据缓存）；`--plan-dir`／`--ledger-dir` 可覆盖。plancheck 的 `--cache` 无默认值，传 `data/判据缓存`。

每源约 1 分钟（4 核以内，<8 GB）。输出：`matches.tsv`（列见 `engine.py` COLS）、`stats.json`、`config_used.json`（含 engine_version、Work 索引条数）、可选 `write_plan.jsonl`／`linked_draft.jsonl`。

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
不改 schema；匹配表等大文件不进仓；凭据不进仓；只写确定档，存疑不写。已有适配器：nlc／kokusho／ndl／naikaku／waseda；另有 `authorgate`（责任者闸）、`plancheck`（写计划校验与占用检查，K9 每 Work 最多 3 条藏本）。
