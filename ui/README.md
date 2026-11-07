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
import 'book-index-ui/tokens.css'            // 设计变量（推荐；用到组件时引入）
import 'book-index-ui/themes.css'            // 可选：内置主题 indigo / ink（<html data-theme>）
import 'book-index-ui/styles'                // 旧入口＝tokens.css ＋ themes.css 合并，保留兼容
```

## 样式契约（设计变量）

`tokens.css` 是设计变量的**唯一真源**（由 `src/styles/tokens.ts` 生成）。宿主的做法：

1. 先 `import 'book-index-ui/tokens.css'`；
2. 再在自己的 `:root` 里**只覆盖品牌相关的变量**（朱色一族、字体、页面底色等）；覆盖声明须在 tokens.css 之后加载；
3. （有调色板时，第 2 步改为覆盖 `--bim-palette-*`，见下）不要重写整套 `--bim-*`，也不要写 `.bim-*` 结构选择器去改组件内部——要调的东西都应该有变量，没有就提需求加变量。

**调色板（推荐给有自己品牌色的宿主）**：`tokens.css` 之后再 `import 'book-index-ui/palette.css'`，然后在 `:root` 里**只覆盖约 20 个 `--bim-palette-*`**（`paper` `raise` `tint` `tint-2` `ink` `ink-2` `ink-3` `aux` `accent` `accent-deep` `gold` `gold-ink` `blue` `blue-soft` `purple` `purple-soft` `green` `amber` `red` `book` `shade`）。语义变量（链接、类型徽章、警告条、高亮、分隔线……）全部由调色板推出，不必逐个重写；宿主有自己的令牌体系时把调色板接过去，换主题自动跟随。不引 `palette.css` 则保持 `tokens.css` 的默认值（VS Code 扩展等不受影响）。调色板的名字与默认值、推导关系见 `src/styles/tokens.ts` 的 `BIM_PALETTE` / `BIM_PALETTE_MAP`。

内置主题（indigo、ink）在 `themes.css`，用 `<html data-theme="…">` 切换；宿主自己用品牌色接管的，不必引。版式（`data-layout="boxed"`，界栏）在 tokens.css 里。

**对外承诺的变量**：`tokens.css` 里声明的全部 `--bim-*`（含 `data-layout="boxed"` 块里改的那些），改名或删除都按破坏性改动处理，需升 minor 并写进变更说明。常用分组：

| 分组 | 变量（节选） |
|---|---|
| 颜色 | `--bim-bg` `--bim-fg` `--bim-page-bg` `--bim-ink` `--bim-accent` `--bim-accent-deep` `--bim-link` `--bim-muted` `--bim-border` `--bim-flag-bg` … |
| 字体 | `--bim-font-ui` `--bim-font-body` `--bim-font-serif` `--bim-font-reading` |
| 阅读器字体 | `--bim-font-reader-ui` `--bim-font-reader-serif` `--bim-font-reader-reading`：只在阅读器根节点（`.bim-rd`）内换掉对应字体；默认等于上面的全局字体 |
| 列表页 | `--bim-browser-pad-x`：列表页（IndexBrowser）标题栏、检索框行、结果区的左右内边距，默认 `20px`，宿主要贴齐版心时设 `0` |
| 版式 | `--bim-fr-*`（疏朗／界栏） |
| 阅读器 | `--bim-reader-top`（吸顶工具条让出的顶部高度）等 |

完整清单见 `src/styles/tokens.ts`。`tests/unit/tokens.test.ts` 保证 tokens.css 与源文件同步、组件里没有颜色字面量。

## 主要 export

### React 组件

| 组件 | 用途 |
|---|---|
| `IndexBrowser` | 完整索引浏览器：搜索框 + 分类 tab + 推荐 + 最近浏览 |
| `BookDetailLayout` | 详情页外壳：Tab（基本信息/整理本/全文/反馈）+ 路由到下面四个 Page；kaiyuanguji-web 用它 |
| `WorkPage` / `BookPage` / `CollectionPage` / `EntityPage` | **现行详情页**（2026-09 版式重构）：作品 / 版本 / 丛编 / 人物 |
| `primitives`（`PageFrame`、`SectionHead`、`DataTable`、`Chip` …） | 四个 Page 共用的版式原语与 `DETAIL_CSS` |
| `deriveEra` / `deriveDating` / `buildVersionTable` … | `core/detail-model.ts` 的数据派生层（刊刻年代、角色归一、版本表） |
| `MetaHomeView` / `ReadHomeView` | 元数据首页／阅读首页（取代已删除的旧 `HomePage`） |
| `WorkCatalog` | 作品目录 |
| `IndexEditor`、`ResourceEditor`、`SourceEditor`、`RelationPanel`、`EntitySelector`、`CreateEntityDialog`、`EntityPickerDialog` | 编辑态，**在子入口 `book-index-ui/editor`**（0.66 起不再从主入口导出；写入需 storage 实现 saveItem） |
| `TextReader` | **统一阅读器**（overview#307）：整理本与全文合一，版本下拉含全部版本，取数走 `core/text-api`（只认新结构），见下「统一阅读器」 |
| `ReaderShell` / `ReaderToc` / `ImagePanel` / `ReaderMdText` | 阅读器（整理本与全文共用），见下「阅读器」 |
| `CollectionCatalog` | 丛编目录（按册/卷分组） |
| `VersionLineageView` / `VersionLineageGraph` | 版本传承图（dagre + xyflow） |
| `FeedbackButton` / `FeedbackList` / `FeedbackForm` / `FeedbackTab` | 反馈组件。`FeedbackTab` 不直接发请求：走 `IndexStorage.listFeedback／submitFeedback`，没有就按 `feedbackApiUrl` 用 `createFeedbackTransport(url)` |
| `LocaleProvider` / `LocaleToggle` | 繁简切换 |
| `useI18n` / `getT` | **统一 i18n 入口**：界面文字 `t(key)`、数据文字 `convert`，见下「界面文字与繁简」 |
| `useT` / `useConvert` | 旧 hook（整本字典 / 繁简转换），新代码用 `useI18n` |
| `findTraditionalChars` | 简体模式残留繁体字检测（vitest 与网站 e2e 共用） |

### 阅读器插件（`TextReader` 的 `plugins`）

宿主把站点功能写成 `ReaderPlugin` 对象传给 `TextReader`，不要再用选择器抓阅读器 DOM。钩子：`onChapter`、`settings`、`toolbar`、`decorate`、`onCell`、`selectionActions`、`overlay`；`ReaderApi` 提供 `locate／scrollTo／rectOf／refresh／prefs／t／convert`。`decorate`／`onCell`／`selectionActions`／`locate({cp})` 只对有逐字格位的对读章生效。完整接口见 `src/components/Reader/plugins.ts` 与 DESIGN.md。

### 统一阅读器（`TextReader`，overview#307）

```tsx
<TextReader
  id={workOrBookId} transport={storage}
  versionKey={key}  chapter={chapterKey}          // 受控（可不传，自己管）
  onLocationChange={(loc, cause) => router.push(urlFor(loc))}  // loc: { key, chapter, isDefault }；cause: 'auto' | 'chapter' | 'version'
  onNavigate={id => router.push(entryUrl(id))}
