import type { IndexStorage } from './types';
import type {
    IndexType,
    IndexEntry,
    PageResult,
    LoadOptions,
    GroupedSearchResult,
    ResourceCatalog,
    ResourceProgress,
    RecommendedData,
    VolumeBookMapping,
    CollatedEditionIndex,
    CollatedJuan,
} from '../types';
import { rankByRelevance, rankByRelevanceWithSimplified } from '../core/storage';
import type { SearchSIndex } from '../core/storage';
import { normalizeCatalog } from '../core/normalize-catalog';

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
    attached_texts?: string[];
    edition?: string;
    juan_count?: number;
    has_text?: boolean;
    has_image?: boolean;
    has_collated?: boolean;
    subtype?: string;
    primary_name?: string;
    birth_year?: number;
    death_year?: number;
    cbdb_id?: number;
}

interface BundleIndexResponse {
    books?: Record<string, BundleIndexItem>;
    collections?: Record<string, BundleIndexItem>;
    works?: Record<string, BundleIndexItem>;
    entities?: Record<string, BundleIndexItem>;
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
    private manifest: string[] | null = null;
    private tiyaoCache = new Map<string, Record<string, unknown>>();
    private searchSCache: SearchSIndex | null = null;
    private searchSLoaded = false;
    private t2sConverter: ((text: string) => string) | null | false = null; // null=未加载, false=不可用

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
            ['entities', 'entity'],
        ];

        for (const [key, type] of typeMap) {
            const items = data[key];
            if (!items) continue;
            for (const item of Object.values(items)) {
                const displayTitle = type === 'entity'
                    ? (item.primary_name || item.title || item.name || item.id)
                    : (item.title || item.name || item.id);
                entries.push({
                    id: item.id,
                    title: displayTitle,
                    type,
                    isDraft: true, // bundle 目前只打包 draft 数据
                    author: item.author,
                    dynasty: item.dynasty,
                    role: item.role,
                    path: item.path,
                    additional_titles: item.additional_titles?.map((t: any) => typeof t === 'string' ? t : t?.book_title).filter(Boolean),
                    attached_texts: item.attached_texts?.map((t: any) => typeof t === 'string' ? t : t?.book_title).filter(Boolean),
                    edition: item.edition,
                    juan_count: item.juan_count,
                    has_text: item.has_text,
                    has_image: item.has_image,
                    has_collated: item.has_collated,
                    subtype: item.subtype,
                    primary_name: item.primary_name,
                    birth_year: item.birth_year,
                    death_year: item.death_year,
                    cbdb_id: item.cbdb_id,
                });
                this.pathMap.set(item.id, { path: item.path, isDraft: true });
            }
        }

        this.indexCache = entries;
        return entries;
    }

    /** 加载简体搜索索引（search_s.json），加载失败时降级为空对象 */
    private async ensureSearchSLoaded(): Promise<SearchSIndex> {
        if (this.searchSLoaded) return this.searchSCache ?? {};
        this.searchSLoaded = true;
        try {
            this.searchSCache = await this.fetchJson<SearchSIndex>(
                `${this.basePath}/search_s.json`
            );
        } catch {
            this.searchSCache = {};
        }
        return this.searchSCache!;
    }

    /** 懒加载 opencc-js 繁→简转换器，不可用时降级 */
    private async ensureT2S(): Promise<((text: string) => string) | null> {
        if (this.t2sConverter === false) return null;
        if (this.t2sConverter) return this.t2sConverter;
        try {
            const OpenCC = await import('opencc-js');
            this.t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
            return this.t2sConverter;
        } catch {
            this.t2sConverter = false;
            return null;
        }
    }

    // ─── L1: 详情 chunk ───

    /** Load manifest listing all chunk prefixes */
    private async loadManifest(): Promise<string[]> {
        if (this.manifest) return this.manifest;
        try {
            this.manifest = await this.fetchJson<string[]>(
                `${this.basePath}/chunks/_manifest.json`
            );
        } catch {
            this.manifest = [];
        }
        return this.manifest;
    }

    /** Find the chunk prefix for a given ID using the manifest */
    private async resolvePrefix(id: string): Promise<string | null> {
        const manifest = await this.loadManifest();
        // Binary search: find the last prefix that is <= id
        let lo = 0, hi = manifest.length - 1, best: string | null = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (manifest[mid] <= id) {
                best = manifest[mid];
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        // Verify the prefix actually matches
        if (best && id.startsWith(best)) return best;
        // Fallback: linear scan for any matching prefix
        for (const p of manifest) {
            if (id.startsWith(p)) return p;
        }
        return null;
    }

    private async loadChunk(prefix: string): Promise<Record<string, unknown>> {
        if (this.chunkCache.has(prefix)) return this.chunkCache.get(prefix)!;
        try {
            const data = await this.fetchJson<Record<string, unknown>>(
                `${this.basePath}/chunks/${prefix}.json`
            );
            this.chunkCache.set(prefix, data);
            return data;
        } catch {
            this.chunkCache.set(prefix, {});
            return {};
        }
    }

    /** Load chunk for a specific ID using manifest-based prefix resolution */
    private async loadChunkForId(id: string): Promise<Record<string, unknown>> {
        const prefix = await this.resolvePrefix(id);
        if (!prefix) return {};
        return this.loadChunk(prefix);
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

    async getResourceCounts(): Promise<{ hasText: number; hasImage: number }> {
        const all = await this.ensureLoaded();
        let hasText = 0, hasImage = 0;
        for (const e of all) {
            if (e.type !== 'work') continue;
            if (e.has_text) hasText++;
            if (e.has_image) hasImage++;
        }
        return { hasText, hasImage };
    }

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
        const searchS = await this.ensureSearchSLoaded();
        const t2s = await this.ensureT2S();
        const typeFiltered = all.filter(e => e.type === type);

        const queryS = t2s ? t2s(query) : undefined;
        const hasSimplified = Object.keys(searchS).length > 0;
        const ranked = hasSimplified
            ? rankByRelevanceWithSimplified(typeFiltered, query, queryS, searchS)
            : rankByRelevance(typeFiltered, query);

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
        const searchS = await this.ensureSearchSLoaded();
        const t2s = await this.ensureT2S();
        const types: IndexType[] = ['work', 'book', 'collection', 'entity'];

        const queryS = t2s ? t2s(query) : undefined;
        const hasSimplified = Object.keys(searchS).length > 0;
        const results = types.map(t => {
            const filtered = all.filter(e => e.type === t);
            return hasSimplified
                ? rankByRelevanceWithSimplified(filtered, query, queryS, searchS)
                : rankByRelevance(filtered, query);
        });

        return {
            works: results[0].slice(0, limit),
            books: results[1].slice(0, limit),
            collections: results[2].slice(0, limit),
            entities: results[3].slice(0, limit),
            totalWorks: results[0].length,
            totalBooks: results[1].length,
            totalCollections: results[2].length,
            totalEntities: results[3].length,
        };
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        try {
            const chunk = await this.loadChunkForId(id);
            const item = (chunk[id] as Record<string, unknown>) || null;
            if (item) {
                // 从 index 条目合并 has_collated 标记
                const entry = (await this.ensureLoaded()).find(e => e.id === id);
                if (entry?.has_collated) item.has_collated = true;
                // Entity：把 primary_name 同步到 title 字段
                if (item.type === 'entity' && !item.title && item.primary_name) {
                    item.title = item.primary_name;
                }
            }
            return item;
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

    // ─── 关联文件：直接从 items/{id}/ 加载 ───

    async getCollectionCatalogs(collectionId: string): Promise<ResourceCatalog[] | null> {
        const item = await this.getItem(collectionId);
        if (!item) return null;

        const resources = (item.resources as Array<{ id: string; short_name?: string }>) || [];
        if (resources.length === 0) return null;

        const catalogs: ResourceCatalog[] = [];
        for (const res of resources) {
            try {
                const data = await this.fetchJson<unknown>(
                    `${this.basePath}/items/${collectionId}/${res.id}/volume_book_mapping.json`
                );
                if (data) {
                    catalogs.push({
                        resource_id: res.id,
                        short_name: res.short_name,
                        data: normalizeCatalog(data),
                    });
                }
            } catch {
                // skip — this resource has no mapping
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
        try {
            return await this.fetchJson<CollatedEditionIndex>(
                `${this.basePath}/items/${workId}/collated_edition_index.json`
            );
        } catch {
            return null;
        }
    }

    async getCollatedJuan(workId: string, juanFile: string): Promise<CollatedJuan | null> {
        if (juanFile.includes('..') || !juanFile.endsWith('.json')) return null;

        // 直接从 items/{workId}/collated_edition/{juanFile} 加载
        try {
            return await this.fetchJson<CollatedJuan>(
                `${this.basePath}/items/${workId}/collated_edition/${juanFile}`
            );
        } catch {
            return null;
        }
    }

    // ─── 资源导入进度 ───

    async getResourceProgress(): Promise<ResourceProgress | null> {
        try {
            return await this.fetchJson<ResourceProgress>(`${this.basePath}/resource.json`);
        } catch {
            return null;
        }
    }

    async getSiteProgress(): Promise<ResourceProgress | null> {
        try {
            return await this.fetchJson<ResourceProgress>(`${this.basePath}/resource-site.json`);
        } catch {
            return null;
        }
    }

    async getRecommended(): Promise<RecommendedData | null> {
        try {
            return await this.fetchJson<RecommendedData>(`${this.basePath}/recommended.json`);
        } catch {
            return null;
        }
    }

    // ─── 工具 ───

    clearCache(): void {
        this.indexCache = null;
        this.pathMap.clear();
        this.chunkCache.clear();
        this.manifest = null;
        this.tiyaoCache.clear();
        this.searchSCache = null;
        this.searchSLoaded = false;
        this.t2sConverter = null;
    }
}
