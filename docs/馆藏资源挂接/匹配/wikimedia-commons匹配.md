# Wikimedia Commons 图像资源匹配

> 执行日期：2026-09-07
> 脚本：[scripts/match_commons.py](../../../scripts/match_commons.py) + [scripts/write_commons_resources.py](../../../scripts/write_commons_resources.py)
> 数据：`files.jsonl`（152.9万条文件元数据）+ `wikitext.jsonl`（同批文件的 Author/Title 字段）

## 数据来源

`https://tools-static.wmflabs.org/booksearch/{date}/` 下的两个官方聚合数据集：

```
files.jsonl     791MB  152.9万条：pageid/文件名/sha1/mime/所属books/分类/来源
wikitext.jsonl  3.17GB 152.9万条：pageid/wikitext原文/解析出的Author,Title,Source等字段
```

两者按 `pageid` 关联。mime 分布以 `application/pdf`（126万）、`image/vnd.djvu`（26万）为主，
是典型的古籍扫描件格式。`books` 字段归一化后得 24.3万个不重复书名。

## 方法：与 wikisource 同一套（书名精确匹配 + 作者交叉校验）

1. 按归一化书名建候选表：`{normalize(书名): [(pageid,file,mime,sha1,原书名)]}`
2. 我方 Work（无 commons 资源者）书名归一化后查表
3. 一本书通常挂多个文件（分卷/分册/合订），取 wikitext.jsonl 里出现过的所有 Author
   候选，逐个跟我方 authors 用 `author_match_score` 比对，取最高分
4. 代表文件优先级：djvu/pdf（整卷）> 有 Author 字段 > 文件名最短（避开分册号）

首轮结果（未过滤合刊）：候选 25,264，确认 15,058（59.6%），
待查 3,275，拒绝 6,931。抽查 90 条（30+60）全部正确。

## 关键处理：排除"一文件对多书名"

写入前发现 **1,245 个文件被 2 个以上不同书名的 Work 共享**，涉及 4,713 条确认结果。
两种成因：

1. **真合刊丛书**：如「叢書集成新編086.pdf」一册收《天祿閣外史》《墨客揮犀》
   《北夢瑣言》等 32 部笔记小说；「文淵閣四庫全書 1056冊.djvu」收《南華真經新傳》
   《莊子注》《莊子口義》三部庄子注疏。这些书名匹配都不算误配（确实收录在这一册里），
   但 Commons 元数据没有页码/卷次信息能定位到具体某部书的起讫页，写成任何一部书的
   专属资源都会把用户导向一整册几百页的合订本，找不到自己要看的那部分。
2. **我方库内同名重复 Work**：如《湖廣通志》库里有两条不同作者（夏力恕/邁柱）的
   记录，恰好命中同一份四库扫描件——这是我方数据本身的重复著录问题，不该由本轮
   匹配脚本自行判定合并，留给专门的库内去重流程。

**处理**：不区分成因，统一按"该 URL 对应的书名集合大小是否为 1"分流。
`resource 必须指向具体内容`是既有原则——合刊本没有可用的页码/锚点定位手段
（不同于 wikisource 那边可以用 `#锚点` 精确到章节），故只保留单书单文件的部分：

| | 数量 |
|---|---|
| confirmed 总数 | 15,058 |
| 排除（一文件对多书名）| 3,629 |
| **安全写入（一文件对一书名）** | **11,429** |

## 写入结果

- **11,429/11,429 全部成功**，`check-index` 通过
- 资源写法：`id=commons`（不是 wikisource）、`name=维基共享资源`、
  `type=image`（不是 text —— Commons 上是 PDF/DjVu 扫描件，不是转录文字）
- 库中有 commons 资源的 Work：0 → **11,429**（此前从未做过 Commons 匹配）

## 抽查质量

90 条随机抽查（一次30条、一次60条）全部正确。典型：

```
漢書雋 | 我方=陳許廷 | commons=明陳許廷輯並評
篆隸萬象名義 | 我方=釋空海 | commons=（日）释空海撰
百夷傳 | 我方=李思聰 | commons=〔明〕錢古訓撰／〔明〕李思聰撰   ← 双作者合撰，正确校验通过
東南紀事 | 我方=邵廷寀 | commons=(清)邵廷采撰                  ← 唯一发现的形近字差异，寀/采实为同一人
```

拒绝样例经查全部是真·同名异书（如《論語集解》我方孫綽本 vs commons 何晏本），
与 wikisource 匹配发现的同一类陷阱一致。

## 未处理，留作后续

- **3,629 条合刊/重名候选**：需要逐条判断"是否能定位到册内页码范围"，
  能定位的可以像 wikisource 合刊那样标注页码区间再写入；不能定位的应放弃。
  未做，因为需要人工或更精细的 OCR/页码解析，超出本轮范围。
- **3,275 条待查**：多为 OCR 缺字符占位（`〓`、`?`）导致的作者名残缺，
  不像 wikisource 那批能用繁简折简救回多少——这批的差异本身就是数据缺陷，
  不应强行判定。
- **6,931 条拒绝**：抽查显示多为真·同名异书，判定应保留。

## 复现

```bash
cd /d/workspace/overview
python scripts/match_commons.py --sample 500 --out /d/tmp/commons_sample.tsv
python scripts/match_commons.py --out /d/tmp/commons_full.tsv
# 过滤"一文件对多书名"后，写入 write_commons_resources.py
```
