# 阅读器版式护栏（overview#526）

jsdom 没有布局：`getBoundingClientRect` 恒为 0、`canvas.getContext` 不存在。下面这些回归只有真浏览器能抓，
所以这里在真 Chromium 里渲染阅读器组件、**量几何关系**（不比截图像素——不同机器字体不同，像素比对会误报）。

| 抓的回归 | 断言 | 数据 |
|---|---|---|
| 行首空白两格（0.52.0） | 非首行第一个字贴着段落左缘；同一行相邻两字间距 ≤ 0.9 字宽 | `96mid1ogzk` 002 第 3–5 页（第 4、5 页各 9 个行首空格列） |
| 抬头列首字偏高（0.52.0，0.52.3 修） | `.is-raised` 字与同行字的 y 差 ≤ 2px，且无 `transform`／位移 | 同上第 3 页（有抬头列） |
| 去空白不生效 | 去空白与保留空白的 `<canvas>` 尺寸不同；去空白＝字框外接矩形（加 3% 边），比整图小 | 同上第 3 页的 cord 字框 |

## 跑
```
cd ui
npm run test:layout            # 自动起 vite（端口 5199）并跑
CHROME=/path/to/chrome npm run test:layout   # 没有 playwright 自带浏览器时指定可执行文件
```
CI 上需要先 `npx playwright install --with-deps chromium`。

## 改这里要注意
- **每条断言都做过变异验证**：把对应的线上回归重现一遍（行首空格渲染成空位／抬头字上移／裁切区恒为 null），断言必须变红；改断言时请重做，别只看"现在是绿的"。
- 数据是真实片段（`fixtures/`，约 58KB）。整份 `002.char.json` 有 1.4MB，不要整份提交；要换页，从 book-text 的 `96mid1ogzk/default/` 里截取。
- `<canvas width>` 属性按整数解析，截断而不是四舍五入（断言里用 `Math.floor`）。
- 同一行的字用「垂直中心相差 < 12px」聚类，不要用 `top` 取整——同行 20px 字与 16px 小注的 `top` 相差约 4px，会被拆成两行。
