/** 阅读数据读取上收：loadReaderChapter／readerVersions，以及 TextReader 不传 resolveWarpData 时自取、facsimile.trimmed */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { loadReaderChapter, loadReaderFiles, readerVersions } from '../../src/core/reader-data';
import { TextReader } from '../../src/components/TextReader';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const CHAR = { book_id: 'abc1', volume: 2, pages: [{ page: 1, columns: [{ col: 1, cells: [{ a: '1:1:1', c: '天' }, { a: '1:1:2', c: '地' }] }] }] };
const store = (files: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    getTextFile: vi.fn(async (_id: string, _key: string, file: string) => files[file] ?? null),
    ...extra,
}) as unknown as IndexStorage;

describe('readerVersions · 阅读页版本列表规则', () => {
    const v = (key: string, kind: string, extra: object = {}) => ({ key, kind, label: key, ...extra }) as never;
    it('有全文版时隐藏 collated，保留 self_collated', () => {
        const m = { versions: [v('default', 'collated'), v('ws', 'transcription'), v('own', 'self_collated')] };
        expect(readerVersions(m).versions.map(x => x.key)).toEqual(['ws', 'own']);
    });
    it('同来源有精校就不列粗校', () => {
        const m = { versions: [v('a', 'self_collated', { quality: 'fine', source_name: 'S' }), v('b', 'self_collated', { quality: 'rough', source_name: 'S' }), v('c', 'self_collated', { quality: 'rough', source_name: 'T' })] };
        expect(readerVersions(m).versions.map(x => x.key)).toEqual(['a', 'c']);
    });
    it('没有要隐藏的原样返回同一对象', () => {
        const m = { versions: [v('default', 'collated')] };
        expect(readerVersions(m)).toBe(m);
    });
});

describe('loadReaderChapter', () => {
    it('无 cord_file：返回 null；没声明 char_file 也是 null', async () => {
        const s = store({ '001.char.json': CHAR });
        expect(await loadReaderChapter(s, { id: 'i1', versionKey: 'k', chapter: { file: '001', char_file: '001.char.json' } })).toBeNull();
        expect(await loadReaderChapter(s, { id: 'i1', versionKey: 'k', chapter: { file: '001' } })).toBeNull();
    });
    it('窄屏不取 cord：照常给 pages，并按 char 推册号', async () => {
        const s = store({ '001.char.json': CHAR, '001.cord.json': { pages: [] } });
        const d = await loadReaderChapter(s, { id: 'i2', versionKey: 'k', chapter: { file: '001', char_file: '001.char.json', cord_file: '001.cord.json' } }, { cord: false });
        expect(d?.pages.length).toBeGreaterThan(0);
        expect(d?.iiifVolume).toEqual({ bookId: 'abc1', vol: '02' });
        const asked = (s.getTextFile as ReturnType<typeof vi.fn>).mock.calls.map(c => c[2]);
        expect(asked).not.toContain('001.cord.json');
    });
    it('warp_file 作为透视矫正样张并入；path 不合规的声明被忽略', async () => {
        const s = store({ '001.char.json': CHAR, '001.cord.json': { pages: [] }, '001.warp.json': { page_id: 'p10', title: 't', image_size: [1, 1], total_warped_w: 1, columns: [], banxin: { x: 1 } } });
        const ch = { file: '001', char_file: '001.char.json', cord_file: '001.cord.json', warp_file: '001.warp.json' };
        const d = await loadReaderChapter(s, { id: 'i3', versionKey: 'k', chapter: ch }, { cord: false });
        expect(d?.warpData.page_id).toBe('p10');
        expect(await loadReaderFiles(s, { id: 'i3b', versionKey: 'k', chapter: { char_file: '../x.json' } })).toBeNull();
    });
    it('没有 getTextFile 时退回 textFileBase 的 fetch', async () => {
        const f = vi.fn(async (u: string) => ({ ok: true, json: async () => (u.endsWith('c.json') ? CHAR : null) }));
        vi.stubGlobal('fetch', f);
        const files = await loadReaderFiles({} as IndexStorage, { id: 'i4', versionKey: 'k', chapter: { char_file: 'c.json' } }, { textFileBase: '/data/items/' });
        expect(files?.char).toBeTruthy();
        expect(f).toHaveBeenCalledWith('/data/items/i4/k/c.json');
        vi.unstubAllGlobals();
    });
});

