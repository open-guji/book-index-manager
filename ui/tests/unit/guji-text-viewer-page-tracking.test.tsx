/**
 * 页追踪（滚动时报告「读到第几页」）：没有布局信息时不判页。
 * 所有页锚点的位置都是 0（容器被隐藏、display:none、jsdom）时，二分会选中最后一页，把读者甩到末页；
 * text-reader-facsimile「换成另一部书…」偶发超时就是这样来的（翻页后的 800ms 锁一过期，页号被甩走）。
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

const page = (n: number) => ({ page: n, columns: [{ col: 1, cells: [{ a: `${n}:1:1`, c: '甲' }, { a: `${n}:1:2`, c: '乙' }] }] });

function mount(onVisiblePageChange: (p: number) => void) {
    const pages = adaptCharCord({ pages: [page(3), page(4), page(5)] });
    const pageData: any = { page_id: 'vol:3', columns: [], pages };
    return render(
        <LocaleProvider locale="zh-Hant">
            <GujiTextViewer pageData={pageData} pages={pages as any} selectedCharIds={new Set()} onVisiblePageChange={onVisiblePageChange} />
        </LocaleProvider>,
    );
}

const realRect = Element.prototype.getBoundingClientRect;
afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

describe('页追踪：没有布局信息', () => {
    it('所有页锚点位置相同（jsdom 全 0）：不报页，更不会报最后一页', () => {
        const fn = vi.fn();
        mount(fn);
        expect(fn).not.toHaveBeenCalled();
    });

    it('有布局：报参考线（顶部以下 120px）所在的页', () => {
        // 第 3、4、5 页的顶边分别在 0、1000、2000：参考线 120 落在第 3 页
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const n = parseInt(this.getAttribute('data-page-section') ?? '', 10);
            const top = isNaN(n) ? 0 : (n - 3) * 1000;
            return { top, bottom: top + 900, left: 0, right: 600, width: 600, height: 900, x: 0, y: top, toJSON() {} } as DOMRect;
        };
        const fn = vi.fn();
        mount(fn);
        expect(fn).toHaveBeenLastCalledWith(3);
    });

    it('有布局且第 4 页已滚到参考线上方：报第 4 页', () => {
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const n = parseInt(this.getAttribute('data-page-section') ?? '', 10);
            const top = isNaN(n) ? 0 : (n - 4) * 1000 + 100; // 第 4 页顶边在 100（≤120），第 5 页在 1100
            return { top, bottom: top + 900, left: 0, right: 600, width: 600, height: 900, x: 0, y: top, toJSON() {} } as DOMRect;
        };
        const fn = vi.fn();
        mount(fn);
        expect(fn).toHaveBeenLastCalledWith(4);
    });
});
