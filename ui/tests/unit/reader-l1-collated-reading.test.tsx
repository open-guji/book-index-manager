/**
 * L1 对读正文接线（overview#510）：分叶分割线、页指示头、书名号／波浪线、引号、专名号三档。
 * 默认（不传偏好 props）的渲染与改动前一致，由原有测试守住；这里证明新增的可见行为。
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GujiTextViewer, type PunctEntry } from '../../src/components/Reader/GujiTextViewer';
import { TextReader } from '../../src/components/TextReader';
import { ReaderMdText, bookMarkingOf, renderReaderInline } from '../../src/components/Reader/ReaderText';
import { adaptEntityJson } from '../../src/core/entity-annotations';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { DEFAULT_READER_PREFS, loadReaderPrefs } from '../../src/components/Reader/prefs';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: () => <div data-testid="canvas-stub" />,
}));
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const chars = (page: number, col: number, text: string) =>
    Array.from(text).map((char, i) => ({ id: `${page}:${col}:${i + 1}`, char, slot: i + 1, pos: i + 1, bbox_col: [0, 0, 1, 1] as number[], sub: null }));

/** 三页，每页一列 */
const pagesData: any = {
    page_id: 'vol:1',
    columns: [],
    pages: [
        { page: 1, columns: [{ col: 1, chars: chars(1, 1, '甲乙丙丁') }] },
        { page: 2, columns: [{ col: 1, chars: chars(2, 1, '戊己庚辛') }] },
        { page: 3, columns: [{ col: 1, chars: chars(3, 1, '壬癸子丑') }] },
    ],
};

function viewer(extra: Partial<React.ComponentProps<typeof GujiTextViewer>> = {}) {
    return render(
        <LocaleProvider>
            <GujiTextViewer pageData={pagesData} pages={pagesData.pages} selectedCharIds={new Set()} {...extra} />
        </LocaleProvider>,
    );
}

describe('分叶分割线（#501 第 1 条）', () => {
    it('默认画：第 2、3 页前各一条；pageBreaks=false：DOM 里没有分割元素，连续阅读', () => {
        const on = viewer();
        expect(on.container.querySelectorAll('.guji-page-divider').length).toBe(2);
        on.unmount();
        const off = viewer({ pageBreaks: false });
        expect(off.container.querySelectorAll('.guji-page-divider').length).toBe(0);
        // 页的 section 仍在（滚动判页要用），字一个不少
        expect(off.container.querySelectorAll('[data-page-section]').length).toBe(3);
        expect(off.container.querySelectorAll('[data-char-id]').length).toBe(12);
    });
});

