/**
 * 阅读器版式护栏（overview#526 第 1 项）。jsdom 没有布局，下面这些只有真浏览器能量：
 *   - 行首空白（0.52.0）：换行后每一行第一个字的 x 必须贴着段落左缘；
 *   - 抬头列首字偏高（0.52.0，0.52.3 修）：抬头字的 y 必须与同行的字一致。
 * 量的是几何关系而不是截图像素——不同机器字体不同，像素比对会误报，几何关系与字体无关。
 */
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '') {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`/tests/layout/harness.html?s=text${query}`);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await page.waitForSelector('.guji-reflow-paragraph [data-char-id]');
    await page.evaluate(() => document.fonts.ready);
    return errors;
}

test.describe('正文重排版式', () => {
    test('挂载无报错，且三页的字都在（第 3、4、5 页）', async ({ page }) => {
        const errors = await open(page);
        expect(errors).toEqual([]);
        const pages = await page.$$eval('[data-page-section]', els => els.map(e => e.getAttribute('data-page-section')));
        expect(pages).toEqual(['3', '4', '5']);
        expect(await page.locator('[data-char-id]').count()).toBeGreaterThan(400);
    });

    test('每页 section 的占位高度（content-visibility 用）在真浏览器里算得出来：auto ＋ 正的像素值（GUJI-632）', async ({ page }) => {
        await open(page);
        const sizes = await page.$$eval('[data-page-section]', els => els.map(e => {
            const cs = getComputedStyle(e);
            return { cv: cs.contentVisibility, cis: cs.containIntrinsicHeight || cs.getPropertyValue('contain-intrinsic-height') };
        }));
        for (const s of sizes) {
            expect(s.cv).toBe('auto');
            expect(s.cis).toMatch(/^auto \d+(\.\d+)?px$/);
            expect(parseFloat(s.cis.replace('auto ', ''))).toBeGreaterThan(64);
        }
    });

    test('换行处无空白：非首行的第一个字贴着段落左缘（行首空格列不渲染成空位）', async ({ page }) => {
        await open(page);
        const bad = await page.$$eval('p.guji-reflow-paragraph', ps => {
            const out: string[] = [];
            ps.forEach((p, pi) => {
                const pr = p.getBoundingClientRect();
                const pad = parseFloat(getComputedStyle(p).paddingLeft) || 0;
                const left = pr.left + pad;
                // 按垂直中心聚成「行」：同一行里 20px 的字与 16px 的单行小注 top 相差约 4px、中心只差 1–3px，
                // 行距约 41px；相邻中心差 < 12px 算同一行。（用 top 取整分组会把一行拆成两组，行中间的字被当成行首）
                const rects: { x: number; cy: number; id: string }[] = [];
                for (const s of Array.from(p.querySelectorAll<HTMLElement>('span[data-char-id]'))) {
                    // 夹注（is-sub）也算：一行可以以夹注开头，排除它会把夹注后面的正文字当成行首
                    for (const r of Array.from(s.getClientRects())) rects.push({ x: r.left, cy: r.top + r.height / 2, id: s.getAttribute('data-char-id') ?? '' });
                }
                rects.sort((a, b) => a.cy - b.cy);
                const lines: { cy: number; x: number; id: string }[] = [];
                for (const r of rects) {
                    const last = lines[lines.length - 1];
                    if (last && Math.abs(r.cy - last.cy) < 12) { if (r.x < last.x) { last.x = r.x; last.id = r.id; } }
                    else lines.push({ cy: r.cy, x: r.x, id: r.id });
                }
                const sorted = lines.map(l => [l.cy, l] as const);
                // 第一行有 text-indent，不查；其后每一行的起点必须贴着左缘（容差 1.5px）
                sorted.slice(1).forEach(([, l]) => { if (Math.abs(l.x - left) > 1.5) out.push(`段${pi} 行首 ${l.id} 偏离左缘 ${Math.round(l.x - left)}px`); });
            });
            return out;
        });
        expect(bad, '换行处出现了空白').toEqual([]);
    });

    test('行内无空位：同一行里相邻两字的间距不超过 0.9 个字宽（0.52.0 的行首空格被渲染成 2 字宽空位）', async ({ page }) => {
        await open(page);
        const bad = await page.$$eval('p.guji-reflow-paragraph', ps => {
            const out: string[] = [];
            ps.forEach((p, pi) => {
                type R = { l: number; r: number; cy: number; fs: number; id: string };
                const rects: R[] = [];
                for (const s of Array.from(p.querySelectorAll<HTMLElement>('span[data-char-id]'))) {
                    const fs = parseFloat(getComputedStyle(s).fontSize);
                    for (const r of Array.from(s.getClientRects())) rects.push({ l: r.left, r: r.right, cy: r.top + r.height / 2, fs, id: s.getAttribute('data-char-id') ?? '' });
                }
                rects.sort((a, b) => a.cy - b.cy);
                const lines: R[][] = [];
                for (const r of rects) {
                    const last = lines[lines.length - 1];
                    if (last && Math.abs(r.cy - last[0].cy) < 12) last.push(r); else lines.push([r]);
                }
                lines.forEach(line => {
                    line.sort((a, b) => a.l - b.l);
                    for (let i = 1; i < line.length; i++) {
                        const gap = line[i].l - line[i - 1].r;
                        if (gap > line[i - 1].fs * 0.9) out.push(`段${pi} ${line[i - 1].id}→${line[i].id} 间距 ${Math.round(gap)}px`);
                    }
                });
            });
            return out;
        });
        expect(bad, '行内出现了空位').toEqual([]);
    });

    test('抬头列首字不偏移：与同行的字同一水平线，且没有位移样式', async ({ page }) => {
        await open(page);
        const raised = await page.$$eval('span.guji-text-char.is-raised', els => els.map(e => {
            const cs = getComputedStyle(e);
            const line = e.getBoundingClientRect();
            // 同一行（top 相差不到半个字）的正文字，取中位数
            const p = e.closest('p')!;
            const mates = Array.from(p.querySelectorAll<HTMLElement>('span[data-char-id]'))
                .filter(s => s !== e && !s.classList.contains('is-sub') && Math.abs(s.getBoundingClientRect().top - line.top) < line.height * 0.6);
            const tops = mates.map(s => s.getBoundingClientRect().top).sort((a, b) => a - b);
            return {
                id: e.getAttribute('data-char-id'),
                dy: tops.length ? line.top - tops[Math.floor(tops.length / 2)] : null,
                mates: tops.length,
                transform: cs.transform, position: cs.position, top: cs.top,
            };
        }));
        expect(raised.length, '第 3 页应有一个抬头列首字').toBeGreaterThanOrEqual(1);
        for (const r of raised) {
            expect(r.mates, `${r.id} 同行至少要有别的字可比`).toBeGreaterThan(0);
            expect(Math.abs(r.dy!), `${r.id} 与同行字的 y 差`).toBeLessThanOrEqual(2);
            expect(r.transform, `${r.id} 不应有位移`).toBe('none');
            expect(['static', 'relative']).toContain(r.position);
        }
    });
});

