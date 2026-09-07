# book-index-ui 组件设计

> 2026-09-06 按版式重构（2026-09）后的现状重写。重构前以 `IndexDetail` 为中心的版本见 git 历史。
> 重构本身的设计记录：overview 仓 `项目进展/古籍索引网站/整体设计/2026-09-详情页重构方案.md`。

## 设计原则

book-index-ui 提供**可组合的 React 组件**，由消费者自由组合、布局和导航。组件本身不负责路由、URL、数据源选择等外层逻辑；
数据一律经 `IndexStorage` 接口取得，组件不直接发网络请求。

## 组件分层

### 页面级

| 组件 | 职责 |
|---|---|
| `BookDetailLayout` | 条目详情页外壳：顶条（面包屑、繁简切换、反馈入口）、标题区、次级导航 Tab（概览 / 整理本 / 全文 / 版本传承 / 丛编目录 / 反馈）、页脚。按 `detail.type` 路由到下面四个 Page，并把跨 Tab 的入口注入进去（`lineageAction`、`collatedSection`）。单栏 1000px 文档流，不固定高度、不内滚动 |
| `IndexBrowser` | 列表页：搜索框 + 分类 Tab + 推荐 + 最近浏览（`localStorage` 键 `bim-recent-ids`）。Book 行同时显示撰人朝代 `dynasty` 与刊刻朝代 `era` |
| `HomePage` | 首页：推荐丛编、经典作品、资源导入进度、反馈列表 |
| `IndexApp` | 内置左浏览 / 右详情布局的整页应用，测试页与 VS Code 扩展直接用 |

### 详情页（`src/components/detail/`）

四张页面共用一套版式原语，区块之间只用 1px / 2px 直线分隔，无卡片、无圆角、无阴影：

| 组件 | 区块顺序 |
|---|---|
| `WorkPage` | header → intro（简介 / 别名 / 附录）→ **整理本入口**（由 layout 注入）→ 相關版本 → 在線數字資源 → 歷代書目收錄 ‖ 歷代考證 → 續書與評註 → 相關作品 |
| `BookPage` | header → intro（多数只剩 facts）→ 收入叢編 → 所屬作品 ‖ 影印與全文 → 同作品其他版本 |
| `CollectionPage` | header → intro → 收錄書籍（目录档 → `contained_works` → `books[]` 三来源降序）→ 影印與全文 ‖ 包含作品 |
| `EntityPage` | header → intro（别名 + 简介 + facts）→ 相關作品 |
| `primitives.tsx` | `PageFrame` `TopStrip` `Breadcrumb` `DetailHeader` `IntroGrid` `FactList` `SectionHead` `DataTable` `TableRow` `ExpandRow` `Chip` `ChipWall` `ResourceGroup` `ResourceRow` `VolumeLinks` `TagRows` … 以及全部样式 `DETAIL_CSS`。所有承载文字的原语内部调用 `useConvert()` 做繁简 |

**数据派生层**在 `src/core/detail-model.ts`（无 React，可单测）：刊刻年代 `deriveEra` / `deriveYear` / `deriveDating` / `sortYear`（先读落盘的 `Book.dating`，读不到才回退到题名推断）、角色归一 `normalizeRole` / `roleFacets`、版本表 `buildVersionTable`、资源分桶 `bucketResources`、关联作品分组 `groupRelatedWorks`、丛编表 `buildCollectionTable`。资源纯函数在 `src/core/resources.ts`，传承图合成在 `src/core/lineage-graph.ts`。

### 阅读器与其他

| 组件 | 职责 |
|---|---|
| `CollatedEdition` | 整理本阅读器：卷导航、目录 / 原文切换、全文搜索、文本质量徽章。`section.type` 是英文枚举，显示前一律经 `normSectionType()`；卷文件名经 `juanDisplayName()`（兼容 `juan001.json` 与 `juan/001.json`） |
| `BookFullText` | Book 全文 Tab（读 book-text 的 `Book/…/full_text/`） |
| `VersionLineageView` / `Graph` / `List` | 版本传承图：Graph 用 dagre + xyflow（可选依赖），List 是无图依赖的降级 |
| `CollectionCatalog` / `WorkCatalog` | 丛编目录（按册 / 卷分组）/ 作品目录 |
| `IndexEditor` 及 `Resource*` / `SourceEditor` / `RelationPanel` / `Entity*` 对话框 | 编辑态，VS Code 扩展用；网站不用 |
| `IndexDetail` / `IndexView` | **重构前的详情组件**，仍导出以兼容 guji-platform；新功能不要加在这里 |

## 消费者

### kaiyuanguji-web（Next.js 静态站）

- `app/book-index/page.tsx` 装配 `IndexBrowser` / `HomePage`，选数据源、初始化搜索、管 URL 参数
- `components/book-index/BookDetailContent.tsx` 用 `BookDetailLayout`，注入本站专属块：`footerExtra={<CitationBar/>}`、`extraTabs`（反馈、数字化视图）
- 数据传输层：生产是 `cos-storage.ts` 对 `BundleStorage` 的包装（条目走 `current/entry/{id}.json`，搜索分片走 `v/{commit}/search/`）；dev 是 `LocalApiStorage`
- 搜索不走本包：网站自己的 `lib/search/`（Meilisearch L1 + Web Worker L2）

