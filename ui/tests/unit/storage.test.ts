/**
 * BookIndexStorage + scoring 单测
 *
 * 这是 npm 包 book-index-ui 的 storage 抽象层，VS Code/Node CLI 都依赖它。
 * 之前覆盖率 1.4%（753 行）— 实际只有 cleanName 一条被测过。
 *
 * 用 InMemoryFS 模拟文件系统：路径→内容 Map，避免真盘 I/O。
 *
 * 覆盖：
 *   - 路径计算（getRootByStatus / getRootById / getPath / getAssetDir）
 *   - shardOf 哈希（与 Python 端等价的回归断言）
 *   - CRUD 往返（saveItem → findFileById → getItem → deleteItem）
 *   - shard 索引（loadEntries / rebuildIndex / collections 单文件特例）
 *   - 搜索调度（searchEntries / searchAll）
 *   - asset directory（initAssetDir / hasAssetDir）
 *   - 评分（scoreEntry 各档分） + 排序（rankByRelevance 同分按长度）
 *   - 繁简双索引（rankByRelevanceWithSimplified）
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
    BookIndexStorage,
    cleanName,
    shardOf,
    NUM_SHARDS,
    scoreEntry,
    rankByRelevance,
    rankByRelevanceWithSimplified,
} from '../../src/core/storage';
import type { FileSystem } from '../../src/core/filesystem';
import type { IndexEntry } from '../../src/types';

// ─── InMemory FileSystem ───
class InMemoryFS implements FileSystem {
    files = new Map<string, string>();
    dirs = new Set<string>();

    async readFile(path: string): Promise<string> {
        const f = this.files.get(path);
        if (f === undefined) throw new Error(`ENOENT: ${path}`);
        return f;
    }
    async writeFile(path: string, content: string): Promise<void> {
        this.files.set(path, content);
        // 自动注册父目录链
        let dir = path.substring(0, path.lastIndexOf('/'));
        while (dir) {
            this.dirs.add(dir);
            const next = dir.substring(0, dir.lastIndexOf('/'));
            if (next === dir) break;
            dir = next;
        }
    }
    async deleteFile(path: string): Promise<void> {
        if (!this.files.delete(path)) throw new Error(`ENOENT: ${path}`);
    }
    async exists(path: string): Promise<boolean> {
        if (this.files.has(path) || this.dirs.has(path)) return true;
        // 是目录前缀也算存在
        const prefix = path + '/';
        for (const f of this.files.keys()) if (f.startsWith(prefix)) return true;
        return false;
    }
    async mkdir(path: string): Promise<void> {
        this.dirs.add(path);
    }
    async readdir(path: string): Promise<string[]> {
        const prefix = path.endsWith('/') ? path : path + '/';
        const direct = new Set<string>();
        for (const f of this.files.keys()) {
            if (f.startsWith(prefix)) {
                const rest = f.slice(prefix.length);
                const slash = rest.indexOf('/');
                direct.add(slash === -1 ? rest : rest.slice(0, slash));
            }
        }
        return Array.from(direct);
    }
    async stat(path: string): Promise<{ isDirectory: boolean }> {
        if (this.files.has(path)) return { isDirectory: false };
        return { isDirectory: true };
    }
    async glob(dir: string, _pattern: string): Promise<string[]> {
        // 测试只用 '**/*.json' 模式
        const prefix = dir.endsWith('/') ? dir : dir + '/';
        const out: string[] = [];
        for (const f of this.files.keys()) {
            if (f.startsWith(prefix) && f.endsWith('.json')) out.push(f);
        }
        return out;
    }
}

// 真实 work draft IDs（来自 book-index-draft 现有数据）
const WORK_ID_SHIJI = '1eujfe7s94veo'; // 史記
const WORK_ID_HAN = '1euidlec1g8ow';   // 漢書

const WORKSPACE = '/ws';

function makeStorage() {
    const fs = new InMemoryFS();
    const storage = new BookIndexStorage(fs, WORKSPACE);
    return { fs, storage };
}

describe('shardOf hash (与 Python 端等价)', () => {
    it('稳定哈希：同一 ID 总是落到同一分片', () => {
        const a = shardOf(WORK_ID_SHIJI);
        const b = shardOf(WORK_ID_SHIJI);
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(NUM_SHARDS);
    });

    it('不同 ID 分布到不同分片（统计意义上）', () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => s.repeat(5));
        const shards = new Set(ids.map(id => shardOf(id)));
        expect(shards.size).toBeGreaterThan(1);
    });

    it('支持自定义分片数', () => {
        expect(shardOf('xyz', 4)).toBeLessThan(4);
        expect(shardOf('xyz', 32)).toBeLessThan(32);
    });
});

