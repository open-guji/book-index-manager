/**
 * overview#527：对读「显示分叶分割线」关闭时，跨页处不应再分段／加视觉间隔。
 * 开关关＝页尾无 break 收尾的末段与下一页首段并成一个 <p>；开则行为不变。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GujiTextViewer, type PunctEntry } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

const cell = (a: string, c: string) => ({ a, c });
const page = (n: number, chars: string[], col: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    page: n, ...extra,
    columns: [{ col: 1, ...col, cells: chars.map((c, i) => cell(`${n}:1:${i + 1}`, c)) }],
});
const brk = (anchor: string): PunctEntry => ({ anchor, mark: '。', kind: 'break' });

function mount(docPages: any[], opts: { pageBreaks: boolean; punctuations?: PunctEntry[]; selected?: string[]; onVisiblePageChange?: (p: number) => void }) {
    const pages = adaptCharCord({ pages: docPages });
    const pageData: any = { page_id: 'vol:3', columns: [], pages };
    return render(
        <LocaleProvider locale="zh-Hant">
            <GujiTextViewer
                pageData={pageData}
                pages={pages as any}
                punctuations={opts.punctuations}
                selectedCharIds={new Set(opts.selected ?? [])}
                pageBreaks={opts.pageBreaks}
                onVisiblePageChange={opts.onVisiblePageChange}
            />
        </LocaleProvider>,
    );
}

const paras = (c: HTMLElement) => Array.from(c.querySelectorAll('p.guji-reflow-paragraph'));
const idsIn = (p: Element) => Array.from(p.querySelectorAll('[data-char-id]')).map((e) => e.getAttribute('data-char-id'));

describe('分叶分割线关：跨页连续（overview#527）', () => {
    const open = [page(3, ['甲', '乙']), page(4, ['丙', '丁'])];

    it('关：页尾无 break → 跨页并成一个 <p>，字 id 顺序不变，没有分割线', () => {
        const { container } = mount(open, { pageBreaks: false });
        const ps = paras(container);
        expect(ps).toHaveLength(1);
        expect(idsIn(ps[0])).toEqual(['3:1:1', '3:1:2', '4:1:1', '4:1:2']);
        expect(container.querySelector('.guji-page-divider')).toBeNull();
        // 页的 <section> 仍在（滚动联动靠它）
        expect(container.querySelector('[data-page-section="4"]')).not.toBeNull();
    });

    it('开：行为不变，每页自己一段，带分割线', () => {
        const { container } = mount(open, { pageBreaks: true });
        expect(paras(container)).toHaveLength(2);
        expect(container.querySelector('.guji-page-divider')).not.toBeNull();
    });

    it('关：页尾字带 break（原件在这里收句）→ 仍分段', () => {
        const { container } = mount(open, { pageBreaks: false, punctuations: [brk('3:1:2')] });
        expect(paras(container)).toHaveLength(2);
    });

    it('关：下一页首列抬头（raised）或行首空格（lead_blank）是原件另起一段 → 不并', () => {
        for (const col of [{ raised: 1 }, { lead_blank: 2 }]) {
            const { container } = mount([page(3, ['甲', '乙']), page(4, ['丙', '丁'], col)], { pageBreaks: false });
            expect(paras(container)).toHaveLength(2);
        }
    });

    it('关：连续三页都没有 break → 并成一个 <p>；中间页整页并走也不丢字', () => {
        const { container } = mount([page(3, ['甲']), page(4, ['乙']), page(5, ['丙'])], { pageBreaks: false });
        const ps = paras(container);
        expect(ps).toHaveLength(1);
        expect(idsIn(ps[0])).toEqual(['3:1:1', '4:1:1', '5:1:1']);
    });

    it('关：下一页首段并走后，页内剩下的段落照旧分段', () => {
        const { container } = mount([page(3, ['甲']), page(4, ['乙', '丙'])], { pageBreaks: false, punctuations: [brk('4:1:1')] });
        const ps = paras(container);
        expect(ps).toHaveLength(2);
        expect(idsIn(ps[0])).toEqual(['3:1:1', '4:1:1']);
        expect(idsIn(ps[1])).toEqual(['4:1:2']);
    });

    it('关：并进上一页段里的字，选中仍然高亮（按渲染位置分桶）', () => {
        // 选中单字会 scrollIntoView；jsdom 没实现
        Element.prototype.scrollIntoView = vi.fn();
        const { container } = mount(open, { pageBreaks: false, selected: ['4:1:1'] });
        const el = container.querySelector('[data-char-id="4:1:1"]')!;
        expect(el.classList.contains('is-selected')).toBe(true);
        expect(container.querySelectorAll('.is-selected')).toHaveLength(1);
    });
});
