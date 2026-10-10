/**
 * L2 书影面板（overview#511，#501 第 3、4 条）：
 * - 页导航在书影图片正下方；箭头点击区 ≥ 40×40；「第 x 葉」可输入（回车／失焦跳转，越界夹取，非数字还原）；
 * - 保留空白／去空白走阅读偏好：切换后书影确有不同、刷新后保持，设置面板里的勾选框与书影区按钮是同一个偏好；
 * - 非对读的普通书影面板（ImagePanel）去空白时按逐字框裁到版心，裁不了的保持原样。
 */
import React from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { ImagePanel, trimRect } from '../../src/components/Reader/ImagePanel';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import type { IndexStorage } from '../../src/storage/types';
import type { ReaderPageImage } from '../../src/components/Reader/types';
import { LocaleProvider } from '../../src/i18n';

// jsdom 没有 WebGL：画布换成只回报页号和 preserveMargins 的桩
vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: (p: { imageUrl: string; preserveMargins?: boolean; pageData: { page_id: string } }) => (
        <div data-testid="canvas-stub" data-page-id={p.pageData.page_id} data-image={p.imageUrl} data-preserve={String(p.preserveMargins)} />
    ),
}));

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
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
const input = () => screen.getByTestId('facsimile-page-input') as HTMLInputElement;
const stub = () => screen.getByTestId('canvas-stub');

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
    // 正文排版晚到一拍会让 GujiTextViewer 的页追踪 effect 重跑、把页号拉回参考线所在页；先等它安静再操作
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    return view;
}

beforeEach(() => { localStorage.clear(); });

