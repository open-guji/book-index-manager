# 分块设计：馆藏与在线资源挂接 ／ D 匹配引擎统一

> 块负责人：Everett（程序员，目录团队，账号 B）　｜　项目主力：Silas　｜　状态：待评审
> 对应总计划：`项目进展/馆藏资源挂接/计划/总计划.md` 第四节 D 行　｜　写于 2026-10-12 洛杉矶 17:50
> 口径：先按总计划附录提案（Work 层优先、`types` 取值、`kokusho`／`nlc`／`ndl`／`nat-archives-jp` 站点 id、每来源机构每 Work ≤3 藏本）；A 块 `口径.md` 定稿后，只改第二节 `out_*` 字段映射与第三节 `policy.yaml`，不动匹配核心。

## 一、本块目标与边界
目标：把 `claude/b5-match` 分支及 `book_index_json/library_data/_匹配/<源>/scripts/` 里各源各写一份的匹配脚本，统一成**一个引擎＋每源一个适配器**，复用 #580 的归一与朝代判据、#574 的异体字表，输出统一的 **确定／存疑／无** 三档表；并证明新引擎在国图、国書、NDL 三个已有基准上**复现旧结论、不降准确率**。

不做：
- 不写 book-index／book-index-draft 任何数据（本块只出脚本和匹配表）；写入归 E 块。
- 不定口径（A 块 Silas）；不改 schema；不改 Entity（异体字表、朝代键表只读）。
- 不做内閣文庫、故宫、早稲田、上图的**适配器**（国圖／國書／NDL 三个先做；内閣文庫放第 8 步，视 E4 开工时间；早稲田 E5 第二波）。
- 不跑 GLM 全量，不用 GLM 判「异」（用户 10-07 定）。GLM 筛子接口只留钩子（`--assist glm`），默认关。
- 匹配表和大文件不进仓；抓取站点 ≥2 秒／次；凭据不进仓／issue／聊天。

交付物：
1. 引擎代码：放 **overview 仓** `scripts/馆藏资源挂接/match_engine/`（脚本类小文件进仓；大表不进）。
2. 三个适配器：`adapters/nlc.py`、`adapters/kokusho.py`、`adapters/ndl.py`。
3. 回归基准：`tests/`（单元＋金标回归）＋ `回归报告.md`。
4. 统一三档表 `matches.tsv`（schema 见第二节），存 `book_index_json/library_data/_匹配/<源>/统一引擎/`（不进 overview）。
5. `README.md`：怎么加一个新源适配器（给 E1–E5 和 E5 日文馆用）。

## 二、Schema／数据格式（完整）

### 2.1 引擎输入：统一馆方记录（适配器输出，内存 dict／jsonl）
| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `source` | str | 否 | 站点 id：`nlc`｜`kokusho`｜`ndl`｜`nat-archives-jp`｜… |
| `source_record_id` | str | 否 | 馆方记录号（nlc 的 fid、国書 bid、NDL PID） |
| `group_key` | str | 可 | 同书成组键（国書著作 id；NDL 按（题名,责任者,版本）成组；其余为空＝单条成组） |
| `title_raw` | str | 否 | 站方原题名 |
| `author_raw` | str | 可 | 站方原责任者串（含朝代标注、责任方式词） |
| `version_raw` | str | 可 | 版本／刊年串 |
| `juan` | int／null | 可 | 卷数（适配器解析，解析不了留空） |
| `class_raw` | str | 可 | 馆方分类（用于汉籍筛：NDL 四库分类） |
| `url` | str | 否 | 馆方详情页 |
| `image_url` | str | 可 | 影像入口（IIIF／阅读页）；空＝无影像 |
| `has_image` | bool | 否 | 由 `image_url`／站方数位化状态得出 |
| `extra` | obj | 可 | 站方其余字段，原样保留 |

### 2.2 引擎输入：Work 索引（从 book-index 即时建，不落盘）
来源 `Work/*/*/*/*.json`，排除 `merged_into`、`promoted_to` 墓碑。取字段：`id`、`title`、`additional_titles`、`original_title`、`authors[].name`、`authors[].dynasty`、`juan_count`、`resources`（用于已挂判断）、`books`（数量）。

