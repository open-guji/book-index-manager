import type { IndexStorage } from './types';
import type {
    IndexType,
    IndexEntry,
    PageResult,
    LoadOptions,
    GroupedSearchResult,
    ResourceCatalog,
    VolumeBookMapping,
    CollatedEditionIndex,
    CollatedJuan,
} from '../types';
import { rankByRelevance } from '../core/storage';

/**
 * index.json 中的条目格式（与 GithubStorage 相同）
 */
interface BundleIndexItem {
    id: string;
    title?: string;
    name?: string;
    path: string;
    type?: string;
    author?: string;
    dynasty?: string;
    role?: string;
    year?: string;
    holder?: string;
    additional_titles?: string[];
    juan_count?: number;
    has_text?: boolean;
    has_image?: boolean;
}

interface BundleIndexResponse {
    books?: Record<string, BundleIndexItem>;
    collections?: Record<string, BundleIndexItem>;
    works?: Record<string, BundleIndexItem>;
}

export interface BundleStorageConfig {
    /** chunk 文件的基础路径，默认 '/data' */
    basePath?: string;
    /** 请求超时（毫秒），默认 10000 */
    timeout?: number;
}

const DEFAULT_BASE_PATH = '/data';
const DEFAULT_TIMEOUT = 10000;

/**
 * Bundle 只读 Storage 实现
 *
 * 从同域预打包的 chunk 文件中读取索引数据。
 * 构建时由 bundle-data 脚本将散落的 JSON 文件打包为少量 chunk。
 *
 * 数据分层：
 * - L0: /data/index.json — 全局索引（启动时加载一次）
 * - L1: /data/chunks/{prefix}.json — 按 ID 前两字符分桶的详情数据
 * - L2: /data/tiyao/juan-{start}-{end}.json — 整理本提要（按卷组）
 *
 * 写操作（saveItem/deleteItem/generateId）抛出异常。
 */
export class BundleStorage implements IndexStorage {
    private basePath: string;
    private timeout: number;

    // 缓存
    private indexCache: IndexEntry[] | null = null;
    private pathMap: Map<string, { path: string; isDraft: boolean }> = new Map();
    private chunkCache = new Map<string, Record<string, unknown>>();
    private tiyaoCache = new Map<string, Record<string, unknown>>();

    constructor(config: BundleStorageConfig = {}) {
        this.basePath = config.basePath ?? DEFAULT_BASE_PATH;
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    }

    // ─── 内部工具 ───

    private async fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(this.timeout),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    // ─── L0: 索引层 ───

    private async ensureLoaded(): Promise<IndexEntry[]> {
        if (this.indexCache) return this.indexCache;

        const data = await this.fetchJson<BundleIndexResponse>(
            `${this.basePath}/index.json`
        );

        const entries: IndexEntry[] = [];
        const typeMap: [keyof BundleIndexResponse, IndexType][] = [
            ['books', 'book'],
            ['collections', 'collection'],
            ['works', 'work'],
        ];

        for (const [key, type] of typeMap) {
            const items = data[key];
            if (!items) continue;
            for (const item of Object.values(items)) {
                entries.push({
                    id: item.id,
                    title: item.title || item.name || item.id,
                    type,
                    isDraft: true, // bundle 目前只打包 draft 数据
                    author: item.author,
                    dynasty: item.dynasty,
                    role: item.role,
                    path: item.path,
                    additional_titles: item.additional_titles,
                    juan_count: item.juan_count,
                    has_text: item.has_text,
                    has_image: item.has_image,
                });
                this.pathMap.set(item.id, { path: item.path, isDraft: true });
            }
        }

        this.indexCache = entries;
        return entries;
    }

    // ─── L1: 详情 chunk ───

    private async loadChunk(prefix: string): Promise<Record<string, unknown>> {
        if (this.chunkCache.has(prefix)) return this.chunkCache.get(prefix)!;

        const data = await this.fetchJson<Record<string, unknown>>(
            `${this.basePath}/chunks/${prefix}.json`
        );
        this.chunkCache.set(prefix, data);
        return data;
    }

    // ─── L2: 提要 chunk ───

    private async loadTiyaoGroup(start: number, end: number): Promise<Record<string, unknown>> {
        const key = `${start}-${end}`;
        if (this.tiyaoCache.has(key)) return this.tiyaoCache.get(key)!;

        const pad = (n: number) => String(n).padStart(3, '0');
        const data = await this.fetchJson<Record<string, unknown>>(
            `${this.basePath}/tiyao/juan-${pad(start)}-${pad(end)}.json`
        );
        this.tiyaoCache.set(key, data);
        return data;
    }

    // ─── IndexStorage 实现 ───

    async loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const all = await this.ensureLoaded();
        let filtered = all.filter(e => e.type === type);

