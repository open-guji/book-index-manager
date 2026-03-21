# book-index-manager

古籍索引数据的存储、读写、校验与迁移工具。提供 Python 和 TypeScript 两套库，接口完全对齐。

## 安装

```bash
pip install -e .          # Python
npm install book-index-ui  # TypeScript
```

## 架构

```
BookIndexManager (Facade API)
  └── Storage (多后端)
        ├── LocalStorage   — 本地文件系统
        └── GithubStorage  — GitHub 只读 (CDN fallback)
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

## CLI (Python)

```bash
book-index gen-id --type book --status draft
book-index get --bid <ID> --root <path>
book-index draft "书名" --type work --root <path>
book-index save - --root <path>
book-index update --bid <ID> --key title --value "新标题" --root <path>
book-index delete --bid <ID> --root <path>
book-index reindex --root <path> --target all
book-index parse-id <ID>
book-index migrate --root <path> --target draft
```

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
├── book-index/          # Official
│   ├── Book/{c1}/{c2}/{c3}/{ID}-{名称}.json
│   ├── Collection/...
│   ├── Work/...
│   └── index.json
└── book-index-draft/    # Draft (同上)
```

## 许可

Apache 2.0
