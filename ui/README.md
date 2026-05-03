# book-index-ui

`book-index-manager` 的 React 组件库 + 存储客户端，发布为 npm 包 `book-index-ui`。
配合 [book-index-manager](https://github.com/open-guji/book-index-manager) 的 Python CLI 一起使用。

```bash
npm install book-index-ui
```

## 包结构

两个独立入口：

```ts
import { ... } from 'book-index-ui'          // React 组件 + 类型 + 数据层
import { ... } from 'book-index-ui/storage'  // 仅数据层（无 React，体积小，适合 Node/Worker）
import 'book-index-ui/styles'                // CSS（用到组件时引入）
```

## 主要 export

### React 组件

| 组件 | 用途 |
|---|---|
| `IndexBrowser` | 完整索引浏览器：搜索框 + 分类 tab + 推荐 + 最近浏览 |
| `IndexView` | 单条目详情视图（基于 ID 拉数据 + 渲染） |
| `IndexDetail` | 详情视图的纯渲染（已有 detailData 时用） |
| `IndexEditor` | 详情编辑器（写入需 storage 实现 saveItem） |
| `HomePage` | 首页：推荐丛编 + 经典作品（kaiyuanguji-web 用） |
| `CollatedEdition` | 整理本（collated_edition）阅读 + 全文搜索 |
| `CollectionCatalog` | 丛编目录（按册/卷分组） |
| `EmendatedBySection` | "校勘自" 引用列表 |
| `VersionLineageView` / `VersionLineageGraph` | 版本传承图（dagre + xyflow） |
| `FeedbackButton` / `FeedbackList` / `FeedbackForm` | 反馈组件 |
| `LocaleProvider` / `LocaleToggle` | 繁简切换 |
| `useT` / `useConvert` | 繁简 hook |

### 数据层（`book-index-ui/storage`）

| 类 | 用途 |
|---|---|
| `BookIndexManager` | Facade：统一 `getItem/saveItem/deleteItem/generateId/...` |
| `BookIndexStorage` | 本地文件系统实现（Node / Electron） |
| `GithubStorage` | GitHub 只读 + jsdelivr CDN fallback（浏览器/CI 用） |
| `BundleStorage` | 同域预打包数据读取（kaiyuanguji-web 生产模式） |
| `LocalStorage` | `BookIndexStorage` 的薄包装（兼容历史 API） |
| `IndexStorage` | 接口（自实现自定义后端时实现它） |

数据层还导出 `encodeId / decodeId / smartDecode / extractType / shardOf / scoreEntry / rankByRelevance / cleanName` 等纯函数工具。

### 类型

`IndexEntry` / `IndexDetailData` / `WorkDetailData` / `BookDetailData` / `CollectionDetailData` / `EntityDetailData` / `IndexType` / `IndexStatus` / `LineageGraph` / `CollatedEditionIndex` / `ResourceCatalog` 等。

## 最小用法

### 1. 用 GithubStorage 直接渲染索引（浏览器）

```tsx
import { IndexBrowser, GithubStorage, LocaleProvider } from 'book-index-ui';
import 'book-index-ui/styles';

const transport = new GithubStorage({
    org: 'open-guji',
    repos: { draft: 'book-index-draft', official: 'book-index' },
});

export default function App() {
    return (
        <LocaleProvider>
            <IndexBrowser
                transport={transport}
                onEntryClick={entry => console.log('clicked', entry.id)}
            />
        </LocaleProvider>
    );
}
```

### 2. 仅用数据层（Node 环境，例如 build script）

```ts
import { BookIndexManager } from 'book-index-ui/storage';

const mgr = new BookIndexManager('/workspace');
const item = await mgr.getItem('1evgowbkc2qyo');
console.log(item?.title);
```

### 3. 自定义 storage 后端（VS Code 扩展、Electron 等）

```ts
import type { IndexStorage, IndexEntry, PageResult, LoadOptions } from 'book-index-ui';

class MyStorage implements IndexStorage {
    async loadEntries(type, options): Promise<PageResult<IndexEntry>> { ... }
    async getItem(id): Promise<Record<string, unknown> | null> { ... }
    // ... 实现 IndexStorage 全部必选方法
}
```

参考 `kaiyuanguji-web/nextjs/src/lib/local-api-storage.ts`（浏览器 → Next.js API 路由）和 `guji-platform/src/storage/VscodeStorage.ts`（VS Code 文件系统）。

## 数据约定

`book-index-ui` 读写的数据格式与 Python 端 `book-index-manager` CLI 完全一致。详见 [根 README](../README.md) 的"存储结构"和"Manager API 对照表"。

**关键约束**：文件名清洗（`cleanName`）的 CJK 范围 TS/Python 必须一致——见 [tests/unit/cleanName.test.ts](tests/unit/cleanName.test.ts) 的跨语言 fixture。

## 开发

```bash
npm install
npm run dev          # vite dev server（开发组件）
npm run test         # vitest 单元测试
npm run test:e2e     # Playwright E2E
npm run build:lib    # 输出 dist/ 给 npm 发布
```

## 许可

Apache 2.0