### 2.3 引擎输出：`matches.tsv`（统一三档表，UTF-8，制表符，首行表头）
| 列 | 类型 | 含义 |
|---|---|---|
| `source` | str | 同上 |
| `source_record_id` | str | 同上 |
| `group_key` | str | 同上（空串＝无） |
| `tier` | enum | `确定`｜`存疑`｜`无` |
| `work_id` | str | 确定档必填；存疑档填首选候选（可空）；无档空 |
| `work_title` | str | 对应 Work 题名，便于人看 |
| `lib_title` / `lib_author` / `lib_version` | str | 站方原值 |
| `url` / `image_url` / `has_image` | str／str／0\|1 | 同输入 |
| `existing_res` | 0\|1 | 目标 Work 或其下 Book 已有任何资源（供 E 块判「净增」） |
| `already_linked` | 0\|1 | 目标 Work/Book 已挂同一 `source_record_id`（幂等跳过） |
| `reason_codes` | str | 分号分隔**枚举码**（见 2.4），取代旧版自由文本 |
| `reasons_text` | str | 人读解释 |
| `candidates` | str | 逗号分隔候选 Work id（≤8） |
| `evidence` | json str | 命中证据：`{title_match, author_rel, era_flag, juan_flag, group_size}` |
| `engine_version` | str | 引擎 git short hash＋policy 哈希，保证可复现 |

另出 `stats.json`（三档计数、各 reason 码计数）、`config_used.json`（本次运行的 policy 与表指纹）。

### 2.4 `reason_codes` 枚举（取代各源自由文本；每码固定含义，可统计）
确定的**充分条件**（缺任一降存疑）：`T_EXACT`（题名全等）、`A_EQ`（责任者主名有交集）、`W_UNIQUE`（唯一 Work）、`ERA_OK`（朝代无冲突）。
降存疑码：`T_FUZZY`（去装饰词后相合）、`T_AUTHOR_NEAR`（同责任者近似题名）、`A_MISSING`（任一方缺责任者）、`A_DIFF`（同题责任者不合）、`A_ALIAS_ONLY`（仅别名相合）、`ERA_CONFLICT`、`ERA_VERSION_EARLIER`、`JUAN_GAP`、`COLLECTION`（丛书／合集）、`MULTI_TITLE`（合刻合订）、`LOCAL_PART`（摘抄／續編／序等局部标记）、`GAZETTEER_PREFIX`（地方志带朝代前缀）、`MULTI_WORK`（同题多 Work）、`DUP_WORK_SUSPECT`（本仓同名同作者重复 Work，转 C2 线索）、`GROUP_SPLIT`（同书成组内各条落到不同 Work）。
无档码：`T_MISS`（题名未命中）、`T_EMPTY`（题名空）、`NOT_HANZI`（非汉籍，适配器筛出）。

### 2.5 配置：`policy.yaml`（与 A 块口径对接的唯一入口）
`types_for_image: ["image"]`；`max_items_per_work_per_source: 3`（仅在 `--emit-write-plan` 时生效，见第 7 步）；`min_author_substr_len: 3`；`near_title_ratio: 0.8`；`write_no_image: false`。口径定稿后只改此文件与 `out_*` 映射函数。

### 2.6 与共用契约的对应
总计划第五节「三档匹配表：统一 tsv，列由 D 块分块设计定」→ 即 2.3。写入清单（E 块）由引擎的 `--emit-write-plan` 从 2.3 的确定档生成，格式遵 `schema/common.md` 第三节 `resources[]`，**但由 E 块执行写入**。

## 三、程序架构

```
match_engine/
  engine.py          # 入口：python3 -I engine.py --source nlc --out DIR [--works-root PATH] [--limit N]
  normalize.py       # 题名／责任者归一（复用，见下）
  era.py             # 朝代序判据（复用 #580 政权映射）
  workindex.py       # 从 book-index 建 Work 索引
  tier.py            # 三档判定（纯函数，无 IO）
  groups.py          # 同书成组（国書 id／NDL 键）
  writeplan.py       # 确定档 → resources[] 草案（不写库）
  report.py          # stats.json / 回归对比
  adapters/{nlc,kokusho,ndl}.py   # 每个：load(path) -> Iterable[Record]
  policy.yaml
  tests/{test_normalize,test_tier,test_adapters,test_regression}.py
```
调用关系：`engine` → `adapters.<src>.load` → `groups` → `tier.judge(record, workindex, policy)` → `report`。`tier` 只依赖 `normalize`／`era`／`workindex`，纯函数，便于单测。