### guji-platform（VS Code 扩展）

`IndexBrowser` + `IndexView` / `IndexEditor` + `CollatedEdition`，数据经 `VscodeStorage`（postMessage 桥接到 Node）。

### 测试页（`src/app/main.tsx`，`npm run dev` → :5173）

`DevApiStorage` 经 Vite 中间件 `/api/*` 直读 `D:/workspace` 下的 book-index / book-index-draft / book-text（`vite.config.ts` 写死了这个根）。三仓不在那里则页面空白。

## 数据传输层（`IndexStorage`）

| 消费者 | 实现 | 说明 |
|---|---|---|
| kaiyuanguji-web 生产 | `BundleStorage`（经 `cos-storage.ts`） | 同域 / COS 预打包 JSON |
| kaiyuanguji-web dev | `LocalApiStorage` | Next API route 读本地仓 |
| 浏览器无数据仓时 | `GithubStorage` | GitHub raw + jsDelivr fallback |
| guji-platform | `VscodeStorage` | postMessage 桥接 |
| 测试页 | `DevApiStorage` | Vite dev 中间件，不对外导出 |

## 约定

- **文案**：用户可见文字一律经 `useT()`（`i18n/locales/zh-Hans.ts` / `zh-Hant.ts`），动态内容经 `useConvert()` 繁简转换
- **受控词汇是英文枚举，显示层负责翻译**：`section.type`（book / category / preface / tally / verification …）、`Work.subtype`（article / poem / chapter / book）。直出原值就是 bug
- **索引条目字段**（`IndexEntry`）由 TS `core/storage.ts` 与 Python `entry_extractor.py` 各写一份，**加字段两侧必须同步**，否则 reindex 会把字段抹掉。`dynasty` 是撰人朝代，`era` / `sort_year` 是刊刻朝代与排序年，语义不同
- `ai_note` 是整理者写给整理者的注，**不渲染**

## 样式策略

- 组件使用 **CSS 变量 + inline styles**，不依赖 Tailwind
- 消费者通过 CSS 变量（`--bim-*`）适配自己的主题
- 导入 `book-index-ui/styles` 获取基础样式（构建时由 `src/styles/variables.css` 原样复制而来）

### 换肤约定

组件内部一律以 `var(--bim-x, <默认值>)` 取色，**不写死颜色**。默认值与
`src/styles/variables.css` 保持一致，因此：

- 消费者只要在自己的 `:root` 覆盖同名变量即可整体换肤
- 不覆盖时观感与历史版本完全一致
- 若同时引入了 `book-index-ui/styles`，请确保覆盖声明在其**之后**加载

带透明度的描边/底色请用 `color-mix()` 从主色推出，不要再写 `${color}40`
这类十六进制拼接——那样无法与 `var()` 组合。

完整变量清单见 [src/styles/variables.css](src/styles/variables.css)：

| 分组 | 变量 |
|------|------|
| 底色与层次 | `--bim-bg` `--bim-bg-subtle` `--bim-widget-bg` `--bim-sidebar-bg` |
| 文字 | `--bim-fg` `--bim-desc-fg` `--bim-muted` |
| 描边 | `--bim-widget-border` `--bim-border` `--bim-input-border` `--bim-focus-border` |
| 输入控件 | `--bim-input-bg` `--bim-input-fg` |
| 主色 | `--bim-primary` `--bim-primary-fg` `--bim-primary-soft` `--bim-primary-bg` |
| 链接 | `--bim-link` `--bim-link-fg` |
| 列表交互态 | `--bim-list-hover-bg` `--bim-list-active-bg` |
| 标签点缀 | `--bim-tag-bg` `--bim-accent-bg` |
| 语义状态 | `--bim-danger` `--bim-warning` `--bim-success` `--bim-info-*` `--bim-warn-*` |
| 条目类型徽章 | `--bim-type-book` `--bim-type-work` `--bim-type-collection` `--bim-type-entity` |
| 条目状态徽章 | `--bim-status-draft` `--bim-status-official` |
| 资源类型标记 | `--bim-restype-*` `--bim-missing-fg` |
| 影印色彩模式 | `--bim-colormode-bw-*` `--bim-colormode-color-*` |
| 导入进度 | `--bim-progress-active` `--bim-progress-done` `--bim-progress-todo` |

> 文本质量等级色（`types.ts` 的 `published/fine/rough/ocr`、i18n locale 里的
> `精校/粗校/AI整理`）目前仍写死：这些颜色本身承载「质量分级」语义，
> 更接近数据而非皮肤，换肤时不应随主题漂移。同理，`--bim-danger` /
> `--bim-warning` / `--bim-success` 也建议消费者保持默认。

## 待办

- [ ] `IndexBrowser` 没有排序控件；`sort_year` 已进索引，可加「按年代」排序
- [ ] Entity 的 `native_place`（2026-09 新增字段）尚未展示
- [ ] guji-platform 迁到 `BookDetailLayout` 后，移除 `IndexDetail` / `IndexView`
