/** 阅读文本取数（overview#307）：新结构原样走新接口，旧结构合成等价数据 */
import { describe, expect, it, vi } from 'vitest';
import { createTextApi } from '../../src/core/text-api';
import type { IndexStorage } from '../../src/storage/types';
import type { CollatedEditionIndex, CollatedJuan, WorkFullTextEntry, WorkFullTextIndex } from '../../src/types';

const WORK = 'd59f2htm01du';
const BOOK = '988fbiuha8';

const store = (x: Partial<IndexStorage>) => x as IndexStorage;

// ── 新结构 ──
function nativeStore(manifests: Record<string, unknown>) {
    const getTextManifest = vi.fn(async (id: string) => (manifests[id] ?? null) as never);
    const getTextIndex = vi.fn(async (_id: string, key: string) => ({ chapters: [{ n: 1, file: '001', title: `${key}一` }] }) as never);
    const getChapter = vi.fn(async (_id: string, key: string, ch: string) => ({ md: `${key}/${ch}`, json: null }));
    return { getTextManifest, getTextIndex, getChapter };
}
const MANIFEST = { id: WORK, versions: [{ key: 'default', kind: 'collated', label: '整理本' }, { key: 'wikisource', kind: 'transcription', label: '維基文庫' }] };

// ── 旧结构 ──
const COLLATED: CollatedEditionIndex = { work_id: WORK, title: '書錄', juan_files: ['juan/001.json', 'juan/002.json'] };
const JUAN: CollatedJuan = { title: '卷一', sections: [] };
const FULLS: WorkFullTextEntry[] = [
    { key: 'kanripo-01', owner_type: 'Work', path: 'p', source_name: 'Kanripo', version_label: 'K', total_chapters: 1, primary: true },
    { key: 'wikisource-01', owner_type: 'Work', path: 'p', source_name: '維基文庫', version_label: 'W', total_chapters: 1, primary: false },
];
const FT_INDEX = (key: string): WorkFullTextIndex => ({
    work_id: WORK, version_label: key, source: { name: key, url: 'u' }, total_chapters: 1, chapters: [{ n: 1, title: '第一', file: '第001.md' }],
});
function legacyStore() {
    return {
        getCollatedEditionIndex: vi.fn(async () => COLLATED),
        getCollatedJuan: vi.fn(async () => JUAN),
        getCollatedJuanText: vi.fn(async () => '# 原文'),
        getWorkFullTextList: vi.fn(async () => FULLS),
        getWorkFullTextIndex: vi.fn(async (_id: string, key: string) => FT_INDEX(key)),
        getWorkFullTextChapter: vi.fn(async (_id: string, key: string, file: string) => `${key}:${file}`),
        getBookFullTextIndex: vi.fn(async () => ({ book_id: BOOK, version_label: 'b', source: { name: '維基文庫', url: 'u' }, total_chapters: 1, chapters: [{ n: 1, title: '一回', file: '第001.md' }] }) as never),
        getBookFullTextChapter: vi.fn(async (_id: string, file: string) => `book:${file}`),
    };
}

describe('新结构：有 manifest 就原样走新接口', () => {
    it('manifest、目录、章内容都来自新接口，不碰旧方法', async () => {
        const n = nativeStore({ [WORK]: MANIFEST });
        const old = legacyStore();
        const api = createTextApi(store({ ...n, ...old }));
        const m = await api.getManifest(WORK);
        expect(m?.versions.map(v => v.key)).toEqual(['default', 'wikisource']);
        expect((await api.getIndex(WORK, 'wikisource'))?.chapters[0].title).toBe('wikisource一');
        expect(await api.getChapter(WORK, 'default', '001', { json: true })).toEqual({ md: 'default/001', json: null });
        expect(n.getChapter).toHaveBeenCalledWith(WORK, 'default', '001', { json: true });
        expect(old.getCollatedEditionIndex).not.toHaveBeenCalled();
        expect(old.getWorkFullTextList).not.toHaveBeenCalled();
    });

    it('同一条目的 manifest 只取一次（并发也是）', async () => {
        const n = nativeStore({ [WORK]: MANIFEST });
        const api = createTextApi(store(n));
        await Promise.all([api.getManifest(WORK), api.getManifest(WORK), api.getIndex(WORK, 'default')]);
        expect(n.getTextManifest).toHaveBeenCalledTimes(1);
    });
});

