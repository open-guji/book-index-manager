/**
 * GUJI-629／630：阅读页性能 P0。
 * - 书影画布后备尺寸按显示尺寸开（backingSize）；
 * - 悬停 store 只通知订阅者；
 * - 正文字的点击、悬停委托在容器上（字 span 上不再各挂回调），行为与原来一致。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { backingSize } from '../../src/components/Reader/GujiWarpCanvas';
import { createHoverStore } from '../../src/components/Reader/hover-store';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

describe('backingSize：画布后备按显示尺寸开', () => {
    it('桌面 441 宽、DPR 1：后备取到 448（64 对齐），远小于原图 2345', () => {
        const [w, h] = backingSize(2345, 3122, 441, 1);
        expect(w).toBe(448);
        expect(h).toBe(Math.round((448 * 3122) / 2345));
    });
    it('DPR 最多按 2 算；缩放档往上取整', () => {
        expect(backingSize(4000, 5000, 400, 3)[0]).toBe(832); // 400×2=800 → 832
        expect(backingSize(4000, 5000, 400, 1, 1.2)[0]).toBe(640); // 1.2 → 1.5 档：600 → 640
    });
    it('不超过逻辑尺寸', () => {
        expect(backingSize(1000, 1300, 900, 2, 6)).toEqual([1000, 1300]);
    });
    it('还没量到或被隐藏（宽 0）：1×1，不占显存', () => {
        expect(backingSize(2345, 3122, null, 2)).toEqual([1, 1]);
        expect(backingSize(2345, 3122, 0, 2)).toEqual([1, 1]);
    });
});

describe('hover store', () => {
    it('值变了才通知；退订后不再通知', () => {
        const s = createHoverStore();
        const cb = vi.fn();
        const off = s.subscribe(cb);
        s.set('3:1:1');
        s.set('3:1:1');
        expect(cb).toHaveBeenCalledTimes(1);
        expect(s.get()).toBe('3:1:1');
        off();
        s.set(null);
        expect(cb).toHaveBeenCalledTimes(1);
        expect(s.get()).toBeNull();
    });
});

describe('正文字事件委托在容器上', () => {
    const doc = { pages: [{ page: 3, columns: [{ col: 1, cells: [
        { a: '3:1:1', c: '甲' }, { a: '3:1:2', c: '乙' }, { a: '3:1:3', c: '丙' },
    ] }] }] };
    const punct = [{ anchor: '3:1:1', mark: '，' }];

    function mount(props: Partial<React.ComponentProps<typeof GujiTextViewer>>) {
        const pages = adaptCharCord(doc);
        const pageData: any = { page_id: 'vol:3', columns: [], pages };
        return render(
            <LocaleProvider locale="zh-Hant">
                <GujiTextViewer pageData={pageData} pages={pages as any} punctuations={punct} selectedCharIds={new Set()} {...props} />
            </LocaleProvider>,
        );
    }

    it('点字回调字 id；点标点不回调', () => {
        const onCharClick = vi.fn();
        const { container } = mount({ onCharClick });
        fireEvent.click(container.querySelector('[data-char-id="3:1:2"]')!);
        expect(onCharClick).toHaveBeenLastCalledWith('3:1:2');
        fireEvent.click(container.querySelector('.guji-text-punct')!);
        expect(onCharClick).toHaveBeenCalledTimes(1);
    });

    it('悬停：字→字只报新字，移到标点报 null，离开正文报 null', () => {
        const onCharHover = vi.fn();
        const { container } = mount({ onCharHover });
        fireEvent.mouseOver(container.querySelector('[data-char-id="3:1:1"]')!);
        fireEvent.mouseOver(container.querySelector('[data-char-id="3:1:2"]')!);
        expect(onCharHover.mock.calls.map((c) => c[0])).toEqual(['3:1:1', '3:1:2']);
        fireEvent.mouseOver(container.querySelector('.guji-text-punct')!);
        expect(onCharHover).toHaveBeenLastCalledWith(null);
        fireEvent.mouseOver(container.querySelector('[data-char-id="3:1:3"]')!);
        fireEvent.mouseLeave(container.querySelector('.guji-text-pane-content')!);
        expect(onCharHover).toHaveBeenLastCalledWith(null);
    });

    it('字 span 上不再挂 onclick（React 给带 onClick 的元素挂的空 onclick 也没有了）', () => {
        const { container } = mount({ onCharClick: () => {} });
        const span = container.querySelector<HTMLElement>('[data-char-id="3:1:1"]')!;
        expect(span.onclick).toBeNull();
    });

    it('外部悬停（书影那边）高亮对应的字', () => {
        const { container, rerender } = mount({ hoveredCharId: '3:1:3' });
        expect(container.querySelector('[data-char-id="3:1:3"]')!.classList.contains('is-hovered')).toBe(true);
        const pages = adaptCharCord(doc);
        rerender(
            <LocaleProvider locale="zh-Hant">
                <GujiTextViewer pageData={{ page_id: 'vol:3', columns: [], pages } as any} pages={pages as any} punctuations={punct} selectedCharIds={new Set()} hoveredCharId="3:1:1" />
            </LocaleProvider>,
        );
        expect(container.querySelector('[data-char-id="3:1:3"]')!.classList.contains('is-hovered')).toBe(false);
        expect(container.querySelector('[data-char-id="3:1:1"]')!.classList.contains('is-hovered')).toBe(true);
    });
});

describe('正文分批渲染（GUJI-632）', () => {
    // 40 页 × 每页 2 列 × 每列 50 字 = 4000 字：超过首批，要分批
    const bigDoc = {
        pages: Array.from({ length: 40 }, (_, i) => ({
            page: i + 3,
            columns: [1, 2].map((col) => ({ col, cells: Array.from({ length: 50 }, (_, k) => ({ a: `${i + 3}:${col}:${k + 1}`, c: '字' })) })),
        })),
    };
    const pagesOf = () => adaptCharCord(bigDoc);
    function mount(props: Partial<React.ComponentProps<typeof GujiTextViewer>> = {}) {
        const pages = pagesOf();
        return render(
            <LocaleProvider locale="zh-Hant">
                <GujiTextViewer pageData={{ page_id: 'vol:3', columns: [], pages } as any} pages={pages as any} selectedCharIds={new Set()} {...props} />
            </LocaleProvider>,
        );
    }

    it('首帧只渲染开头一批，空闲时补齐全章', async () => {
        const { container } = mount();
        const first = container.querySelectorAll('[data-char-id]').length;
        expect(first).toBeGreaterThan(0);
        expect(first).toBeLessThan(4000);
        await waitFor(() => expect(container.querySelectorAll('[data-char-id]').length).toBe(4000));
    });

    it('跳到还没渲染的页（目录标题锚点）：先补到那一页再滚过去', async () => {
        const orig = Element.prototype.scrollIntoView;
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        try {
            const { container } = mount({ scrollToAnchor: { anchor: '40:1:1', nonce: 1 } });
            await waitFor(() => expect(container.querySelector('[data-char-id="40:1:1"]')).not.toBeNull());
            await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
        } finally {
            Element.prototype.scrollIntoView = orig;
        }
    });

    it('每页 section 带 content-visibility: auto，以及占位高度要用的本页字数、段数（CSS 变量，calc 在真浏览器里验）', () => {
        const { container } = mount();
        const sec = container.querySelector<HTMLElement>('[data-page-section="3"]')!;
        expect(sec.style.contentVisibility).toBe('auto');
        expect(sec.style.getPropertyValue('--gtv-pc')).toBe('100');
        expect(Number(sec.style.getPropertyValue('--gtv-pp'))).toBeGreaterThan(0);
    });
});
