/**
 * overview#517 W-E 抽样：book-text 原件（96mid1ogzk 武英殿刻本卷二、卷三）真实 char／cord 过适配器与阅读器，不报错、计数对得上。
 * book-text 很大，不进本仓：用环境变量指向条目的 default 目录才跑，没设整组跳过。
 *   BOOK_TEXT_ORIGINAL_DIR=…/book-text/Book/g/z/k/96mid1ogzk/default npx vitest run tests/unit/guji-char-fields-real.test.tsx
 * 工作包给的计数：lacuna 18、lane:solo 4、raised 112、blank 26、lead_blank 2,248（均为两卷合计，raised／lead_blank／blank 按列计）。
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

const DIR = process.env.BOOK_TEXT_ORIGINAL_DIR;
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR!, f), 'utf8'));

// 注意：skipIf 只跳过 it，describe 体照样执行——读文件必须放进 it／beforeAll，不能写在体里（没设环境变量时 DIR 是 undefined）
describe.skipIf(!DIR)('原件真实数据抽样', () => {
    const loaded = new Map<string, ReturnType<typeof adaptCharCord>>();
    const volPages = (v: string) => {
        if (!loaded.has(v)) loaded.set(v, adaptCharCord(read(`${v}.char.json`), read(`${v}.cord.json`)));
        return loaded.get(v)!;
    };

    it('字段计数与工作包一致', () => {
        let lacuna = 0, solo = 0, raised = 0, blank = 0, lead = 0;
        for (const pages of ['002', '003'].map(volPages)) for (const p of pages) for (const c of p.columns) {
            if (c.kind === 'blank') blank++;
            if (c.raised) raised++;
            if (c.lead_blank) lead++;
            for (const ch of c.chars) { if (ch.lacuna) lacuna++; if (ch.lane === 'solo') solo++; }
        }
        expect({ lacuna, solo, raised, blank, lead }).toEqual({ lacuna: 18, solo: 4, raised: 112, blank: 26, lead: 2248 });
    });

    it.each(['002', '003'])('卷 %s 整册渲染不报错，DOM 里的新标记数 = 数据里的数', (v) => {
        const pages = volPages(v);
        const pageData: any = { page_id: `vol:${v}`, columns: [], pages };
        const { container } = render(
            <LocaleProvider locale="zh-Hant">
                <GujiTextViewer pageData={pageData} pages={pages as any} selectedCharIds={new Set()} />
            </LocaleProvider>,
        );
        const count = (f: (c: (typeof pages)[0]['columns'][0]) => boolean) => pages.reduce((n, p) => n + p.columns.filter(f).length, 0);
        // 只算进了正文的页（有字）；blank 列在无字页上不进正文
        const textPages = pages.filter(p => p.columns.some(c => c.chars.length > 0));
        const inText = (f: (c: (typeof pages)[0]['columns'][0]) => boolean) => textPages.reduce((n, p) => n + p.columns.filter(f).length, 0);
        expect(container.querySelectorAll('.guji-text-lead-blank')).toHaveLength(inText(c => !!c.lead_blank && c.chars.length > 0));
        expect(container.querySelectorAll('.is-raised')).toHaveLength(inText(c => !!c.raised && c.chars.length > 0));
        expect(container.querySelectorAll('.guji-text-blank-col')).toHaveLength(inText(c => c.kind === 'blank'));
        expect(container.querySelectorAll('.is-lacuna')).toHaveLength(textPages.reduce((n, p) => n + p.columns.reduce((m, c) => m + c.chars.filter(x => x.lacuna).length, 0), 0));
        expect(count(() => true)).toBeGreaterThan(0);
    });
});
