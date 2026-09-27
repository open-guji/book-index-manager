/**
 * BundleStorage 的 Work 全文读取层（W6a）。
 *
 * 三份真实数据固定为 fixture（取自 book-text 09-27 HEAD）：
 * - 周易 d59ezakdey2o：只有一份 wikisource-01（primary），覆盖「一份」；
 * - 老子 d59ezkx8dt6o：wikisource-02（王弼本）与 wikisource-01（匯校本）两份，
 *   前者 primary（T12 道按内容完整度改过 primary，非按 key 字典序），覆盖「多份按规则选最好」；
 * - 一个真实不存在全文的 Work id，覆盖「无全文」。
 *
 * shard 分片号也按 book-text `scripts/book-text/build_index.py` 的 shard() 实测值
 * 写死（周易 e、老子 7），验证 TS 侧 shardOf 与 Python 侧算法确为同一套哈希——
 * 算法一旦跑偏，测试请求的分片文件名就会跟真实数据摆放的分片错开，必然 404。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BundleStorage } from '../../src/storage/bundle-storage';
import type { WorkFullTextEntry, WorkFullTextIndex } from '../../src/types';

const ZHOUYI_ID = 'd59ezakdey2o';
const ZHOUYI_SHARD = 'e';
const LAOZI_ID = 'd59ezkx8dt6o';
const LAOZI_SHARD = '7';
const NO_FULLTEXT_ID = 'd59f2mp38qv4'; // 真实存在的 Work，但不在任何 full_text 分片里

const ZHOUYI_ENTRY: WorkFullTextEntry = {
    key: 'wikisource-01',
    owner_type: 'Work',
    path: 'Work/y/2/o/d59ezakdey2o/full_text/wikisource-01',
    version_label: '周易',
    source_name: '維基文庫',
    source_url: 'https://zh.wikisource.org/wiki/%E5%91%A8%E6%98%93',
    license: 'CC BY-SA 4.0',
    grade: 'source',
    total_chapters: 73,
    fetched_at: '2026-09-27',
    primary: true,
};

const ZHOUYI_INDEX: WorkFullTextIndex = {
    work_id: ZHOUYI_ID,
    version_label: '周易',
    source: { name: '維基文庫', url: 'https://zh.wikisource.org/wiki/%E5%91%A8%E6%98%93', license: 'CC BY-SA 4.0' },
    total_chapters: 73,
    chapters: [
        { n: 1, title: '彖', file: '001.md', page_title: '周易/彖', md_len: 4585 },
        { n: 2, title: '大象', file: '002.md', page_title: '周易/大象', md_len: 1370 },
    ],
};

// 老子：wikisource-02（王弼本，81 章）在列表里排第一即 primary；
// wikisource-01（匯校本，2 章）排第二——与 T12 道实测的真实排序一致。
const LAOZI_ENTRIES: WorkFullTextEntry[] = [
    {
        key: 'wikisource-02',
        owner_type: 'Work',
        path: 'Work/t/6/o/d59ezkx8dt6o/full_text/wikisource-02',
        version_label: '老子',
        source_name: '維基文庫',
        source_url: 'https://zh.wikisource.org/wiki/%E9%81%93%E5%BE%B7%E7%B6%93%20%28%E7%8E%8B%E5%BC%BC%E6%9C%AC%29',
        license: 'CC BY-SA 4.0',
        grade: 'source',
        total_chapters: 81,
        fetched_at: '2026-09-27',
        primary: true,
    },
    {
        key: 'wikisource-01',
        owner_type: 'Work',
        path: 'Work/t/6/o/d59ezkx8dt6o/full_text/wikisource-01',
        version_label: '老子',
        source_name: '維基文庫',
        source_url: 'https://zh.wikisource.org/wiki/%E8%80%81%E5%AD%90%20%28%E5%8C%AF%E6%A0%A1%E7%89%88%29',
        license: 'CC BY-SA 4.0',
        grade: 'source',
        total_chapters: 2,
        fetched_at: '2026-09-27',
        primary: false,
    },
];

interface FetchCall { url: string }

function setupFetch(handler: (url: string) => { ok: boolean; body?: unknown; text?: string; status?: number }): {
    calls: FetchCall[];
    restore: () => void;
} {
    const calls: FetchCall[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        calls.push({ url });
        const r = handler(url);
        return {
            ok: r.ok,
            status: r.status ?? (r.ok ? 200 : 404),
            statusText: r.ok ? 'OK' : 'Not Found',
            json: async () => r.body,
            text: async () => r.text ?? JSON.stringify(r.body ?? null),
        } as Response;
    }) as any;
    return { calls, restore: () => { globalThis.fetch = original; } };
}

function fullTextShardHandler(shards: Record<string, Record<string, WorkFullTextEntry[]>>) {
    return (url: string) => {
        if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abcdef123456' } };
        const m = url.match(/\/index\/full_text\/([0-9a-f])\.json/);
        if (m && shards[m[1]]) return { ok: true, body: shards[m[1]] };
        if (m) return { ok: false, status: 404 };
        return { ok: false, status: 404 };
    };
}

describe('BundleStorage.getWorkFullTextList', () => {
    let restore: () => void;
    afterEach(() => restore?.());

    it('一份：周易只有 wikisource-01，取到的分片号与 book-text 实测一致', async () => {
        const { calls, restore: r } = setupFetch(fullTextShardHandler({
            [ZHOUYI_SHARD]: { [ZHOUYI_ID]: [ZHOUYI_ENTRY] },
        }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        const list = await s.getWorkFullTextList!(ZHOUYI_ID);
        expect(list).toEqual([ZHOUYI_ENTRY]);
        expect(calls.some(c => c.url.includes(`/index/full_text/${ZHOUYI_SHARD}.json`))).toBe(true);
    });

    it('多份：老子两份按「哪份最好」排好序，首项 primary（不重新排序）', async () => {
        const { restore: r } = setupFetch(fullTextShardHandler({
            [LAOZI_SHARD]: { [LAOZI_ID]: LAOZI_ENTRIES },
        }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        const list = await s.getWorkFullTextList!(LAOZI_ID);
        expect(list).toHaveLength(2);
        expect(list[0].key).toBe('wikisource-02');
        expect(list[0].primary).toBe(true);
        expect(list[1].key).toBe('wikisource-01');
        expect(list[1].primary).toBe(false);
        // 只允许一份 primary
        expect(list.filter(e => e.primary)).toHaveLength(1);
    });

    it('无全文：分片里没有这个 owner，返回空数组而非 null／抛错', async () => {
        // 该 id 具体落哪个分片无所谓（下面 handler 对任何分片号都返回空对象），反正分片里没有它
        const { restore: r } = setupFetch(() => ({ ok: true, body: {} }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        const list = await s.getWorkFullTextList!(NO_FULLTEXT_ID);
        expect(list).toEqual([]);
    });

    it('分片文件本身 404（如该分片恰好空）时也返回空数组', async () => {
        const { restore: r } = setupFetch(() => ({ ok: false, status: 404 }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        await expect(s.getWorkFullTextList!(ZHOUYI_ID)).resolves.toEqual([]);
    });
});

describe('BundleStorage.getWorkFullTextIndex', () => {
    let restore: () => void;
    afterEach(() => restore?.());

    it('按 key 取周易目录，字段与真实 index.json 一致', async () => {
        const { calls, restore: r } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            if (url.includes(`/items/${ZHOUYI_ID}/full_text/wikisource-01/index.json`)) {
                return { ok: true, body: ZHOUYI_INDEX };
            }
            return { ok: false, status: 404 };
        });
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        const idx = await s.getWorkFullTextIndex!(ZHOUYI_ID, 'wikisource-01');
        expect(idx?.work_id).toBe(ZHOUYI_ID);
        expect(idx?.total_chapters).toBe(73);
        expect(idx?.chapters[0].title).toBe('彖');
        expect(calls.some(c => c.url.includes('/items/d59ezakdey2o/full_text/wikisource-01/index.json'))).toBe(true);
    });

    it('取老子非 primary 的 wikisource-01（匯校本），与取 wikisource-02 是两个不同请求', async () => {
        const { calls, restore: r } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            if (url.includes(`/items/${LAOZI_ID}/full_text/wikisource-01/index.json`)) {
                return { ok: true, body: { work_id: LAOZI_ID, version_label: '老子', total_chapters: 2, chapters: [], source: { name: '維基文庫', url: '' } } };
            }
            return { ok: false, status: 404 };
        });
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        const idx = await s.getWorkFullTextIndex!(LAOZI_ID, 'wikisource-01');
        expect(idx?.total_chapters).toBe(2);
        expect(calls.some(c => c.url.includes('wikisource-02'))).toBe(false);
    });

    it('key 含路径穿越或斜杠时直接拒绝，不发请求', async () => {
        const { calls, restore: r } = setupFetch(() => ({ ok: true, body: ZHOUYI_INDEX }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        expect(await s.getWorkFullTextIndex!(ZHOUYI_ID, '../secret')).toBeNull();
        expect(await s.getWorkFullTextIndex!(ZHOUYI_ID, 'a/b')).toBeNull();
        expect(calls).toHaveLength(0);
    });

    it('key 不存在时返回 null', async () => {
        const { restore: r } = setupFetch(() => ({ ok: false, status: 404 }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        expect(await s.getWorkFullTextIndex!(ZHOUYI_ID, 'no-such-key')).toBeNull();
    });
});

describe('BundleStorage.getWorkFullTextChapter', () => {
    let restore: () => void;
    afterEach(() => restore?.());

    it('取周易第一章正文（.md 请求会改写成 .txt，与 Book 全文同规则）', async () => {
        const chapterText = '## 彖\n\n## 乾（卦一）\n大哉乾元，萬物資始，乃統天。';
        const { calls, restore: r } = setupFetch((url) => {
            if (url.includes('/version.json')) return { ok: true, body: { commitId: 'abc' } };
            if (url.includes(`/items/${ZHOUYI_ID}/full_text/wikisource-01/001.txt`)) {
                return { ok: true, text: chapterText };
            }
            return { ok: false, status: 404 };
        });
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        const text = await s.getWorkFullTextChapter!(ZHOUYI_ID, 'wikisource-01', '001.md');
        expect(text).toBe(chapterText);
        expect(calls.some(c => c.url.includes('001.txt'))).toBe(true);
        expect(calls.some(c => c.url.includes('001.md'))).toBe(false);
    });

    it('文件不存在时返回 null', async () => {
        const { restore: r } = setupFetch(() => ({ ok: false, status: 404 }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        expect(await s.getWorkFullTextChapter!(ZHOUYI_ID, 'wikisource-01', '999.md')).toBeNull();
    });

    it('key 或 file 含路径穿越时直接拒绝，不发请求', async () => {
        const { calls, restore: r } = setupFetch(() => ({ ok: true, text: 'x' }));
        restore = r;
        const s = new BundleStorage({ basePath: '/data' });
        expect(await s.getWorkFullTextChapter!(ZHOUYI_ID, '../x', '001.md')).toBeNull();
        expect(await s.getWorkFullTextChapter!(ZHOUYI_ID, 'wikisource-01', '../../etc/passwd')).toBeNull();
        expect(calls).toHaveLength(0);
    });
});
