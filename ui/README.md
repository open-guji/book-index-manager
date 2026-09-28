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
| `IndexDetail` | **旧版**详情纯渲染（2026-09 重构前，仍导出以兼容） |
| `BookDetailLayout` | 详情页外壳：Tab（基本信息/整理本/全文/反馈）+ 路由到下面四个 Page；kaiyuanguji-web 用它 |
| `WorkPage` / `BookPage` / `CollectionPage` / `EntityPage` | **现行详情页**（2026-09 版式重构）：作品 / 版本 / 丛编 / 人物 |
| `primitives`（`PageFrame`、`SectionHead`、`DataTable`、`Chip` …） | 四个 Page 共用的版式原语与 `DETAIL_CSS` |
| `deriveEra` / `deriveDating` / `buildVersionTable` … | `core/detail-model.ts` 的数据派生层（刊刻年代、角色归一、版本表） |
| `BookFullText` / `WorkCatalog` | 全文阅读页（Book / Work 全文，走 `ReaderShell`）/ 作品目录 |
| `IndexEditor` | 详情编辑器（写入需 storage 实现 saveItem） |
| `HomePage` | 首页：推荐丛编 + 经典作品（kaiyuanguji-web 用） |
| `CollatedEdition` | 整理本阅读页（走 `ReaderShell`）+ 跨卷搜索；「條目」看法保留原卡片视图 |
| `ReaderShell` / `ReaderToc` / `ImagePanel` / `ReaderMdText` | 阅读器（整理本与全文共用），见下「阅读器」 |
| `CollectionCatalog` | 丛编目录（按册/卷分组） |
| `EmendatedBySection` | "校勘自" 引用列表 |
| `VersionLineageView` / `VersionLineageGraph` | 版本传承图（dagre + xyflow） |
| `FeedbackButton` / `FeedbackList` / `FeedbackForm` | 反馈组件 |
| `LocaleProvider` / `LocaleToggle` | 繁简切换 |
| `useT` / `useConvert` | 繁简 hook |

### 阅读器（`components/Reader/`，2026-09 N5a）

整理本与全文共用一个外壳 `ReaderShell`：

- 布局：**书影在正文左边**，目录在最左。宽屏（≥1100px）目录是可收起的侧栏（默认展开）；更窄时是抽屉（默认收起，选卷后自动合上，Esc 关闭，打开时 Tab 圈在抽屉内）；窄屏（≤719px）书影区不显示，只留正文。
- 工具条（吸顶）只用文字与图标：目录、书影、繁｜简、A− A+、自然段（体裁判得清时才出现，W7）、专名线（书名加波浪线）。竖排预留 `allowVertical`，默认不显示。
- 正文：`--bim-font-reading`（宋体，默认接 `--bim-font-serif`，宿主覆盖后者即可）18px、行高 2.05（手机端同样），`line-break: strict` 避头尾；界面黑体。
- 无障碍：第一个可聚焦元素是「跳到正文」；目录用游走 tabindex，几百卷也只有当前卷进 Tab 序列（↑↓ Home End 移动）。
- 偏好（字号、自然段、专名线）存 `localStorage['bim-reader-prefs']`，首帧用默认值，SSR 安全。
- 宿主若有吸顶导航，设 `--bim-reader-top`（如 `60px`）。

书影接口：`CollatedEdition` / `BookFullText` 的 `resolveImages(chapterKey)` 返回当卷的 `ReaderPageImage[]`（可异步）——每页一张图，URL 由宿主给，可带 `width/height` 与逐字框 `boxes`（暂定格式 `bim-charbox-v0`：原图像素坐标 `x/y/w/h`，可选 `char`/`textOffset`/`confidence`）。其他格式的框设 `boxFormat` 并用 `renderImageOverlay` 自己画，这是与 CV 交付格式对齐前的扩展点。没有影像时书影区默认收起（`imagePanel="auto"`），点工具条「书影」可看占位。

版本下拉框（overview#235，同一 owner 有多份全文时用）：`ReaderShell` 的四个 props——

| prop | 说明 |
|---|---|
| `versions` | `ReaderVersion[]`（`key / label / sourceName / license / sourceUrl / primary`）。两份以上时工具条出「版本」下拉框，只有一份不出；有值时正文末尾显示所选版本的出处与授权 |
| `currentVersionKey` | 当前版本 key；不给（`undefined`）时组件自管，给了但无效则选 `primary`，再没有就第一份 |
| `onVersionChange` | 下拉框切换回调 `(key) => void`；组件不改 URL，由宿主换 `toc` 与正文（换上新目录后自动选中第一卷） |
| `versionSource` | 是否显示正文末尾的「出处 · 授权」，默认 `true`；宿主自己画出处时设 `false` |

配套两个导出（`book-index-ui` 根入口与 `components/Reader`）：`readerVersionsFromFullText(entries)` 把 book-text 的 `WorkFullTextEntry[]` 换成 `ReaderVersion[]`（顺序不变，清单已按「哪份最好」排好）；`pickReaderVersion(versions, key?)` 给出当前选中的一份（key 有效用它，否则 primary，再否则第一份），宿主用它决定该载入哪份 toc / 正文。

**`resolveImages` 要用 `useCallback`（或模块级函数）包一层**：组件按 `[resolveImages, 当前卷]` 重新取书影，每次渲染都传一个新函数会反复请求。

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

### 4. 宿主接入要点（手机 / 无障碍，2026-09-28）

- **搜索结果是真链接**：`IndexBrowser` 的结果卡片是 `<a href>`，href 由 `BidUrlProvider` 的 `buildUrl` 生成（默认 `/book-index?id=…`），站点路由不同时务必包一层 Provider。普通左键点击仍调 `onEntryClick` 走客户端路由；Ctrl / Cmd / Shift / 中键交给浏览器（新标签、复制链接）。不传 `onEntryClick` 则按 href 整页跳转。
- **反馈浮钮** `FeedbackButton`：
  - 层级取 `--bim-feedback-fab-z`（默认 40），低于抽屉与弹层；也可传 `zIndex` prop。
  - 挂载且未隐藏时在 `<html>` 上写 `--bim-feedback-fab-offset`（浮钮占掉的底部高度）。正文容器写 `padding-bottom: var(--bim-feedback-fab-offset, 0px)`，右下角内容就不会被盖住。
  - `hidden` prop：移动端菜单 / 抽屉打开时传 `true`，浮钮与留白一起撤掉。

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
