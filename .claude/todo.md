# book-index-manager 近期任务

## 统一 python，js core library

## JS UI 优化

搜索框放最上 搜索所有类型

然后显示最近搜索

然后显示分类浏览、数据统计 (不显示丛编)

## Loading 状态优化

首页加载时页面空白，需要改为动态"加载中..."提示（循环显示1-3个点，表示正在进行中）：
- HomePage.tsx 第288、374、528行：推荐项/丛书目录/在线资源的 loading 状态，把静态 `"..."` 改为动态省略号动画
- kaiyuanguji-web page.tsx 第103行：Suspense fallback 从空白 div 改为带动态省略号的加载提示
