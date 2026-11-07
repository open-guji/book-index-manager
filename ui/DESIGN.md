# book-index-ui 组件设计

> 2026-11-07 按插件化迁移（迁移计划第 0–7 步）完成后的现状重写。再往前的版本见 git 历史（2026-09 版式重构前以 `IndexDetail` 为中心；该组件与 `IndexApp`／`HomePage`／`IndexView`／`EntityDetail` 已于 2026-11-07 删除）。
> 长期方案：A41 共享目录 `长期方案与迁移计划.md`；详情页重构记录：overview 仓 `项目进展/古籍索引网站/整体设计/2026-09-详情页重构方案.md`。

## 设计原则

book-index-ui 提供**可组合的 React 组件**，由宿主自由组合、布局和导航。组件不负责路由、URL、数据源选择；数据一律经 `IndexStorage`（或阅读器自带的取数层）取得；宿主定制靠**插件与变量**，不靠抓 DOM、不靠重写 `.bim-*` 选择器。

## 入口

| 入口 | 内容 |
|---|---|
| `book-index-ui` | 读者端：详情、阅读、检索、总目、首页、反馈，加类型与数据层 |
| `book-index-ui/storage` | 纯数据层（无 React，Node／Worker 可用） |
| `book-index-ui/editor` | **编辑态**：`IndexEditor`、`ResourceEditor`、`SourceEditor`、`RelationPanel`、`EntitySelector`、`CreateEntityDialog`、`EntityPickerDialog`。读者端打包不带这部分；写入需 storage 实现 `saveItem` |
| `book-index-ui/tokens.css`、`themes.css`、`styles` | 设计变量、内置主题、旧合并入口 |
| `book-index-ui/variant-supplement`、`variant-chars` | 异体字补充表与数据 |

## 组件分层

### 页面级

| 组件 | 职责 |
|---|---|
| `BookDetailLayout` | 条目详情页外壳：顶条、标题区、次级导航 Tab、页脚；按 `detail.type` 路由到下面四个 Page，注入跨 Tab 入口。单栏 1000px 文档流，不固定高度、不内滚动 |
| `WorkPage` / `BookPage` / `CollectionPage` / `EntityPage`（`components/detail/`） | 现行详情页：作品／版本／丛编／人物；共用 `primitives.tsx` 的版式原语与 `DETAIL_CSS`，区块间只用 1px／2px 直线，无卡片、圆角、阴影 |
| `IndexBrowser` + `search/*` | 列表与检索结果：搜索框、分类 Tab、结果页签、最近浏览（`localStorage` 键 `bim-recent-ids`） |
| `MetaHomeView` / `ReadHomeView` | 元数据首页、阅读首页（数据契约与网站构建产物共用） |
| `CatalogPage` / `WorkCatalog` / `CollectionCatalog` | 古籍总目、作品目录、丛编目录 |
| `VersionLineageView` / `Graph` / `List` | 版本传承：Graph 用 dagre＋xyflow（可选依赖），List 是无图依赖的降级 |
| `FeedbackTab` 等 | 反馈；经 `IndexStorage.listFeedback／submitFeedback` 或 `createFeedbackTransport(url)`，不自己 `fetch` |

**数据派生层**在 `src/core/detail-model.ts`（无 React，可单测）：`deriveEra`／`deriveDating`、`normalizeRole`、`buildVersionTable`、`bucketResources`、`groupRelatedWorks`、`buildCollectionTable` 等；资源纯函数 `core/resources.ts`，传承图合成 `core/lineage-graph.ts`。

### 阅读器（`components/Reader/`、`TextReader.tsx`、`core/reader-data.ts`）