/>
```

- 数据模型（规格 overview `项目进展/古籍索引网站/设计/阅读文本.md`）：`items/<id>/manifest.json` 列全部版本（`versions[0]` 是 `default`），`<key>/index.json` 是章目录（`chapters[{ n, file:'001', title, has_json }]`），章正文 `<key>/001.txt`，整理本的章另有 `001.json`。`IndexStorage` 新增可选 `getTextManifest / getTextIndex / getChapter`，`BundleStorage` 已实现。
- **只认新结构**（用户 09-30 定）：条目没有 `manifest.json`（含旧的 `collated_edition/`、`full_text/…` 目录）就显示「暂无文本」，不从旧目录合成。旧的 `BookFullText` 已删；`CollatedEdition.tsx` 现在只是整理本章渲染模块（`JuanReading`／`JuanRail`／`useCrossJuanSearch`），不导出整页组件。
- 界面：工具条一个「版本」下拉按 manifest 顺序列全部版本（含整理本），只有一份时只在书名后标来源名；正文末尾显示所选版本的出处与授权；章有 json 用结构化渲染（条目、作品链接、跨章搜索），否则按 md；切版本尽量停在同一章号，对不上回第一章。
- 组件不改 URL：宿主在 `onLocationChange` 里改地址（新 URL：`/read/<id>[/<key>][/<章>]`，主版本不写 key）。`versionKey／chapter` 传了就受控；传了无效值时组件回落并以 `auto` 通知。
- 工具条另有上一章／下一章（窄屏隐去，翻卷交给正文底部的翻页卡片）、书名链接回条目页；窄屏（右栏藏起来）时正文末尾有「报告错字」入口。

### 阅读器（`components/Reader/`，2026-09 N5a）

整理本与全文共用一个外壳 `ReaderShell`：

- 布局：**书影在正文左边**，目录在最左。宽屏（≥1100px）目录是可收起的侧栏（默认展开）；更窄时是抽屉（默认收起，选卷后自动合上，Esc 关闭，打开时 Tab 圈在抽屉内）；窄屏（≤719px）书影区不显示，只留正文。
- 工具条（吸顶）只用文字与图标：目录、繁｜简、A− A+、「阅读设置」键（overview#463）。其余偏好收进**右侧「阅读设置」侧栏**（≥860px 右侧可折叠栏；窄屏是底栏「设置」打开的底部抽屉），分三组：文字（字体、字号、繁简）、标注（专名线，对读时加标点）、版面（自然段、标出作品链接、书影、对读留白，竖排预留 `allowVertical`）。宿主通过阅读器插件（`TextReader` 的 `plugins`，`ReaderPlugin.settings`）往侧栏塞自己的控件，接口说明见 DESIGN.md「阅读器」；0.66 已删旧插槽 `settingsExtra`／`settingsAnnotate`／`settingsLayout`／`toolbarExtra`。字体选项只有宋体（默认，沿用 `--bim-font-reading`）／楷体／系统默认（无衬线），全是系统已装字体，不加载网络字体；楷体栈 `Kaiti SC → Kaiti TC → STKaiti → KaiTi → AR PL UKai CN → Noto Serif CJK SC → serif`。
- 正文：`--bim-font-reading`（宋体，默认接 `--bim-font-serif`，宿主覆盖后者即可）18px、行高 2.05（手机端同样），`line-break: strict` 避头尾；界面黑体。
- 无障碍：第一个可聚焦元素是「跳到正文」；目录用游走 tabindex，几百卷也只有当前卷进 Tab 序列（↑↓ Home End 移动）。
- 偏好（字号、字体、自然段、专名线…）存 `localStorage['bim-reader-prefs']`，首帧用默认值，SSR 安全。
- 宿主若有吸顶导航，设 `--bim-reader-top`（如 `60px`）。

书影接口（推荐）：给 `TextReader` 一个 `resolveFacsimile(bookId, vol)`，返回该 IIIF 册的 `ReaderPageImage[]`——阅读器自己按章条目的 cord 找出册号再调它，宿主不必碰 `loadReaderFiles`／`iiifVolumeOf`。需要完全接管时用下面的 `resolveImages`（优先于 `resolveFacsimile`）。

书影接口（接管）：`TextReader` 的 `resolveImages(chapterKey)` 返回当卷的 `ReaderPageImage[]`（可异步）——每页一张图，URL 由宿主给，可带 `width/height` 与逐字框 `boxes`（暂定格式 `bim-charbox-v0`：原图像素坐标 `x/y/w/h`，可选 `char`/`textOffset`/`confidence`）。其他格式的框设 `boxFormat` 并用 `renderImageOverlay` 自己画，这是与 CV 交付格式对齐前的扩展点。没有影像时书影区默认收起（`imagePanel="auto"`），点工具条「书影」可看占位。

版本下拉框（overview#235，同一 owner 有多份全文时用）：`ReaderShell` 的四个 props——

| prop | 说明 |
|---|---|
| `versions` | `ReaderVersion[]`（`key / label / sourceName / license / sourceUrl / primary`）。两份以上时工具条出「版本」下拉框，只有一份不出；有值时正文末尾显示所选版本的出处与授权 |
| `currentVersionKey` | 当前版本 key；不给（`undefined`）时组件自管，给了但无效则选 `primary`，再没有就第一份 |
| `onVersionChange` | 下拉框切换回调 `(key) => void`；组件不改 URL，由宿主换 `toc` 与正文（换上新目录后自动选中第一卷） |
| `versionSource` | 是否显示正文末尾的「出处 · 授权」，默认 `true`；宿主自己画出处时设 `false` |

配套两个导出（`book-index-ui` 根入口与 `components/Reader`）：`readerVersionsFromFullText(entries)` 把 book-text 的 `WorkFullTextEntry[]` 换成 `ReaderVersion[]`（顺序不变，清单已按「哪份最好」排好）；`pickReaderVersion(versions, key?)` 给出当前选中的一份（key 有效用它，否则 primary，再否则第一份），宿主用它决定该载入哪份 toc / 正文。

插件接口里的定位与修饰（`ReaderApi`）：`locate({ cp })` 的 `cp` 是**格序**（`api.cells` 的下标，阅读顺序，从 0 数），不是全章码点偏移（网站旧版 DOM 的 `data-ft-cp`）；按内容定位用 `locate({ text })`。整理本、Markdown 等无逐字格位的章，`api.cells` 为空，`api.textCells` 给出按渲染文字数出的格（anchor `t:<序>:1`），`decorate` 以它为 key 即可修饰（`tone`／`bg`／`fg`／`underline`／`focus`，经 CSS Custom Highlight API 画，不改 DOM；`sub`／`insertAfter`／`title` 在这类章里不支持）。

**`resolveImages`／`resolveFacsimile` 要用 `useCallback`（或模块级函数）包一层**：组件按 `[resolveImages, 当前卷]` 重新取书影，每次渲染都传一个新函数会反复请求。

### 正文实体标注（`EntityText`，overview#389）

给一段正文和实体区间：人名、地名、官职等画直线专名线，书名画波浪线（书名号样式）；已收录的实体是 `/item/<id>` 链接，悬停或聚焦弹出摘要卡（取法同详情页 `transport.getItem`），Esc 收起。

```tsx
import { EntityText, adaptEntityJson } from 'book-index-ui';

