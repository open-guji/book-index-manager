/**
 * guji-markdown 0.2.0 行内新写法（GM2 道，2026-09-27）。
 *
 * 规范：open-guji/guji-markdown `spec/syntax.md` §1「分行」、§13 阙文、§14 缺字猜测、§16 组字。
 * 每种写法至少 3 例，含与夹注 `<…>` 相互嵌套的情形；另有启用开关、零回归、宋史卷215 组字样本。
 *
 * `fixtures/guji-inline/songshi-215-zi.md`：宋史卷215 含组字的 50 行（52 处），由本道按规范转的临时样本——
 * 17 处照 T26 候选清单（IDS／嵌套 IDS／文字描述），35 处两字无方位者原样包进 `:zi[…]`
 * （规范 §16 不建议这样写，此处只为验证渲染；写回 book-text 的写法由文本总管定）。
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
    parseGujiInline, gujiInlineToPlain, hasGujiMarkdownV02, mayHaveGujiInline,
} from '../../src/core/guji-inline';
import { renderInterlinear } from '../../src/components/detail/primitives';
import { renderFullTextBody } from '../../src/components/detail/GujiTable';
import { TextReader } from '../../src/components/TextReader';
import { fakeTextTransport } from './helpers/text-transport';

const ON = { gujiMarkdown: true };
const html = (node: React.ReactNode) => render(<>{node}</>).container;
const plain = (s: string) => gujiInlineToPlain(parseGujiInline(s));

describe('启用条件 hasGujiMarkdownV02', () => {
    it('0.2.0 及以上才启用', () => {
        expect(hasGujiMarkdownV02({ guji_markdown: '0.2.0' })).toBe(true);
        expect(hasGujiMarkdownV02({ guji_markdown: '0.2' })).toBe(true);
        expect(hasGujiMarkdownV02({ guji_markdown: '0.3.1' })).toBe(true);
        expect(hasGujiMarkdownV02({ guji_markdown: '1.0.0' })).toBe(true);
    });
    it('未声明、0.1.x、非法取值一律不启用', () => {
        expect(hasGujiMarkdownV02(null)).toBe(false);
        expect(hasGujiMarkdownV02({})).toBe(false);
        expect(hasGujiMarkdownV02({ guji_markdown: '0.1.0' })).toBe(false);
        expect(hasGujiMarkdownV02({ guji_markdown: 'v0.2' })).toBe(false);
        expect(hasGujiMarkdownV02({ guji_markdown: 0.2 as unknown as string })).toBe(false);
    });
});

describe('组字 :zi[…]（§16）', () => {
    it('IDS：方框字、与正文同级、title 带原描述，不当夹注', () => {
        const c = html(renderInterlinear('令:zi[⿰句員]卒', undefined, ON));
        const zi = c.querySelector('.bim-zi')!;
        expect(zi.textContent).toBe('⿰句員');
        expect(zi.getAttribute('title')).toBe('組字：⿰句員');
        expect((zi as HTMLElement).style.fontSize).toBe('1em');
        expect(c.querySelector('.bim-jiazhu')).toBeNull();
        expect(c.textContent).toBe('令⿰句員卒');
    });
    it('嵌套 IDS 与文字描述（含逗号、半角逗号）原样', () => {
        expect(parseGujiInline(':zi[⿱宀⿱出心]')).toEqual([{ type: 'zi', label: '⿱宀⿱出心' }]);
        expect(parseGujiInline('孟:zi[三囗，囗中為歹]')).toEqual([
            { type: 'text', text: '孟' }, { type: 'zi', label: '三囗，囗中為歹' },
        ]);
        expect(parseGujiInline(':zi[泑,ㄠ在力上]')[0]).toEqual({ type: 'zi', label: '泑,ㄠ在力上' });
    });
    it('嵌在夹注里：`<:zi[⿰句員]>` → 夹注内一个组字', () => {
        const nodes = parseGujiInline('令<:zi[⿰句員]>');
        expect(nodes).toEqual([
            { type: 'text', text: '令' },
            { type: 'jz', children: [{ type: 'zi', label: '⿰句員' }] },
        ]);
        const c = html(renderInterlinear('令<音:zi[⿰句員]>', undefined, ON));
        expect(c.querySelector('.bim-jiazhu .bim-zi')!.textContent).toBe('⿰句員');
    });
    it('label 内配对方括号与转义；空 label、跨行、未闭合按字面', () => {
        expect(parseGujiInline(':zi[甲[乙]丙]')[0]).toEqual({ type: 'zi', label: '甲[乙]丙' });
        expect(parseGujiInline(':zi[甲\\]乙]')[0]).toEqual({ type: 'zi', label: '甲]乙' });
        expect(plain(':zi[]')).toBe(':zi[]');
        expect(plain(':zi[甲\n乙]')).toBe(':zi[甲\n乙]');
        expect(plain(':zi[甲乙')).toBe(':zi[甲乙');
    });
});

describe('阙文 [[…]]（§13）', () => {
    it('显示 □，说明藏在 title', () => {
        const c = html(renderInterlinear('[[凡三字，漫漶不可辨]]', undefined, ON));
        expect(c.textContent).toBe('□');
        expect(c.querySelector('.bim-qw')!.getAttribute('title')).toBe('闕文：凡三字，漫漶不可辨');
    });
    it('内容可空', () => {
        const c = html(renderInterlinear('帝崩，[[]]即位。', undefined, ON));
        expect(c.textContent).toBe('帝崩，□即位。');
        expect(c.querySelector('.bim-qw')!.getAttribute('title')).toBe('闕文');
    });
    it('在夹注里；夹注在阙文说明里不被拆开', () => {
        const c = html(renderInterlinear('甲<注[[二字]]文>乙', undefined, ON));
        expect(c.querySelector('.bim-jiazhu')!.textContent).toBe('注□文');
        expect(parseGujiInline('[[原作<某>]]')).toEqual([{ type: 'qw', label: '原作<某>' }]);
    });
    it('跨行或找不到 ]] 按字面', () => {
        expect(plain('[[漫漶]{{甲}}')).toBe('[[漫漶]{{甲}}');
        expect(plain('[[甲\n乙]]')).toBe('[[甲\n乙]]');
    });
});

describe('缺字猜测 □{guess=X}（§14）', () => {
    it('只显示 □，猜测字留在 data 属性、不进正文', () => {
        const c = html(renderInterlinear('帝崩，太子□{guess=即}位。', undefined, ON));
        expect(c.textContent).toBe('帝崩，太子□位。');
        expect(c.querySelector('.bim-qz')!.getAttribute('data-guji-guess')).toBe('即');
    });
    it('在夹注里', () => {
        const c = html(renderInterlinear('正文<□{guess=某}氏>', undefined, ON));
        expect(c.querySelector('.bim-jiazhu')!.textContent).toBe('□氏');
        expect(c.querySelector('.bim-jiazhu .bim-qz')!.getAttribute('data-guji-guess')).toBe('某');
    });
    it('反例：非紧接、空值、别的属性、含空白 → 字面', () => {
        expect(plain('□')).toBe('□');
        expect(plain('□ {guess=甲}')).toBe('□ {guess=甲}');
        expect(plain('□{guess=}')).toBe('□{guess=}');
        expect(plain('□{type=推测}')).toBe('□{type=推测}');
        expect(plain('□{guess=甲 type=乙}')).toBe('□{guess=甲 type=乙}');
    });
});

describe('夹注分行 <a|b>（§1）', () => {
    it('横排忽略 |，连成一行小字', () => {
        const c = html(renderInterlinear('子曰<孔子也|魯人>', undefined, ON));
        expect(c.querySelector('.bim-jiazhu')!.textContent).toBe('孔子也魯人');
        expect(c.textContent).toBe('子曰孔子也魯人');
    });
    it('⟨…⟩ 与表格格内转义 \\| 同样忽略', () => {
        expect(plain('甲⟨乙|丙⟩')).toBe('甲（乙丙）');
        expect(plain('甲<乙\\|丙>')).toBe('甲（乙丙）');
    });
    it('夹注外的 | 按字面', () => {
        expect(plain('甲 | 乙')).toBe('甲 | 乙');
        expect(plain('甲|乙<丙>')).toBe('甲|乙（丙）');
    });
    it('与组字、阙文同框', () => {
        expect(plain('令<:zi[⿰句員]|[[]]>')).toBe('令（⿰句員□）');
    });
    it('表格格内 <丙\\|丁> 不切格，渲染为一段注', () => {
        const c = html(renderFullTextBody(':::table\n甲 | 乙<丙\\|丁> | 戊\n:::', true, true));
        const tds = c.querySelectorAll('td');
        expect(tds).toHaveLength(3);
        expect(tds[1].querySelector('.bim-jiazhu')!.textContent).toBe('丙丁');
    });
});

describe('夹注配对（启用时按规范计数配对）', () => {
    it('<注<再注>> 内层不截断外层，注中注不二次缩小', () => {
        const c = html(renderInterlinear('甲<注<再注>>乙', undefined, ON));
        const outer = c.querySelector('.bim-jiazhu') as HTMLElement;
        expect(outer.textContent).toBe('注再注');
        const inner = outer.querySelector('.bim-jiazhu') as HTMLElement;
        expect(inner.style.fontSize).toBe('');
        expect(c.textContent).toBe('甲注再注乙');
    });
    it('闭合记号落在组字里不算闭合', () => {
        expect(parseGujiInline('<注:zi[甲>乙]>')).toEqual([
            { type: 'jz', children: [{ type: 'text', text: '注' }, { type: 'zi', label: '甲>乙' }] },
        ]);
    });
    it('HTML、自动链接、未闭合仍按字面', () => {
        expect(plain('<div>正文</div>')).toBe('<div>正文</div>');
        expect(plain('a < b')).toBe('a < b');
        expect(plain('<注未閉合')).toBe('<注未閉合');
        expect(plain('<注\n文>')).toBe('<注\n文>');
    });
});

describe('零回归：不启用时与改前逐字一致', () => {
    const samples = [
        '令<:zi[⿰句員]>',
        ':zi[上雍下玉]',
        '帝崩，[[]]即位。[[凡三字]]',
        '太子□{guess=即}位',
        '子曰<孔子也|魯人>',
        '甲<注<再注>>乙',
        '張敷華⟨字缺⟩介軒集<注>',
    ];
    it.each(samples)('%s', (s) => {
        const a = html(renderInterlinear(s)).innerHTML;
        const b = html(renderInterlinear(s, undefined, {})).innerHTML;
        const c = html(renderFullTextBody(s, false)).innerHTML;
        expect(b).toBe(a);
        expect(c).toBe(a);
        // 不启用时这些写法不产生新元素
        expect(a).not.toMatch(/bim-(zi|qw|qz)/);
    });
    it('启用但文本不含任何新写法：输出与不启用逐字一致', () => {
        const s = '子曰<孔子也>：學而時習之⟨悅也⟩。';
        expect(html(renderInterlinear(s, undefined, ON)).innerHTML).toBe(html(renderInterlinear(s)).innerHTML);
        expect(mayHaveGujiInline('無記號正文')).toBe(false);
    });
});

describe('宋史卷215：52 处组字', () => {
    const md = fs.readFileSync(path.join(__dirname, 'fixtures', 'guji-inline', 'songshi-215-zi.md'), 'utf8');

    it('启用后 52 处全部渲染为组字，0 处被当成夹注', () => {
        const c = html(renderFullTextBody(md, true, true));
        expect(c.querySelectorAll('.bim-zi')).toHaveLength(52);
        expect(c.querySelectorAll('.bim-jiazhu')).toHaveLength(0);
        expect(c.querySelectorAll('.bim-jiazhu .bim-zi')).toHaveLength(0);
        expect(c.textContent).not.toContain(':zi[');
    });
    it('不启用（只有 table_notation）时组字按字面，不产生组字元素', () => {
        const c = html(renderFullTextBody(md, true, false));
        expect(c.querySelectorAll('.bim-zi')).toHaveLength(0);
        expect(c.textContent).toContain(':zi[');
    });
});

describe('TextReader 接线（全文章）', () => {
    const text = '## 卷一\n\n令:zi[⿰句員]，[[]]，□{guess=即}\n\n:::table\n甲 | 乙\n:::\n';
    function mount(index: Record<string, unknown> = {}) {
        const transport = fakeTextTransport('b1', {
            chapters: [{ n: 1, title: '卷一', file: '001' }],
            index: { source: { name: '维基文库', url: 'https://example.org' }, ...index },
            md: text,
        });
        return render(<TextReader id="b1" transport={transport} />).container;
    }

    it('目录带 guji_markdown: 0.2.0 → 组字／阙文／缺字猜测／表格都生效', async () => {
        const c = mount({ guji_markdown: '0.2.0' });
        await waitFor(() => expect(c.querySelector('article')).toBeTruthy());
        expect(c.querySelector('article .bim-zi')!.textContent).toBe('⿰句員');
        expect(c.querySelector('article .bim-qw')).not.toBeNull();
        expect(c.querySelector('article .bim-qz')).not.toBeNull();
        expect(c.querySelector('article table')).not.toBeNull();
    });

    it('目录不带 → 同样宽松按 v0.2 解析（spec 03 §2.1，overview#516 W-B）', async () => {
        const c = mount();
        await waitFor(() => expect(c.querySelector('article')).toBeTruthy());
        expect(c.querySelector('article .bim-zi')).not.toBeNull();
        expect(c.querySelector('article')!.textContent).not.toContain(':zi[');
    });
});
