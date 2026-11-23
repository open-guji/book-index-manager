/**
 * 缺页（guji-gaps/0.1）：解析、正文里的注记行、书影翻页多一步占位卡。
 */
import React from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { adaptGaps, gapNoteOf } from '../../src/core/gaps';
import { loadReaderChapter } from '../../src/core/reader-data';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: (p: { pageData: { page_id: string } }) => <div data-testid="canvas-stub" data-page-id={p.pageData.page_id} />,
}));
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
const realRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
        const page = this.getAttribute?.('data-page-section');
        if (page == null) return realRect.call(this);
        const top = 300 + (Number(page) - 1) * 900;
        return { x: 0, y: top, top, left: 0, right: 0, bottom: top + 800, width: 0, height: 800, toJSON() { return this; } } as DOMRect;
    };
});
afterAll(() => { Element.prototype.getBoundingClientRect = realRect; });
beforeEach(() => { localStorage.setItem('bim-reader-prefs', JSON.stringify({ v: 2, pageBreaks: true })); });

const raw = { schema: 'guji-gaps/0.1', book: '06', chapter: '009', gaps: [
    { after_page: 20, what: '卷九叶九、叶十', kind: '原书缺', est_chars: 830, evidence: 'x', note: '〔原书此处缺卷九叶九、叶十，约 830 字〕' },
] };

describe('adaptGaps', () => {
    it('认 after_page／what／kind／est_chars／note，按页序排', () => {
        const g = adaptGaps({ gaps: [{ after_page: 30, what: 'b', kind: '未拍' }, ...raw.gaps] });
        expect(g.map(x => x.afterPage)).toEqual([20, 30]);
        expect(g[0]).toMatchObject({ what: '卷九叶九、叶十', kind: '原书缺', estChars: 830, note: '〔原书此处缺卷九叶九、叶十，约 830 字〕' });
        expect(g[1].note).toBe('〔此处未拍b〕');
    });
    it('形状不对的条目丢掉，整体不对返回空数组', () => {
        expect(adaptGaps(null)).toEqual([]);
        expect(adaptGaps({ gaps: [{ after_page: '3', what: 'x' }, { after_page: -1, what: 'x' }, { after_page: 2, what: '' }, 7] })).toEqual([]);
        expect(adaptGaps({ gaps: [{ after_page: 1, what: 'a' }, { after_page: 1, what: 'b' }] })).toHaveLength(1);
    });
    it('note 缺省时按导出端同形的写法兜底', () => {
        expect(gapNoteOf({ what: '卷九叶九', kind: '原书缺', estChars: 830 })).toBe('〔原书此处缺卷九叶九，约 830 字〕');
    });
});

const char = { pages: [
    { page: 20, columns: [{ col: 1, cells: [{ a: '20:1:1', c: '前' }] }] },
    { page: 21, columns: [{ col: 1, cells: [{ a: '21:1:1', c: '後' }] }] },
] };
const mkCord = (canvas: (n: string) => unknown) => ({ pages: [
    { page: 20, canvas: canvas('0020'), cells: [{ a: '20:1:1', box: [1, 1, 10, 10] }] },
    { page: 21, canvas: canvas('0021'), cells: [{ a: '21:1:1', box: [1, 1, 10, 10] }] },
] });

describe('loadReaderChapter 读 gaps_file', () => {
    it('声明了 gaps_file 就取并带进 warpData.gaps；没声明没有这个键；取不到当没有', async () => {
        const cord = mkCord(n => ({ id: `https://x/iiif/B/canvas/06/${n}`, seq: n, width: 100, height: 100 }));
        const files: Record<string, unknown> = { '009.char.json': char, '009.cord.json': cord, '009.gaps.json': raw };
        const storage = { getTextFile: async (_i: string, _k: string, f: string) => files[f] ?? null };
        const chapter = { char_file: '009.char.json', cord_file: '009.cord.json' };
        const a = await loadReaderChapter(storage as never, { id: 'B', versionKey: 'k', chapter: { ...chapter, gaps_file: '009.gaps.json' } });
        expect((a!.warpData as any).gaps).toHaveLength(1);
        const b = await loadReaderChapter(storage as never, { id: 'B', versionKey: 'k', chapter });
        expect('gaps' in (b!.warpData as any)).toBe(false);
        const c = await loadReaderChapter(storage as never, { id: 'B', versionKey: 'k', chapter: { ...chapter, gaps_file: '404.gaps.json' } });
        expect('gaps' in (c!.warpData as any)).toBe(false);
    });
});