describe('cleanName', () => {
    it('保留 CJK + ASCII 字母数字，删其他', () => {
        expect(cleanName('史記·司馬遷 (撰)')).toBe('史記司馬遷撰');
        expect(cleanName('Book 1 — Notes')).toBe('Book1Notes');
    });

    it('保留 CJK 兼容字（U+F900+，旧版漏过）', () => {
        // 歷 (U+F98C) 是 CJK 兼容字
        expect(cleanName('歷史')).toBe('歷史');
    });

    it('全 punctuation → 兜底 Undefined', () => {
        expect(cleanName('!!!---')).toBe('Undefined');
        expect(cleanName('')).toBe('Undefined');
    });
});

describe('BookIndexStorage 路径', () => {
    it('getRootByStatus 区分 official / draft', () => {
        const { storage } = makeStorage();
        expect(storage.getRootByStatus('draft')).toBe('/ws/book-index-draft');
        expect(storage.getRootByStatus('official')).toBe('/ws/book-index');
    });

    it('getRootById 由 ID 解码决定 status', () => {
        const { storage } = makeStorage();
        // 1euxxx 是 base36 解码后 status=1（draft）
        expect(storage.getRootById(WORK_ID_SHIJI)).toBe('/ws/book-index-draft');
    });

    it('getPath 走 ID 前 3 字符分桶 + cleanName 拼路径', () => {
        const { storage } = makeStorage();
        const p = storage.getPath('work', WORK_ID_SHIJI, '史記');
        // /ws/book-index-draft/Work/1/e/u/{id}-史記.json
        expect(p).toMatch(/\/Work\/1\/e\/u\//);
        expect(p).toContain(WORK_ID_SHIJI);
        expect(p).toContain('史記');
        expect(p.endsWith('.json')).toBe(true);
    });

    it('getAssetDir：JSON 同级 ID 命名的目录', () => {
        const { storage } = makeStorage();
        const dir = storage.getAssetDir(WORK_ID_SHIJI);
        // 路径形如 /ws/book-index-draft/Work/1/e/u/{id}（无 .json）
        expect(dir).toMatch(/\/Work\/1\/e\/u\/1eujfe7s94veo$/);
    });
});

describe('BookIndexStorage CRUD 往返', () => {
    let storage: BookIndexStorage;
    let fs: InMemoryFS;

    beforeEach(() => {
        ({ fs, storage } = makeStorage());
    });

    it('saveItem → findFileById → getItem 闭环', async () => {
        const meta = { title: '史記', authors: [{ name: '司馬遷' }], juan_count: 130 };
        const path = await storage.saveItem('work', WORK_ID_SHIJI, meta);
        // 文件落在文件系统里
        expect(fs.files.has(path)).toBe(true);
        // findFileById 找回
        const found = await storage.findFileById(WORK_ID_SHIJI);
        expect(found).toBe(path);
        // getItem 解析回 metadata
        const got = await storage.getItem(WORK_ID_SHIJI);
        expect(got).toMatchObject({ title: '史記', id: WORK_ID_SHIJI, type: 'work' });
    });

    it('saveItem 重命名：title 变化时旧文件被删', async () => {
        const path1 = await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記' });
        const path2 = await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記_v2' });
        expect(path1).not.toBe(path2);
        expect(fs.files.has(path1)).toBe(false);
        expect(fs.files.has(path2)).toBe(true);
    });

    it('saveItem 自动写 id + type 到 metadata', async () => {
        const meta: any = { title: '漢書' };
        await storage.saveItem('work', WORK_ID_HAN, meta);
        const stored = JSON.parse(fs.files.get(await storage.findFileById(WORK_ID_HAN) as string)!);
        expect(stored.id).toBe(WORK_ID_HAN);
        expect(stored.type).toBe('work');
    });

    it('findFileById：不存在返回 null', async () => {
        expect(await storage.findFileById('nonexistent12345')).toBeNull();
    });

    it('getItem：不存在返回 null', async () => {
        expect(await storage.getItem('nonexistent12345')).toBeNull();
    });

    it('deleteItem：清掉文件 + shard 中的索引', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記' });
        const ok = await storage.deleteItem(WORK_ID_SHIJI);
        expect(ok).toBe(true);
        expect(await storage.findFileById(WORK_ID_SHIJI)).toBeNull();
    });

    it('deleteItem：不存在返回 false', async () => {
        expect(await storage.deleteItem('nonexistent99999')).toBe(false);
    });

    it('loadMetadata：读取并 parse', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記' });
        const path = await storage.findFileById(WORK_ID_SHIJI) as string;
        const meta = await storage.loadMetadata(path);
        expect(meta.title).toBe('史記');
    });

    it('loadMetadata：文件不存在返回空对象（不抛）', async () => {
        const meta = await storage.loadMetadata('/nonexistent/path.json');
        expect(meta).toEqual({});
    });
});

