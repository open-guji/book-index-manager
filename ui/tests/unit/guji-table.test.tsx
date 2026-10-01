/**
 * `:::table` 表格块（guji-table-v1，2026-09-27 TBL 道）。
 *
 * 样例取自 overview `项目进展/古籍文本/整体设计/展示样张/表格/` 的 6 份 md 及其 HTML
 * （文本总管 T19 用维基原表生成的对照页）。逐表逐行逐格比对：标签（th/td）、
 * colspan、rowspan、文字、夹注。
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
    parseGujiTable, splitFullTextTables, splitTableRow, hasGujiTableNotation,
} from '../../src/core/guji-table';
import { renderFullTextBody } from '../../src/components/detail/GujiTable';
import { renderInterlinear } from '../../src/components/detail/primitives';
import { TextReader } from '../../src/components/TextReader';
import { fakeTextTransport } from './helpers/text-transport';

const FIX = path.join(__dirname, 'fixtures', 'guji-table');
const SAMPLES = fs.readdirSync(FIX).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort();

interface CellShape { tag: string; colspan: number; rowspan: number; text: string; jz: string[] }

function shapeOf(table: Element): CellShape[][] {
    return Array.from(table.querySelectorAll('tr')).map(tr =>
        Array.from(tr.children).map(td => ({
            tag: td.tagName.toLowerCase(),
            colspan: Number(td.getAttribute('colspan') ?? 1),
            rowspan: Number(td.getAttribute('rowspan') ?? 1),
            text: (td.textContent ?? '').replace(/ /g, '').trim(),
            jz: Array.from(td.querySelectorAll('.jz, .bim-jiazhu')).map(e => e.textContent ?? ''),
        })),
    );
}

/**
 * 对照 HTML 本身与 md 不齐之处（维基原表不齐，md 转写时已规整），逐条登记：
 * key 为「样例名#表序#行序」（1 起），值为 HTML 该行尾部多出的空格子数。
 */
const KNOWN_HTML_TRAILING_PAD: Record<string, number> = {
    // 齊國王隆祐一组（跨 2 行）：维基原表这两行 9 格，同表其余各行 8 格；md 按 8 列写
    '05-遼史卷066-皇族表#7#6': 1,
    '05-遼史卷066-皇族表#7#7': 1,
};

describe('样张：md 解析结果与对照 HTML 一致', () => {
    it('6 个样例都在', () => {
        expect(SAMPLES).toHaveLength(6);
    });

    it.each(SAMPLES)('%s', (name) => {
        const md = fs.readFileSync(path.join(FIX, `${name}.md`), 'utf8');
        const html = fs.readFileSync(path.join(FIX, `${name}.html`), 'utf8');
        const expected = Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('table'))
            .map(shapeOf);

        const segs = splitFullTextTables(md);
        const tables = segs.filter(s => s.type === 'table');
        expect(tables.length).toBe(expected.length);
        for (const t of tables) if (t.type === 'table') expect(t.table.warnings).toEqual([]);

        const { container } = render(<div>{renderFullTextBody(md, true)}</div>);
        const actual = Array.from(container.querySelectorAll('table')).map(shapeOf);
        expect(actual.length).toBe(expected.length);
        actual.forEach((tbl, ti) => {
            expect(tbl.length, `表 ${ti + 1} 行数`).toBe(expected[ti].length);
            tbl.forEach((row, ri) => {
                let exp = expected[ti][ri];
                const pad = KNOWN_HTML_TRAILING_PAD[`${name}#${ti + 1}#${ri + 1}`];
                if (pad) {
                    const tail = exp.slice(exp.length - pad);
                    expect(tail.every(c => c.text === '' && c.colspan === 1 && c.rowspan === 1)).toBe(true);
                    exp = exp.slice(0, exp.length - pad);
                }
                expect(row, `表 ${ti + 1} 第 ${ri + 1} 行`).toEqual(exp);
            });
        });
    });

    it('遼史皇族表：跨行跨列落在正确位置', () => {
        const md = fs.readFileSync(path.join(FIX, '05-遼史卷066-皇族表.md'), 'utf8');
        const tables = splitFullTextTables(md).flatMap(s => (s.type === 'table' ? [s.table] : []));
        const t3 = tables[2];
        expect(t3.columns).toBe(9);
        expect(t3.rows[0].cells[0]).toMatchObject({ text: '橫帳孟父房巖木楚國王。', rowspan: 17, colspan: 1 });
        // `_^13`：空格子跨 13 行
        expect(t3.rows[4].cells[0]).toMatchObject({ empty: true, text: '', rowspan: 13 });
        // `孟父房，不知世次：{2}^3`
        expect(t3.rows[4].cells[1]).toMatchObject({ text: '孟父房，不知世次：', colspan: 2, rowspan: 3 });
    });
});

