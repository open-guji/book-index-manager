/**
 * BundleStorage 单测
 *
 * 这一层是 index.json 剥离的最后防线。回归断言：
 * 1. search/searchAll/loadEntries/getAllEntries 必须抛错（"已废弃"）—
 *    若有人重新引入这些路径，CI 立即失败而不是悄悄拉 23 MB
 * 2. getCounts 仅读 meta.json，无 fallback
 * 3. getEntry 走 chunks，不再触发全量 index 加载
 *
 * fetch 用 vi.fn 全局 stub。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BundleStorage } from '../../src/storage/bundle-storage';

interface FetchCall { url: string; init?: RequestInit }

function setupFetch(handler: (url: string) => { ok: boolean; body?: unknown; status?: number }): {
    calls: FetchCall[];
    restore: () => void;
} {
    const calls: FetchCall[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: any, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        calls.push({ url, init });
        const r = handler(url);
        return {
            ok: r.ok,
            status: r.status ?? (r.ok ? 200 : 404),
            statusText: r.ok ? 'OK' : 'Not Found',
            json: async () => r.body,
            text: async () => JSON.stringify(r.body ?? null),
        } as Response;
    }) as any;
    return { calls, restore: () => { globalThis.fetch = original; } };
}

describe('BundleStorage — 已废弃方法必须抛错（index.json 剥离回归）', () => {
    let restore: () => void;

    beforeEach(() => {
        ({ restore } = setupFetch(() => ({ ok: false, status: 404 })));
    });
    afterEach(() => restore());

    it('searchAll 抛错', async () => {
        const s = new BundleStorage({ basePath: '/data' });
        await expect(s.searchAll('q')).rejects.toThrow(/已废弃/);
    });

    it('search 抛错', async () => {
        const s = new BundleStorage({ basePath: '/data' });
        await expect(s.search('q', 'work', { page: 1, pageSize: 10 })).rejects.toThrow(/已废弃/);
    });

    it('loadEntries 抛错', async () => {
        const s = new BundleStorage({ basePath: '/data' });
        await expect(s.loadEntries('work', { page: 1, pageSize: 10 })).rejects.toThrow(/已废弃/);
    });

    it('getAllEntries 抛错', async () => {
        const s = new BundleStorage({ basePath: '/data' });
        await expect(s.getAllEntries()).rejects.toThrow(/已废弃/);
    });
});

describe('BundleStorage.getCounts — 仅 meta.json，不 fallback', () => {
    it('正确返回 meta.json 内容', async () => {
        const meta = { works: 100, books: 200, collections: 5, entities: 50,
            resourceCounts: { hasText: 30, hasImage: 40 }, subtypeStats: {} };
        const { calls, restore } = setupFetch((url) => {
            if (url.includes('/meta.json')) return { ok: true, body: meta };
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abcdef123456' } };
            return { ok: false };
        });
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const c = await s.getCounts();
            expect(c.works).toBe(100);
            expect(c.books).toBe(200);
            expect(c.entities).toBe(50);
            // 必须 fetch 过 meta.json，绝不 fetch index.json
            expect(calls.some(c => c.url.includes('/meta.json'))).toBe(true);
            expect(calls.some(c => c.url.includes('/index.json'))).toBe(false);
        } finally {
            restore();
        }
    });

    it('meta.json 缺失时抛错（不再回退到 index.json）', async () => {
        const { restore } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            return { ok: false, status: 404 };
        });
        try {
            const s = new BundleStorage({ basePath: '/data' });
            await expect(s.getCounts()).rejects.toThrow();
        } finally {
            restore();
        }
    });
});

describe('BundleStorage.getEntry — chunk 路径', () => {
    it('从 manifest+chunk 取条目，绝不 fetch index.json', async () => {
        // 真实 work ID 长度 13；这里用一个虚构但格式合规的 ID
        const id = '1evgowbkc2qyo';  // 水滸傳
        const detail = {
            title: '水滸傳',
            type: 'work',
            author: '羅貫中',
            dynasty: '明',
            has_collated: true,
            juan_count: { number: 100 },
        };
        const { calls, restore } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            if (url.includes('/chunks/_manifest.json')) {
                return { ok: true, body: ['1ev'] };  // 单个前缀，覆盖该 ID
            }
            if (url.includes('/chunks/1ev.json')) {
                return { ok: true, body: { [id]: detail } };
            }
            return { ok: false, status: 404 };
        });
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const entry = await s.getEntry(id);
            expect(entry).not.toBeNull();
            expect(entry!.id).toBe(id);
            expect(entry!.title).toBe('水滸傳');
            expect(entry!.has_collated).toBe(true);
            // 关键回归：绝不 fetch index.json
            expect(calls.some(c => c.url.includes('/index.json'))).toBe(false);
            // 必须 fetch 过 chunk
            expect(calls.some(c => c.url.includes('/chunks/1ev.json'))).toBe(true);
        } finally {
            restore();
        }
    });

    it('chunk miss 时返回 null（不 fallback 到 index.json）', async () => {
        const { calls, restore } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            if (url.includes('/chunks/_manifest.json')) return { ok: true, body: [] };
            return { ok: false, status: 404 };
        });
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const entry = await s.getEntry('1evgowbkc2qyo');
            expect(entry).toBeNull();
            expect(calls.some(c => c.url.includes('/index.json'))).toBe(false);
        } finally {
            restore();
        }
    });
});

describe('BundleStorage.fetchJson — version.json 拼 ?v= 一次（不重复）', () => {
    it('getLineageGraph 不再产生重复 v= query', async () => {
        const { calls, restore } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abcdef123456' } };
            if (url.includes('lineage_graph')) return { ok: true, body: { nodes: [] } };
            return { ok: false, status: 404 };
        });
        try {
            const s = new BundleStorage({ basePath: '/data' });
            await s.getLineageGraph!('1evgowbkc2qyo');
            const lineage = calls.find(c => c.url.includes('lineage_graph'));
            expect(lineage).toBeDefined();
            // 关键回归：之前 bug 是 ?v=...&v=...（重复）
            const matches = lineage!.url.match(/v=/g) ?? [];
            expect(matches.length).toBe(1);
        } finally {
            restore();
        }
    });
});

describe('BundleStorage — 阅读文本新结构（overview#307）', () => {
    const ID = 'd59f2htm01du';

    it('getTextManifest：读 items/<id>/manifest.json；404（旧结构）返回 null', async () => {
        const { calls, restore } = setupFetch(url => (url.includes(`/items/${ID}/manifest.json`)
            ? { ok: true, body: { id: ID, versions: [{ key: 'default', kind: 'collated', label: '整理本' }] } }
            : { ok: false }));
        try {
            const s = new BundleStorage({ basePath: '/data', version: 'v1' });
            const m = await s.getTextManifest(ID);
            expect(m?.versions[0].key).toBe('default');
            expect(calls[0].url).toBe(`/data/items/${ID}/manifest.json?v=v1`);
            expect(await s.getTextManifest('d59f2zzzzzzz')).toBeNull();
        } finally { restore(); }
    });

    it('getTextManifest：versions 不是数组也当没有', async () => {
        const { restore } = setupFetch(() => ({ ok: true, body: { id: ID } }));
        try {
            expect(await new BundleStorage({ basePath: '/data' }).getTextManifest(ID)).toBeNull();
        } finally { restore(); }
    });

    it('getTextIndex：读 items/<id>/<key>/index.json；key 不合法不发请求', async () => {
        const { calls, restore } = setupFetch(() => ({ ok: true, body: { chapters: [{ n: 1, file: '001', title: '一' }] } }));
        try {
            const s = new BundleStorage({ basePath: '/data', version: 'v1' });
            expect((await s.getTextIndex(ID, 'wikisource-2'))?.chapters).toHaveLength(1);
            expect(calls[0].url).toBe(`/data/items/${ID}/wikisource-2/index.json?v=v1`);
            const n = calls.length;
            for (const k of ['../x', 'a/b', 'Manifest', 'manifest', '001', '']) expect(await s.getTextIndex(ID, k)).toBeNull();
            expect(calls.length).toBe(n);
        } finally { restore(); }
    });

    it('getChapter：md 读 <key>/<章>.txt；opts.json 时另取 <章>.json；都没有返回 null', async () => {
        const { calls, restore } = setupFetch(url => {
            if (url.includes('/default/001.txt')) return { ok: true, body: '正文' };
            if (url.includes('/default/001.json')) return { ok: true, body: { title: '卷一', sections: [] } };
            return { ok: false };
        });
        try {
            const s = new BundleStorage({ basePath: '/data', version: 'v1' });
            const r = await s.getChapter(ID, 'default', '001', { json: true });
            expect(r?.json?.title).toBe('卷一');
            expect(typeof r?.md).toBe('string');
            expect(calls.map(c => c.url).sort()).toEqual([`/data/items/${ID}/default/001.json?v=v1`, `/data/items/${ID}/default/001.txt?v=v1`]);
            const only = await s.getChapter(ID, 'default', '001');
            expect(only?.json).toBeNull();
            expect(await s.getChapter(ID, 'default', '002', { json: true })).toBeNull();
            expect(await s.getChapter(ID, '../x', '001')).toBeNull();
            expect(await s.getChapter(ID, 'default', '../001')).toBeNull();
        } finally { restore(); }
    });
});
