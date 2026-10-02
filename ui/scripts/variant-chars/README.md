# 异体字归一表（overview#350）

`src/i18n/variant-chars.json`：异体字 → 正字（繁体写法）。简体模式下先按它归一，再走 opencc t2cn；
繁体模式不用，原文照原样显示。网站服务端（`lib/server/simplify.ts`）与检索边缘函数通过
`book-index-ui/variant-chars.json` 引同一张表，不另存副本。

**不要手改 json**，改口径就改 `build.py` 再重新生成。

## 怎么生成

```bash
# 数据：book-text 正文、Unicode Unihan（https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip）、
#       cjkvi-variants（https://github.com/cjkvi/cjkvi-variants，含教育部异体字字典 twedu 等对照）
python3 scripts/variant-chars/build.py --book-text ../../book-text \
    --unihan /path/to/Unihan --cjkvi /path/to/cjkvi-variants \
    --out src/i18n/variant-chars.json --report /tmp/variant-report.tsv
```

## 口径

1. 统计 book-text 全部 `.md`／`.txt` 正文里每个汉字的出现次数，逐字过 t2cn；转完仍不在
   「通用规范汉字表（Unihan kTGH，8105 字）∪ GB2312」里的，记为简体模式下的残留字。
2. 给残留字找正字，来源按优先级：教育部异体字字典（twedu）＞汉语大字典（hydzd）＞ Unihan kZVariant ＞ cjkvi ＞
   日本字形表（JIS X 0213、户籍统一文字、常用／人名用汉字）。同一来源给出的正字转简体后须唯一，否则不收。
3. 只收：出现 ≥1000 次；本身**不是** Big5 常用繁体字（Big5 里的「異體」多半另有字义，如「抬」「雰」「妳」）；
   不在人工剔除名单里（`EXCLUDE`：「嘅」「啇」「䍦」「卨」「籕」）。
4. 结果（2026-10-02，book-text 144,084 个文件、9.64 亿字）：简体模式残留 2.09%，收表 753 条，
   覆盖残留出现次数的 74%。没收的多是生僻专字、避讳缺笔字（如「𤣥」）和有独立字义的字。