describe('parseGujiTable 规则', () => {
    it('表头、空格子、跨列、跨行、续格', () => {
        const t = parseGujiTable([
            '! 表头1 | 表头2 | 表头3',
            '甲 | 乙{2}',
            '丙^2 | _ | 丁',
            '^ | 戊 | 己',
        ]);
        expect(t.warnings).toEqual([]);
        expect(t.columns).toBe(3);
        expect(t.rows.map(r => r.header)).toEqual([true, false, false, false]);
        expect(t.rows[1].cells[1]).toEqual({ text: '乙', empty: false, colspan: 2, rowspan: 1 });
        expect(t.rows[2].cells[0]).toEqual({ text: '丙', empty: false, colspan: 1, rowspan: 2 });
        expect(t.rows[2].cells[1]).toEqual({ text: '', empty: true, colspan: 1, rowspan: 1 });
        // 续格不出格子
        expect(t.rows[3].cells.map(c => c.text)).toEqual(['戊', '己']);
    });

    it('跨列跨行合写 {n}^r，续格每列一个', () => {
        const t = parseGujiTable([
            '甲{2}^2 | 乙',
            '^ | ^ | 丙',
        ]);
        expect(t.warnings).toEqual([]);
        expect(t.rows[0].cells[0]).toMatchObject({ colspan: 2, rowspan: 2 });
    });

    it('写法瑕疵只记 warning，不抛错', () => {
        const t = parseGujiTable([
            '甲 | 乙 | 丙',
            '^ | 丁',          // 续格上方无跨行格，且少一列
            '戊^3 | 己 | 庚',  // 跨行超出表尾
        ]);
        expect(t.rows).toHaveLength(3);
        expect(t.warnings.some(w => w.includes('续格 ^ 上方没有跨行格'))).toBe(true);
        expect(t.warnings.some(w => w.includes('与总列数 3 不符'))).toBe(true);
        expect(t.warnings.some(w => w.includes('超出'))).toBe(true);
    });

    it('被跨行格占住的位置写了内容 → warning', () => {
        const t = parseGujiTable(['甲^2 | 乙', '丙 | 丁']);
        expect(t.warnings.some(w => w.includes('应写 ^'))).toBe(true);
    });

    it('夹注里的 | 不切格', () => {
        expect(splitTableRow('甲<注|文> | 乙⟨又|注⟩')).toEqual(['甲<注|文>', '乙⟨又|注⟩']);
        // 不生效的 `<`（后跟字母）照字面，其后的 | 照切
        expect(splitTableRow('a<b | c>')).toEqual(['a<b', 'c>']);
    });

    it('组字 :zi[…] 里的 | 不切格', () => {
        expect(splitTableRow('甲:zi[a|b]乙 | 丙')).toEqual(['甲:zi[a|b]乙', '丙']);
        // 嵌套方括号按计数配对
        expect(splitTableRow(':zi[⿰[a|b]c|d] | 戊')).toEqual([':zi[⿰[a|b]c|d]', '戊']);
        // `\]` 转义不算闭合，`\|` 原样留在格内
        expect(splitTableRow(':zi[a\\]|b] | 己')).toEqual([':zi[a\\]|b]', '己']);
        expect(splitTableRow(':zi[a\\|b] | 己')).toEqual([':zi[a\\|b]', '己']);
        // 格尾：组字后紧跟跨列／跨行记号，且在行末
        expect(splitTableRow('甲 | :zi[x|y]{2}^3')).toEqual(['甲', ':zi[x|y]{2}^3']);
        expect(splitTableRow('甲 | 乙:zi[x|y]')).toEqual(['甲', '乙:zi[x|y]']);
        // 夹注里的组字、组字里的夹注记号都不切
        expect(splitTableRow('<注:zi[a|b]> | 丙')).toEqual(['<注:zi[a|b]>', '丙']);
    });

    it('配不上的 :zi[ 按字面，其中的 | 照切', () => {
        expect(splitTableRow(':zi[a | b')).toEqual([':zi[a', 'b']);
        expect(splitTableRow(':zi[] | b')).toEqual([':zi[]', 'b']);
        // 转义掉了唯一的 ]，配不上
        expect(splitTableRow(':zi[a\\] | b')).toEqual([':zi[a\\]', 'b']);
    });

    it('组字 :zi[a|b] 在表格里算一个格', () => {
        const t = parseGujiTable(['! 甲 | 乙', ':zi[a|b] | 丙']);
        expect(t.columns).toBe(2);
        expect(t.warnings).toEqual([]);
        expect(t.rows[1].cells.map(c => c.text)).toEqual([':zi[a|b]', '丙']);
    });
});

