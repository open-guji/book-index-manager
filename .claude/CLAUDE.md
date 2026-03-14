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
│   ├── storage.py            # 文件系统存储 (save/load/index)
│   ├── manager.py            # 高层 Facade API (BookIndexManager)
│   ├── id_generator.py       # Snowflake + Base58 ID 生成
│   ├── bid_link.py           # bid:\\ 链接解析
│   ├── config.py             # 配置管理
│   ├── logger.py             # 日志
│   └── exceptions.py         # 异常定义
├── tests/                    # 测试
├── ui/                       # React 组件库 (待开发)
└── pyproject.toml            # 包配置
```

## 数据存储位置
- 索引数据在 `\\wsl.localhost\Ubuntu\home\lishaodong\workspace` 下的 `book-index/` 和 `book-index-draft/`
- 三层目录结构：`{Type}/{c1}/{c2}/{c3}/{ID}-{名称}.json`
- ID 体系：Work → Collection → Book，Snowflake 64-bit + Base58 编码

## 关联项目
- **guji-platform**：VS Code 插件，调用本包的 Python 模块进行索引管理
- **kaiyuanguji-web**：古籍网站，将复用本包的 React 组件
