# Internet Archive 批量匹配方案

> 计划日期：2026-04-26  
> 状态：🔧 Step 1 已完成，进入 Step 2

## Step 1 探查结果（2026-04-26）

### API 选型

- ❌ Scrape API（`/services/search/v1/scrape`）：返回 400 Bad Request，调用方式有问题
- ✅ **`advancedsearch.php`**：可用，支持 `q`、`fl[]`、`rows`、`output=json`，但单次最大约 10000 行，需分页

### 收敛到核心 collection

| 查询 | 数量 | 备注 |
|------|------|------|
| `language:chi AND mediatype:texts` | 625,581 | 大量现代书（管理学、英语、儿童等）|
| `language:Chinese AND mediatype:texts` | 90,526 | — |
| `collection:universallibrary` | 119,432 | 大学图书馆联合扫描 |
| **`collection:universallibrary AND identifier:*.cn`** | **78,380** | **🎯 中文古籍扫描，目标数据集** |
| `identifier:*.cn AND mediatype:texts` | 78,386 | 几乎与上面重合 |

### 数据质量（universallibrary + .cn）

✅ **极佳**：
- 标题：繁体中文，完整
- 作者：含朝代标注（如 `(清)奕訢等撰`、`（明）邱濬`）
- subject：四库分类（如 `['四庫全書', '史部', '地理類', '清']`）

⚠️ **关键特征**：
- identifier 形如 `06057628.cn` / `02079478.cn`（数字编号 + .cn）
- **每条记录是单卷或多卷范围**，不是整本书：
  - `欽定四庫全書考證·卷五十七~卷五十八`
  - `熱河志·卷八十二~卷八十五`
  - `資治通鑑補(八十一)`
- 同一本书会有几十到上百条 IA 记录
- **匹配策略**：要去掉卷号后缀（`·卷N`、`(N)`、`卷N~卷M`）再做归并

## 目标

利用 IA 的 Scrape API 一次性拉取所有中文古籍 metadata，建本地索引后与 book-index Work 做批量匹配。

## 候选 collection

| collection | 说明 | 预估规模 |
|-----------|------|---------|
| `chinesebooks` | 通用中文书 | 数万 |
| `chineserarebook` | 中文善本 | ? |
| `universallibrary` | 通用图书馆（含大量中文）| 数十万 |
| `language:chi AND mediatype:texts` | 按语言+类型筛 | 最大集合 |

需先用小 count 探查每个 collection 的实际规模和质量。

## API 用法

### 探查总数
```
GET https://archive.org/services/search/v1/scrape?q=collection:chinesebooks&fields=identifier&count=1
```
响应里有 `total` 字段。

### 批量拉取（游标分页）
```
GET https://archive.org/services/search/v1/scrape
  ?q=collection:chinesebooks
  &fields=title,creator,identifier,date,subject,description
  &count=10000
  &cursor=<上一页返回的 cursor>
```

### 单条详情（按需）
```
GET https://archive.org/metadata/{identifier}
```

## Step 2-3 实测结果（2026-04-26）

### 拉取（脚本：`scripts/fetch_ia_universallibrary.py`）

- **API 选型**：advancedsearch.php 在 page≥3 后返回缺失 `response`（深度限制），必须用 **Scrape API**（`/services/search/v1/scrape`），count 最小 100、最大 10000，靠 cursor 分页
- 8 页拉完全部 **78,380 条**，约 5 分钟
- 输出 `D:/tmp/ia_universallibrary_cn.jsonl`（约 9 MB）

### 匹配（脚本：`scripts/match_ia.py`）

- 关键预处理：剥离卷号后缀 `(N)`、`·卷N(~卷M)`、`·目錄`、`·上中下` 等
- 78380 条 → 归并为 **9180 个基础书名**
- 与 Work 标题精确匹配 + 作者校验

| 维度 | 数量 | 占比 |
|------|------|------|
| 候选总数（书名命中）| 4,180 | — |
| ✅ 作者完全确认 | 2,479 | **59.3%** |
| ⚠️ 待人工核查 | 785 | 18.8% |
| ❌ 拒绝（同名异书）| 916 | 21.9% |