describe('TextReader · 自取对读数据', () => {
    const base = {
        getItem: async () => ({ title: '書' }),
        getTextIndex: async () => ({ chapters: [{ n: 1, file: '001', title: '卷一', char_file: '001.char.json' }] }),
        getChapter: async () => ({ md: '正文', json: null }),
    };
    it('不传 resolveWarpData：自己取并回调 onChapterData', async () => {
        const getTextFile = vi.fn(async () => CHAR);
        const t = { ...base, getTextManifest: async () => ({ id: 'i5', versions: [{ key: 'k', kind: 'self_collated', label: 'k' }] }), getTextFile } as unknown as IndexStorage;
        const cb = vi.fn();
        render(<LocaleProvider><TextReader id="i5" transport={t} versionKey="k" chapter="001" onChapterData={cb} /></LocaleProvider>);
        await waitFor(() => expect(cb).toHaveBeenCalled());
        expect(getTextFile).toHaveBeenCalledWith('i5', 'k', '001.char.json');
        expect(cb.mock.calls[0][0].chapterKey).toBe('001');
    });
    it('resolveFacsimile：阅读器自己从 cord 得出 IIIF 册再向宿主要书影（宿主不碰 loadReaderFiles）', async () => {
        const CORD = { pages: [{ page: 1, canvas: { id: 'https://x/iiif/abc1/canvas/02/0001', seq: '0001', width: 10, height: 10 }, cells: [{ a: '1:1:1', box: [1, 1, 5, 5] }] }] };
        const getTextFile = vi.fn(async (_i: string, _k: string, f: string) => (f.endsWith('cord.json') ? CORD : CHAR));
        const t = { ...base, getTextManifest: async () => ({ id: 'i7', versions: [{ key: 'k', kind: 'self_collated', label: 'k' }] }), getTextIndex: async () => ({ chapters: [{ n: 1, file: '001', title: '卷一', char_file: '001.char.json', cord_file: '001.cord.json' }] }), getTextFile } as unknown as IndexStorage;
        const resolveFacsimile = vi.fn(async () => null);
        render(<LocaleProvider><TextReader id="i7" transport={t} versionKey="k" chapter="001" resolveFacsimile={resolveFacsimile} /></LocaleProvider>);
        await waitFor(() => expect(resolveFacsimile).toHaveBeenCalled());
        expect(resolveFacsimile).toHaveBeenCalledWith('abc1', '02');
    });
    it('manifest 版本 facsimile.trimmed：不出「书影保留空白」', async () => {
        const mk = (trimmed: boolean) => ({ ...base, getTextManifest: async () => ({ id: 'i6', versions: [{ key: 'k', kind: 'self_collated', label: 'k', facsimile: { trimmed } }] }) }) as unknown as IndexStorage;
        const a = render(<LocaleProvider><TextReader id="i6" transport={mk(true)} versionKey="k" chapter="001" /></LocaleProvider>);
        await waitFor(() => expect(a.container.querySelector('.bim-rd')).toBeTruthy());
        await waitFor(() => expect(a.container.textContent).toContain('正文'));
        expect(a.container.textContent).not.toContain('保留空白');
    });
});

describe('TextReader · 版本列表规则', () => {
    it('有全文版时不把整理本 default 列进版本选择，主版本是全文版（缺省即过滤）', async () => {
        const seen: string[] = [];
        const t = {
            getItem: async () => ({ title: '書' }),
            getTextManifest: async () => ({ id: 'i7', versions: [
                { key: 'default', kind: 'collated', label: '整理本' },
                { key: 'wikisource', kind: 'transcription', label: '維基文庫' },
            ] }),
            getTextIndex: async (_i: string, k: string) => { seen.push(k); return { chapters: [{ n: 1, file: '001', title: '卷一' }] }; },
            getChapter: async () => ({ md: '正文', json: null }),
        } as unknown as IndexStorage;
        render(<LocaleProvider><TextReader id="i7" transport={t} /></LocaleProvider>);
        await waitFor(() => expect(seen.length).toBeGreaterThan(0));
        expect(new Set(seen)).toEqual(new Set(['wikisource']));
    });
});

describe('TextReader · hideSupersededVersions={false}', () => {
    it('关掉过滤：按 manifest 顺序，主版本仍是第一个（整理本 default）', async () => {
        const seen: string[] = [];
        const t = {
            getItem: async () => ({ title: '書' }),
            getTextManifest: async () => ({ id: 'i8', versions: [
                { key: 'default', kind: 'collated', label: '整理本' },
                { key: 'wikisource', kind: 'transcription', label: '維基文庫' },
            ] }),
            getTextIndex: async (_i: string, k: string) => { seen.push(k); return { chapters: [{ n: 1, file: '001', title: '卷一' }] }; },
            getChapter: async () => ({ md: '正文', json: null }),
        } as unknown as IndexStorage;
        render(<LocaleProvider><TextReader id="i8" transport={t} hideSupersededVersions={false} /></LocaleProvider>);
        await waitFor(() => expect(seen.length).toBeGreaterThan(0));
        expect(seen).toContain('default');
    });
});

describe('loadReaderChapter · norm／fig（原网站 resolveWarpData 用例迁来）', () => {
    const ch = { file: '005', char_file: 'c.json', cord_file: 'k.json' };
    const FIG = { figures: [{ id: 'f148-2-14', kind: 'inline', file: 'fig/005/f148-2-14.png', alt: '左半圈连一实点', mime: 'image/png', width: 10, height: 10 }] };
    it('声明了 norm_file：hasNorm=true；没声明：false', async () => {
        const s = store({ 'c.json': CHAR, 'k.json': { pages: [] }, 'n.json': { items: [] } });
        const a = await loadReaderChapter(s, { id: 'n1', versionKey: 'k', chapter: { ...ch, norm_file: 'n.json' } });
        expect(a?.warpData.hasNorm).toBe(true);
        const b = await loadReaderChapter(s, { id: 'n2', versionKey: 'k', chapter: ch });
        expect(b?.warpData.hasNorm).toBe(false);
    });
    it('声明了 fig_file：带 figures 与同步的 figUrl（取不到地址给空串）；没声明不带', async () => {
        const s = store({ 'c.json': CHAR, 'k.json': { pages: [] }, 'f.json': FIG }, { getTextAssetUrl: async (_i: string, _k: string, rel: string) => `https://cdn/${rel}` });
        const a = await loadReaderChapter(s, { id: 'f1', versionKey: 'k', chapter: { ...ch, fig_file: 'f.json' } }) as unknown as { warpData: Record<string, any> };
        expect(a.warpData.figures.get('f148-2-14')).toMatchObject({ alt: '左半圈连一实点' });
        expect(a.warpData.figUrl('fig/005/f148-2-14.png')).toBe('https://cdn/fig/005/f148-2-14.png');
        expect(a.warpData.figUrl('fig/005/nope.png')).toBe('');
        const b = await loadReaderChapter(s, { id: 'f2', versionKey: 'k', chapter: ch }) as unknown as { warpData: Record<string, unknown> };
        expect(b.warpData).not.toHaveProperty('figures');
    });
});
