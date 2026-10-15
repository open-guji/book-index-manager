/**
 * F6 步 6（GUJI-316）：阅读器叶子 → 章 md 码点下标（`ctx.mdStart`）。
 *
 * 全量对拍（可重复）：偏移基准＝book-text `default/<章>.md` 经通用换行后的码点。语料用环境变量指向 book-text 检出里的 .md（不用 COS .txt）：
 *   MD_CURSOR_CORPUS=/path/Work/1/d/u/d59f2htm01du/default/001.md npx vitest run tests/unit/md-cursor.test.tsx
 * 多个文件用 `:` 分隔。没设就只跑上面的小例子。
 */
import React from 'react';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ReaderMdText } from '../../src/components/Reader/ReaderText';
import { createMdCursor, mdCursorBlocker, normalizeNewlines } from '../../src/core/md-cursor';

const cp = (s: string) => Array.from(s);

describe('createMdCursor', () => {
    it('跳过标记符与注释，返回码点下标', () => {
        const c = createMdCursor('<!-- x\n y -->\n\n# 易類\n\n**《周易》六卷**\n\n魏王弼注其人。');
        const md = cp('<!-- x\n y -->\n\n# 易類\n\n**《周易》六卷**\n\n魏王弼注其人。');
        const a = c.align('易類')!;
        expect(md.slice(a, a + 2).join('')).toBe('易類');
        const b = c.align('魏王弼注其人。')!;
        expect(md.slice(b, b + 7).join('')).toBe('魏王弼注其人。');
        expect(b).toBeGreaterThan(a);
    });

    it('按码点计：扩展 B 区字占 1', () => {
        const c = createMdCursor('甲𠀀乙丙丁戊己庚');
        expect(c.align('甲𠀀乙')).toBe(0);
        expect(c.align('丙丁')).toBe(3); // 甲0 𠀀1 乙2 丙3；UTF-16 下标会是 4
    });

    it('并段插入的全角空格不在 md 里：跳过', () => {
        const md = '條目一。\n條目二。';
        const c = createMdCursor(md);
        expect(c.align('條目一。　條目二。')).toBe(0);
    });

    it('长叶子可跨过被提升走的整行；短叶子不跨', () => {
        const md = '前文很长的一段文字内容。\n\n**被提升到页头的卷目行**\n\n后文接续的另一段较长文字。';
        const c1 = createMdCursor(md);
        c1.align('前文很长的一段文字内容。');
        const hit = c1.align('后文接续的另一段较长文字。')!;
        expect(cp(md).slice(hit, hit + 3).join('')).toBe('后文接');
        const c2 = createMdCursor(md);
        c2.align('前文很长的一段文字内容。');
        expect(c2.align('后文')).toBeUndefined(); // 太短，中间隔着非标记内容
    });

    it('对不上返回 undefined 且游标不动', () => {
        const c = createMdCursor('甲乙丙丁戊己庚辛壬癸');
        expect(c.align('不存在的文字内容')).toBeUndefined();
        expect(c.align('甲乙丙')).toBe(0);
    });

    it('游标只向前：重复文字不回到前面的出现', () => {
        const md = '子曰學而時習之。子曰學而時習之。';
        const c = createMdCursor(md);
        expect(c.align('子曰學而時習之。')).toBe(0);
        expect(c.align('子曰學而時習之。')).toBe(8);
    });
});

describe('mdCursorBlocker', () => {
    it('可靠章不拦', () => expect(mdCursorBlocker('甲乙', '甲乙', true)).toBeNull());
    it('\\r\\n 归一后可用；孤立 \\r 拦', () => {
        expect(mdCursorBlocker('甲\r\n乙', '甲\r\n乙', true)).toBeNull();
        expect(mdCursorBlocker('甲\r乙', '甲\r乙', true)).toBe('lone-cr');
    });
    it('繁简转换码点数变了拦；引号样式非原样拦；含表格拦', () => {
        expect(mdCursorBlocker('甲乙丙', '甲乙', true)).toBe('convert-length');
        expect(mdCursorBlocker('甲', '甲', false)).toBe('quoteStyle');
        expect(mdCursorBlocker(':::table\n甲', ':::table\n甲', true)).toBe('tables');
    });
});