**复用与新写：**
| 部件 | 复用来源 | 说明 |
|---|---|---|
| 题名／责任者归一 | 旧 `claude/b5-match` `.claude/qa/b5/common.py`（`norm_title`、`norm_author`）；`overview/scripts/_match_normalize.py` + `data/match_variants.json`（4,355 条等价类）；`项目进展/朝代年号录入/scripts/guji_norm.py`（NORMALIZE／PROTECT 咸／EXCEPTIONS 例外表） | **合并成一个 `normalize.py`，三层顺序固定**：①NFKC＋去括注 ②OpenCC＋日文新字体表（旧 common.py 的 EXTRA，补全见第 2 步）③`match_variants.json` 等价类。顺序与旧结果不同的地方在第 2 步用回归对照量化 |
| 朝代序判据 | 旧 `match_nlc.py` 的 `RANK`／`lead_era`／`author_era`；#580 `政权映射.tsv`、`dynasty_reign_keys.json`（块 F 产出） | 第 3 步对齐：把旧的内置 RANK 换成读 #580 的键表，**对不上的朝代名报警不静默** |
| 题名拆分 | 旧 `split_title`／`parse_juan`／`multi_title` | 原样抽成函数并加单测 |
| 国書成组、日文新字体 364 条整表 | `book_index_json/library_data/_匹配/国書漢籍/scripts/`（D3） | 并入 `groups.py` 与 `normalize.py` |
| NDL 的 〓 通配、N卷切题名 | `_匹配/NDL古典籍/scripts/match_ndl.py` | 并入 `adapters/ndl.py`＋`normalize.py` |
| 新写 | `reason_codes` 体系、`policy.yaml`、`already_linked` 幂等判断、`existing_res` 标注、回归框架、`--emit-write-plan` | — |

运行位置：云端会话；Work 索引需 book-index 浅克隆（约 150k 文件，建索引约几分钟）；源数据在 `book_index_json/library_data/`（私有仓，需挂载权限，**步 1 前确认**）。

## 四、步骤流程

