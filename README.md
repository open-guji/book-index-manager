# book-index-manager

古籍索引数据的存储、读写、校验与迁移工具。提供 Python 和 TypeScript 两套库，接口完全对齐。

- `book_index_manager/`：Python 包，`book-index` CLI（reindex / promote / check-index …）
- `ui/`：npm 包 **`book-index-ui`**——网站索引页的全部 React 组件（详情页在 `ui/src/components/detail/`），见 [ui/README.md](ui/README.md)

网站、部署、数据仓三者的全貌见 overview 仓 `项目进展/古籍索引网站/2026-09-网站交接手册.html`（[线上版](https://claude.ai/code/artifact/0b4a9456-eaf9-4f4c-9e2d-72bba9f4e5c8)）。

## 设计文档

- **ID Schema 规范**：[设计文档/古籍索引/索引ID.md](D:/workspace/overview/设计文档/古籍索引/索引ID.md)（Snowflake 位布局、type 枚举、base36 编码、合法性约束、迁移历史）
- **录入规范**：[项目进展/古籍索引网站/整体设计/录入规范.md](D:/workspace/overview/项目进展/古籍索引网站/整体设计/录入规范.md)（Work/Book/Collection 字段定义、命名规则、关系字典）

## 安装

```bash
pip install -e .          # Python
npm install book-index-ui  # TypeScript
```

## 架构

```
BookIndexManager (Facade API)
  └── Storage (多后端)
        ├── LocalStorage    — 本地文件系统（Python / Node / VS Code 扩展）
        ├── GithubStorage   — GitHub 只读 + jsDelivr CDN fallback（浏览器）
        ├── BundleStorage   — 同域预打包 JSON（kaiyuanguji-web 生产：COS current/ + v/{commit}/search/）
        └── DevApiStorage   — Vite dev 中间件 /api/*（仅 ui/ 的本地测试页，不导出）
```

## 模块对照

| 功能 | Python | TypeScript |
|---|---|---|
| Manager | `manager.py` | `core/manager.ts` |
| Storage 接口 | `storage_base.py` | `storage/types.ts` |
| 本地存储 | `storage.py` | `storage/local-storage.ts` |
| GitHub 存储 | `storage_github.py` | `storage/github-storage.ts` |
| ID 生成 | `id_generator.py` | `core/id-generator.ts` |
| Schema 校验 | `schema.py` | `core/schema.ts` |
| Bid 链接 | `bid_link.py` | `core/bid-link.ts` |
| 异常 | `exceptions.py` | `core/exceptions.ts` |
| 迁移 | `migration.py` | — |
| 配置 | `config.py` | — |

## Manager API

| Python | TypeScript |
|---|---|
| `generate_id(type, status)` | `generateId(type, status)` |
| `encode_id(id_val)` | `encodeId(idVal)` |
| `decode_id(id_str)` | `decodeId(idStr)` |
| `save_item(metadata)` | `saveItem(metadata)` |
| `get_item(id_str)` | `getItem(idStr)` |
| `find_item_path(id_str)` | `findItemPath(idStr)` |
| `update_field(id_str, key, content)` | `updateField(idStr, key, content)` |
| `delete_item(id_str)` | `deleteItem(idStr)` |
| `rebuild_indices()` | `rebuildIndices()` |
| `get_asset_dir(id_str)` | `getAssetDir(idStr)` |
| `init_asset_dir(id_str)` | `initAssetDir(idStr)` |
| `has_asset_dir(id_str)` | `hasAssetDir(idStr)` |

## CLI (Python)

```bash
book-index gen-id --type book --status draft
book-index get --bid <ID> --root <path>
book-index draft "书名" --type work --root <path>
book-index save - --root <path>
book-index update --bid <ID> --key title --value "新标题" --root <path>
book-index delete --bid <ID> --root <path>
book-index reindex --root <path> --target all        # 全量重写 index/，能清孤儿；改了 extractor 后必跑
book-index shadow-reindex --root <path> --target all # 增量：只补 item 有、index 无的，不删孤儿（日常用）
book-index check-index --root <path> --target official
book-index promote <draft-id>... --root <path> [--dry-run]   # draft → production 升格（换新 ID、写 tombstone、维护 promotions.json）
book-index validate-promotions --root <path>
book-index validate-lineage --root <path> [--work-id <ID>]
book-index add-resource --bid <ID> --name ... --url ... --type text|image --root <path>
book-index get-config --root <path>
book-index parse-id <ID>
book-index migrate --root <path> --target draft
book-index init-asset --bid <ID> --root <path>
```

`--root` 指 **workspace 父目录**（如 `D:/workspace`），三个数据仓在其下；传成某个仓会静默报 Item not found。
含中文的 metadata 走 Python API 写入，别经 CLI 参数（Windows 控制台编码）。

## 用法

### Python

```python
from book_index_manager import BookIndexManager, BookIndexType, BookIndexStatus

manager = BookIndexManager("/path/to/workspace")
manager.save_item({"title": "史記", "type": "work"})
metadata = manager.get_item("CXEAWw4ToyR")
```

### TypeScript

```typescript
// 含 React 组件
import { BookIndexManager, GithubStorage, LocalStorage } from 'book-index-ui'
// 仅数据层（无 React）
import { BookIndexManager, GithubStorage } from 'book-index-ui/storage'
```

## 存储结构

```
{workspace}/
├── book-index/          # Official：只存元数据
│   ├── Work|Book|Collection|Entity/{c1}/{c2}/{c3}/{ID}-{名称}.json
│   ├── index/{works,books,entities}/{0-f}.json + index/collections.json   # 真正的索引
│   └── index.json       # 废弃残留，勿读
├── book-index-draft/    # Draft：同上 + promotions.json
└── book-text/           # 文本资产（2026-08-26 拆出）：整理本 / 辑佚 / 全文
    └── Work/{c1}/{c2}/{c3}/{ID}/collated_edition/{index.json, juan/NNN.json, text/*.md}
```

- `{c1}/{c2}/{c3}` 取 ID **尾**三字符（2026-08-25 起），三仓共用 `storage.shard_dirs()`；由 id 推路径一律经它，勿自拼。
- ID 为 Snowflake + **base36**（base58 只保留兼容解码）。
- 两个元数据仓之下**再无资产目录**：`get_asset_dir()` 指向 book-text。写进元数据仓的整理本网站打包器不收、线上 404。
- 索引条目由 Python `entry_extractor.py` 与 TS `ui/src/core/storage.ts` 各写一份，**加字段两侧必须同步**，否则 reindex 会把字段抹掉。

## 许可

Apache 2.0
