/**
 * 对读书影翻页（overview#421）：无字页（书脊签、封面签条、空白页）也能翻到，只显示书影；翻到时正文不动。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

// jsdom 没有 WebGL：画布换成只回报当前页的桩
vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: (p: { imageUrl: string; pageData: { page_id: string; columns: { chars: unknown[] }[] } }) => (
        <div data-testid="canvas-stub" data-page-id={p.pageData.page_id} data-image={p.imageUrl} data-boxes={p.pageData.columns.flatMap(c => c.chars).length} />
    ),
}));

// jsdom 没有 scrollIntoView
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const WORK = '96mid1ogzk';
const canvas = (n: string) => ({ id: `https://x/iiif/${WORK}/canvas/03/${n}`, seq: n, width: 1000, height: 1400 });
const char = {
    pages: [
        { page: 1, columns: [] },
        { page: 3, columns: [{ col: 1, cells: [{ a: '3:1:1', c: '欽' }, { a: '3:1:2', c: '定' }] }] },
        { page: 4, columns: [{ col: 1, cells: [{ a: '4:1:1', c: '四' }] }] },
        { page: 5, columns: [{ col: 1, kind: 'blank', cells: [] }] },
        { page: 6, columns: [{ col: 1, cells: [{ a: '6:1:1', c: '庫' }] }] },
    ],
};
const cord = {
    pages: [
        { page: 1, canvas: canvas('0001'), cells: [] },
        { page: 2, canvas: canvas('0002'), cells: [] },
        { page: 3, canvas: canvas('0003'), cells: [{ a: '3:1:1', box: [1, 1, 10, 10] }, { a: '3:1:2', box: [1, 20, 10, 10] }] },
        { page: 4, canvas: canvas('0004'), cells: [{ a: '4:1:1', box: [1, 1, 10, 10] }] },
        { page: 5, canvas: canvas('0005'), cells: [] },
        { page: 6, canvas: canvas('0006'), cells: [{ a: '6:1:1', box: [1, 1, 10, 10] }] },
    ],
};

const transport = {
    getItem: async () => ({ title: '總目' }),
    getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
    getTextIndex: async () => ({ chapters: [{ n: 3, file: '003', title: '卷四至卷五', char_file: '003.char.json', cord_file: '003.cord.json' }] }),
    getChapter: async () => ({ md: 'x', json: null }),
} as unknown as IndexStorage;

const wp = () => document.querySelector('[data-warp-page]')!.getAttribute('data-warp-page');

async function setup() {
    const images = [1, 2, 3, 4, 5, 6].map(n => ({ pageNo: n, seq: String(n).padStart(4, '0'), url: `u${n}`, hiresUrl: `h${n}`, width: 1000, height: 1400 }));
    const view = render(
        <LocaleProvider>
            <TextReader
                id={WORK}
                transport={transport}
                versionKey="original"
                chapter="003"
                resolveWarpData={async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, cord), punctuations: [] }) as never}
                resolveImages={async () => images as never}
            />
        </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('facsimile-next')).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(view.container.querySelector('[data-page-section]')).not.toBeNull(), { timeout: 5000 });
    return view;
}

describe('TextReader 对读书影翻页 · 无字页', () => {
    it('起始页是第一个有字的页；正文里只有有字的页', async () => {
        const { container } = await setup();
        expect(wp()).toBe('3');
        expect(Array.from(container.querySelectorAll('[data-page-section]')).map(e => e.getAttribute('data-page-section'))).toEqual(['3', '4', '6']);
    });

    it('「‹」翻到书脊签、封面签条（第 1、2 页），「›」走过空白页（第 5 页）；无字页只有书影、没有字框', async () => {
        await setup();
        const prev = screen.getByTestId('facsimile-prev') as HTMLButtonElement;
        expect(prev.disabled).toBe(false);
        fireEvent.click(prev);
        expect(wp()).toBe('2');
        expect(screen.getByTestId('canvas-stub').getAttribute('data-boxes')).toBe('0');
        expect(screen.getByTestId('canvas-stub').getAttribute('data-image')).toContain('u2');
        fireEvent.click(prev);
        expect(wp()).toBe('1');
        expect((screen.getByTestId('facsimile-prev') as HTMLButtonElement).disabled).toBe(true);
        for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId('facsimile-next'));
        expect(wp()).toBe('5');
        expect(screen.getByTestId('canvas-stub').getAttribute('data-boxes')).toBe('0');
        fireEvent.click(screen.getByTestId('facsimile-next'));
        expect(wp()).toBe('6');
        expect((screen.getByTestId('facsimile-next') as HTMLButtonElement).disabled).toBe(true);
    });

    it('翻到无字页时正文不跳；翻到有字页时仍让正文滚到该页开头', async () => {
        const { container } = await setup();
        const scrolled: string[] = [];
        const orig = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.getAttribute('data-page-section') ?? '?'); };
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        try {
            fireEvent.click(screen.getByTestId('facsimile-prev')); // 3 → 2（无字页）
            fireEvent.click(screen.getByTestId('facsimile-prev')); // 2 → 1（无字页）
            await new Promise(r => setTimeout(r, 50));
            expect(scrolled).toEqual([]);
            expect(scrollTo).not.toHaveBeenCalled();
            fireEvent.click(screen.getByTestId('facsimile-next')); // 1 → 2
            fireEvent.click(screen.getByTestId('facsimile-next')); // 2 → 3（有字页）
            await waitFor(() => expect(scrollTo.mock.calls.length + scrolled.length).toBeGreaterThan(0));
        } finally {
            Element.prototype.scrollIntoView = orig;
            scrollTo.mockRestore();
        }
        expect(container.querySelector('[data-page-section="3"]')).not.toBeNull();
    });
});