describe('旧结构：用旧取数方法合成等价数据', () => {
    it('Work：整理本 + 维基 + Kanripo，default 是整理本；目录与章内容按旧接口取回', async () => {
        const old = legacyStore();
        const n = nativeStore({}); // 新接口在，但这个条目没有 manifest（返回 null）
        const api = createTextApi(store({ ...n, ...old }));
        const m = await api.getManifest(WORK);
        expect(m?.versions.map(v => [v.key, v.label])).toEqual([['default', '整理本'], ['wikisource', '維基文庫'], ['kanripo', 'Kanripo']]);

        const ci = await api.getIndex(WORK, 'default');
        expect(ci?.chapters.map(c => c.file)).toEqual(['001', '002']);
        expect(await api.getChapter(WORK, 'default', '001', { json: true })).toEqual({ md: '# 原文', json: JUAN });
        expect(old.getCollatedJuan).toHaveBeenCalledWith(WORK, 'juan/001.json');
        expect(old.getCollatedJuanText).toHaveBeenCalledWith(WORK, 'juan/001.json');

        const wi = await api.getIndex(WORK, 'wikisource');
        expect(wi?.chapters[0]).toMatchObject({ file: '第001', title: '第一' });
        expect(await api.getChapter(WORK, 'wikisource', '第001')).toEqual({ md: 'wikisource-01:第001.md', json: null });
        expect(old.getWorkFullTextChapter).toHaveBeenCalledWith(WORK, 'wikisource-01', '第001.md');
    });

    it('transport 没有新接口：同样走旧方法', async () => {
        const api = createTextApi(store(legacyStore()));
        expect((await api.getManifest(WORK))?.versions).toHaveLength(3);
    });

    it('Book：全文一份，default；不去问 Work 的整理本与全文清单', async () => {
        const old = legacyStore();
        const api = createTextApi(store(old));
        const m = await api.getManifest(BOOK);
        expect(m?.versions.map(v => [v.key, v.label])).toEqual([['default', '維基文庫']]);
        expect(old.getCollatedEditionIndex).not.toHaveBeenCalled();
        expect(old.getWorkFullTextList).not.toHaveBeenCalled();
        expect(await api.getChapter(BOOK, 'default', '第001')).toEqual({ md: 'book:第001.md', json: null });
    });

    it('没有任何文本：manifest 为 null，不缓存（下次再试）', async () => {
        const list = vi.fn(async () => [] as WorkFullTextEntry[]);
        const coll = vi.fn(async () => null);
        const api = createTextApi(store({ getWorkFullTextList: list, getCollatedEditionIndex: coll }));
        expect(await api.getManifest(WORK)).toBeNull();
        expect(await api.getManifest(WORK)).toBeNull();
        expect(list).toHaveBeenCalledTimes(2);
    });

    it('取数抛错当作没有，不往外抛', async () => {
        const api = createTextApi(store({
            getCollatedEditionIndex: async () => { throw new Error('boom'); },
            getWorkFullTextList: async () => FULLS.slice(1),
        }));
        expect((await api.getManifest(WORK))?.versions.map(v => v.key)).toEqual(['default']);
    });
});

describe('参数校验', () => {
    it('key、章含路径分隔符、URL 分隔符或 .. 一律返回 null，不发取章／取目录请求', async () => {
        const n = nativeStore({ [WORK]: MANIFEST });
        const api = createTextApi(store(n));
        expect(await api.getIndex(WORK, '../x')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '../001')).toBeNull();
        expect(await api.getChapter(WORK, 'a/b', '001')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '001?x=1')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '001#f')).toBeNull();
        // 取章与取目录的请求一个都不发（条目的 manifest 可能为判断新旧结构已经取过）
        expect(n.getChapter).not.toHaveBeenCalled();
        expect(n.getTextIndex).not.toHaveBeenCalled();
    });

    it('未知的版本 key／章：旧结构返回 null', async () => {
        const api = createTextApi(store(legacyStore()));
        expect(await api.getIndex(WORK, 'nonesuch')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '999')).toBeNull();
    });
});