const spans = adaptEntityJson(entityJson);   // entity.json → EntitySpan[]；格式定稿后只改这一层
<EntityText text={paragraph} entities={spans} offsets="plain" plainBase={0}
            transport={storage} onNavigate={(id, e) => { e.preventDefault(); router.push(`/item/${id}`); }} />
```

entity.json 的 `span` 是**纯字**偏移（不计标点空白），配 `offsets="plain"`；正文只是整卷一段时用 `plainBase` 给出本段起点。`book-index://Work/<id>` 等 URI 由 `bookIndexUriToId` 转站内 id。一页铺很多段时设 `injectStyles={false}`，在页面上放一次 `<style>{ENTITY_TEXT_CSS}</style>`。

### 数据层（`book-index-ui/storage`）

| 类 | 用途 |
|---|---|
| `BookIndexManager` | Facade：统一 `getItem/saveItem/deleteItem/generateId/...` |
| `BookIndexStorage` | 本地文件系统实现（Node / Electron） |
| `GithubStorage` | **已废弃**：读源仓 `index/`，`index/` 删除后不可用；请改用 COS 产物或 BundleStorage |
| `BundleStorage` | 同域预打包数据读取（kaiyuanguji-web 生产模式） |
| `LocalStorage` | `BookIndexStorage` 的薄包装（兼容历史 API） |
| `IndexStorage` | 接口（自实现自定义后端时实现它） |