- `TextReader` 是统一阅读器：整理本与全文合一，只认新结构（`manifest.json`＋`<key>/index.json`＋章文件）。整理本章用 `CollatedEdition.tsx` 里的 `JuanReading`／`JuanRail`／`useCrossJuanSearch` 渲染（该文件现在只是整理本渲染模块，不再导出整页组件）；对读章用 `GujiTextViewer`（逐字格位）；其余按 Markdown。
- **取数在包内**：`loadReaderChapter`／`loadReaderFiles`／`readerVersions`／`readerManifest` 已导出；不传 `resolveWarpData`／`resolveEntities` 时 `TextReader` 自己取；`initialChapter` 给首屏数据，`hideSupersededVersions`（缺省 true）按阅读页规则过滤版本（传 `false` 列出 manifest 全部版本，供编辑／校对界面使用）。
- **外壳** `ReaderShell`：目录、书影、正文三栏，设置侧栏（窄屏为底部抽屉），工具条吸顶（`--bim-reader-top`）。偏好存 `localStorage['bim-reader-prefs']`。
- **插件接口**（`Reader/plugins.ts`，宿主经 `<TextReader plugins={[…]}>` 传入，对象须引用稳定）：

| 钩子 | 作用 |
|---|---|
| `onChapter(ctx)` | 换章取自己的数据，返回值经 `api.state(id)` 传给其余钩子 |
| `settings` | 往设置面板某组（text／annotate／layout／more 或新组）加控件 |
| `toolbar` | `subtitle`／`actions` 位；窄屏由包收进「更多」 |
| `decorate(api)` | 返回 `Map<格位, CellDecoration>`（色调、下划线、底／字色、下标、字后插入、提示、焦点）；多插件按顺序叠加 |
| `onCell.click／hover` | 点字、悬停 |
| `selectionActions(sel, api)` | 选字浮条按钮（报错、改字等） |
| `overlay(api)` | 浮层（桌面右下角，手机贴底） |

  `ReaderApi` 提供 `ctx`、`state`、`cells`、`scrollTo`、`rectOf`、`locate({text}|{cp})`、`refresh`、`prefs/setPref`、`t`、`convert`。钩子抛错只记 console，不拖垮阅读器。
  **适用范围**：`decorate`／`onCell`／`selectionActions`／`locate({cp})` 作用于有逐字格位的对读章；整理本结构化渲染与 Markdown 章没有格位，这几项对它们不生效（`locate({text})` 在无格位章返回不透明记号 `t:…`，只供 `scrollTo`／`rectOf` 使用）。其余钩子对所有章生效。旧插槽 `settingsExtra` 等已在 0.66 删除。
- 书影：`resolveImages`（须 `useCallback`）返回 `ReaderPageImage[]`；框格式 `bim-charbox-v0`，其他格式设 `boxFormat` 并配 `renderImageOverlay`。
- 组件不改 URL：宿主在 `onLocationChange(loc, cause)` 里改地址。

## 消费者

### kaiyuanguji-web（Next.js 静态站）

- `app/book-index/` 装配 `IndexBrowser`／`MetaHomeView` 等，选数据源、初始化搜索、管 URL；`BookDetailContent.tsx` 用 `BookDetailLayout`，注入站点专属块（`footerExtra`、`extraTabs`）
- 阅读页 `app/read/[id]` 用 `TextReader`，站点功能（下载、版本芯片、校勘层、选字报错、对校……）以阅读器插件挂入，不抓 DOM
- 数据传输层：生产 `cos-storage.ts` 包 `BundleStorage`；dev 是 `LocalApiStorage`
- 搜索不走本包：网站自己的 `lib/search/`（Meilisearch L1＋Web Worker L2）

### guji-platform（VS Code 扩展）

依赖 `book-index-ui ^0.1.17`（semver 范围不会升到 0.66），只用 `IndexBrowser`、`IndexEditor`、`ModeIndicator`、`Badge`、`BookIndexStorage`、`IdGenerator` 与类型。2026-11-07 核对：不引用已删除的 `IndexDetail`／`IndexApp`／`HomePage`／`IndexView`／`EntityDetail`。将来升级时编辑态组件改从 `book-index-ui/editor` 引入。

### 测试页（`src/app/main.tsx`，`npm run dev` → :5173）

`DevApiStorage` 经 Vite 中间件 `/api/*` 直读 `D:/workspace` 下的 book-index／book-index-draft／book-text（`vite.config.ts` 写死这个根；`BIM_DATA_WORKSPACE` 可覆盖）。首页只有 `IndexBrowser`，详情用 `BookDetailLayout`，`/catalog` 是总目示例。

