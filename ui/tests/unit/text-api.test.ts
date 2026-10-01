/** 阅读文本取数（overview#307）：只认新结构，没有 manifest 就是没有文本 */
import { describe, expect, it, vi } from 'vitest';
import { createTextApi } from '../../src/core/text-api';
import type { IndexStorage } from '../../src/storage/types';

const WORK = 'd59f2htm01du';
const store = (x: Partial<IndexStorage>) => x as IndexStorage;

function nativeStore(manifests: Record<string, unknown>) {
    const getTextManifest = vi.fn(async (id: string) => (manifests[id] ?? null) as never);
    const getTextIndex = vi.fn(async (_id: string, key: string) => ({ chapters: [{ n: 1, file: '001', title: `${key}一` }] }) as never);
    const getChapter = vi.fn(async (_id: string, key: string, ch: string) => ({ md: `${key}/${ch}`, json: null }));
    return { getTextManifest, getTextIndex, getChapter };
}
const MANIFEST = { id: WORK, versions: [{ key: 'default', kind: 'collated', label: '整理本' }, { key: 'wikisource', kind: 'transcription', label: '維基文庫' }] };

describe('新结构取数', () => {
    it('manifest、目录、章内容都来自 transport 的新接口', async () => {
        const n = nativeStore({ [WORK]: MANIFEST });
        const api = createTextApi(store(n));
        expect((await api.getManifest(WORK))?.versions.map(v => v.key)).toEqual(['default', 'wikisource']);
        expect((await api.getIndex(WORK, 'wikisource'))?.chapters[0].title).toBe('wikisource一');
        expect(await api.getChapter(WORK, 'default', '001', { json: true })).toEqual({ md: 'default/001', json: null });
        expect(n.getChapter).toHaveBeenCalledWith(WORK, 'default', '001', { json: true });
    });

    it('同一条目的 manifest 只取一次（并发也是）', async () => {
        const n = nativeStore({ [WORK]: MANIFEST });
        const api = createTextApi(store(n));
        await Promise.all([api.getManifest(WORK), api.getManifest(WORK)]);
        await api.getManifest(WORK);
        expect(n.getTextManifest).toHaveBeenCalledTimes(1);
    });
});

describe('没有 manifest ＝ 暂无文本', () => {
    it('manifest 404：返回 null，也不缓存（下次再试）', async () => {
        const n = nativeStore({});
        const api = createTextApi(store(n));
        expect(await api.getManifest(WORK)).toBeNull();
        expect(await api.getManifest(WORK)).toBeNull();
        expect(n.getTextManifest).toHaveBeenCalledTimes(2);
    });

    it('transport 没有新接口：同样是 null，目录与章也是 null', async () => {
        const api = createTextApi(store({}));
        expect(await api.getManifest(WORK)).toBeNull();
        expect(await api.getIndex(WORK, 'default')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '001')).toBeNull();
    });

    it('versions 为空或不是数组也当没有；取数抛错当作没有，不往外抛', async () => {
        expect(await createTextApi(store({ getTextManifest: async () => ({ id: WORK, versions: [] }) as never })).getManifest(WORK)).toBeNull();
        expect(await createTextApi(store({ getTextManifest: async () => ({ id: WORK }) as never })).getManifest(WORK)).toBeNull();
        expect(await createTextApi(store({ getTextManifest: async () => { throw new Error('boom'); } })).getManifest(WORK)).toBeNull();
    });
});

describe('参数校验', () => {
    it('id、key、章含路径分隔符、URL 分隔符或 .. 一律返回 null，不发请求', async () => {
        const n = nativeStore({ [WORK]: MANIFEST });
        const api = createTextApi(store(n));
        expect(await api.getManifest('../x')).toBeNull();
        expect(await api.getIndex(WORK, '../x')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '../001')).toBeNull();
        expect(await api.getChapter(WORK, 'a/b', '001')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '001?x=1')).toBeNull();
        expect(await api.getChapter(WORK, 'default', '001#f')).toBeNull();
        expect(n.getTextManifest).not.toHaveBeenCalled();
        expect(n.getTextIndex).not.toHaveBeenCalled();
        expect(n.getChapter).not.toHaveBeenCalled();
    });
});
