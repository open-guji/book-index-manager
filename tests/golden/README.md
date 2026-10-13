# 黄金样例（entries.json）

`entries.json` 是 `entry_extractor.build_index_entry`（Python）与 `ui/src/core/storage.ts` 的
`buildIndexEntry`（TS）的**共享对拍向量**：两侧测试读同一份文件，逐例要求
`build(record) == expect_index_entry`。

格式（overview#568 Eric 10-12 定）：`[{name, type, record, expect_index_entry, negative}]`；
`type` 取 Book／Work／Collection／Entity；`path` 取 `expect_index_entry.path`；`negative: true`
的是旧写法记录，`expect_index_entry` 里**不得**出现由旧字段推出的值。

- 本文件是 B4 先行落地的**临时副本**，正本归 B6（book-index `tests/golden/entries.json`）。
  B6 交付后：把正本拷到此处，并在此写来源 book-index sha；只改加载器，不改用例。
- 对拍口径以 Python 为准（`build_index_entry` 与 book-index `build_derived.index_entry` 逐字对齐）。