**质量远胜维基文库**：IA metadata 普遍有作者+朝代标注，作者校验准确率高得多。

### 经验

1. **Scrape API count 最小 100**：测试时用 5 会报 `RangeException`
2. **title 字段可能是 list**：部分 IA 记录有多个标题，需 `isinstance(title, list)` 兼容
3. **多卷归并是关键**：同一本书在 IA 有几十到上百个 identifier（如《资治通鉴》1259 条），必须按基础书名归并，再选代表条目作 URL
4. **作者朝代标记需归一化**：IA 写法多变，`(清)`、`（清）`、`(宋)朱熹撰`、`（宋）朱鑑` 等
5. **同名异书是 IA 主要噪音**：21.9% 的拒绝率，靠作者校验筛掉

## Step 4 实测结果（2026-04-26）

| 批次 | 候选 | 新增写入 | 已存在(skip) |
|------|------|----------|-------------|
| 作者完全确认 | 2,479 | 1,717 | 762 |
| 作者部分匹配（字形变体） | 135 | 96 | 39 |
| 双方均无作者 | 38 | 38 | 0 |
| **合计新写入** | | **1,851** | |

写入参数：
- URL: `https://archive.org/details/{identifier}`
- resource id: `internet-archive`
- name: `Internet Archive`
- type: `image`（IA 主要是扫描影印）

已知未处理（650 - 38 = 612 条无作者的"待核查"）：
- IA 有作者、我方无作者（595 条）：可作为反向补全 Work 作者的种子，待后续任务
- 我方有作者、IA 无作者（13 条）：太少，可人工核查
- 拒绝 916 条：多为同名异书，应保留拒绝判定

## Step 5：扩展 collection 探查（2026-04-26）

universallibrary 之外是否还有更多古籍？用知名古籍扫描 + collection 候选探查。

### 探查结果

| collection | 总数 | 中文 | 古籍年代(1500-1920) | 是否真古籍 |
|-----------|-----:|-----:|--------------------:|----------|
| **universallibrary** ✅已用 | 119k | — | — | ✅ 主要数据源 |
| **chengyutung** | 19,838 | 17,105 | **4,611** | ✅ 多伦多大学郑裕彤东亚图书馆，明清原刻 |
| ealmucollection | 5,022 | 5,020 | 4,532 | ✅ 与 chengyutung 大量重叠 |
| eastasia-periodicals | 451k | 402k | 73,945 | ❌ 民国近代报刊（中央日报、字林沪报） |
| zilin-hubao-archive | 4,523 | 4,523 | 4,523 | ❌ 单一报纸 |
| booksbylanguage_chinese | 32,947 | 12,615 | — | ❌ 大学手册、政府文件、当代杂物 |
| getty | 74,154 | 282 | 274 | ⚠️ 量小，需细看 |
| smithsonian | 12,716 | 42 | 42 | ⚠️ 量小 |
| cornell/columbia/harvard/yale 等 | — | <50 | — | ❌ 这些大学不用 IA 的 collection 命名空间 |

### 关键发现

1. **`chengyutung`（多伦多大学）4,600 条古籍**是值得做的二级数据源
2. **致命问题**：chengyutung 的 title 字段**全是拼音**（`Su Dongpo shi ji zhu`），没有 `title_alt`/`title_alternative` 中文字段
3. 直接书名匹配不可能；需要做拼音转写对比（"蘇東坡詩集注" → `su dongpo shi ji zhu`）
4. eastasia-periodicals 虽然条目数巨大，但是民国报刊，与 Work 体系不匹配
5. booksbylanguage_chinese 名字误导，实际是当代杂物

### 后续任务（待评估）

1. ~~chengyutung 拼音匹配~~ ✅ 已完成（见下）
2. **eastasia-periodicals**：与古籍 Work 无对应，**不做**
3. **booksbylanguage_chinese**：当代杂物，**不做**

## Step 6：chengyutung 拼音匹配（2026-04-26）

### 数据

- 17,105 条 chengyutung 中文古籍 metadata（拉自 IA）
- 标题全为大陆汉语拼音（不是 Wade-Giles），如 `Su Dongpo shi ji zhu`、`Pei wen yun fu`
- 作者格式：`Lü, Ssu-mien, 1884-1957`、`Zhu, Cuiting, chong ding`

