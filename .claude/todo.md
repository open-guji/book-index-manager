# book-index-manager 近期任务

## UI 组件库开发（ui/ 子目录）✅ 全部完成

### 已完成

1. ✅ 搭建 ui/ 项目骨架（package.json, vite, tsconfig）
2. ✅ 定义 types.ts 和 transport 接口（IndexTransport）
3. ✅ 提取并重构 ResourceEditor — 统一编辑器，支持 id/type/root_type/structure/coverage 字段
4. ✅ 提取 ModeIndicator — CSS 变量替换为 --bim-*
5. ✅ 提取 IndexBrowser — 解耦 vscode.postMessage，通过 IndexTransport 接口交互
6. ✅ 新建 ResourceList — 只读展示，按 type 分组
7. ✅ 实现 VscodeTransport + HttpTransport
8. ✅ guji-platform 改为从 book-index-ui 导入，删除旧组件
9. ✅ guji-platform 后端适配 requestId 协议

### 待完成（后续阶段）

- kaiyuanguji-web 集成 ResourceList 组件（待网站开发到古籍详情页时进行）
