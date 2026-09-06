# book-index-manager

## 语言
- 始终使用中文进行交流和输出

## 简介
古籍索引数据的存储、读写、校验、迁移工具。从 guji-platform 提取独立化，同时供 kaiyuanguji-web 复用。

## 项目结构

```
book-index-manager/
├── book_index_manager/       # Python 包
│   ├── __init__.py           # 公开 API
│   ├── __main__.py           # CLI 入口 (book-index 命令)
│   ├── schema.py             # ResourceEntry 定义、校验、URL→ID 提取
│   ├── migration.py          # 旧格式迁移 (text_resources/image_resources → resources)
│   ├── storage_base.py       # Storage 抽象接口
│   ├── storage.py            # 文件系统存储 (save/load/index)；shard_dirs() 三仓共用
│   ├── storage_github.py     # GitHub 只读后端
│   ├── entry_extractor.py    # metadata → index 条目（与 ui/src/core/storage.ts 必须同步）
│   ├── promotion.py          # draft → production 升格（换 ID、tombstone、promotions.json）
│   ├── manager.py            # 高层 Facade API (BookIndexManager)
│   ├── id_generator.py       # Snowflake + base36 ID 生成（base58 仅兼容解码）
│   ├── bid_link.py           # bid:// 链接解析
│   ├── config.py             # 配置管理
│   ├── logger.py             # 日志
│   └── exceptions.py         # 异常定义
├── scripts/                  # 批处理脚本（update_has_collated 等）
├── tests/                    # pytest（189）
├── ui/                       # npm 包 book-index-ui：网站索引页全部 React 组件（详情页在 src/components/detail/）
└── pyproject.toml            # 包配置
```

## 数据存储位置
- 元数据在 `D:\workspace` 下的 `book-index/`（生产）与 `book-index-draft/`（草稿）；文本资产在 `book-text/`（整理本、辑佚、全文，2026-08-26 拆出）
- 三层目录结构：`{Type}/{c1}/{c2}/{c3}/{ID}-{名称}.json`，`c1..c3` 取 ID **尾**三字符（`storage.shard_dirs()`，三仓共用）
- ID 体系：Work / Book / Collection / Entity 四类，Snowflake 64-bit + **base36** 编码；规范见 `book-index-draft/SCHEMA.md`
- CLI `--root` 指 `D:\workspace` 这个父目录，不是某个仓

## UI 组件设计
详见 [ui/README.md](../ui/README.md)。[ui/DESIGN.md](../ui/DESIGN.md) 描述的是 2026-09 版式重构**之前**的 `IndexDetail` 架构，只看「设计原则」与 CSS 变量两节。
现行详情页 = `ui/src/components/detail/` 四个 Page + `primitives.tsx` + `core/detail-model.ts`，外壳是 `BookDetailLayout`。

## 关联项目
- **guji-platform**（`D:\workspace\guji-platform`）：VS Code 插件，调用本包的 Python 模块和 React 组件
- **kaiyuanguji-web**（`D:\workspace\kaiyuanguji-web`）：古籍网站，从 npm 装本包（`book-index-ui`）。发布顺序：先 `npm publish` 本包，再在网站仓 bump 依赖与 e2e 同批推

## 交接手册
全貌见 overview 仓 `项目进展/古籍索引网站/2026-09-网站交接手册.html`（[线上版](https://claude.ai/code/artifact/0b4a9456-eaf9-4f4c-9e2d-72bba9f4e5c8)）。
