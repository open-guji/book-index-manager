# book-index-manager

古籍索引数据的存储、读写、校验与迁移工具。

## 安装

```bash
pip install -e .
```

## CLI 用法

```bash
# 生成新 ID
book-index gen-id --type book --status draft

# 查询条目
book-index get --bid CXEAWw4ToyR --root /path/to/workspace

# 创建草稿
book-index draft "欽定四庫全書總目提要" --type work --root /path/to/workspace

# 保存元数据 (JSON 字符串或 stdin)
echo '{"title": "史記", "type": "work"}' | book-index save - --root /path/to/workspace

# 迁移旧格式 (text_resources/image_resources → resources)
book-index migrate --root /path/to/workspace --target draft --dry-run
book-index migrate --root /path/to/workspace --target draft

# 重建索引
book-index reindex --root /path/to/workspace --target all

# 解析 ID
book-index parse-id CXEAWw4ToyR
```

## Python API

```python
from book_index_manager import BookIndexManager, BookIndexType, BookIndexStatus

manager = BookIndexManager("/path/to/workspace")

# 生成 ID
id_val = manager.generate_id(BookIndexType.Book, BookIndexStatus.Draft)
id_str = manager.encode_id(id_val)

# 保存
manager.save_item({"title": "史記", "type": "work"})

# 查询
metadata = manager.get_item("CXEAWw4ToyR")

# 更新字段
manager.update_field("CXEAWw4ToyR", "resources", [
    {"id": "wikisource", "name": "维基文库", "url": "...", "type": "text"}
])
```

## Resource Schema

```json
{
  "id": "wikisource",
  "name": "维基文库",
  "url": "https://zh.wikisource.org/wiki/...",
  "type": "text",
  "root_type": "catalog",
  "structure": ["册", "卷"],
  "coverage": { "level": 1, "ranges": "2,3,5-8" },
  "details": "完整电子文本"
}
```

类型：`text` | `image` | `text+image` | `physical`

## 许可

Apache 2.0