数据层还导出 `encodeId / decodeId / smartDecode / extractType / shardOf / scoreEntry / rankByRelevance / cleanName` 等纯函数工具。

### 界面文字与繁简（overview#337）

两类文字，两条路：

| 类别 | 例 | 怎么写 |
|---|---|---|
| 界面固定文字 | 标题、按钮、aria-label、单位、「展開其餘 {n} 冊」 | `const { t } = useI18n(); t('detail.moreN', { n })` |
| 数据文字 | 书名、作者、提要、分类名、版本名、sections.json 里的分区名 | `const { convert } = useI18n(); convert(data.title)` |

- 字典按区域分文件：`src/i18n/messages/<区域>.ts`，`defineMessages(繁体栏, 简体栏, 英文栏?)`，繁简两栏键必须一一对应（tsc 检查）；早期的整块字典 `locales/zh-Hant.ts`／`zh-Hans.ts` 仍可用。
- 键是带类型的点路径（`MessageKey`），写错 tsc 报错；当前语言缺键回落到繁体。
- 没包 `LocaleProvider` 时按繁体。网站务必在最外层包 `LocaleProvider`（或网站的 `BimLocaleProvider`），否则组件一律显示繁体。
- 组件外（Next.js `generateMetadata` 等服务端）：`getT(locale)('…')`，数据文字用同一个转换函数（`LocaleProvider` 的 `converter` 或内置 opencc）。
- 加英文：`Locale` 加 `'en'`，各字典填英文栏（可部分，缺的回落繁体）；数据文字的英文另议。
- 检测：`tests/unit/zh-hans-leak.test.tsx` 在简体模式下渲染各页，用 `findTraditionalChars`（常用繁体字表 + 专名白名单）断言正文无繁体残留；`tests/unit/i18n-dictionaries.test.ts` 检查字典繁简同形、简体栏无繁体。

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

