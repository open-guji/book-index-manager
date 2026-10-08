/**
 * 对读书影翻页（overview#421）：无字页（书脊签、封面签条、空白页）也能翻到，只显示书影；翻到时正文不动。
 */
import React from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// jsdom 没有布局：每页 section 的顶边恒为 0，正文滚动联动会把「视口所在页」当成最后一页。
// 按页号给每页一个递增的顶边（第一个有字的页在参考线以下，同真实页面里标题在上、正文在下），其余元素照旧
const realRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
        const page = this.getAttribute?.('data-page-section');
        if (page == null) return realRect.call(this);
        const top = 300 + (Number(page) - 3) * 900;
        return { x: 0, y: top, top, left: 0, right: 0, bottom: top + 800, width: 0, height: 800, toJSON() { return this; } } as DOMRect;
    };
});
afterAll(() => { Element.prototype.getBoundingClientRect = realRect; });

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

function readerEl(resolveWarpData: () => Promise<unknown>, images: unknown[], id: string = WORK) {
    return (
        <LocaleProvider>
            <TextReader
                id={id}
                transport={transport}
                versionKey="original"
                chapter="003"
                resolveWarpData={resolveWarpData as never}
                resolveImages={async () => images as never}
            />
        </LocaleProvider>
    );
}

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

describe('TextReader 对读 · 起始页与开关状态', () => {
    it('起始页是第一个有字的页，书影区出现后页号不再变（回归保护；过渡页号的竞态要在真浏览器里看，见 web e2e）', async () => {
        const seen: string[] = [];
        const grab = () => { const v = document.querySelector('[data-warp-page]')?.getAttribute('data-warp-page'); if (v && seen[seen.length - 1] !== v) seen.push(v); };
        const mo = new MutationObserver(grab);
        mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-warp-page'] });
        try {
            await setup();
            grab();
        } finally {
            mo.disconnect();
        }
        expect(seen).toEqual(['3']);
    });

    it('「标点」「去空白／保留空白」按钮带 aria-pressed，点一下状态跟着变', async () => {
        await setup();
        fireEvent.click(screen.getByRole('button', { name: /閱讀設置|阅读设置/ }));
        const punct = document.querySelector('button[title="切换外挂现代断句标点"]') as HTMLButtonElement;
        expect(punct.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(punct);
        expect(punct.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(punct);
        expect(punct.getAttribute('aria-pressed')).toBe('true');
        const keep = document.querySelector('button[title^="保留空白"]') as HTMLButtonElement;
        const trim = document.querySelector('button[title^="去空白"]') as HTMLButtonElement;
        expect([keep.getAttribute('aria-pressed'), trim.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
        fireEvent.click(trim);
        expect([keep.getAttribute('aria-pressed'), trim.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    });
});

describe('TextReader 对读 · 连按翻页键', () => {
    it('渲染还没跟上时连按「›」「‹」：第二次按最新页号算，回到原来的页（不是翻到再前一页）', async () => {
        await setup();
        expect(wp()).toBe('3');
        const panel = screen.getByTestId('facsimile-panel');
        // 同一个 act 里连按：两次按键之间 React 来不及渲染，第二次拿到的还是旧闭包
        act(() => {
            fireEvent.keyDown(panel, { key: 'ArrowRight' });
            fireEvent.keyDown(panel, { key: 'ArrowLeft' });
        });
        expect(wp()).toBe('3');
        act(() => {
            fireEvent.keyDown(panel, { key: 'ArrowLeft' });
            fireEvent.keyDown(panel, { key: 'ArrowLeft' });
        });
        expect(wp()).toBe('1');
    });
});


describe('TextReader 对读 · 宿主重取数据', () => {
    it('同一章里宿主换了 resolve（拿到一个新的数据对象）：当前页不被甩回起始页', async () => {
        const images = [1, 2, 3, 4, 5, 6].map(n => ({ pageNo: n, seq: String(n).padStart(4, '0'), url: `u${n}`, hiresUrl: `h${n}`, width: 1000, height: 1400 }));
        const make = () => async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, cord), punctuations: [] });
        const view = render(readerEl(make(), images));
        await waitFor(() => expect(view.container.querySelector('[data-page-section]')).not.toBeNull(), { timeout: 5000 });
        expect(wp()).toBe('3');
        fireEvent.click(screen.getByTestId('facsimile-next'));
        expect(wp()).toBe('4');
        // 宿主重取：resolve 的身份变了，hook 重新要一次数据，得到一个内容相同、对象不同的 warpData
        let calls = 0;
        const again = make();
        view.rerender(readerEl(async () => { calls++; return again(); }, images));
        await waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 });
        await new Promise(r => setTimeout(r, 100));
        expect(wp()).toBe('4');
    });

    it('换成另一部书（版本、章标识相同、也有当前页）：回到新书的起始页，不留在旧页', async () => {
        const images = [1, 2, 3, 4, 5, 6].map(n => ({ pageNo: n, seq: String(n).padStart(4, '0'), url: `u${n}`, hiresUrl: `h${n}`, width: 1000, height: 1400 }));
        const make = () => async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, cord), punctuations: [] });
        const view = render(readerEl(make(), images));
        await waitFor(() => expect(view.container.querySelector('[data-page-section]')).not.toBeNull(), { timeout: 5000 });
        fireEvent.click(screen.getByTestId('facsimile-next'));
        expect(wp()).toBe('4');
        view.rerender(readerEl(make(), images, 'otherwork1'));
        await waitFor(() => expect(wp()).toBe('3'), { timeout: 5000 });
    });
});
