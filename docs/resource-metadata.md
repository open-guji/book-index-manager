# 资源元数据 (Resource Metadata) 录入规范

## 概述

`ResourceEntry.metadata` 是一个 `Record<string, string>` 的键值对字段，用于存放结构化的资源补充信息。相比 `details` 自由文本，`metadata` 提供统一的字段名和中文显示名，便于展示和检索。

## 字段定义

| Key | 中文显示名 | 说明 | 值示例 |
|-----|----------|------|--------|
| `edition` | 版本 | 书籍的版本名称 | 百衲本、武英殿本、文渊阁本 |
| `quality` | 资源质量 | 数字化文本的校勘程度 | 粗校、精校、未校 |
| `image_source` | 影像来源 | 影像的类型或来源说明 | 黑白掃描版、彩色影印、高清彩色 |
| `team` | 所属团队 | 数字化工作的负责团队 | 北大-字节人文开放实验室 |
| `publisher` | 出版社 | 影印本或整理本的出版社 | 上海古籍出版社、中华书局 |
| `year` | 出版年份 | 出版或影印年份 | 1981、1990-1998 |
| `format` | 格式 | 数字资源的文件格式 | DjVu、PDF |
| `note` | 备注 | 其他补充说明 | 缺第16-20册、仅下册 |

## 使用规则

### 1. metadata 与 details 的分工

- **metadata**：存放可以结构化的信息，使用上表中定义的英文 key
- **details**：存放无法归入上述字段的描述性文字（如"图文对照，可按卷浏览和检索"）
- 如果信息可以拆分到 metadata，优先使用 metadata，不要重复写入 details

### 2. 避免重复信息

- 作者、朝代等已在 Book/Work 主体中记录的信息，不要重复写入 `details` 或 `metadata`
- 例如：`"details": "（东汉）班固、顏師古"` 是冗余的，应删除

### 3. quality 值规范

| 值 | 含义 |
|----|------|
| 未校 | 原始 OCR 结果，未经人工校对 |
| 粗校 | 经过初步校对，仍可能有错误 |
| 精校 | 经过仔细校对，质量较高 |

### 4. image_source 值规范

| 值 | 含义 |
|----|------|
| 黑白掃描版 | 黑白扫描或胶片翻拍 |
| 彩色影印 | 彩色影印或扫描 |
| 高清彩色 | 高分辨率彩色扫描 |

### 5. 扩展新 key

如需添加新的 metadata key：
1. 在 `ui/src/types.ts` 的 `RESOURCE_METADATA_LABELS` 中添加映射
2. 在 `docs/resource-metadata.md`（本文件）中补充说明
3. key 使用小写英文 + 下划线命名（snake_case）

## JSON 示例

```json
{
  "id": "shidianguji",
  "name": "识典古籍",
  "url": "https://www.shidianguji.com/book/SK0000A",
  "type": "text+image",
  "metadata": {
    "edition": "百衲本",
    "quality": "粗校",
    "image_source": "黑白掃描版",
    "team": "北大-字节人文开放实验室"
  }
}
```

```json
{
  "id": "jiangyu",
  "name": "天一生水",
  "url": "https://example.com/...",
  "type": "image",
  "metadata": {
    "publisher": "上海古籍出版社",
    "year": "1981",
    "image_source": "黑白掃描版"
  }
}
```

## 代码位置

- Python 定义：`book_index_manager/schema.py` → `ResourceEntry.metadata`
- TypeScript 类型：`ui/src/types.ts` → `ResourceEntry.metadata`
- 中英文映射：`ui/src/types.ts` → `RESOURCE_METADATA_LABELS`
- 只读展示：`ui/src/components/ResourceList.tsx`
- 编辑器：`ui/src/components/ResourceEditor.tsx`
