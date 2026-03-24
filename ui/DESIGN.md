# book-index-ui 组件设计

## 设计原则

book-index-ui 提供**可组合的 React 组件**，由消费者自由组合、布局和导航。组件本身不负责路由、Tab 切换、页面框架等外层逻辑。

## 核心组件

### 1. IndexDetail — 索引基本信息页（只读）

显示一个索引条目（Book / Work / Collection）的完整详情。

**职责：**
- 标题、类型徽章、ID、状态
- 作者、年代、卷数等元数据
- 简介 / 提要
- 附录内容（`additional_works`）：标题 + 卷数，纯展示
- 相关作品（`related_works`）：按 relation 分组（所属 / 包含 / 相关），可点击跳转
- 收录信息（`indexed_by`）
- 资源链接（`resources`）
- 流转历史（Book）/ 历史沿革（Collection）
- 相关版本（Book.related_books / Work.books）
- 所属作品卡片（Book → Work）
- 收录于（Book → Collection）

**不负责：** 页面布局、Tab 切换、返回按钮、数字化视图等。

### 2. IndexEditor — 索引编辑器

编辑一个索引条目的元数据。是 IndexDetail 的编辑对应版。

### 3. IndexBrowser — 搜索与索引列表

搜索、过滤、分页浏览索引条目列表。

### 4. CollectionCatalog — 丛编目录

显示丛编的完整书目结构。

### 5. CollatedEdition — 作品整理本

显示作品的整理本（校勘版）内容。

## 消费者

### kaiyuanguji-web（Next.js 网站）

负责：
- 页面路由（`/book-index/[id]`）
- LayoutWrapper、Tab 切换（基本信息 / 数字化）
- 返回按钮、数据源切换
- DigitalizationView（数字化视图，网站特有）
- 使用 `GithubStorage` 作为数据传输层

组合方式：
```tsx
<LayoutWrapper>
  <导航栏 />
  <Tab 基本信息>
    <IndexDetail data={detail} renderLink={...} />
    <CollectionCatalog ... />  {/* 如果是丛编 */}
  </Tab>
  <Tab 数字化>
    <DigitalizationView ... />  {/* 网站特有 */}
  </Tab>
</LayoutWrapper>
```

### guji-platform（VS Code 扩展）

负责：
- WebView 面板管理
- VS Code 风格的 Tab / 侧边栏布局
- 编辑功能集成（IndexEditor）
- 使用 `VscodeStorage`（通过 postMessage 桥接）作为数据传输层

组合方式：
```tsx
<VSCode面板>
  <IndexBrowser onSelect={...} />    {/* 左侧栏 */}
  <IndexDetail data={...} />          {/* 右侧详情 */}
  <IndexEditor data={...} />          {/* 编辑模式 */}
  <CollatedEdition ... />             {/* 整理本标签页 */}
</VSCode面板>
```

### book-index-ui 测试应用（Vite dev server）

负责：
- 开发调试用的完整页面
- URL 路由
- 使用 `DevApiStorage` 作为数据传输层

组合方式：
```tsx
<IndexApp>  {/* 内置布局：左侧浏览 + 右侧详情/编辑 */}
```

## 数据传输层（IndexStorage）

组件通过 `IndexStorage` 接口获取数据，不直接依赖网络请求。消费者负责提供合适的实现：

| 消费者 | 实现 | 说明 |
|--------|------|------|
| kaiyuanguji-web | `GithubStorage` | 只读，从 GitHub CDN 获取 |
| guji-platform | `VscodeStorage` | 通过 postMessage 桥接到 Node.js |
| 测试应用 | `DevApiStorage` | 本地 Vite dev server API |

## 样式策略

- 组件使用 **CSS 变量 + inline styles**，不依赖 Tailwind
- 消费者通过 CSS 变量（`--bim-*`）适配自己的主题
- 导入 `book-index-ui/styles` 获取基础样式

## 待办

- [ ] kaiyuanguji-web 的 BookDetailContent 应迁移为使用 IndexDetail 组件，去除重复的 Tailwind 实现
- [ ] 确保 IndexDetail 的 `renderLink` prop 足够灵活，支持 Next.js Link 组件