### 算法

- Work 标题 → pypinyin 转所有可能拼音变体（含多音字），归一化（小写、去标点空格）
- IA 标题 → 去 `: xxx juan` 副标题 → 同样归一化
- 拼音串完全相等即命中
- 作者校验：解析 IA creator（去年份、去角色后缀），子串匹配

### 结果

| 类别 | 数量 | 写入 |
|------|------|------|
| 拼音 + 作者完全确认 | 70 | 70 |
| work 无作者（书名唯一）| 47 | 47 |
| IA 无作者 | 54 | 暂不写 |
| 作者不符（同名异书）| 30+ | 拒绝 |
| **新写入** | | **88**（29 已存在）|

### 关键经验

1. **致命 BUG**：第一版 normalize_pinyin 用 `re.sub(r'[\s\-_,;:.\'"\\(\\)\\[\\]/]+', '', s)` 因双重转义未去空格，匹配率仅 1/13。改为 `re.sub(r'[^a-z0-9]+', '', s)` 后命中数从 1 → 70。**教训：复杂正则要测**
2. chengyutung 17105 条只归并出 714 个基础书名（同书几十个分卷）
3. IA 拼音用大陆方案（`zhuan` 而非 `chuan`），与 pypinyin 默认 `chuan` 冲突 → 必用 heteronym 取所有读音
4. 作者拼音匹配用 substring（`liushi` ⊃ `liu`）而非精确，因为 Work 作者只有姓名而 IA 含字号、年份
5. 命中数低（70）是因为 chengyutung 库本身藏书量小（714 个独立书）且与我们已索引的 Work 重叠不大

---

## 计划步骤（已完成 Step 1-3）

### Step 1：探查与采样（30 分钟）

- 对 4 个候选 collection 各拉前 50 条，看：
  - 总数
  - 标题质量（是否中文、是否古籍）
  - 作者字段是否存在
  - 与 book-index 的 Work 标题是否能匹配上几条
- 输出 `ia_探查报告.md`

### Step 2：全量拉取（1-3 小时）

- 选定最有价值的 1-2 个 collection，拉全量 metadata
- 字段：`identifier, title, creator, date, language, subject, description`
- 存为 `D:\tmp\ia_chinese_books.jsonl`

### Step 3：本地匹配（30 分钟）

- 仿照 `match_wikisource.py` 写 `match_ia.py`
- 书名匹配 + 作者校验
- 输出 `ia_verified.tsv`（confirmed / uncertain / rejected）

### Step 4：批量写入

- 用 `book-index add-resource --id internet-archive` 批量写入
- URL 格式：`https://archive.org/details/{identifier}`
- 注意：IA 同一本书可能有多个版本（不同上传者扫描），需要去重或选最佳

## 已知挑战

1. **同名异书**：IA 上同一书名可能有多个上传者，作者校验是关键
2. **标题繁简混杂**：IA 上的中文标题大小写、繁简、夹注都不规范
3. **作者字段不规范**：可能是上传者，不是真正作者
4. **重复书目**：同一本书的多个扫描版本，需选画质最好/页数最全的

## 风险与对策

| 风险 | 对策 |
|------|------|
| Scrape API 限流 | 加 sleep；每页 10000 条已经很大 |
| 数据量超大（>10 万条）| 先按 subject 过滤；只取 mediatype=texts |
| 匹配率低 | 用维基文库类似的多轮校验策略 |
| 资源指向版本而非 Work | URL 用 `/details/{id}` 即可，每条 IA 项目对应一个版本 |

## 与现有数据的关系

- IA 上很多是**影印本扫描**，与识典/维基文库的**录入文本**互补
- 建议 `type` 字段标为 `text+image`（两者皆有）
- 考虑增设 resource id 子类别，如 `internet-archive-scan`

## 输出文件位置

```
D:\tmp\ia_探查样本.json           # Step 1 输出
D:\tmp\ia_chinese_books.jsonl     # Step 2 全量数据
D:\workspace\overview\ia_verified.tsv  # Step 3 匹配结果
```