## 数据传输层（`IndexStorage`）

| 消费者 | 实现 | 说明 |
|---|---|---|
| kaiyuanguji-web 生产 | `BundleStorage`（经 `cos-storage.ts`） | 同域／COS 预打包 JSON |
| kaiyuanguji-web dev | `LocalApiStorage` | Next API route 读本地仓 |
| guji-platform | `VscodeStorage` | postMessage 桥接 |
| 测试页 | `DevApiStorage` | Vite dev 中间件，不对外导出 |
| （已废弃）`GithubStorage` | 读源仓 `index/`，`index/` 删除后不可用 | 改用 COS 产物或 `BundleStorage` |

## Token 契约（样式）

- 设计变量只在 `src/styles/tokens.ts` 定义，`npm run gen:tokens` 生成 `tokens.css`／`themes.css`／`variables.css`（单测校验同步）。对外承诺的变量见 README「样式契约」。
- 宿主：先引 `tokens.css`，再在自己 `:root` 里**只覆盖品牌相关变量**；不写 `.bim-*` 结构选择器改组件内部，缺变量就提需求。
- 组件里不许有 `#hex`／`rgba()`／命名色（`tests/unit/tokens.test.ts` 守门）；带透明度用 `color-mix()`。
- 改名或删除 `tokens.css` 里声明的变量按破坏性改动处理，需升 minor。

## 约定

- **文案**：界面文字 `useI18n().t(key)`（`src/i18n/messages/<区域>.ts`，`defineMessages(繁体, 简体)`，两栏键一一对应），数据文字 `convert(...)`；细则见 README「界面文字与繁简」
- **受控词汇是英文枚举，显示层负责翻译**：`section.type`、`Work.subtype` 等。直出原值就是 bug
- **索引条目字段**（`IndexEntry`）由 TS `core/storage.ts` 与 Python `entry_extractor.py` 各写一份，**加字段两侧必须同步**。`dynasty` 是撰人朝代，`era`／`sort_year` 是刊刻朝代与排序年
- `ai_note` 是整理者写给整理者的注，**不渲染**
- 发版：包的预发布走 `publish-ui.yml`（`0.66.x-rc.N`，dist-tag `next`），正式发布升 patch，升 minor 先问用户

## 样式策略（细则）

- 组件使用 **CSS 变量 + inline styles**，不依赖 Tailwind
- 消费者通过 CSS 变量（`--bim-*`）适配自己的主题
- 导入 `book-index-ui/tokens.css` 获取设计变量（`src/styles/tokens.css`，由 `src/styles/tokens.ts` 生成；内置主题在 `themes.css`；旧入口 `book-index-ui/styles` = 合并版 variables.css，保留兼容）。对外承诺的变量见 README「样式契约」

### 换肤约定（2026-09 N2 起）

**颜色只在 [src/styles/tokens.ts](src/styles/tokens.ts) 定义一次**，组件一律 `bim('fg')` 取色，
得到 `var(--bim-fg, #333333)`——回退值由 tokens.ts 统一给出，不再每处各写一份，
也**不许**再写 `#hex` / `rgba()` / 命名色（单测 `tests/unit/tokens.test.ts` 守门）。

- 新增或改动变量：改 tokens.ts → `npm run gen:tokens` 重新生成 variables.css / tokens.css / themes.css（单测校验同步）
- 消费者只要在自己的 `:root` 覆盖同名变量即可整体换肤；若同时引入了
  `book-index-ui/styles`，覆盖声明须在其**之后**加载
- 没引样式表时，内联回退值与样式表默认值相同，观感一致

带透明度的描边/底色请用 `color-mix()` 从变量推出，不要再写 `${color}40`
这类十六进制拼接——那样无法与 `var()` 组合（存量里 CollatedEdition 还有几处这样拼出了无效 CSS、实际不生效，为保持观感暂未改）。