describe('页指示头（#501 第 2 条）', () => {
    const tops: Record<string, number> = {};
    let rectSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true, writable: true });
        rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const p = this.getAttribute('data-page-section');
            const top = p ? (tops[p] ?? 0) : 0;
            return { top, bottom: top + 300, left: 200, right: 960, width: 760, height: 300, x: 200, y: top, toJSON() {} } as DOMRect;
        });
        // rAF 换成异步的 setTimeout（和真实一样：回调在调用返回之后才跑），测试里用 flush 等一帧
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { setTimeout(() => cb(0), 0); return 1; });
        vi.stubGlobal('cancelAnimationFrame', () => {});
    });
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    afterEach(() => { rectSpy.mockRestore(); vi.unstubAllGlobals(); });

    it('没传 pageIndicatorY：不画指示头，参考线仍是顶部以下 120px（旧行为）', () => {
        tops['1'] = -300; tops['2'] = 100; tops['3'] = 400;
        const onVisiblePageChange = vi.fn();
        const { container } = viewer({ onVisiblePageChange });
        expect(container.querySelector('.guji-page-indicator')).toBeNull();
        expect(onVisiblePageChange).toHaveBeenLastCalledWith(2); // 第 2 页顶边 100 ≤ 120，第 3 页 400 > 120
    });

    it('页码由指示头所在的行决定：同一滚动位置，指示头在 33% 得第 2 页、挪到 50% 得第 3 页', async () => {
        tops['1'] = -300; tops['2'] = 100; tops['3'] = 400;
        const onVisiblePageChange = vi.fn();
        const { container, rerender } = viewer({ onVisiblePageChange, pageIndicatorY: 0.33 });
        const slider = container.querySelector('.guji-page-indicator') as HTMLElement;
        expect(slider.getAttribute('role')).toBe('slider');
        expect(slider.getAttribute('aria-valuenow')).toBe('33');
        await flush();
        expect(onVisiblePageChange).toHaveBeenLastCalledWith(2); // 指示头在 330：第 3 页顶边 400 还在它下面
        rerender(
            <LocaleProvider>
                <GujiTextViewer pageData={pagesData} pages={pagesData.pages} selectedCharIds={new Set()} onVisiblePageChange={onVisiblePageChange} pageIndicatorY={0.5} />
            </LocaleProvider>,
        );
        await flush();
        expect(onVisiblePageChange).toHaveBeenLastCalledWith(3); // 指示头在 500：第 3 页顶边 400 已在它上面
    });

    it('模拟滚动：页往上走过指示头，页码跟着变；往回滚又变回来', async () => {
        tops['1'] = -300; tops['2'] = 100; tops['3'] = 600;
        const onVisiblePageChange = vi.fn();
        viewer({ onVisiblePageChange, pageIndicatorY: 0.33 });
        await flush();
        expect(onVisiblePageChange).toHaveBeenLastCalledWith(2);
        tops['2'] = -500; tops['3'] = 200; // 向下滚：第 3 页顶边升到指示头（330）之上
        window.dispatchEvent(new Event('scroll'));
        await flush();
        expect(onVisiblePageChange).toHaveBeenLastCalledWith(3);
        tops['2'] = 100; tops['3'] = 600; // 往回滚
        window.dispatchEvent(new Event('scroll'));
        await flush();
        expect(onVisiblePageChange).toHaveBeenLastCalledWith(2);
    });

    it('键盘微调：上下键 ±0.02、Shift ±0.1，夹在 0.1–0.9；通知宿主写偏好', () => {
        const onPageIndicatorYChange = vi.fn();
        const { container } = viewer({ onVisiblePageChange: vi.fn(), pageIndicatorY: 0.33, onPageIndicatorYChange });
        const slider = container.querySelector('.guji-page-indicator') as HTMLElement;
        fireEvent.keyDown(slider, { key: 'ArrowDown' });
        expect(onPageIndicatorYChange).toHaveBeenLastCalledWith(0.35);
        fireEvent.keyDown(slider, { key: 'ArrowUp' });
        expect(onPageIndicatorYChange).toHaveBeenLastCalledWith(0.31);
        fireEvent.keyDown(slider, { key: 'ArrowDown', shiftKey: true });
        expect(onPageIndicatorYChange).toHaveBeenLastCalledWith(0.43);
        fireEvent.keyDown(slider, { key: 'Enter' });
        expect(onPageIndicatorYChange).toHaveBeenCalledTimes(3);
    });

    it('键盘到头不越界', () => {
        const onPageIndicatorYChange = vi.fn();
        const { container } = viewer({ onVisiblePageChange: vi.fn(), pageIndicatorY: 0.1, onPageIndicatorYChange });
        fireEvent.keyDown(container.querySelector('.guji-page-indicator') as HTMLElement, { key: 'ArrowUp', shiftKey: true });
        expect(onPageIndicatorYChange).toHaveBeenLastCalledWith(0.1);
    });

    it('拖动：松手才把位置通知宿主（夹在 0.1–0.9），拖动中指示头跟手', () => {
        const onPageIndicatorYChange = vi.fn();
        const { container } = viewer({ onVisiblePageChange: vi.fn(), pageIndicatorY: 0.33, onPageIndicatorYChange });
        const slider = container.querySelector('.guji-page-indicator') as HTMLElement;
        fireEvent.pointerDown(slider, { pointerId: 1, clientY: 330 });
        fireEvent.pointerMove(slider, { pointerId: 1, clientY: 700 });
        expect(onPageIndicatorYChange).not.toHaveBeenCalled();
        expect(slider.getAttribute('aria-valuenow')).toBe('70');
        fireEvent.pointerUp(slider, { pointerId: 1, clientY: 700 });
        expect(onPageIndicatorYChange).toHaveBeenCalledTimes(1);
        expect(onPageIndicatorYChange).toHaveBeenLastCalledWith(0.7);
        // 拖出范围：夹住
        fireEvent.pointerDown(slider, { pointerId: 1, clientY: 700 });
        fireEvent.pointerMove(slider, { pointerId: 1, clientY: 990 });
        fireEvent.pointerUp(slider, { pointerId: 1, clientY: 990 });
        expect(onPageIndicatorYChange).toHaveBeenLastCalledWith(0.9);
    });

    it('不遮挡文字：指示头在正文栏左缘之外，且不在正文容器的文字流里', () => {
        const { container } = viewer({ onVisiblePageChange: vi.fn(), pageIndicatorY: 0.33 });
        const slider = container.querySelector('.guji-page-indicator') as HTMLElement;
        expect(slider.style.position).toBe('fixed');
        expect(parseInt(slider.style.left, 10)).toBeLessThan(200); // 正文栏 left=200（mock）
        expect(container.querySelector('.guji-text-reflow-view')!.contains(slider)).toBe(false);
    });
});