## schema-v2 派生字段（overview#458）

详情页（`BookDetailLayout` 及其下各页）直接读 build 产物的 `_` 字段，没有中间的归一／兼容层：

| 记录 | 页面读的字段 |
|---|---|
| Work | `_books`（版本卡）、`_edition_count`、`_classifications`（优先 zongmu）、`_related`（含 `direction`）、`_collections`；著录文字仍读源档的 `indexed_by` |
| Book | `_collections`（所属丛编与册次）；上级作品的版本取自 Work 的 `_books` |
| Collection | `_members`（前 20 项）＋`_member_count`；上级丛编读源档的 `contained_in` |
| Entity | `_works` |

卡片里 `{id, h:1}` 的枢纽引用没有 title，名称取自 `_hubs.json`：`IndexStorage.getHubs?()` 提供（`BundleStorage` 默认读 `${basePath}/_hubs.json`，可用 `hubsPath` 改相对路径）；不提供时枢纽引用无名，页面回退显示 ID。`BookDetailLayout` 会给传入的 `transport` 套一层 `withHubTitles`（只补枢纽卡的 `title`，不改字段形状）。夹具取自 book-index `schema-v2` 的 `build/contract-sample/`（`tests/unit/fixtures/contract-sample/`）。

`tests/unit/DerivedGolden.test.tsx` 用 `tests/unit/fixtures/derived-golden/`（真实 build 产物里挑的 47 个样本）逐字节比对整页渲染，改页面后输出有意变化时才重新生成（见该测试文件头部）。
