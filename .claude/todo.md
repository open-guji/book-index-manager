# book-index-manager 近期任务

## UI 组件库开发（ui/ 子目录）✅ 基础实现完成

从 guji-platform 提取古籍索引相关的 React 组件，使其可在 guji-platform 和 kaiyuanguji-web 中复用。

### 已完成

1. ✅ 搭建 ui/ 项目骨架（package.json, vite, tsconfig）
2. ✅ 定义 types.ts 和 transport 接口（IndexTransport）
3. ✅ 提取并重构 ResourceEditor — 统一编辑器，支持 id/type/root_type/structure/coverage 字段
4. ✅ 提取 ModeIndicator — CSS 变量替换为 --bim-*
5. ✅ 提取 IndexBrowser — 解耦 vscode.postMessage，通过 IndexTransport 接口交互
6. ✅ 新建 ResourceList — 只读展示，按 type 分组
7. ✅ 实现 VscodeTransport（postMessage + request/response 模式）
8. ✅ 实现 HttpTransport（REST API）
9. ✅ CSS 变量默认值（styles/variables.css）
10. ✅ TypeScript 编译 + Vite library 构建通过

### 待完成

- guji-platform 改为从 book-index-ui 包导入组件
- kaiyuanguji-web 集成 ResourceList 组件
- guji-platform 后端适配 VscodeTransport 的 request/response 协议