describe('书名号／波浪线、引号（#501 第 5、12 条）', () => {
    const punct = (anchor: string, mark: string, pos: 'before' | 'after'): PunctEntry => ({ anchor, mark, pos, id: `${anchor}${mark}` });
    // 第 1 页：甲乙丙丁；书名 乙丙，其前后挂《》，丁后挂「」
    const puncts: PunctEntry[] = [
        punct('1:1:2', '《', 'before'), punct('1:1:3', '》', 'after'), punct('1:1:4', '「', 'before'), punct('1:1:4', '」', 'after'),
    ];
    const ents = adaptEntityJson({ entities: [{ id: 'w', type: 'work', text: '乙丙', anchor: { start: '1:1:2', end: '1:1:3' }, span: { start_offset: 1, end_offset: 3 }, target: { status: 'new_candidate' } }] });
    const punctText = (c: HTMLElement) => Array.from(c.querySelectorAll('.guji-text-punct')).map((e) => e.textContent).join('');

    it('不传任何显示偏好：标点原样、书名线照画（旧行为）', () => {
        const { container } = viewer({ punctuations: puncts, entities: ents });
        expect(punctText(container)).toBe('《》「」');
        expect(container.querySelector('.bim-et-work')).not.toBeNull();
        expect(container.querySelector('.bim-et-nu')).toBeNull();
    });

    it('波浪线：隐去《》，画线', () => {
        const { container } = viewer({ punctuations: puncts, entities: ents, bookTitleStyle: 'wavy', showWorks: true, quoteStyle: 'original' });
        expect(punctText(container)).toBe('「」');
        expect(container.querySelector('.bim-et-work')).not.toBeNull();
        expect(container.querySelector('.bim-et-nu')).toBeNull();
    });

    it('书名号：显示《》，不画波浪线（线与号二选一）', () => {
        const { container } = viewer({ punctuations: puncts, entities: ents, bookTitleStyle: 'bracket', showWorks: true, quoteStyle: 'original' });
        expect(punctText(container)).toBe('《》「」');
        expect(container.querySelector('.bim-et-work')!.className).toContain('bim-et-nu');
    });

    it('showWorks=false：书名两样都不标（隐去《》；宿主筛掉书名实体后也没有线）', () => {
        const { container } = viewer({ punctuations: puncts, entities: [], bookTitleStyle: 'bracket', showWorks: false, quoteStyle: 'original' });
        expect(punctText(container)).toBe('「」');
        expect(container.querySelector('.bim-et')).toBeNull();
    });

    it('引号三态只改显示：original 不动、modern 「」→“”、classic “”→「」，字格与锚点不变', () => {
        const base = { punctuations: puncts, bookTitleStyle: 'bracket' as const, showWorks: true };
        expect(punctText(viewer({ ...base, quoteStyle: 'original' }).container)).toBe('《》「」');
        expect(punctText(viewer({ ...base, quoteStyle: 'modern' }).container)).toBe('《》“”');
        const modernPuncts = [punct('1:1:4', '“', 'before'), punct('1:1:4', '”', 'after')];
        const c = viewer({ punctuations: modernPuncts, bookTitleStyle: 'bracket', showWorks: true, quoteStyle: 'classic' }).container;
        expect(punctText(c)).toContain('「」');
        expect(c.querySelectorAll('[data-char-id]').length).toBeGreaterThanOrEqual(12);
    });
});

