/**
 * 阅读器插件内核（A41 迁移 P 线）：设置块、工具条、浮层、onChapter、按格修饰、格子事件、选字动作、locate／scrollTo。
 * 同时冻结网站迁移期还在依赖的 DOM 细节（`data-char-id`、阅读顺序）。
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import type { IndexStorage } from '../../src/storage/types';
import type { ReaderApi, ReaderPlugin } from '../../src/components/Reader/plugins';
import { LocaleProvider } from '../../src/i18n';

vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: () => <div data-testid="canvas-stub" />,
}));
beforeAll(() => { if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}; });
beforeEach(() => { localStorage.setItem('bim-reader-prefs', JSON.stringify({ v: 2, pageBreaks: true })); });

const WORK = '96mid1ogzk';
const canvas = (n: string) => ({ id: `https://x/iiif/${WORK}/canvas/03/${n}`, seq: n, width: 1000, height: 1400 });
const char = {
    pages: [
        { page: 3, columns: [{ col: 1, cells: [{ a: '3:1:1', c: '欽' }, { a: '3:1:2', c: '定' }, { a: '3:1:3', c: '四' }, { a: '3:1:4', c: '庫' }] }] },
    ],
};
const cord = {
    pages: [{ page: 3, canvas: canvas('0003'), cells: ['3:1:1', '3:1:2', '3:1:3', '3:1:4'].map((a, i) => ({ a, box: [1, 1 + i * 20, 10, 10] })) }],
};
const transport = {
    getItem: async () => ({ title: '總目' }),
    getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
    getTextIndex: async () => ({ chapters: [{ n: 3, file: '003', title: '卷四', char_file: '003.char.json', cord_file: '003.cord.json' }] }),
    getChapter: async () => ({ md: 'x', json: null }),
} as unknown as IndexStorage;
const warp = async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, cord), punctuations: [] }) as never;

async function setup(plugins?: ReaderPlugin[], extra: Record<string, unknown> = {}) {
    const view = render(
        <LocaleProvider>
            <TextReader id={WORK} transport={transport} versionKey="original" chapter="003" resolveWarpData={warp} plugins={plugins} {...extra} />
        </LocaleProvider>,
    );
    await waitFor(() => expect(view.container.querySelector('[data-char-id="3:1:1"]')).not.toBeNull(), { timeout: 5000 });
    return view;
}
const openSettings = (last = false) => { const b = screen.getAllByRole('button', { name: /阅读设置|閱讀設置|設置|设置/ }); fireEvent.click(last ? b[b.length - 1] : b[0]); };
const cell = (c: HTMLElement, id: string) => c.querySelector(`[data-char-id="${id}"]`) as HTMLElement;

describe('DOM 契约（过渡期冻结）', () => {
    it('每个字是 span[data-char-id=页:列:序]，DOM 顺序即阅读顺序，文字就是该字', async () => {
        const { container } = await setup();
        const spans = Array.from(container.querySelectorAll('span[data-char-id]'));
        expect(spans.map(s => s.getAttribute('data-char-id'))).toEqual(['3:1:1', '3:1:2', '3:1:3', '3:1:4']);
        expect(spans.map(s => s.textContent).join('')).toBe('钦定四库');
        expect(container.querySelector('[data-page-section="3"]')).not.toBeNull();
    });
});

describe('阅读器插件', () => {
    it('settings：并进已有组、新开自定义组；按 order 排序', async () => {
        const plugins: ReaderPlugin[] = [
            { id: 'b', settings: { group: 'more', order: 20, render: () => <i data-testid="s-b">B</i> } },
            { id: 'a', settings: { group: 'more', order: 10, render: () => <i data-testid="s-a">A</i> } },
            { id: 'c', settings: { group: 'compare', title: '对校', render: () => <i data-testid="s-c">C</i> } },
            { id: 'd', settings: { group: 'annotate', render: () => <i data-testid="s-d">D</i> } },
        ];
        const { container } = await setup(plugins);
        openSettings();
        const more = screen.getByTestId('s-a').closest('section')!;
        expect(more.contains(screen.getByTestId('s-b'))).toBe(true);
        expect(Array.from(more.querySelectorAll('i')).map(e => e.textContent)).toEqual(['A', 'B']);
        const cmp = screen.getByTestId('s-c').closest('section')!;
        expect(cmp.querySelector('h3')!.textContent).toBe('对校');
        expect(cmp).not.toBe(more);
        expect(screen.getByTestId('s-d').closest('section')!.querySelector('h3')!.textContent).toBeTruthy();
        // 内置标点开关也走插件，仍在「标注」组
        expect(container.querySelector('button[aria-pressed][title="切换外挂现代断句标点"]')).not.toBeNull();
    });

    it('旧的 settingsExtra 插槽照旧可用', async () => {
        await setup(undefined, { settingsExtra: <b data-testid="legacy">下载</b> });
        openSettings();
        expect(screen.getByTestId('legacy')).toBeTruthy();
    });

    it('toolbar：subtitle、actions 宽屏在工具条上', async () => {
        const plugins: ReaderPlugin[] = [
            { id: 't1', toolbar: { slot: 'subtitle', render: () => <u data-testid="tb-sub">v1</u> } },
            { id: 't2', toolbar: { slot: 'actions', render: () => <u data-testid="tb-act">dl</u> } },
        ];
        const { container } = await setup(plugins);
        expect(container.querySelector('.bim-rd-bar')!.contains(screen.getByTestId('tb-sub'))).toBe(true);
        expect(container.querySelector('.bim-rd-bar')!.contains(screen.getByTestId('tb-act'))).toBe(true);
    });

    it('toolbar：窄屏收进设置抽屉的「更多」组', async () => {
        const orig = window.matchMedia;
        window.matchMedia = ((q: string) => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
        try {
            const plugins: ReaderPlugin[] = [{ id: 't2', toolbar: { slot: 'actions', render: () => <u data-testid="tb-act">dl</u> } }];
            const { container } = await setup(plugins);
            await waitFor(() => expect(container.querySelector('.bim-rd-bb')).not.toBeNull());
            openSettings(true);
            await waitFor(() => expect(container.querySelector('.bim-rd-sp')!.contains(screen.getByTestId('tb-act'))).toBe(true));
            expect(container.querySelector('.bim-rd-bar')!.contains(screen.getByTestId('tb-act'))).toBe(false);
        } finally { window.matchMedia = orig; }
    });

    it('onChapter：取数一次，返回值经 api.state 传给设置块；ctx 带章条目', async () => {
        const onChapter = vi.fn(async (ctx) => ({ n: ctx.chapter.n }));
        const plugins: ReaderPlugin[] = [{
            id: 'p',
            onChapter,
            settings: { group: 'more', render: (api: ReaderApi) => <i data-testid="st">{String((api.state<{ n: number }>('p'))?.n ?? 'none')}</i> },
        }];
        await setup(plugins);
        openSettings();
        await waitFor(() => expect(screen.getByTestId('st').textContent).toBe('3'));
        expect(onChapter).toHaveBeenCalledTimes(1);
        expect(onChapter.mock.calls[0][0]).toMatchObject({ entryId: WORK, versionKey: 'original', chapterKey: '003' });
    });

    it('decorate：加类、data-cd-*，不改 textContent；insertAfter 是伪元素用的空节点', async () => {
        const plugins: ReaderPlugin[] = [{
            id: 'd',
            decorate: () => new Map([
                ['3:1:2', { tone: 'warn', underline: 'wavy', sub: '訂', title: '异文', focus: true }],
                ['3:1:3', { tone: 'add', insertAfter: '之' }],
            ]),
        }];
        const { container } = await setup(plugins);
        const c2 = cell(container, '3:1:2');
        expect(c2.className).toMatch(/bim-cd-warn/);
        expect(c2.className).toMatch(/bim-cd-ul-wavy/);
        expect(c2.getAttribute('data-cd-sub')).toBe('訂');
        expect(c2.hasAttribute('data-cd-focus')).toBe(true);
        expect(c2.getAttribute('title')).toBe('异文');
        expect(c2.textContent).toBe('定');
        const ins = container.querySelector('.bim-cd-ins');
        expect(ins?.getAttribute('data-cd-ins')).toBe('之');
        expect(ins?.textContent).toBe('');
        expect(cell(container, '3:1:1').className).not.toMatch(/bim-cd/);
        // 阅读顺序里的文字不被修饰污染
        expect(Array.from(container.querySelectorAll('span[data-char-id]')).map(s => s.textContent).join('')).toBe('钦定四库');
    });

    it('多个插件对同一格的修饰叠加（后者覆盖，focus 取或）', async () => {
        const plugins: ReaderPlugin[] = [
            { id: 'a', decorate: () => new Map([['3:1:1', { tone: 'accent', focus: true }]]) },
            { id: 'b', decorate: () => new Map([['3:1:1', { tone: 'warn' }]]) },
        ];
        const { container } = await setup(plugins);
        const c = cell(container, '3:1:1');
        expect(c.className).toMatch(/bim-cd-warn/);
        expect(c.className).not.toMatch(/bim-cd-accent/);
        expect(c.hasAttribute('data-cd-focus')).toBe(true);
    });

    it('api.refresh：插件状态变了重算修饰', async () => {
        let on = false;
        let api0: ReaderApi | null = null;
        const plugins: ReaderPlugin[] = [{
            id: 'r',
            decorate: (api) => { api0 = api; return on ? new Map([['3:1:4', { tone: 'muted' }]]) : undefined; },
        }];
        const { container } = await setup(plugins);
        expect(cell(container, '3:1:4').className).not.toMatch(/bim-cd/);
        on = true;
        act(() => api0!.refresh());
        await waitFor(() => expect(cell(container, '3:1:4').className).toMatch(/bim-cd-muted/));
    });

    it('onCell：点击与悬停回调带格位、字', async () => {
        const click = vi.fn();
        const hover = vi.fn();
        const { container } = await setup([{ id: 'c', onCell: { click, hover } }]);
        fireEvent.mouseOver(cell(container, '3:1:3'));
        await waitFor(() => expect(hover).toHaveBeenCalled());
        expect(hover.mock.calls[0][0]).toMatchObject({ anchor: '3:1:3', char: '四' });
        fireEvent.click(cell(container, '3:1:2'));
        await waitFor(() => expect(click).toHaveBeenCalled());
        expect(click.mock.calls[0][0]).toMatchObject({ anchor: '3:1:2', char: '定' });
    });

    it('selectionActions：选字后出浮条，按钮拿到选区的格位与文字', async () => {
        const onClick = vi.fn();
        const sel = vi.fn((s) => [{ key: 'fix', label: '改字', onClick: () => onClick(s) }]);
        const { container } = await setup([{ id: 's', selectionActions: sel }]);
        expect(screen.queryByTestId('reader-selbar')).toBeNull();
        fireEvent.click(cell(container, '3:1:3'));
        const btn = await screen.findByRole('button', { name: '改字' });
        fireEvent.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onClick.mock.calls[0][0]).toMatchObject({ anchors: ['3:1:3'], text: '四' });
    });

    it('api：cells 阅读顺序、locate(text／cp)、rectOf、overlay 渲染', async () => {
        let api: ReaderApi | null = null;
        const { container } = await setup([{ id: 'o', overlay: (a) => { api = a; return <div data-testid="ov">ov</div>; } }]);
        await waitFor(() => expect(screen.getByTestId('ov')).toBeTruthy());
        expect(container.querySelector('.bim-rd-overlay')!.contains(screen.getByTestId('ov'))).toBe(true);
        expect(api!.cells.map(c => c.char).join('')).toBe('欽定四庫');
        expect(api!.cells[1]).toMatchObject({ anchor: '3:1:2', page: 3, col: 1 });
        expect(api!.locate({ text: '四庫' })).toBe('3:1:3');
        expect(api!.locate({ text: '無' })).toBeNull();
        expect(api!.locate({ cp: 0 })).toBe('3:1:1');
        expect(api!.rectOf('3:1:1')).not.toBeNull();
        expect(api!.rectOf('9:9:9')).toBeNull();
        expect(() => api!.scrollTo('3:1:3')).not.toThrow();
    });

    it('插件钩子抛错不拖垮阅读器', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { container } = await setup([{ id: 'bad', decorate: () => { throw new Error('x'); }, settings: { group: 'more', render: () => { throw new Error('y'); } } }]);
        expect(cell(container, '3:1:1')).not.toBeNull();
        expect(err).toHaveBeenCalled();
        err.mockRestore();
    });
});
