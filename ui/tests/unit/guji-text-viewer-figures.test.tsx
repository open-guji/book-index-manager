/**
 * 阅读器显示图片格与插图块（GUJI-741；设计 book-text docs/design/2026-10-图片格与插图设计.md §六）。
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord, adaptFig } from '../../src/core/guji-char-cord';
import { copyTextWithFigures } from '../../src/components/Reader/GujiFigureParts';
import { LocaleProvider } from '../../src/i18n';

const figJson = { figures: [
    { id: 'f148-2-14', kind: 'inline', page: 148, box: [1, 2, 3, 4], alt: '左半圈连一实点', file: 'fig/005/f148-2-14.png', sha256: 'a'.repeat(64), mime: 'image/png', width: 120, height: 48, source: 'crop', by: 'cv:export' },
    { id: 'f148-3-1', kind: 'inline', page: 148, box: [1, 2, 3, 4], alt: '双圈', file: 'fig/005/f148-3-1.png', sha256: 'b'.repeat(64), mime: 'image/png', width: 240, height: 48, source: 'crop', by: 'cv:export' },
    { id: 'p149-fig1', kind: 'block', page: 149, box: [10, 20, 30, 40], alt: '河圖', file: 'fig/005/p149-fig1.webp', sha256: 'c'.repeat(64), mime: 'image/webp', width: 800, height: 600, source: 'crop', by: 'cv:export' },
] };
const figures = adaptFig(figJson);
const figUrl = (f: string) => `https://cdn.test/${f}`;

const doc = { pages: [
    { page: 148, columns: [
        { col: 2, cells: [
            { a: '148:2:12', c: '圖' }, { a: '148:2:13', c: '作' }, { a: '148:2:14', c: '□', fig: 'f148-2-14' }, { a: '148:2:15', c: '形' },
        ] },
        { col: 3, cells: [
            { a: '148:3:1', c: '□', fig: 'f148-3-1' }, { a: '148:3:2', c: '□', fig: 'f148-3-1' }, { a: '148:3:3', c: '末' },
        ] },
    ] },
    { page: 149, columns: [
        { col: 1, cells: [{ a: '149:1:1', c: '前' }] },
        { col: 2, kind: 'figure', span: 4, fig: 'p149-fig1', cells: [] },
        { col: 6, cells: [{ a: '149:6:1', c: '後' }] },
    ] },
] };

function mount(props: Partial<React.ComponentProps<typeof GujiTextViewer>> = {}, data: unknown = doc) {
    const pages = adaptCharCord(data);
    const pageData: any = { page_id: 'vol:148', columns: [], pages };
    return render(
        <LocaleProvider locale="zh-Hans">
            <GujiTextViewer pageData={pageData} pages={pages as any} selectedCharIds={new Set()} figures={figures} figUrl={figUrl} {...props} />
        </LocaleProvider>,
    );
}

afterEach(() => { window.getSelection()?.removeAllRanges(); });

describe('图片格', () => {
    it('一字宽的内嵌图：<img> 在格里，原字 □ 保留且在 glyph 里，title／aria-label「图形符号：说明」', () => {
        const { container } = mount();
        const cell = container.querySelector('[data-char-id="148:2:14"]') as HTMLElement;
        expect(cell.classList.contains('is-fig')).toBe(true);
        const img = cell.querySelector('img.guji-fig-img') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('https://cdn.test/fig/005/f148-2-14.png');
        expect(cell.querySelector('.guji-fig-glyph')!.textContent).toBe('□');
        expect(cell.getAttribute('title')).toBe('图形符号：左半圈连一实点');
        expect(cell.getAttribute('aria-label')).toBe('图形符号：左半圈连一实点');
        expect(cell.style.getPropertyValue('--guji-fig-n')).toBe('1');
        // 前后的普通字不受影响
        expect(container.querySelector('[data-char-id="148:2:13"]')!.textContent).toBe('作');
    });

    it('连续同 id 的格合并成一张图：首格画图、宽 2 字，后续格不画图且不占宽，每格仍有 data-char-id', () => {
        const { container } = mount();
        const first = container.querySelector('[data-char-id="148:3:1"]') as HTMLElement;
        const second = container.querySelector('[data-char-id="148:3:2"]') as HTMLElement;
        expect(first.querySelectorAll('img').length).toBe(1);
        expect(first.style.getPropertyValue('--guji-fig-n')).toBe('2');
        expect(second.querySelectorAll('img').length).toBe(0);
        expect(second.classList.contains('is-fig-cont')).toBe(true);
        expect(container.querySelectorAll('img.guji-fig-img').length).toBeGreaterThanOrEqual(3); // 两张图片格 + 一个插图块
    });

    it('繁简转换不碰图片格（□ 不变），旁边的字照转', () => {
        const convert = vi.fn((s: string) => s.replace('圖', '图').replace('形', '形'));
        const { container } = mount({ convert });
        expect(container.querySelector('[data-char-id="148:2:14"] .guji-fig-glyph')!.textContent).toBe('□');
        expect(container.querySelector('[data-char-id="148:2:12"]')!.textContent).toBe('图');
    });

    it('取不到图（没传 figures）：显示 〔图：图形符号〕 标签，不显示裸 □', () => {
        const { container } = mount({ figures: undefined });
        const cell = container.querySelector('[data-char-id="148:2:14"]') as HTMLElement;
        expect(cell.classList.contains('is-fig-missing')).toBe(true);
        expect(cell.querySelector('img')).toBeNull();
        expect(cell.querySelector('.guji-fig-missing')!.textContent).toBe('〔图：图形符号〕');
    });

    it('图片文件加载失败：换成 〔图：说明〕 标签', async () => {
        const { container } = mount();
        const cell = container.querySelector('[data-char-id="148:2:14"]') as HTMLElement;
        fireEvent.error(cell.querySelector('img')!);
        await waitFor(() => expect(cell.querySelector('.guji-fig-missing')?.textContent).toBe('〔图：左半圈连一实点〕'));
        expect(cell.classList.contains('is-fig-missing')).toBe(true);
    });

    it('点图片格按格位 id 走字的点击（与普通格一样联动书影）', () => {
        const onCharClick = vi.fn();
        const { container } = mount({ onCharClick });
        fireEvent.click(container.querySelector('[data-char-id="148:2:14"] img')!);
        expect(onCharClick).toHaveBeenCalledWith('148:2:14');
    });
});

describe('插图块', () => {
    it('图列在前后两段之间渲染成 <figure>：整图＋说明；正文在此断开成两段', () => {
        const { container } = mount();
        const sec = container.querySelector('[data-page-section="149"]')!;
        const order = Array.from(sec.children).filter(el => el.matches('p, figure')).map(el => el.tagName + ':' + el.textContent);
        expect(order).toEqual(['P:前', 'FIGURE:河圖', 'P:後']);
        const fig = sec.querySelector('figure.guji-fig-block') as HTMLElement;
        expect(fig.querySelector('img')!.getAttribute('src')).toBe('https://cdn.test/fig/005/p149-fig1.webp');
        expect(fig.querySelector('figcaption')!.textContent).toBe('河圖');
    });

    it('点击插图块：通知宿主页号、图 id、cord 里的框', () => {
        const onFigureBlockClick = vi.fn();
        const cord = { pages: [{ page: 149, canvas: { id: 'https://x/canvas/05/0149', seq: '0149', width: 100, height: 200 }, cells: [], marks: [{ kind: 'figure', id: 'm', fig: 'p149-fig1', col: 2, span: 4, box: [10, 20, 30, 40] }] }] };
        const pages = adaptCharCord(doc, cord);
        const { container } = render(
            <LocaleProvider locale="zh-Hans">
                <GujiTextViewer pageData={{ page_id: 'v:1', columns: [], pages } as any} pages={pages as any} selectedCharIds={new Set()} figures={figures} figUrl={figUrl} onFigureBlockClick={onFigureBlockClick} />
            </LocaleProvider>,
        );
        fireEvent.click(container.querySelector('figure.guji-fig-block')!);
        expect(onFigureBlockClick).toHaveBeenCalledWith({ page: 149, fig: 'p149-fig1', box: [10, 20, 40, 60] });
    });

    it('取不到图：块里显示 〔图：说明〕 标签，说明照常', () => {
        const { container } = mount({ figUrl: undefined });
        const fig = container.querySelector('figure.guji-fig-block')!;
        expect(fig.querySelector('.guji-fig-missing')!.textContent).toBe('〔图：河圖〕');
        expect(fig.querySelector('figcaption')!.textContent).toBe('河圖');
    });

    it('整页插图页（只有图列）也出在正文里', () => {
        const only = { pages: [{ page: 7, columns: [{ col: 1, kind: 'figure', span: 8, fig: 'p149-fig1', cells: [] }] }] };
        const { container } = mount({}, only);
        expect(container.querySelector('[data-page-section="7"] figure.guji-fig-block')).not.toBeNull();
    });
});

describe('复制', () => {
    const rangeOf = (container: HTMLElement, fromId: string, toId: string) => {
        const r = document.createRange();
        r.setStartBefore(container.querySelector(`[data-char-id="${fromId}"]`)!);
        r.setEndAfter(container.querySelector(`[data-char-id="${toId}"]`)!);
        return r;
    };

    it('选区含图片格：图换成 〔图：说明〕，周围的字原样', () => {
        const { container } = mount();
        expect(copyTextWithFigures(rangeOf(container, '148:2:12', '148:2:15'))).toBe('圖作〔图：左半圈连一实点〕形');
    });

    it('连占两格的图只复制一次', () => {
        const { container } = mount();
        expect(copyTextWithFigures(rangeOf(container, '148:3:1', '148:3:3'))).toBe('〔图：双圈〕末');
    });

    it('选区含插图块：块单独成行', () => {
        const { container } = mount();
        const r = document.createRange();
        r.setStartBefore(container.querySelector('[data-char-id="149:1:1"]')!);
        r.setEndAfter(container.querySelector('[data-char-id="149:6:1"]')!);
        expect(copyTextWithFigures(r)).toBe('前\n〔图：河圖〕\n後');
    });

    it('选区不含图：返回 null，交给浏览器原生复制', () => {
        const { container } = mount();
        const r = document.createRange();
        r.setStartBefore(container.querySelector('[data-char-id="148:2:12"]')!);
        r.setEndAfter(container.querySelector('[data-char-id="148:2:13"]')!);
        expect(copyTextWithFigures(r)).toBeNull();
    });

    it('copy 事件：选区含图时写入 text/plain 并拦下默认行为', () => {
        const { container } = mount();
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(rangeOf(container, '148:2:13', '148:2:15'));
        const data: Record<string, string> = {};
        const ev = new Event('copy', { bubbles: true, cancelable: true }) as any;
        ev.clipboardData = { setData: (k: string, v: string) => { data[k] = v; } };
        container.querySelector('.guji-text-pane-content')!.dispatchEvent(ev);
        expect(data['text/plain']).toBe('作〔图：左半圈连一实点〕形');
        expect(ev.defaultPrevented).toBe(true);
    });
});

describe('选区', () => {
    it('选区起点在图片格里：该格算在内（探针取到 glyph 里的文本节点）', async () => {
        const fn = vi.fn();
        const { container } = mount({ onSelectionChange: fn });
        const t = (id: string) => {
            let n: Node = container.querySelector(`[data-char-id="${id}"]`)!;
            while (n.nodeType !== 3) n = n.firstChild!;
            return n as Text;
        };
        const r = document.createRange();
        r.setStart(t('148:2:14'), 0);
        r.setEnd(t('148:2:15'), 1);
        const sel = window.getSelection()!;
        sel.removeAllRanges(); sel.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
        await waitFor(() => expect(fn).toHaveBeenCalled());
        expect(fn.mock.calls.at(-1)![0]).toEqual(['148:2:14', '148:2:15']);
    });
});

describe('没有图的章', () => {
    it('渲染里没有任何 fig 相关节点', () => {
        const { container } = mount({}, { pages: [{ page: 3, columns: [{ col: 1, cells: [{ a: '3:1:1', c: '欽' }, { a: '3:1:2', c: '定' }] }] }] });
        expect(container.querySelector('.is-fig, figure, [data-fig-copy]')).toBeNull();
    });
});