| 步 | 做什么 | 输入标准（开工前什么必须成立） | 产出 | 验收标准（命令＋预期数字） | 谁验 | 估时 |
|---|---|---|---|---|---|---|
| 1 | **基线固化**：取旧三个源的匹配表与旧脚本，记 commit／指纹；确认能读 `book_index_json`；建三份**金标**（见第五节） | 总计划评审通过；Silas 或 Marlowe 在 #583 放行本设计；能 clone `book_index_json` 与 book-index `claude/b5-match`（否则找 Marlowe 要权限，**不通过则停在此步**） | `基线清单.md`（各表路径、条数、sha256、book-index 基线 commit）；`gold/{nlc,kokusho,ndl}.tsv` | `wc -l` 与卡上数字逐项一致：国图 25,574（确定 9,047／存疑 6,257／无 10,270）、国書 15,126（3,974／5,391／5,761）、NDL 3,232 藏本（545／876／1,811）；金标行数＝第五节规定数 | 自验＋Silas 抽看 | 约 45 分钟 |
| 2 | **归一层合并**：`normalize.py` 把三套归一合一；补全日文新字体表（现仅约 80 字 → 并入 D3 的 364 条）；写单测 | 步 1 通过；`match_variants.json` 与 `guji_norm.py` 可读；与 Sasha 确认异体字表以哪份为准（**未决 Q1**） | `normalize.py`＋`tests/test_normalize.py`（≥60 条用例，含 咸/鹹、啓/啟、〓 通配、陈琯不吃姓、方括号著者不删） | `pytest tests/test_normalize.py` 全绿；对三源全部题名跑新旧归一差异统计：**键不同的条数 ≤ 总数 0.5%**，且逐条分类（改善／回退），回退为 0 才过，否则回头改表 | 自验；Sasha 或 Soren 复核异体表来源 | 约 60 分钟 |
| 3 | **朝代判据对齐 #580**：`era.py` 改读 `政权映射.tsv`／键表；旧内置 RANK 与键表做差集 | #580 块 F 已出 `dynasty_reign_keys.json`（或 `政权映射.tsv` 当前版，**记版本**）；步 2 通过 | `era.py`＋`tests/test_era.py`；`朝代差集.tsv`（旧 RANK 有而键表无／反之） | 差集中旧 RANK 里每一项要么对上键表要么逐条写处置；`pytest tests/test_era.py` 绿；旧 `author_era`／`lead_era` 在国图 25,574 条上的输出与新实现**逐条相同率 ≥99.5%**，余者逐条说明 | 自验；Sasha 看差集 | 约 40 分钟 |
| 4 | **三档判定核心 `tier.py`**＋`reason_codes`；把旧 `match_one` 的逻辑改写为纯函数，**行为先保持不变**，再统一各源差异开关（丛书、局部标记、合刻、方志前缀） | 步 2、3 通过；`reason_codes` 枚举（2.4）评审通过 | `tier.py`＋`tests/test_tier.py`（每个 reason 码至少 2 条用例，含旧实测错例：陈琯、`[(明)倪谦撰]`、吳越所見書畫錄合刻、六十種曲） | `pytest tests/test_tier.py` 绿；**确定档的四个充分条件缺任一即降级**由属性测试覆盖：随机扰动 1000 次，无一次「缺条件仍确定」 | 自验；Silas 评审规则 | 约 75 分钟 |
| 5 | **同书成组 `groups.py`**＋`workindex.py`（含 `existing_res`、`already_linked`） | 步 4 通过；book-index 基线浅克隆在位（commit 记入 `config_used.json`） | 两模块＋测试；Work 索引构建耗时记录 | 对 book-index 基线：Work 在世数＝**131,696**（总计划 stat_res.py 同基线）；`already_linked` 对国图 9,045 条已写项命中 ≥99%（余者逐条解释）；国書成组数与 D3 报告「4,629 著作」一致 | 自验 | 约 50 分钟 |
| 6 | **三个适配器＋端到端回归** | 步 5 通过；三源原始数据在位 | `adapters/*.py`；三份 `matches.tsv`；`回归报告.md` | **回归线（见第五节）**：对每源在**同一份 Work 基线**下，新引擎与旧匹配表比较——①旧「确定」档中新引擎仍判确定的比例 ≥98%；②**新引擎判确定而旧表不是确定**的，全部列清单并抽检（≥30 条或全部，取小），错 0 才算通过，否则改规则不改金标；③金标上放行错 0、漏判（金标「同」而判存疑／无）的数不比旧引擎多；④三源 `tier` 计数与旧表差异逐项解释（每项原因 `reason_codes` 可统计） | 自验；Silas 复核回归报告；**交叉验：Sol 或 Selene 从①②③抽 40 条** | 机器约 20–30 分钟 ＋ 人约 60 分钟 |
| 7 | **`--emit-write-plan` 与 policy 对接 A 块口径**：确定档 → `resources[]` 草案 jsonl（不写库）；落实「同一来源机构每 Work ≤3 藏本，取舍序＝有全本影像＞版本信息明确＞卷数完整」 | A 块 `口径.md` 已定稿并推仓（**未到不开工**，不在第一波卡死关键路径内；步 1–6 不依赖） | `writeplan.py`＋测试；各源 `write_plan.jsonl` 草案 | 草案每条通过 `check_schema` 的 `resources[]` 单项校验（用 `schema/common.md` 第三节规则脚本化）：**ERROR 0**；国图 9,045 已写项的草案与库内现有 resources `id/group` 一致率 100%（证明格式与既有写入同形）；每 Work 每来源 >3 的为 0 | 自验；E 块负责人试读 | 约 45 分钟 |
| 8 | **交接与 README**：写 `README.md`（加新源适配器的 6 步）；在 #583 贴回归结果与用法；给 E1–E4 负责人演示一遍 | 步 6、7 通过 | `README.md`；#583 汇报评论 | E 块负责人按 README **独立**跑通一个源（如 NDL）、结果与我的 `matches.tsv` 逐行相同（`diff` 空）；一次口头问不出新问题即过 | E 块负责人 | 约 30 分钟 |
| 8b（可选，视排期） | 内閣文庫适配器（203,713 册，影像 90.9%，每 Work ≤3 藏本） | 步 8 通过；E4 排班确认；内閣文庫原始数据位置确认 | `adapters/naikaku.py`＋`matches.tsv` | 复现旧结果：确定 4,489／存疑 3,867／无 4,195（对旧基线 `08c01aaf86`，容差 ≤0.5% 且逐项解释）；旧抽检 200/200 回站错 0 | 交叉验 | 约 60 分钟 |

合计：约 **4.5 小时人工＋机器约 0.5 小时**（含 8b 另加约 1 小时）。与总计划 D 块估时「4 小时＋机器」基本一致，多出的 0.5 小时用在步 1 的金标固化。

