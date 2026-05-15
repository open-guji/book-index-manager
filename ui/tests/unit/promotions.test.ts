/**
 * Promotions 客户端 redirect 单测。
 *
 * 覆盖 GithubStorage 和 BundleStorage 在遇到已升格 draft-id 时：
 *   - getEntry(D) 返回 P 的内容，并挂 redirected_from=D
 *   - getItem(D) 返回 P 的详情，并挂 redirected_from=D
 *   - 默认 ensureLoaded 不再返回带 promoted_to 的 draft tombstone
 *   - promotions.json 缺失（404）时降级为不做 redirect
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubStorage } from '../../src/storage/github-storage';
import { BundleStorage } from '../../src/storage/bundle-storage';
import { buildPromotionMap } from '../../src/storage/promotions';

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

// ── buildPromotionMap 单元测试 ──

describe('buildPromotionMap', () => {
    it('正常 v1 文件', () => {
        const m = buildPromotionMap({
            version: 1,
            promotions: {
                'abc123def4567': { production_id: 'd59deewiqf40', type: 'work', promoted_at: 't' },
            },
        });
        expect(m.size).toBe(1);
        expect(m.get('abc123def4567')).toBe('d59deewiqf40');
    });

    it('未知 version 当作空映射', () => {
        const m = buildPromotionMap({ version: 999, promotions: { a: { production_id: 'b' } } });
        expect(m.size).toBe(0);
    });

    it('null/非对象当作空映射', () => {
        expect(buildPromotionMap(null).size).toBe(0);
        expect(buildPromotionMap('not an object').size).toBe(0);
    });

    it('entry 缺 production_id 跳过', () => {
        const m = buildPromotionMap({ version: 1, promotions: { good: { production_id: 'x' }, bad: {} } });
        expect(m.size).toBe(1);
        expect(m.has('bad')).toBe(false);
    });
});

// ── BundleStorage redirect ──

describe('BundleStorage promotions redirect', () => {
    const DRAFT = '1evdraftxxxx1';
    const PROD = 'd59prodxxxx1';

    function makeHandler(includePromotions: boolean) {
        return (url: string) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            if (url.includes('/promotions.json')) {
                if (!includePromotions) return { ok: false, status: 404 };
                return {
                    ok: true,
                    body: {
                        version: 1,
                        promotions: {
                            [DRAFT]: { production_id: PROD, type: 'work', promoted_at: 't' },
                        },
                    },
                };
            }
            if (url.includes('/chunks/_manifest.json')) {
                return { ok: true, body: ['d59', '1ev'] };
            }
            if (url.includes('/chunks/d59.json')) {
                return { ok: true, body: { [PROD]: { title: '红楼梦', type: 'work', author: '曹雪芹' } } };
            }
            // 故意 draft chunk 也存在（模拟旧 bundle 残留），用以证明 redirect 不走 draft 路径
            if (url.includes('/chunks/1ev.json')) {
                return { ok: true, body: { [DRAFT]: { title: '不该被读到', type: 'work' } } };
            }
            return { ok: false, status: 404 };
        };
    }

    it('getEntry(D) 重定向到 P 内容', async () => {
        const { restore } = setupFetch(makeHandler(true));
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const e = await s.getEntry(DRAFT);
            expect(e).not.toBeNull();
            expect(e!.id).toBe(PROD);
            expect(e!.title).toBe('红楼梦');
            expect(e!.redirected_from).toBe(DRAFT);
        } finally {
            restore();
        }
    });

    it('getItem(D) 重定向到 P 详情', async () => {
        const { restore } = setupFetch(makeHandler(true));
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const item = await s.getItem(DRAFT);
            expect(item).not.toBeNull();
            expect((item as any).title).toBe('红楼梦');
            expect((item as any).redirected_from).toBe(DRAFT);
        } finally {
            restore();
        }
    });

    it('getEntry(P) 直接命中，不带 redirected_from', async () => {
        const { restore } = setupFetch(makeHandler(true));
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const e = await s.getEntry(PROD);
            expect(e).not.toBeNull();
            expect(e!.id).toBe(PROD);
            expect(e!.redirected_from).toBeUndefined();
        } finally {
            restore();
        }
    });

    it('promotions.json 缺失时 getEntry(D) 正常返回 draft 内容', async () => {
        const { restore } = setupFetch(makeHandler(false));
        try {
            const s = new BundleStorage({ basePath: '/data' });
            const e = await s.getEntry(DRAFT);
            expect(e).not.toBeNull();
            expect(e!.id).toBe(DRAFT);
            expect(e!.redirected_from).toBeUndefined();
        } finally {
            restore();
        }
    });
});

// ── GithubStorage redirect ──

describe('GithubStorage promotions redirect', () => {
    const DRAFT = '1evdraftxxxx2';
    const PROD = 'd59prodxxxx2';

    function makeHandler(opts: { includePromotions: boolean; draftHasTombstone: boolean }) {
        return (url: string) => {
            // probe 路径：返回成功让 fetchIndex 进入正常流程
            if (url.includes('index/collections.json')) return { ok: true, body: {} };
            if (url.includes('promotions.json')) {
                if (!opts.includePromotions) return { ok: false, status: 404 };
                return {
                    ok: true,
                    body: {
                        version: 1,
                        promotions: {
                            [DRAFT]: { production_id: PROD, type: 'work', promoted_at: 't' },
                        },
                    },
                };
            }
            // 单个 item 文件
            if (url.includes(`/${DRAFT}-`)) {
                return { ok: true, body: { id: DRAFT, type: 'work', title: '旧的 draft 内容' } };
            }
            if (url.includes(`/${PROD}-`)) {
                return { ok: true, body: { id: PROD, type: 'work', title: '红楼梦' } };
            }
            // works shard
            if (url.includes('/book-index-draft/main/index/works/')) {
                if (url.endsWith('0.json')) {
                    const tombstone = opts.draftHasTombstone
                        ? { [DRAFT]: { id: DRAFT, title: '旧的 draft 内容', path: `Work/1/e/v/${DRAFT}-x.json`, promoted_to: PROD } }
                        : { [DRAFT]: { id: DRAFT, title: '旧的 draft 内容', path: `Work/1/e/v/${DRAFT}-x.json` } };
                    return { ok: true, body: tombstone };
                }
                return { ok: true, body: {} };
            }
            if (url.includes('/book-index/main/index/works/')) {
                if (url.endsWith('0.json')) {
                    return { ok: true, body: { [PROD]: { id: PROD, title: '红楼梦', path: `Work/d/5/9/${PROD}-x.json` } } };
                }
                return { ok: true, body: {} };
            }
            // 其他 shard 一律 200 空，避免 fetchIndex 失败
            return { ok: true, body: {} };
        };
    }

    it('getEntry(D) 重定向到 P', async () => {
        const { restore } = setupFetch(makeHandler({ includePromotions: true, draftHasTombstone: true }));
        try {
            const s = new GithubStorage({ org: 'open-guji', repos: { draft: 'book-index-draft', official: 'book-index' } });
            const e = await s.getEntry(DRAFT);
            expect(e).not.toBeNull();
            expect(e!.id).toBe(PROD);
            expect(e!.redirected_from).toBe(DRAFT);
        } finally {
            restore();
        }
    });

    it('getAllEntries 过滤掉已升级的 draft tombstone', async () => {
        const { restore } = setupFetch(makeHandler({ includePromotions: true, draftHasTombstone: true }));
        try {
            const s = new GithubStorage({ org: 'open-guji', repos: { draft: 'book-index-draft', official: 'book-index' } });
            const all = await s.getAllEntries();
            const ids = all.map(e => e.id);
            expect(ids).toContain(PROD);
            expect(ids).not.toContain(DRAFT);
        } finally {
            restore();
        }
    });

    it('未升级的 draft 仍然出现在 getAllEntries', async () => {
        const { restore } = setupFetch(makeHandler({ includePromotions: false, draftHasTombstone: false }));
        try {
            const s = new GithubStorage({ org: 'open-guji', repos: { draft: 'book-index-draft', official: 'book-index' } });
            const all = await s.getAllEntries();
            const ids = all.map(e => e.id);
            expect(ids).toContain(DRAFT);
            expect(ids).toContain(PROD);
        } finally {
            restore();
        }
    });
});