        const sortBy = options.sortBy || 'title';
        const sortOrder = options.sortOrder || 'asc';
        filtered.sort((a, b) => {
            const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
            const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
            const cmp = aVal.localeCompare(bVal, 'zh');
            return sortOrder === 'asc' ? cmp : -cmp;
        });

        const page = options.page || 1;
        const pageSize = options.pageSize || 50;
        const start = (page - 1) * pageSize;

        return {
            entries: filtered.slice(start, start + pageSize),
            total: filtered.length,
            page,
            pageSize,
        };
    }

    async search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const all = await this.ensureLoaded();
        const typeFiltered = all.filter(e => e.type === type);
        const ranked = rankByRelevance(typeFiltered, query);

        const page = options.page || 1;
        const pageSize = options.pageSize || 50;
        const start = (page - 1) * pageSize;

        return {
            entries: ranked.slice(start, start + pageSize),
            total: ranked.length,
            page,
            pageSize,
        };
    }

    async searchAll(query: string, limit: number = 5): Promise<GroupedSearchResult> {
        const all = await this.ensureLoaded();
        const types: IndexType[] = ['work', 'book', 'collection'];
        const results = types.map(t => rankByRelevance(all.filter(e => e.type === t), query));
        return {
            works: results[0].slice(0, limit),
            books: results[1].slice(0, limit),
            collections: results[2].slice(0, limit),
            totalWorks: results[0].length,
            totalBooks: results[1].length,
            totalCollections: results[2].length,
        };
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        const prefix = id.slice(0, 2);
        try {
            const chunk = await this.loadChunk(prefix);
            return (chunk[id] as Record<string, unknown>) || null;
        } catch {
            return null;
        }
    }

    async getEntry(id: string): Promise<IndexEntry | null> {
        const all = await this.ensureLoaded();
        return all.find(e => e.id === id) || null;
    }

    async getAllEntries(): Promise<IndexEntry[]> {
        return this.ensureLoaded();
    }

    // ─── 写操作：不支持 ───

    async saveItem(): Promise<{ id: string; path: string }> {
        throw new Error('BundleStorage 为只读模式，不支持保存');
    }

    async deleteItem(): Promise<void> {
        throw new Error('BundleStorage 为只读模式，不支持删除');
    }

    async generateId(): Promise<string> {
        throw new Error('BundleStorage 为只读模式，不支持生成 ID');
    }

    // ─── 丛编目录 ───

    async getCollectionCatalogs(collectionId: string): Promise<ResourceCatalog[] | null> {
        const item = await this.getItem(collectionId);
        if (!item) return null;

        const resources = (item.resources as Array<{ id: string; short_name?: string }>) || [];
        if (resources.length === 0) return null;

        // 丛编目录数据在 chunk 中以 {collectionId}/{resourceId}/volume_book_mapping 形式存储
        const catalogs: ResourceCatalog[] = [];
        for (const res of resources) {
            const mappingKey = `${collectionId}/${res.id}/volume_book_mapping`;
            const prefix = collectionId.slice(0, 2);
            try {
                const chunk = await this.loadChunk(prefix);
                const data = chunk[mappingKey] as VolumeBookMapping;
                if (data) {
                    catalogs.push({
                        resource_id: res.id,
                        short_name: res.short_name,
                        data,
                    });
                }
            } catch {
                // skip
            }
        }

        return catalogs.length > 0 ? catalogs : null;
    }

    async getCollectionCatalog(collectionId: string): Promise<VolumeBookMapping | null> {
        const catalogs = await this.getCollectionCatalogs(collectionId);
        return catalogs?.[0]?.data ?? null;
    }

    // ─── 整理本 ───

    async getCollatedEditionIndex(workId: string): Promise<CollatedEditionIndex | null> {
        const prefix = workId.slice(0, 2);
        try {
            const chunk = await this.loadChunk(prefix);
            const key = `${workId}/collated_edition_index`;
            return (chunk[key] as CollatedEditionIndex) || null;
        } catch {
            return null;
        }
    }

    async getCollatedJuan(workId: string, juanFile: string): Promise<CollatedJuan | null> {
        if (juanFile.includes('..') || !juanFile.endsWith('.json')) return null;

        const match = juanFile.match(/juan(\d+)/);
        if (!match) return null;

        const juanNum = parseInt(match[1]);
        const groupSize = 10;
        const group = Math.ceil(juanNum / groupSize);
        const start = (group - 1) * groupSize + 1;
        const end = group * groupSize;

        try {
            const data = await this.loadTiyaoGroup(start, end);
            return (data[juanFile] as CollatedJuan) || null;
        } catch {
            return null;
        }
    }

    // ─── 工具 ───

    clearCache(): void {
        this.indexCache = null;
        this.pathMap.clear();
        this.chunkCache.clear();
        this.tiyaoCache.clear();
    }
}
