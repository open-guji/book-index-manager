# 资源来源站点目录 (Source Catalog)

## 概述

`source-catalog.json` 是古籍数字资源来源站点的元数据库。`Book.resources` / `Work.resources` 里每条 `resource.id` 都应该是本表中某个 `source.id`。

文件位置：`book-index-manager/source-catalog.json`（仓库顶级）。本仓既是 Python 包又承担 UI 静态资产，UI / 各 skill / bookget-py / book-index-draft 都可通过本路径或包导出读取。

## 与现有 `resource-*.json` 的区别

| 文件 | 用途 |
|---|---|
| `book-index-draft/resource.json`、`resource-catalog.json`、`resource-collection.json`、`resource-site.json` | **录入工作进度**跟踪表（哪本志书 / 哪个丛编录了多少 Work） |
| `book-index-manager/source-catalog.json` | **站点元数据库**（站点本身的属性，跟具体录入工作无关） |

两者职责分离，不重复。

## Schema

```json
{
  "version": "1.0",
  "updated_at": "YYYY-MM-DD",
  "tier_definitions": { "<1-5>": { "label", "description", "default_policy", "import_strategy" } },
  "policy_definitions": { "<policy>": "<含义>" },
  "sources": [ <SourceEntry> ]
}
```

### SourceEntry

```json
{
  "id": "string (短 id，作为 Book.resources[].id 的主键。kebab-case 或简洁单词)",
  "name": "string (显示名)",
  "url": "string (站点入口 URL)",
  "description": "string (optional)",

  "tier": 1 | 2 | 3 | 4 | 5,
  "policy": "preserve | mirror | download_only | drop",

  "access": {
    "from_cn": "bool (国内能否直接访问)",
    "from_intl": "bool (海外能否访问)",
    "needs_login": "bool (浏览/下载是否需要登录)",
    "notes": "string (optional, 访问条件补充)"
  },
  "download": {
    "supported": "bool (是否支持机械下载)",
    "method": "direct | api | iiif | scraping | openlist_api | manual",
    "speed_kbps_typical": "number | null (典型单连接速度，KB/s)",
    "notes": "string (optional)"
  },
  "bookget": {
    "supported": "bool (是否有 bookget-py adapter)",
    "adapter_name": "string | null (bookget/adapters/ 下的文件名 stem)"
  },

  "examples": ["string (URL 模式或样本，可选)"],
  "notes": "string (optional, 整体备注)"
}
```

## Tier 分级

资源来源按可信度 / 稳定性 / 收录优先级分 5 个 tier。每个 tier 有默认 policy；个别站点可覆盖。

| tier | 名称 | 例子 | 默认 policy | 录入策略 |
|---|---|---|---|---|
| 1 | 原图书馆 / 官方来源 | 国图、北大、台图 NCL、哈佛燕京、京都大学、NDL | `preserve` | **全收**（有多少录多少） |
| 2 | 国外可访问资源库 | Internet Archive、Wikimedia Commons、HathiTrust、Europeana | `preserve` | 都录入；若 1-4 全无，从 5 下载后传 IA 作镜像 |
| 3 | 国内稳定下载站 | 书格、识典古籍、CText、维基文库 | `preserve` | **录一个最好的**（择优，不重复） |
| 4 | 自家备份 | 百度网盘 | `mirror`（条件） | tier 3 已有则不备份；tier 3 缺失才备份并放分享链接 |
| 5 | 杂源 / 灰色 / 私人盘 | Anna's Archive、z-library、论坛、天一生水 | `download_only` | **不收录**到 Book.resources，仅用于内部下载工作流 |

## Policy 定义

| policy | 含义 |
|---|---|
| `preserve` | 直接录到 `Book.resources`，保留原始 URL |
| `mirror` | 我们做的镜像，通过 `group` 字段绑到原始 resource；带 `group_role=mirror` |
| `download_only` | 仅作为内部下载工作流来源，**不**写入 `Book.resources` |
| `drop` | 已有更优替代或不再合适收录，老条目应清理 |

> Note: policy 是面向新增条目的指引。现存 Book.resources 中不符合 policy 的历史条目不强制改写，可在专项整理时（如版本谱系梳理）逐步清理。

## 与 Book.resources 的关系

```
Book.resources[i].id  ──查找──>  source-catalog.json/sources[].id
Book.resources[i].group ─同源镜像─> 其他 resources[i].group (相同值)
```

UI 渲染：
1. 用 `resource.id` 查 source-catalog 拿 site name / icon / from_cn 标记
2. 按 `resource.group` 把 resources 分桶；每桶显示 `group_label` + 镜像列表

## 添加新站点

1. 在 `sources[]` 增加一条；id 唯一
2. 设置 tier / policy（policy 默认跟随 tier，如要 override 写明）
3. 测一次访问性 / 下载性，填 access / download 字段
4. 如要做 bookget adapter，加 `bookget.supported=true` + `adapter_name`，去 `bookget-py/bookget/adapters/` 写实现
5. `updated_at` 改成今天
6. 用 `/curate-source-catalog` skill 复核