function collect(md: string, mode: 'line' | 'paragraph' = 'line', extra: Record<string, unknown> = {}) {
    const leaves: Array<{ s: string; mdStart?: number }> = [];
    render(
        <ReaderMdText
            text={md}
            mode={mode}
            renderText={(s, ctx) => { leaves.push({ s, mdStart: ctx?.mdStart }); return s; }}
            {...extra}
        />,
    );
    cleanup();
    return leaves;
}

describe('ReaderMdText 叶子带 mdStart', () => {
    const md = '<!-- 说明 -->\n\n# 易類\n\n**《周易注》六卷**\n\n魏尚書郎王弼注，晉韓康伯注《繫辭》。\n\n甲<夾注內容>乙丙丁戊己。';

    it('line 模式：每个叶子的首字就是 md 在 mdStart 处的字', () => {
        const norm = cp(normalizeNewlines(md));
        const leaves = collect(md);
        expect(leaves.length).toBeGreaterThan(3);
        for (const l of leaves) {
            expect(l.mdStart, `叶子 ${l.s}`).toBeDefined();
            expect(norm[l.mdStart!]).toBe(cp(l.s)[0]);
        }
    });

    it('旧调用方只收 s：行为不变', () => {
        const out: string[] = [];
        render(<ReaderMdText text="甲乙丙" mode="line" renderText={(s) => { out.push(s); return s; }} />);
        cleanup();
        expect(out.join('')).toContain('甲乙丙');
    });

    it('孤立 \\r 的章不给任何锚点', () => {
        const leaves = collect('甲乙丙丁戊\r己庚辛壬癸');
        expect(leaves.length).toBeGreaterThan(0);
        expect(leaves.every(l => l.mdStart === undefined)).toBe(true);
    });

    it('\\r\\n 的章仍给锚点，且按归一后的码点数', () => {
        const leaves = collect('甲乙丙\r\n\r\n丁戊己庚辛壬癸');
        const second = leaves.find(l => l.s.startsWith('丁'))!;
        expect(second.mdStart).toBe(cp('甲乙丙\n\n').length);
    });

    it('引号样式非原样：整章不给锚点', () => {
        const leaves = collect('甲「乙」丙', 'line', { quoteStyle: 'curly' });
        expect(leaves.every(l => l.mdStart === undefined)).toBe(true);
    });
});

// ---- 全量对拍（需要 book-text .md；没设环境变量就跳过） ----
const CORPUS = (process.env.MD_CURSOR_CORPUS ?? '').split(':').filter(f => f && fs.existsSync(f));

describe.skipIf(CORPUS.length === 0)('全量对拍：book-text .md', () => {
    for (const file of CORPUS) {
        for (const mode of ['line', 'paragraph'] as const) {
            it(`${file.split('/').slice(-3).join('/')} · ${mode}`, () => {
                const raw = fs.readFileSync(file, 'utf8');
                const norm = cp(normalizeNewlines(raw));
                const leaves = collect(raw, mode);
                let anchored = 0, wrong = 0, total = 0, prev = -1, back = 0;
                for (const l of leaves) {
                    const sc = cp(l.s);
                    if (sc.every(c => /\s/.test(c) || c === '　')) continue;
                    total++;
                    if (l.mdStart === undefined) continue;
                    anchored++;
                    const first = sc.find(c => c !== '　')!;
                    if (norm[l.mdStart] !== first) wrong++;
                    if (l.mdStart < prev) back++;
                    prev = l.mdStart;
                }
                // 错位（锚点处的字不是叶子首字、或锚点倒退）必须为 0；覆盖率只汇报
                // eslint-disable-next-line no-console
                console.log(`[md-cursor] ${file} ${mode}: 叶子 ${total}，有锚点 ${anchored}（${((anchored / Math.max(total, 1)) * 100).toFixed(1)}%），错位 ${wrong}，倒退 ${back}`);
                expect(wrong).toBe(0);
                expect(back).toBe(0);
                expect(anchored / Math.max(total, 1)).toBeGreaterThan(0.9);
            });
        }
    }
});
