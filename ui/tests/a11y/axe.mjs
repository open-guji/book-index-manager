/**
 * 阅读首页、阅读页（overview#308）与元数据首页（#322）的 axe 检查：3 配色 × 2 版式 × 桌面 1440／手机 390，
 * 只拦 critical 与 serious（WCAG 2.0/2.1 A、AA），与网站 e2e/ui/a11y.spec.ts 同口径。
 * 阅读页在手机上另把「字号」「书影」两个底部抽屉各打开扫一遍。
 *
 * 先起 dev server：`npx vite --port 5199`，再：
 *   node tests/a11y/axe.mjs
 * axe-core 不在本包依赖里：用环境变量 AXE_CORE 指向 axe.min.js（或装在可 import 到的位置）。
 * 环境变量 CHROME 可指定浏览器可执行文件。有违规时退出码 1，并列出规则、级别与选择器。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const BASE = process.env.HARNESS_URL || 'http://localhost:5199/tests/a11y/harness.html';
const axePath = process.env.AXE_CORE || createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const axeSrc = readFileSync(axePath, 'utf-8');

const THEMES = ['zhusha', 'indigo', 'ink'];
const LAYOUTS = ['airy', 'boxed'];
const VIEWPORTS = [{ name: '桌面 1440', width: 1440, height: 900 }, { name: '手机 390', width: 390, height: 844 }];
/** [场景, 打开哪个抽屉（只在手机）] */
const SCENES = [['home', null], ['reader', null], ['reader', '字号'], ['reader', '书影'], ['meta', null], ['meta-empty', null]];

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
let failed = 0;
let runs = 0;
for (const vp of VIEWPORTS) {
    const mobile = vp.width < 500;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    for (const theme of THEMES) {
        for (const layout of LAYOUTS) {
            for (const [scene, sheet] of SCENES) {
                if (sheet && !mobile) continue;
                const page = await ctx.newPage();
                await page.goto(`${BASE}?s=${scene}&theme=${theme}&layout=${layout}`, { waitUntil: 'networkidle' });
                await page.waitForSelector(scene === 'home' ? '.bim-rh' : scene.startsWith('meta') ? (scene === 'meta' ? '.bim-mh-recent li' : '.bim-mh-recent-empty') : '.bim-rd');
                if (sheet) {
                    await page.getByRole('navigation', { name: '阅读工具' }).getByRole('button', { name: sheet }).click();
                    await page.getByRole('dialog', { name: sheet }).waitFor();
                }
                await page.addScriptTag({ content: axeSrc });
                const violations = await page.evaluate(async () => {
                    // eslint-disable-next-line no-undef
                    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
                    return r.violations
                        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
                        .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
                });
                runs++;
                const tag = `[${vp.name}] ${scene}${sheet ? `＋${sheet}抽屉` : ''} · ${theme}＋${layout}`;
                if (violations.length) {
                    failed++;
                    console.log(`✗ ${tag}`);
                    for (const v of violations) console.log(`    - [${v.impact}] ${v.id}：${v.help}\n      ${v.nodes.join('\n      ')}`);
                } else {
                    console.log(`✓ ${tag}`);
                }
                await page.close();
            }
        }
    }
    await ctx.close();
}
await browser.close();
console.log(`\n${runs} 项，${failed ? `${failed} 项有严重／关键问题` : '全部无严重／关键问题'}`);
process.exitCode = failed ? 1 : 0;