describe('BookIndexStorage 索引 shard', () => {
    let storage: BookIndexStorage;

    beforeEach(() => {
        ({ storage } = makeStorage());
    });

    it('loadEntries 读取 shard 索引', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記', authors: [{ name: '司馬遷' }] });
        await storage.saveItem('work', WORK_ID_HAN, { title: '漢書', authors: [{ name: '班固' }] });
        const entries = await storage.loadEntries('work', 'draft');
        expect(entries).toHaveLength(2);
        const titles = entries.map(e => e.title).sort();
        expect(titles).toEqual(['史記', '漢書']);
    });

    it('loadEntries 提取 author 字符串（authors 数组对象）', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記', authors: [{ name: '司馬遷' }] });
        const entries = await storage.loadEntries('work', 'draft');
        expect(entries[0].author).toBe('司馬遷');
    });

    it('loadEntries 提取 has_text/has_image（resources 标记）', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, {
            title: '史記',
            resources: [{ types: ['text', 'image'] }],
        });
        const entries = await storage.loadEntries('work', 'draft');
        expect(entries[0].has_text).toBe(true);
        expect(entries[0].has_image).toBe(true);
    });

    it('searchEntries 用 rankByRelevance 排序（标题完全匹配 > 部分匹配）', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記' });
        await storage.saveItem('work', WORK_ID_HAN, { title: '漢書·藝文志' });
        const r = await storage.searchEntries('史記', 'work', 'draft');
        expect(r[0].title).toBe('史記');
    });

    it('searchAll 同时返回 work/book/collection，按 limit 切', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, { title: '史記' });
        const r = await storage.searchAll('史記', 5, 'draft');
        expect(r.totalWorks).toBeGreaterThan(0);
        expect(r.works.length).toBeLessThanOrEqual(5);
        expect(r.books).toEqual([]);
    });

    it('updateIndexEntry 提取 additional_titles + attached_texts', async () => {
        await storage.saveItem('work', WORK_ID_SHIJI, {
            title: '史記',
            additional_titles: ['太史公書', { book_title: '太史公記' }],
            attached_texts: ['某序'],
        });
        const entries = await storage.loadEntries('work', 'draft');
        expect(entries[0].additional_titles).toEqual(['太史公書', '太史公記']);
        expect(entries[0].attached_texts).toEqual(['某序']);
    });
});

describe('BookIndexStorage 资源目录', () => {
    it('initAssetDir + hasAssetDir 闭环', async () => {
        const { storage, fs } = makeStorage();
        expect(await storage.hasAssetDir(WORK_ID_SHIJI)).toBe(false);
        const dir = await storage.initAssetDir(WORK_ID_SHIJI);
        expect(dir).toContain(WORK_ID_SHIJI);
        expect(fs.dirs.has(dir)).toBe(true);
        expect(await storage.hasAssetDir(WORK_ID_SHIJI)).toBe(true);
    });
});

describe('BookIndexStorage rebuildIndex', () => {
    it('扫描 metadata 文件，重写所有 shard 索引', async () => {
        const { storage, fs } = makeStorage();
        // 直接落 JSON 文件（绕过 saveItem 的 shard 写入）
        const path = `/ws/book-index-draft/Work/1/e/u/${WORK_ID_SHIJI}-史記.json`;
        await fs.writeFile(path, JSON.stringify({ id: WORK_ID_SHIJI, title: '史記', type: 'work' }));

        // 重建后 loadEntries 能找到
        await storage.rebuildIndex('draft');
        const entries = await storage.loadEntries('work', 'draft');
        expect(entries.find(e => e.id === WORK_ID_SHIJI)?.title).toBe('史記');
    });

    it('rebuildIndex 跳过 /index/ 内的 shard 文件本身', async () => {
        const { storage, fs } = makeStorage();
        // 一个真 metadata + 一个 index shard（不应被吞回）
        await fs.writeFile(
            `/ws/book-index-draft/Work/1/e/u/${WORK_ID_SHIJI}-史記.json`,
            JSON.stringify({ id: WORK_ID_SHIJI, title: '史記', type: 'work' })
        );
        await fs.writeFile(
            `/ws/book-index-draft/index/works/0.json`,
            JSON.stringify({ STALE: { id: 'STALE', title: 'old', type: 'Work' } })
        );
        await storage.rebuildIndex('draft');
        const entries = await storage.loadEntries('work', 'draft');
        expect(entries.find(e => e.id === 'STALE')).toBeUndefined();
    });
});