变量分组见 tokens.ts 里的 `BIM_TOKEN_GROUPS`：基础（跟随 VS Code）、底色/文字/描边、提示与警告、
遮罩与阴影、条目类型/状态徽章、资源（含校对程度 `--bim-check-*`）、整理本（含文本质量
`--bim-quality-*`）、版本传承/关系方向、编辑器视图、详情页（宣纸+朱砂）、字体。

> 文本质量等级（`--bim-quality-*`）与校对程度（`--bim-check-*`）承载分级语义，
> 更接近数据而非皮肤；`--bim-danger` / `--bim-warning` / `--bim-success` 同理，
> 建议消费者保持默认。

## 待办

- [ ] `IndexBrowser` 没有排序控件；`sort_year` 已进索引，可加「按年代」排序
- [ ] Entity 的 `native_place`（2026-09 新增字段）尚未展示
- [ ] guji-platform 从 `^0.1` 升到现行版本时，编辑态改从 `book-index-ui/editor` 引入

## 主题（2026-09-29，overview#286）

两套：**朱砂**（默认，= `tokens.ts` 各变量的 `value`）与**靛蓝**（设计稿 v3：`--ac #2E5266` `--ac-d #23414F` `--ac-t #E3EAEC`）。
开关是 `<html data-theme="zhusha|indigo">`；未设、空或值不认识一律按朱砂（样式表里只有 `indigo` 有覆盖块）。

- **变量**：`tokens.ts` 的 `BIM_THEMES` 只列与默认不同的变量，`npm run gen:tokens` 生成 `:root[data-theme="indigo"] { … }` 追加在 `variables.css` 末尾。
  靛蓝只换强调色一族（`accent` `accent-deep` `flag-bg` `selection-bg` `rule-accent-soft`）；纸色、墨色、暖沙横幅、分类色、阅读器底色两套共用。
- **API**（`src/theme.ts`，均从包入口导出）：`THEMES` `DEFAULT_THEME` `normalizeTheme` `readStoredTheme` `storeTheme` `applyTheme` `currentTheme`
  与 `THEME_INIT_SCRIPT`。存储键 `bim-theme`，读写全包 try/catch，存储不可用时按默认朱砂、只在本页生效。
- **首屏不闪**：宿主把 `THEME_INIT_SCRIPT`（自包含内联脚本）放进 `<head>`，首帧前按存储设属性；没存过就保持宿主 SSR 出的默认。
- **控件**：`ThemeToggle`——两个色点、`radiogroup` 语义；首帧按默认渲染（与 SSR 一致），挂载后读 `<html>` 实际主题；`onChange` 供宿主同步 `<meta name="theme-color">`。
- **对比度**：两套主题强调色在页底／斑马／卡底／悬停底、白字主按钮、「有影印」块上文字对比度 ≥ 4.5，`tests/unit/tokens.test.ts` 卡着。

## 搜索页（2026-09-29 v3，overview#286）

`IndexBrowser` 的结果区：新增**结果页签**（全部＋各类带条数，顺序作品／叢編／書籍／人物，只有一类有结果时不出）；点某一类只列该类并把该类展开到全部，再点「全部」还原。
**去 emoji**：类型标记改为小方块（`TypeMark`，取 `--bim-type-*`），空状态、资源标记里的 emoji 一并去掉。
`resultVariant` 新增 `'list'`（单列、无间距，行的分隔由宿主 `renderEntry` 负责）。
设计稿里的「只看有影印」「按相关度」**没做**：搜索接口目前不接受筛选／排序参数，客户端只对已载入的几条过滤会让页签条数与列表对不上。

## 古籍总目（2026-09-29 v3，overview#286）

`CatalogPage` 新增「卡片／列表」切换（页头右端；首帧一律卡片与 SSR 一致，可受控 `view`／`onViewChange`）。列表行＝書名（＋卷數）｜撰人｜分類，摘要不出。
设计稿里的其余筛选（书名／作者输入、朝代、有影印／有全文、存佚，排序）与卡片角标（影印／全文／佚）**没有做**：总目卡片（`CatalogWorkCard`）由网站构建期产物按页静态生成，
卡片里没有朝代、资源、存佚字段，跨页筛选也无从做起——要做得先扩构建脚本与卡片契约。