## 五、测试数据与金标
- **金标 = 三源各取三类样本**，每条人工裁定为 同／异／存疑（对「同」要求原站打开核对）：
  1. 旧确定档已验的抽检明细：国图 185 条（抽检-追加\*.md）、国書 200 条（抽检明细.tsv）、NDL 179 条——**来源已有，不新抽**。
  2. **旧存疑档里的人审结果**：国图存疑档中旧 GLM 对照的 100＋67 条（已有我方盲标）；用来检验**不要把存疑误放行**。
  3. **边界对抗集**（本块新造，约 60 条）：陈琯／陈（姓与朝代混淆）、方括号著者、合刻本、丛书整套、同题异书（釋車 蕭掄 vs 朱駿聲）、一字异体（朱國楨／朱國禎）、〓 缺字（繆〓孫）、「N卷」黏连题名、地方志朝代前缀、局部（摘抄／續編／序）。来源＝旧报告列出的典型错例＋国書 62 条局部清单。
- **分训练／验证**：不训练，规则型；但**金标分两半**——步 2–4 开发只看 A 半；步 6 回归用 B 半＋全量旧表，避免对着金标调参。
- **评测口径**：分母＝金标条数；指标＝放行错（金标「异」或「存疑」被判确定）、漏放（金标「同」被判存疑）、确定档与旧表一致率。**放行错 0 是硬线**，漏放允许略升但需写明。
- **独立性提醒**：故宫类「库与站同源」样本不作为独立验证（总计划风险表已写），本块不用故宫做金标。

## 六、与其他块的接口
| 方向 | 对方块／负责人 | 文件／格式 | 何时交接 | 对方已确认？ |
|---|---|---|---|---|
| 输入 | A／Silas | `口径.md`（types、group／id 命名、藏本上限、physical 与 provenance 分工） | 步 7 开工前；步 1–6 按附录提案先做 | 待（Silas 定稿后对齐） |
| 输入 | C／Silas＋Sabine | `先后规则.md`（哪些 Work 暂不挂：录入／去重未完） | 步 7；引擎提供 `--exclude-works FILE` 钩子 | 待 |
| 输入 | #580／Sasha | `dynasty_reign_keys.json`／`政权映射.tsv`；异体字表归属（Q1） | 步 3 前 | 待（直接 send_message 问 Sasha／Soren） |
| 输出 | E1–E4 | `matches.tsv`（2.3）＋`README.md`＋`write_plan.jsonl` | 步 6 完成起，E 块用 | 待 |
| 输出 | F／Sol、Selene | `matches.tsv` 的 `evidence`、`reason_codes` 可用于分层抽检 | 步 6 | 待 |
| 输出 | Marlowe | 排班登记：本块只读 book-index，不占写域 | 步 1 前一行 | 待 |

## 七、风险与未决
- **最可能出错的一处**：统一归一后，三源在**同一题名上对异体的松紧不一**——例如国書的日文新字体折叠比国图更宽，合并后国图原本分得开的两书被折成同键，导致「确定」档的 `W_UNIQUE` 错判或出现新的同题多 Work。**防线**：步 2 要求新旧归一键差异逐条分类、回退为 0；步 6 的②项把「新判确定而旧非确定」全部抽检；确定档四条充分条件缺一降级，不靠归一松紧单独放行。
- 异体字权威表归哪份（Q1，问 Sasha／Soren）：`match_variants.json` 4,355 类 vs `guji_norm.py` 7 字 vs #574 的表；默认做法＝三层叠加、同键冲突**以更保守者**（不合并）为准，并把冲突字对列清单。
- 私有仓权限（`book_index_json`、`book-index-crawler`）：本会话现只挂了 overview，book-index 只读；步 1 前需 Marlowe 放行 `book_index_json` 读权限（Q2）。不通过则只能用卡上数字与分支上的旧脚本，**无法做回归**，需停在步 1。
- 内存与耗时：book-index 150k 文件 Work 索引 + NDL 3 万册，预估 <8 GB、<10 分钟，步 5 实测后写入 README。
- 云端访问不到的站点（HathiTrust 403）不在本块范围；本块不抓站，只读已有 library_data。
- 与旧结果「放行更严」的方向变动属预期（如把旧 GLM 无关的局部标记统一降级），但**必须在回归报告里量化**，不悄悄偏离。

未决事项（发 #583）：Q1 异体字权威表；Q2 `book_index_json` 读权限；Q3 内閣文庫适配器 8b 是否并入 D 块、由我做还是 E4 自做；Q4 引擎放 overview 仓合适吗（默认：放，路径见第一节；否则请 Marlowe 指定）。