describe('GujiTextViewer 缺页注记', () => {
    it('在 after_page 那页文字之后单起一行 note，与正文区分', () => {
        const pages = adaptCharCord(char);
        const { container } = render(
            <LocaleProvider locale="zh-Hans">
                <GujiTextViewer pageData={{ page_id: '', columns: [], pages } as any} pages={pages as any} selectedCharIds={new Set()} gaps={adaptGaps(raw)} />
            </LocaleProvider>,
        );
        const note = container.querySelector('.guji-gap-note') as HTMLElement;
        expect(note.textContent).toBe('〔原书此处缺卷九叶九、叶十，约 830 字〕');
        expect(note.previousElementSibling!.getAttribute('data-page-section')).toBe('20');
        expect(note.nextElementSibling!.getAttribute('data-page-section')).toBe('21');
        expect(note.querySelector('[data-char-id]')).toBeNull();
    });
    it('after_page 为 0 排在第一页之前；没有缺页就没有这行', () => {
        const pages = adaptCharCord(char);
        const mk = (gaps?: any) => render(
            <LocaleProvider locale="zh-Hans">
                <GujiTextViewer pageData={{ page_id: '', columns: [], pages } as any} pages={pages as any} selectedCharIds={new Set()} gaps={gaps} />
            </LocaleProvider>,
        ).container;
        const c = mk(adaptGaps({ gaps: [{ after_page: 0, what: '卷首', kind: '原书缺' }] }));
        expect(c.querySelector('.guji-gap-note')!.nextElementSibling!.getAttribute('data-page-section')).toBe('20');
        expect(mk().querySelector('.guji-gap-note')).toBeNull();
    });
});

describe('TextReader 书影缺页占位卡', () => {
    const WORK = '99k3i35yww';
    const canvas = (n: string) => ({ id: `https://x/iiif/${WORK}/canvas/06/${n}`, seq: n, width: 1000, height: 1400 });
    const transport = {
        getItem: async () => ({ title: '脈經' }),
        getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
        getTextIndex: async () => ({ chapters: [{ n: 9, file: '009', title: '卷九', char_file: '009.char.json', cord_file: '009.cord.json' }] }),
        getChapter: async () => ({ md: 'x', json: null }),
    } as unknown as IndexStorage;
    const wp = () => document.querySelector('[data-warp-page]')!.getAttribute('data-warp-page');
    async function setup() {
        const images = [20, 21].map(n => ({ pageNo: n, seq: String(n).padStart(4, '0'), url: `u${n}`, width: 1000, height: 1400 }));
        const view = render(
            <LocaleProvider>
                <TextReader id={WORK} transport={transport} versionKey="original" chapter="009"
                    resolveWarpData={async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, mkCord(canvas)), punctuations: [], gaps: adaptGaps(raw) }) as never}
                    resolveImages={async () => images as never} />
            </LocaleProvider>,
        );
        await waitFor(() => expect(screen.getByTestId('facsimile-next')).toBeTruthy(), { timeout: 5000 });
        await waitFor(() => expect(view.container.querySelector('[data-page-section]')).not.toBeNull(), { timeout: 5000 });
        await act(async () => { await new Promise(r => setTimeout(r, 200)); });
        return view;
    }
    it('第 20 页之后多一步：占位卡写 what 与估计字数，不占页号；再点「›」到第 21 页，「‹」回占位卡', async () => {
        await setup();
        await waitFor(() => expect(wp()).toBe('20'), { timeout: 5000 });
        expect(screen.queryByTestId('facsimile-gap')).toBeNull();
        fireEvent.click(screen.getByTestId('facsimile-next'));
        await waitFor(() => expect(screen.getByTestId('facsimile-gap')).toBeTruthy());
        expect(wp()).toBe('20');
        expect(screen.getByTestId('facsimile-gap').textContent).toContain('卷九叶九、叶十');
        expect(screen.getByTestId('facsimile-gap').textContent).toContain('830');
        expect(screen.queryByTestId('canvas-stub')).toBeNull();
        fireEvent.click(screen.getByTestId('facsimile-next'));
        await waitFor(() => { expect(wp()).toBe('21'); expect(screen.queryByTestId('facsimile-gap')).toBeNull(); });
        expect((screen.getByTestId('facsimile-next') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByTestId('facsimile-prev'));
        await waitFor(() => { expect(wp()).toBe('20'); expect(screen.getByTestId('facsimile-gap')).toBeTruthy(); });
        fireEvent.click(screen.getByTestId('facsimile-prev'));
        await waitFor(() => { expect(screen.queryByTestId('facsimile-gap')).toBeNull(); expect(screen.getByTestId('canvas-stub')).toBeTruthy(); });
        expect(wp()).toBe('20');
    });
});
