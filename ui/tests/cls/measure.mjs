/**
 * 真实浏览器量 CLS。先起 dev server：`npx vite --port 5199`，再：
 *   node tests/cls/measure.mjs [scenario=search|empty|work] [width=390] [height=844]
 * 输出总 CLS 与每次 layout-shift 的来源（元素、位置/高度变化）。
 * 环境变量 CHROME 可指定浏览器可执行文件。
 */
import { chromium } from '@playwright/test';

const [,, scenario = 'search', w = '390', h = '844', waitMs = '7000'] = process.argv;
const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: +w < 500, isMobile: +w < 500 });
const page = await ctx.newPage();
await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__shifts.push({
                t: Math.round(e.startTime), v: e.value,
                src: e.sources.map(s => `${s.node?.className || s.node?.nodeName || '?'} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h ${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`),
            });
        }
    }).observe({ type: 'layout-shift', buffered: true });
});
await page.goto(`http://localhost:5199/tests/cls/harness.html?s=${scenario}`, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
const { shifts, mounted } = await page.evaluate(() => ({ shifts: window.__shifts, mounted: window.__mountedAt }));
// 只算 SSR 内容挂上之后的位移（挂载前是台子自己的空白帧，不属于组件）
const real = shifts.filter(s => s.t >= mounted - 1);
const cls = real.reduce((a, s) => a + s.v, 0);
console.log(JSON.stringify({ scenario, width: +w, cls: +cls.toFixed(4), shifts: real.map(s => ({ ...s, v: +s.v.toFixed(4) })) }, null, 1));
await browser.close();