## 八、评审
| 日期 | 评审人 | 结论 | 意见 |
|---|---|---|---|
| 2026-10-12 | Silas（项目主力） | 过（带条件） | ①每步输入／验收齐全，放行错 0 为硬线，同意。②Q1：异体表默认「三层叠加、冲突取更保守者、冲突字对列清单」照做；权威归属由 Sasha／Soren 答，答前不阻塞步 2。③Q4：引擎目录改放 `scripts/馆藏资源挂接/match_engine/`，与 stat_res.py 同目录。④Q2、Q3 归 Marlowe：权限不通过则停在步 1；8b 不并入 D 块，E4 开工时再定。⑤步 7 等口径.md，不卡步 1–6。⑥写入前不碰 book-index／book-index-draft，不必登记排班；若要写盘到仓内，先登记。 |
| 10-13 | Marlowe（经理） | 过 | Q2 book_index_json、book-index 等 open-guji／open-guji-core 下仓你自己 add_repo（只读）；Q3 随 Silas：8b 不并入 D 块，E4 开工时再定；Q4 同意并按 Silas 改放 `scripts/馆藏资源挂接/match_engine/`；Q1 按默认先做；步 7 等 A 块口径；步 6 交叉验由 Sol 或 Selene 做，我再点头 |

## 九、与 `口径.md`（K1–K11，db11a1f）对齐记录（2026-10-12 洛杉矶 Everett）
设计无冲突，步 7 / `policy.yaml` 按下表落实（步 1–6 不受影响）：
| 口径 | 落到哪 |
|---|---|
| K1／K2 层级 | 引擎只出 Work 层 `write_plan`；Book 层（版本三项齐备且库有该 Book）不自动判，输出 `book_candidate` 标注留给 E 块人工；不新建 Book／Work |
| K3／K4 types | `policy.types_for_image=["image"]`；仅站点提供文本才 `["text","image"]`（适配器给 `has_text`）；Work 层绝不出 `physical`（写计划单测） |
| K5 | `write_plan` 不出馆藏记录；`provenance` 不在本块 |
| K6／K7 | `policy.site_id`：nlc→`nlc`、kokusho→`kokusho`、ndl→`ndl`、内閣→`nat-archives-jp`；`policy.group_prefix`：`nlc-`／`kokusho-`／`ndl-`／`naikaku-`；`group_role: origin` |
| K8 | `policy.metadata_keys`：nlc `nlc_fid`；kokusho `kokusho_bid`／`holder`／`iiif_manifest`；ndl `ndl_record`；内閣 `naikaku_file_id`／`request_no`／`extent`；均含 `edition` |
| K9 | `max_items_per_work_per_source=3`，取舍序＝有全本影像＞版本信息明确＞卷数完整；被舍行在 `matches.tsv` 标 `reason_codes=CAP_DROPPED`（新增枚举码） |
| K11 | 只写确定档；丛书／合刻／方志降存疑（已在 tier） |
| 步 7 格式金标 | 口径.md 样例 1–8（Work 层 nlc／kokusho／ndl／nat-archives-jp 各 2 条）用作 `writeplan` 回归：新出 resources 项与库内同 Work 现有项**逐字段相同**（id／types／group／group_role／metadata 键集） |

## 十、设计变更记录
| 日期 | 改了什么 | 为什么 | 影响哪块 | 谁批 |
|---|---|---|---|---|
| 10-12 | Q1 结案：异体表按默认（三层叠加、冲突取保守不合并、冲突字对清单发 Sasha）。`guji_norm.py` 的 NORMALIZE／EXCEPTIONS **只用于朝代／年号名（`era.py`），不用于题名** | Sasha 答复：该表只管年号／朝代名 | 步 2 题名归一只叠 ①OpenCC＋日文新字体 ②`match_variants.json`；步 3 才用 guji_norm | Sasha（异体表）、自 |
| 10-12 | 步 3 键表来源：`dynasty_reign_keys.json`（Edwin 维护，生成 `朝代年号录入/scripts/regen_keys.sh`，交接 `古籍目录/整体设计/专名建档/P4-升格/dynasty_reign_keys-交接.md`）＋`朝代年号录入/政权映射.tsv`；**步 3 前向 Edwin 问 commit 号**（book-index#168 已合，dates 近期仍有小改） | Sasha 答复 | 步 3 | Sasha |