describe('L2 · 页导航下移', () => {
    it('页导航在书影图片（画布）之后，且在同一个书影面板里', async () => {
        await setup();
        const panel = screen.getByTestId('facsimile-panel');
        const pager = screen.getByTestId('facsimile-pager');
        expect(panel.contains(pager)).toBe(true);
        // 画布在前、页导航在后
        expect(stub().compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // 导航条里有上一葉、葉码输入框、下一葉
        expect(pager.contains(screen.getByTestId('facsimile-prev'))).toBe(true);
        expect(pager.contains(input())).toBe(true);
        expect(pager.contains(screen.getByTestId('facsimile-next'))).toBe(true);
        // 面板顶栏不再放翻页
        expect(panel.firstElementChild!.contains(screen.getByTestId('facsimile-prev'))).toBe(false);
    });

    it('左右箭头点击区 ≥ 40×40，aria-label 完整；输入框有 aria-label', async () => {
        await setup();
        for (const id of ['facsimile-prev', 'facsimile-next']) {
            const b = screen.getByTestId(id) as HTMLButtonElement;
            expect(parseInt(b.style.minWidth, 10)).toBeGreaterThanOrEqual(40);
            expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(40);
            expect(b.getAttribute('aria-label')).toBeTruthy();
        }
        expect(input().getAttribute('aria-label')).toMatch(/叶码|葉碼/);
        expect(screen.getByTestId('facsimile-pager').getAttribute('aria-label')).toBeTruthy();
    });
});

describe('L2 · 输入葉码跳转', () => {
    it('输入页码回车跳转；输入框显示当前页', async () => {
        await setup();
        expect(input().value).toBe('3');
        fireEvent.change(input(), { target: { value: '5' } });
        fireEvent.keyDown(input(), { key: 'Enter' });
        expect(wp()).toBe('5');
        expect(input().value).toBe('5');
        expect(stub().getAttribute('data-image')).toContain('u5');
    });

    it('失焦也跳转', async () => {
        await setup();
        fireEvent.change(input(), { target: { value: '4' } });
        fireEvent.blur(input());
        expect(wp()).toBe('4');
        expect(input().value).toBe('4');
    });

    it('越界夹到首／末页', async () => {
        await setup();
        fireEvent.change(input(), { target: { value: '99' } });
        fireEvent.keyDown(input(), { key: 'Enter' });
        expect(wp()).toBe('6');
        expect(input().value).toBe('6');
        fireEvent.change(input(), { target: { value: '0' } });
        fireEvent.keyDown(input(), { key: 'Enter' });
        expect(wp()).toBe('1');
        expect(input().value).toBe('1');
    });

    it('超长数字串（parseInt 得 Infinity）按越界处理，夹到末页', async () => {
        await setup();
        fireEvent.change(input(), { target: { value: '9'.repeat(400) } });
        fireEvent.keyDown(input(), { key: 'Enter' });
        expect(wp()).toBe('6');
    });

    it('非数字忽略并还原为当前页', async () => {
        await setup();
        for (const bad of ['abc', '', ' ', '-2', '3.5', '一二']) {
            fireEvent.change(input(), { target: { value: bad } });
            fireEvent.keyDown(input(), { key: 'Enter' });
            expect(wp()).toBe('3');
            expect(input().value).toBe('3');
        }
    });

    it('输入框里按方向键不触发书影翻页；Esc 放弃输入', async () => {
        await setup();
        fireEvent.change(input(), { target: { value: '5' } });
        fireEvent.keyDown(input(), { key: 'ArrowRight' });
        expect(wp()).toBe('3');
        fireEvent.keyDown(input(), { key: 'Escape' });
        expect(input().value).toBe('3');
        fireEvent.blur(input());
        expect(wp()).toBe('3');
    });

    it('箭头翻页后输入框跟着变；翻页与输入互不串', async () => {
        await setup();
        fireEvent.click(screen.getByTestId('facsimile-next'));
        await waitFor(() => expect(input().value).toBe('4'), { timeout: 5000 });
        fireEvent.change(input(), { target: { value: '1' } });
        fireEvent.keyDown(input(), { key: 'Enter' });
        expect(wp()).toBe('1');
        expect((screen.getByTestId('facsimile-prev') as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('L2 · 保留空白／去空白', () => {
    const keep = () => document.querySelector('button[title^="保留空白"]') as HTMLButtonElement;
    const trim = () => document.querySelector('button[title^="去空白"]') as HTMLButtonElement;
    const openSettings = () => fireEvent.click(screen.getByRole('button', { name: /閱讀設置|阅读设置/ }));

    it('默认保留空白；点「去空白」书影画布的 preserveMargins 变 false，再点回 true', async () => {
        await setup();
        expect(stub().getAttribute('data-preserve')).toBe('true');
        openSettings();
        fireEvent.click(trim());
        expect(stub().getAttribute('data-preserve')).toBe('false');
        expect(trim().getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(keep());
        expect(stub().getAttribute('data-preserve')).toBe('true');
    });

    it('选择写进阅读偏好并在刷新（重新挂载）后保持', async () => {
        await setup();
        openSettings();
        fireEvent.click(trim());
        expect(JSON.parse(localStorage.getItem('bim-reader-prefs')!).preserveMargins).toBe(false);
        cleanup();
        await setup();
        await waitFor(() => expect(stub().getAttribute('data-preserve')).toBe('false'));
        openSettings();
        expect(trim().getAttribute('aria-pressed')).toBe('true');
    });

    it('设置面板里的「书影保留空白」勾选框与书影区按钮是同一个偏好（修前两者互不相通）', async () => {
        await setup();
        openSettings();
        const box = screen.getByLabelText(/書影保留空白|书影保留空白/) as HTMLInputElement;
        expect(box.checked).toBe(true);
        fireEvent.click(box); // 取消勾选 → 去空白
        expect(stub().getAttribute('data-preserve')).toBe('false');
        expect(trim().getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(keep());
        expect(box.checked).toBe(true);
    });
});

describe('L2 · 普通书影面板（ImagePanel）去空白', () => {
    const page = (extra: Partial<ReaderPageImage> = {}): ReaderPageImage => ({
        url: 'p1.jpg', width: 1000, height: 1400, label: '一',
        boxes: [{ x: 200, y: 300, w: 100, h: 100 }, { x: 600, y: 1000, w: 100, h: 100 }], ...extra,
    });
    const wrap = (ui: React.ReactElement) => render(<LocaleProvider>{ui}</LocaleProvider>);

    it('trimRect：逐字框外接矩形外扩 3%（短边）；无框／无尺寸／退化框不裁', () => {
        expect(trimRect(page())).toEqual({ x: 170, y: 270, w: 560, h: 860 });
        expect(trimRect(page({ boxes: [] }))).toBeNull();
        expect(trimRect(page({ width: undefined }))).toBeNull();
        expect(trimRect(page({ boxes: [{ x: 5, y: 5, w: 0, h: 0 }] }))).toBeNull();
        expect(trimRect(page({ boxFormat: 'other' }))).toBeNull();
        // 框完全落在图外：不裁，不产生负宽高
        expect(trimRect(page({ boxes: [{ x: 1500, y: 1600, w: 50, h: 50 }] }))).toBeNull();
        expect(trimRect(page({ boxes: [{ x: -300, y: -300, w: 50, h: 50 }] }))).toBeNull();
        // 框几乎铺满整页：不裁
        expect(trimRect(page({ boxes: [{ x: 0, y: 0, w: 1000, h: 1400 }] }))).toBeNull();
    });

    it('保留空白（默认）：整张书影，不裁', () => {
        const { container } = wrap(<ImagePanel pages={[page()]} />);
        expect(container.querySelector('.bim-rd-img-trimmed')).toBeNull();
        expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1000 1400');
    });

    it('去空白：裁到版心（裁切参数与逐字框 viewBox 同步），换回保留空白恢复整张', () => {
        const { container, rerender } = wrap(<ImagePanel pages={[page()]} preserveMargins={false} />);
        const fig = container.querySelector('.bim-rd-img-trimmed')!;
        expect(fig).not.toBeNull();
        expect(fig.getAttribute('data-trim')).toBe('170,270,560,860');
        const img = fig.querySelector('img') as HTMLImageElement;
        expect(img.style.width).toBe(`${(1000 / 560) * 100}%`);
        expect(img.style.left).toBe(`${(-170 / 560) * 100}%`);
        expect(img.style.top).toBe(`${(-270 / 860) * 100}%`);
        expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('170 270 560 860');
        rerender(<LocaleProvider><ImagePanel pages={[page()]} preserveMargins /></LocaleProvider>);
        expect(container.querySelector('.bim-rd-img-trimmed')).toBeNull();
    });

    it('裁不了的图保持原样：没有逐字框、或宿主自带叠加层（裁了会错位）', () => {
        const a = wrap(<ImagePanel pages={[page({ boxes: undefined })]} preserveMargins={false} />);
        expect(a.container.querySelector('.bim-rd-img-trimmed')).toBeNull();
        a.unmount();
        const b = wrap(<ImagePanel pages={[page()]} preserveMargins={false} renderOverlay={() => <i data-testid="ov" />} />);
        expect(b.container.querySelector('.bim-rd-img-trimmed')).toBeNull();
        expect(screen.getByTestId('ov')).toBeTruthy();
    });
});