describe('整理本文本路径：bookMarkingOf／renderReaderInline（#501 第 5、12 条）', () => {
    const html = (n: React.ReactNode) => render(<div>{n}</div>).container.innerHTML;
    const base = { showWorks: true, bookTitleStyle: 'wavy' as const, properNameMode: 'full' as const };

    it('bookMarkingOf：showWorks 关＝none；书名号＝bracket；波浪线要专名号开着才画', () => {
        expect(bookMarkingOf(base)).toBe('wavy');
        expect(bookMarkingOf({ ...base, properNameMode: 'lite' })).toBe('wavy');
        expect(bookMarkingOf({ ...base, properNameMode: 'off' })).toBe('bracket');
        expect(bookMarkingOf({ ...base, bookTitleStyle: 'bracket' })).toBe('bracket');
        expect(bookMarkingOf({ ...base, showWorks: false })).toBe('none');
    });

    it('wavy＝波浪线（书名号视觉隐去、仍在 DOM）；bracket＝原文无线；none＝只隐号、无线；旧开关 properNames 照旧', () => {
        const text = '見《論語》「學而」';
        const wavy = html(renderReaderInline(text, { bookMarking: 'wavy' }));
        expect(wavy).toContain('bim-rd-pn');
        expect(wavy).toContain('<span class="bim-rd-sr">《</span>');
        const bracket = html(renderReaderInline(text, { bookMarking: 'bracket' }));
        expect(bracket).not.toContain('bim-rd-pn');
        expect(bracket).not.toContain('bim-rd-sr');
        expect(bracket).toContain('《論語》');
        const none = html(renderReaderInline(text, { bookMarking: 'none' }));
        expect(none).not.toContain('bim-rd-pn');
        expect(none).toContain('<span class="bim-rd-sr">《</span>');
        expect(html(renderReaderInline(text, { properNames: true }))).toBe(wavy);
        expect(html(renderReaderInline(text, { properNames: false }))).toBe(bracket);
    });

    it('quoteStyle：modern／classic 改显示，original／不传不动', () => {
        const text = '子曰「學而」，又曰“時習”';
        expect(html(renderReaderInline(text, { quoteStyle: 'modern' }))).toContain('子曰“學而”，又曰“時習”');
        expect(html(renderReaderInline(text, { quoteStyle: 'classic' }))).toContain('子曰「學而」，又曰「時習」');
        expect(html(renderReaderInline(text, { quoteStyle: 'original' }))).toBe(html(renderReaderInline(text, {})));
    });

    it('ReaderMdText 带上这两个偏好', () => {
        const { container } = render(
            <LocaleProvider><ReaderMdText text={'見《論語》「學而」'} mode="line" bookMarking="wavy" quoteStyle="modern" /></LocaleProvider>,
        );
        expect(container.querySelector('.bim-rd-pn')).not.toBeNull();
        expect(container.textContent).toContain('“学而”'); // 默认语言（简体）下文字被转换，引号已按 modern 改写
    });
});