test.describe('书影画布：去空白', () => {
    async function dims(page: Page, margins: 0 | 1) {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(`/tests/layout/harness.html?s=canvas&margins=${margins}`);
        await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
        const canvas = page.locator('#host canvas');
        await canvas.waitFor();
        // 逻辑尺寸（原图像素坐标系，去空白时是裁切区，取整截断）在 data-logical-size；<canvas width> 是后备尺寸，
        // 按显示尺寸开（GUJI-629），不再等于逻辑尺寸
        const d = await canvas.evaluate(c => {
            const [w, h] = (c.getAttribute('data-logical-size') ?? '0x0').split('x').map(Number);
            return { w, h, backingW: (c as HTMLCanvasElement).width, backingH: (c as HTMLCanvasElement).height, cssW: c.clientWidth };
        });
        const meta = await page.evaluate(() => ({
            image: (window as unknown as { __image: { w: number; h: number } }).__image,
            trim: (window as unknown as { __trim: { w: number; h: number } | null }).__trim,
            boxes: (window as unknown as { __boxes: number[][] }).__boxes,
        }));
        return { ...d, ...meta, errors };
    }

    test('去空白与保留空白的画布尺寸不同；去空白等于字框外接矩形（加 3% 边），比整幅原图小', async ({ page }) => {
        const trimmed = await dims(page, 0);
        const kept = await dims(page, 1);
        expect(trimmed.errors.concat(kept.errors), '页面报错').toEqual([]);
        expect(trimmed.trim, '这一页应能算出裁切区（字框没占满整图）').not.toBeNull();
        // 保留空白：整幅原图的宽
        expect(kept.w).toBe(kept.image.w);
        // 高度同样是原图高（不被版心高度的下限撑高，否则整图纵向拉伸、字框对不上）
        expect(kept.h).toBe(kept.image.h);
        // 去空白：画布就是裁切区，且两个方向都比保留空白小
        // 裁切区是小数；<canvas width> 属性按整数解析，截断而不是四舍五入
        // 预期裁切区在这里独立算（字框并集＋短边 3% 的边），不借用被测的 fullImageTrimRect——否则它错了测试也跟着错
        const xs = trimmed.boxes.flatMap(b => [b[0], b[2]]), ys = trimmed.boxes.flatMap(b => [b[1], b[3]]);
        const pad = Math.min(trimmed.image.w, trimmed.image.h) * 0.03;
        const ew = Math.min(trimmed.image.w, Math.max(...xs) + pad) - Math.max(0, Math.min(...xs) - pad);
        const eh = Math.min(trimmed.image.h, Math.max(...ys) + pad) - Math.max(0, Math.min(...ys) - pad);
        expect(trimmed.trim!.w).toBeCloseTo(ew, 6);
        expect(trimmed.trim!.h).toBeCloseTo(eh, 6);
        expect(trimmed.w).toBe(Math.floor(ew));
        expect(trimmed.h).toBe(Math.floor(eh));
        expect(trimmed.w).toBe(Math.floor(trimmed.trim!.w));
        expect(trimmed.h).toBe(Math.floor(trimmed.trim!.h));
        expect(trimmed.w, '去空白后宽度应变小').toBeLessThan(kept.w);
        expect(trimmed.h, '去空白后高度应变小').toBeLessThan(kept.h);
        // 去空白前后不能一样（「去空白不生效」的回归就是两者相等）
        expect([trimmed.w, trimmed.h]).not.toEqual([kept.w, kept.h]);
        // 后备尺寸按显示尺寸开：不超过逻辑尺寸、不超过显示宽 × 2（DPR 上限）向上取 64 的倍数，长宽比与逻辑尺寸一致
        for (const d of [trimmed, kept]) {
            expect(d.backingW).toBeGreaterThan(1);
            expect(d.backingW).toBeLessThanOrEqual(d.w + 1);
            expect(d.backingW).toBeLessThanOrEqual(Math.ceil((d.cssW * 2) / 64) * 64);
            expect(Math.abs(d.backingH / d.backingW - d.h / d.w)).toBeLessThan(0.01);
        }
    });
});
