/**
 * 阅读页几何量测：目录栏、正文列的宽度与间距，并截图。
 *   node tests/cls/geometry.mjs read 1440 900 out.png
 * 输出 JSON：页面横向滚动宽度、目录/正文列 rect、目录右缘到正文左缘的空隙、正文列宽。
 */
import { chromium } from '@playwright/test';

const [,, scenario = 'read', w = '1440', h = '900', out = ''] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: +w < 500, isMobile: +w < 500 });
const page = await ctx.newPage();
await page.goto(`http://localhost:5199/tests/cls/harness.html?s=${scenario}`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const g = await page.evaluate(() => {
    const r = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right) }; };
    const toc = r('.bim-rd-toc'), col = r('.bim-rd-col'), text = r('.bim-rd-text'), prose = r('.bim-rd-prose'), main = r('.bim-d-main');
    return {
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
        main, toc, text, col, prose,
        gapTocToCol: toc && col ? col.x - toc.right : null,
    };
});
console.log(JSON.stringify({ scenario, width: +w, ...g }));
if (out) await page.screenshot({ path: out });
await browser.close();
