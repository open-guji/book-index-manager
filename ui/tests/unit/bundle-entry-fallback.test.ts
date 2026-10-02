/**
 * BundleStorage 详情：没有 chunks/ 的数据（网站 Phase 3 起只出 entry/{id}.json）退到单文件（overview#371）。
 * 原先 chunks/_manifest.json 404 就当查无此条，丛编页 getCollectionCatalogs 永远取不到目录。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BundleStorage } from '../../src/storage/bundle-storage';

const COLL = '8rlb6yi1ecqo';
const DETAIL = { id: COLL, type: 'collection', title: '欽定四庫全書·文淵閣本', resources: [{ id: 'cptw', short_name: '台北' }] };
const MAPPING = { volumes: [{ volume: 1, books: [{ title: '御製文集', work_id: 'w1' }] }] };

function mockFetch(files: Record<string, unknown>) {
    const calls: string[] = [];
    const fn = vi.fn(async (url: string) => {
        const path = url.replace(/\?v=.*$/, '');
        calls.push(path);
        const body = files[path];
        return body === undefined
            ? new Response('not found', { status: 404 })
            : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    return calls;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('BundleStorage：详情退到 entry/{id}.json', () => {
    it('auto：chunks 清单 404 → 读 entry/，丛编目录取得到；清单只请求一次', async () => {
        const calls = mockFetch({
            [`/data/entry/${COLL}.json`]: DETAIL,
            [`/data/items/${COLL}/cptw/volume_book_mapping.json`]: MAPPING,
        });
        const s = new BundleStorage({ basePath: '/data', version: 'v1' });
        const catalogs = await s.getCollectionCatalogs(COLL);
        expect(catalogs).toHaveLength(1);
        expect(catalogs![0]).toMatchObject({ resource_id: 'cptw', short_name: '台北' });
        expect((await s.getItem(COLL))?.title).toBe('欽定四庫全書·文淵閣本');
        expect((await s.getEntry(COLL))?.title).toBe('欽定四庫全書·文淵閣本');
        expect(calls.filter((c) => c.endsWith('/chunks/_manifest.json'))).toHaveLength(1);
        expect(calls.filter((c) => c.endsWith(`/entry/${COLL}.json`))).toHaveLength(1);
    });

    it("detailLayout: 'entry'：根本不请求 chunks/_manifest.json", async () => {
        const calls = mockFetch({ [`/data/entry/${COLL}.json`]: DETAIL });
        const s = new BundleStorage({ basePath: '/data', version: 'v1', detailLayout: 'entry' });
        expect((await s.getItem(COLL))?.id).toBe(COLL);
        expect(calls.some((c) => c.includes('/chunks/'))).toBe(false);
    });

    it('有 chunks 的旧数据（pack_bundle.py）照旧读 chunk，不去请求 entry/', async () => {
        const calls = mockFetch({
            '/data/chunks/_manifest.json': ['8rlb'],
            '/data/chunks/8rlb.json': { [COLL]: DETAIL },
        });
        const s = new BundleStorage({ basePath: '/data', version: 'v1' });
        expect((await s.getItem(COLL))?.title).toBe('欽定四庫全書·文淵閣本');
        expect(calls.some((c) => c.includes('/entry/'))).toBe(false);
    });

    it('两边都没有：返回 null，不抛错', async () => {
        mockFetch({});
        const s = new BundleStorage({ basePath: '/data', version: 'v1' });
        expect(await s.getItem('nope')).toBeNull();
        expect(await s.getEntry('nope')).toBeNull();
        expect(await s.getCollectionCatalogs('nope')).toBeNull();
    });
});