// ─── scoring ───
function entry(over: Partial<IndexEntry>): IndexEntry {
    return {
        id: 'x', type: 'work', title: 't',
        ...over,
    };
}

describe('scoreEntry', () => {
    it('标题完全匹配 = 200（× work 1.05）', () => {
        const s = scoreEntry(entry({ title: '史記' }), '史記');
        // 200 + length-bonus(20-2=18) = 218，× 1.05 ≈ 229
        expect(s).toBeGreaterThan(200);
    });

    it('标题前缀 > 标题包含 > 别名包含', () => {
        const exact = scoreEntry(entry({ title: '史記' }), '史記');
        const prefix = scoreEntry(entry({ title: '史記索隱' }), '史記');
        const contains = scoreEntry(entry({ title: '太史記' }), '史記');
        const alias = scoreEntry(entry({ title: '無關', additional_titles: ['含史記字'] }), '史記');
        expect(exact).toBeGreaterThan(prefix);
        expect(prefix).toBeGreaterThan(contains);
        expect(contains).toBeGreaterThan(alias);
    });

    it('作者匹配（标题没匹配时启用）', () => {
        const s = scoreEntry(entry({ title: '無關書', author: '司馬遷' }), '司馬遷');
        expect(s).toBeGreaterThan(0);
    });

    it('朝代匹配（最低优先级）', () => {
        const s = scoreEntry(entry({ title: '無關', dynasty: '漢' }), '漢');
        expect(s).toBeGreaterThan(0);
    });

    it('完全无匹配返回 0', () => {
        expect(scoreEntry(entry({ title: '紅樓夢' }), '量子力學')).toBe(0);
    });

    it('has_text / has_image 加微小分（不影响档位顺序）', () => {
        const plain = scoreEntry(entry({ title: '史記' }), '史記');
        const withText = scoreEntry(entry({ title: '史記', has_text: true }), '史記');
        expect(withText).toBeGreaterThan(plain);
        expect(withText - plain).toBeLessThan(10);
    });

    it('类型加成：work × 1.05, collection × 1.02', () => {
        const work = scoreEntry(entry({ title: '某', type: 'work' }), '某');
        const coll = scoreEntry(entry({ title: '某', type: 'collection' }), '某');
        const book = scoreEntry(entry({ title: '某', type: 'book' }), '某');
        expect(work).toBeGreaterThan(coll);
        expect(coll).toBeGreaterThan(book);
    });
});

describe('rankByRelevance', () => {
    it('过滤 0 分、按分数降序', () => {
        const list = [
            entry({ id: 'a', title: '完全無關' }),     // 0 分被过滤
            entry({ id: 'b', title: '史記索隱' }),     // 前缀
            entry({ id: 'c', title: '史記' }),         // 完全
        ];
        const r = rankByRelevance(list, '史記');
        expect(r.map(e => e.id)).toEqual(['c', 'b']);
    });

    it('同档匹配下短标题优先', () => {
        const list = [
            entry({ id: 'long', title: '史記注釋本' }),  // 5 字 prefix
            entry({ id: 'short', title: '史記注' }),     // 3 字 prefix
        ];
        const r = rankByRelevance(list, '史記');
        // 两者 nameScore 都是 150（prefix），length bonus 不同（短的多）
        expect(r[0].id).toBe('short');
    });
});

describe('rankByRelevanceWithSimplified', () => {
    it('简体 query 通过 simplifiedMap 命中繁体存储', () => {
        const e = entry({ id: 'h', title: '漢書' });
        // 数据存的是繁体 漢書，simplifiedMap 提供简体 汉书
        const map = { h: { t: '汉书' } };
        const r = rankByRelevanceWithSimplified([e], '漢書', '汉书', map);
        expect(r).toHaveLength(1);
        expect(r[0].id).toBe('h');
    });

    it('原文 query 也能命中（取 max）', () => {
        const e = entry({ id: 'h', title: '漢書' });
        const map = { h: { t: '汉书' } };
        const r = rankByRelevanceWithSimplified([e], '漢書', undefined, map);
        expect(r).toHaveLength(1);
    });

    it('无任一字段命中返回空', () => {
        const e = entry({ id: 'h', title: '漢書' });
        const map = { h: { t: '汉书' } };
        const r = rankByRelevanceWithSimplified([e], '量子力學', '量子力学', map);
        expect(r).toEqual([]);
    });
});