describe('splitFullTextTables', () => {
    it('块外原样、块本身解析；紧贴的换行吃掉', () => {
        const segs = splitFullTextTables('前文。\n\n:::table\n甲 | 乙\n:::\n\n後文。\n');
        expect(segs.map(s => s.type)).toEqual(['text', 'table', 'text']);
        expect(segs[0]).toEqual({ type: 'text', text: '前文。' });
        expect(segs[2]).toEqual({ type: 'text', text: '後文。\n' });
    });

    it('未闭合的 :::table 按字面', () => {
        const src = '前文。\n:::table\n甲 | 乙\n';
        expect(splitFullTextTables(src)).toEqual([{ type: 'text', text: src }]);
    });

    it('连续两个表、表内空行跳过', () => {
        const segs = splitFullTextTables(':::table\n甲\n\n乙\n:::\n\n:::table\n丙\n:::');
        expect(segs.map(s => s.type)).toEqual(['table', 'table']);
        if (segs[0].type === 'table') expect(segs[0].table.rows).toHaveLength(2);
    });
});

describe('渲染', () => {
    it('格内夹注以小字渲染、不露记号；空格子无内容', () => {
        const { container } = render(<div>{renderFullTextBody(':::table\n!年 | 事\n一月<注文> | _\n:::', true)}</div>);
        expect(container.querySelectorAll('th')).toHaveLength(2);
        const tds = container.querySelectorAll('td');
        expect(tds[0].querySelector('.bim-jiazhu')!.textContent).toBe('注文');
        expect(tds[0].textContent).toBe('一月注文');
        expect(tds[1].textContent).toBe('');
    });

    it('启用写法时整行 **…** 加粗', () => {
        const { container } = render(<div>{renderFullTextBody('**燕王房**\n\n:::table\n甲\n:::', true)}</div>);
        expect(container.querySelector('strong')!.textContent).toBe('燕王房');
    });

    it('未启用写法：与 renderInterlinear 输出逐字一致（:::table 按字面）', () => {
        const body = '前文<注>。\n\n**燕王房**\n\n:::table\n甲 | 乙{2}\n:::\n';
        const a = render(<div>{renderFullTextBody(body, false)}</div>).container.innerHTML;
        const b = render(<div>{renderInterlinear(body)}</div>).container.innerHTML;
        expect(a).toBe(b);
        expect(a).not.toContain('<table');
    });

    it('hasGujiTableNotation 只认 guji-table-v1', () => {
        expect(hasGujiTableNotation({ table_notation: 'guji-table-v1' })).toBe(true);
        expect(hasGujiTableNotation({ table_notation: 'other' })).toBe(false);
        expect(hasGujiTableNotation({})).toBe(false);
        expect(hasGujiTableNotation(null)).toBe(false);
    });
});

describe('TextReader 接入（全文章）', () => {
    const text = '## 卷一\n\n表前。\n\n:::table\n!甲 | 乙\n丙 | 丁\n:::\n';
    function mount(index: Record<string, unknown> = {}) {
        const transport = fakeTextTransport('b1', {
            chapters: [{ n: 1, title: '卷一', file: '001' }],
            index: { source: { name: '维基文库', url: 'https://example.org' }, ...index },
            md: text,
        });
        return render(<TextReader id="b1" transport={transport} />).container;
    }

    it('目录带 table_notation → 出表格', async () => {
        const c = mount({ table_notation: 'guji-table-v1' });
        await waitFor(() => expect(c.querySelector('article table')).toBeTruthy());
        expect(c.querySelectorAll('article th')).toHaveLength(2);
        expect(c.querySelector('article')!.textContent).not.toContain(':::');
    });

    it('目录不带 → 原样文本，无表格', async () => {
        const c = mount();
        await waitFor(() => expect(c.querySelector('article')).toBeTruthy());
        expect(c.querySelector('article table')).toBeNull();
        expect(c.querySelector('article')!.textContent).toContain(':::table');
    });
});
