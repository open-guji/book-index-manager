/**
 * overview#516 W-G：guji-markdown 一致性语料（open-guji/guji-format `spec/fixtures/cases.json`）过 bim 阅读器渲染。
 *
 * 语料在私有仓里，不进本仓：用环境变量 `GUJI_FORMAT_CASES` 指向 cases.json 才跑，没设就整组跳过。
 *   GUJI_FORMAT_CASES=/path/to/guji-format/spec/fixtures/cases.json GUJI_CONFORMANCE_OUT=/tmp/out.md npx vitest run tests/unit/guji-conformance-corpus.test.tsx
 *
 * bim 没有“规范化”（directive）这一层，只有渲染，所以只比渲染：
 *   - 文本：渲染后的 textContent（去空白）与语料 html 的 textContent 一致；
 *   - 结构：bim 已有的元素种类与语料数量一致（jz→.bim-jiazhu、qw→.bim-qw、qz→.bim-qz、zi→.bim-zi、table/tr/th/td）。
 * 不通过的先不修，只汇总（GUJI_CONFORMANCE_OUT 写成 markdown 清单）。
 */
import React from 'react';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ReaderMdText } from '../../src/components/Reader/ReaderText';

const CASES_PATH = process.env.GUJI_FORMAT_CASES;
const OUT = process.env.GUJI_CONFORMANCE_OUT;

interface Case { name: string; note?: string; guji: string; html: string; options?: unknown }

// 语料 class → bim 已实现的对应元素
const STRUCT: Array<[string, string, string]> = [
    ['jz', '.guji-jz', '.bim-jiazhu'],
    ['qw', '.guji-qw', '.bim-qw'],
    ['qz', '.guji-qz', '.bim-qz'],
    ['zi', '.guji-zi', '.bim-zi'],
    ['table', 'table', 'table'],
    ['tr', 'tr', 'tr'],
    ['th', 'th', 'th'],
    ['td', 'td', 'td'],
];
const squash = (s: string | null) => (s ?? '').replace(/\s+/g, '');

function check(c: Case): { ok: boolean; reasons: string[] } {
    const exp = document.createElement('div');
    exp.innerHTML = c.html;
    const { container } = render(<ReaderMdText text={c.guji} mode="line" tables gujiMarkdown />);
    const reasons: string[] = [];
    const et = squash(exp.textContent), at = squash(container.textContent);
    if (et !== at) reasons.push(`文本 期望「${et.slice(0, 40)}」实际「${at.slice(0, 40)}」`);
    for (const [k, es, as_] of STRUCT) {
        const e = exp.querySelectorAll(es).length, a = container.querySelectorAll(as_).length;
        if (e !== a) reasons.push(`${k} 期望${e}实际${a}`);
    }
    cleanup();
    return { ok: reasons.length === 0, reasons };
}

describe.skipIf(!CASES_PATH)('guji-format 一致性语料', () => {
    const cases: Case[] = CASES_PATH ? JSON.parse(fs.readFileSync(CASES_PATH, 'utf8')).cases : [];
    const results = cases.map(c => ({ c, ...check(c) }));

    it('语料已载入并逐例跑完', () => {
        expect(cases.length).toBeGreaterThan(0);
        const pass = results.filter(r => r.ok).length;
        const lines = [
            `一致性语料 ${cases.length} 例：通过 ${pass}，不通过 ${cases.length - pass}`,
            '',
            '| 组 | 通过/总数 |', '|---|---|',
            ...[...new Set(results.map(r => r.c.name.split('/')[0]))].map(g => {
                const rs = results.filter(r => r.c.name.startsWith(g + '/'));
                return `| ${g} | ${rs.filter(r => r.ok).length}/${rs.length} |`;
            }),
            '',
            '不通过：', '',
            ...results.filter(r => !r.ok).map(r => `- \`${r.c.name}\`：${r.reasons.join('；')}`),
        ];
        console.log(lines.join('\n'));
        if (OUT) fs.writeFileSync(OUT, lines.join('\n') + '\n');
    });
});