describe('TextReader 接线：偏好 → 对读正文', () => {
    const WORK = '96mid1ogzk';
    const char = { pages: [
        { page: 3, columns: [{ col: 1, cells: ['讀', '易', '王', '弼', '官', '長'].map((c, i) => ({ a: `3:1:${i + 1}`, c })) }] },
        { page: 4, columns: [{ col: 1, cells: ['唐', '代'].map((c, i) => ({ a: `4:1:${i + 1}`, c })) }] },
    ] };
    const cord = { pages: [3, 4].map((pg) => ({
        page: pg, canvas: { id: `https://x/iiif/${WORK}/canvas/0${pg}/000${pg}`, seq: `000${pg}`, width: 1000, height: 1400 },
        cells: (pg === 3 ? [1, 2, 3, 4, 5, 6] : [1, 2]).map((n) => ({ a: `${pg}:1:${n}`, box: [1, 1 + n * 20, 10, 10] })),
    })) };
    const ent = (id: string, type: string, text: string, s: string, e: string) =>
        ({ id, type, text, anchor: { start: s, end: e }, span: { start_offset: 0, end_offset: text.length }, target: { status: 'new_candidate' } });
    const entity = { entities: [
        ent('e1', 'work', '讀易', '3:1:1', '3:1:2'),
        ent('e2', 'people', '王弼', '3:1:3', '3:1:4'),
        ent('e3', 'office', '官長', '3:1:5', '3:1:6'),
        ent('e4', 'dynasty', '唐代', '4:1:1', '4:1:2'),
    ] };
    const transport = {
        getItem: async () => ({ title: '總目' }),
        getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
        getTextIndex: async () => ({ chapters: [{ n: 3, file: '003', title: '卷四', char_file: '003.char.json', cord_file: '003.cord.json' }] }),
        getChapter: async () => ({ md: 'x', json: null }),
    } as unknown as IndexStorage;

    async function mount() {
        const view = render(
            <LocaleProvider>
                <TextReader
                    id={WORK}
                    transport={transport}
                    versionKey="original"
                    chapter="003"
                    resolveWarpData={async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, cord), punctuations: [
                        { anchor: '3:1:1', mark: '《', pos: 'before', id: 'p1' }, { anchor: '3:1:2', mark: '》', pos: 'after', id: 'p2' },
                    ] }) as never}
                    resolveImages={async () => [] as never}
                    resolveEntities={async () => entity}
                />
            </LocaleProvider>,
        );
        await waitFor(() => expect(view.container.querySelector('[data-page-section]')).not.toBeNull(), { timeout: 5000 });
        await waitFor(() => expect(view.container.querySelector('.bim-et')).not.toBeNull());
        return view;
    }
    const put = (p: object) => localStorage.setItem('bim-reader-prefs', JSON.stringify(p));
    const kinds = (c: HTMLElement) => Array.from(c.querySelectorAll('.bim-et')).map((e) => e.className.match(/bim-et-(work|person|place|office|dynasty|reign|other)\b/)?.[1]).sort();

    beforeEach(() => { localStorage.clear(); });

    it('properNameMode：full 全画；lite 只画人名、地名、朝代（官职不画）；off 不画人名等，书名只看 showWorks', async () => {
        put({ properNameMode: 'full' });
        expect(kinds((await mount()).container)).toEqual(['dynasty', 'office', 'person', 'work']);
        document.body.innerHTML = '';
        put({ properNameMode: 'lite' });
        expect(kinds((await mount()).container)).toEqual(['dynasty', 'person', 'work']);
        document.body.innerHTML = '';
        put({ properNameMode: 'lite', showWorks: false });
        expect(kinds((await mount()).container)).toEqual(['dynasty', 'person']);
        document.body.innerHTML = '';
        put({ properNameMode: 'off', showWorks: true });
        expect(kinds((await mount()).container)).toEqual(['work']);
    });

    it('分叶分割线：偏好 pageBreaks=false → 没有分割元素；默认有', async () => {
        put({ properNameMode: 'full' });
        expect((await mount()).container.querySelectorAll('.guji-page-divider').length).toBe(1);
        document.body.innerHTML = '';
        put({ properNameMode: 'full', pageBreaks: false });
        expect((await mount()).container.querySelectorAll('.guji-page-divider').length).toBe(0);
    });

    it('书名标法：默认波浪线隐去《》；偏好 bracket 显示《》且不画线', async () => {
        put({ properNameMode: 'full' });
        let c = (await mount()).container;
        expect(c.textContent).not.toContain('《');
        expect(c.querySelector('.bim-et-work.bim-et-nu')).toBeNull();
        document.body.innerHTML = '';
        put({ properNameMode: 'full', bookTitleStyle: 'bracket' });
        c = (await mount()).container;
        expect(c.textContent).toContain('《');
        expect(c.querySelector('.bim-et-work.bim-et-nu')).not.toBeNull();
    });

    it('指示头：键盘微调写进偏好（localStorage），刷新（重新挂载）后位置保留', async () => {
        put({ properNameMode: 'full' });
        const first = await mount();
        const slider = () => first.container.querySelector('.guji-page-indicator') as HTMLElement;
        expect(slider().getAttribute('aria-valuenow')).toBe('33');
        fireEvent.keyDown(slider(), { key: 'ArrowDown', shiftKey: true });
        await waitFor(() => expect(slider().getAttribute('aria-valuenow')).toBe('43'));
        expect(JSON.parse(localStorage.getItem('bim-reader-prefs') ?? '{}').pageIndicatorY).toBe(0.43);
        first.unmount();
        document.body.innerHTML = '';
        const second = await mount();
        await waitFor(() => expect((second.container.querySelector('.guji-page-indicator') as HTMLElement).getAttribute('aria-valuenow')).toBe('43'));
        expect(loadReaderPrefs().pageIndicatorY).toBe(0.43);
        expect(DEFAULT_READER_PREFS.pageIndicatorY).toBe(0.33);
    });
});
