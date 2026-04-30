import type { IndexStorage } from './types';
import type { IndexType, IndexEntry, IndexStatus, PageResult, LoadOptions, GroupedSearchResult, VolumeBookMapping, ResourceCatalog, CollatedEditionIndex, CollatedJuan, ResourceProgress, RecommendedData } from '../types';
import { rankByRelevance, rankByRelevanceWithSimplified, NUM_SHARDS } from '../core/storage';
import type { SearchSIndex } from '../core/storage';
import { normalizeCatalog } from '../core/normalize-catalog';
import { smartDecode, parseId } from '../id';

/**
 * 索引分片文件中的条目格式
 */
interface GithubIndexItem {
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
    collection?: string;
}

/**
 * 合并后的索引格式
 */
interface GithubIndexResponse {
    books?: Record<string, GithubIndexItem>;
    collections?: Record<string, GithubIndexItem>;
    works?: Record<string, GithubIndexItem>;
    entities?: Record<string, GithubIndexItem>;
}

export interface GithubStorageConfig {
    /** GitHub 组织名，如 "open-guji" */
    org: string;
    /** 仓库名称 */
    repos: {
        draft: string;     // "book-index-draft"
        official: string;  // "book-index"
    };
    /** GitHub raw 基础 URL */
    baseUrl?: string;
    /** CDN fallback URLs（按优先级排列） */
    cdnUrls?: string[];
    /** 请求超时（毫秒） */
    timeout?: number;
}

const DEFAULT_BASE_URL = 'https://raw.githubusercontent.com';
const DEFAULT_CDN_URLS = [
    'https://fastly.jsdelivr.net/gh',
    'https://cdn.jsdelivr.net/gh',
];
const DEFAULT_TIMEOUT = 5000;

/**
 * GitHub 只读 Storage 实现
 *
 * 从 GitHub raw.githubusercontent.com 获取 index.json 和单个 JSON 文件。
 * 支持 jsDelivr CDN fallback（适用于中国大陆）。
 * 写操作（saveItem/deleteItem/generateId）抛出异常。
 */
export class GithubStorage implements IndexStorage {
    private config: Required<GithubStorageConfig>;
    private cache: IndexEntry[] | null = null;
    private pathMap: Map<string, { path: string; isDraft: boolean }> = new Map();
    private searchSCache: SearchSIndex | null = null;
    private t2sConverter: ((text: string) => string) | null | false = null; // null=未加载, false=不可用

    constructor(config: GithubStorageConfig) {
        this.config = {
            org: config.org,
            repos: config.repos,
            baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
            cdnUrls: config.cdnUrls ?? DEFAULT_CDN_URLS,
            timeout: config.timeout ?? DEFAULT_TIMEOUT,
        };
    }

    /** 确保 index 数据已加载到缓存 */
    private async ensureLoaded(): Promise<IndexEntry[]> {
        if (this.cache) return this.cache;

        const allEntries: IndexEntry[] = [];

        for (const isDraft of [true, false]) {
            try {
                const repo = isDraft ? this.config.repos.draft : this.config.repos.official;
                const data = await this.fetchIndex(repo);
                const entries = this.parseIndexResponse(data, isDraft);
                allEntries.push(...entries);
            } catch (err) {
                console.warn(`Failed to fetch ${isDraft ? 'draft' : 'official'} index:`, err);
            }
        }

        const map = new Map<string, IndexEntry>();
        for (const entry of allEntries) {
            map.set(entry.id, entry);
        }
        this.cache = Array.from(map.values());
        return this.cache;
    }

    /** 从 GitHub 或 CDN 获取单个文件 */
    private async fetchFileWithFallback<T>(repo: string, path: string): Promise<T> {
        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(path)}`;
        try {
            return await this.fetchJson(githubUrl);
        } catch {
            // 降级到 CDN
        }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(path)}`;
            try {
                return await this.fetchJson(cdnUrl);
            } catch {
                continue;
            }
        }

        throw new Error(`Failed to fetch ${path} for ${repo} from all sources`);
    }

    /** 探测 repo 是否存在索引目录（用轻量 HEAD 请求避免大量 404） */
    private async probeIndex(repo: string): Promise<boolean> {
        // 依次尝试各数据源，任一返回 2xx 即认为索引存在
        const probePath = 'index/collections.json';

        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(probePath)}`;
        try {
            const res = await fetch(githubUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (res.ok) return true;
        } catch { /* try CDN */ }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(probePath)}`;
            try {
                const res = await fetch(cdnUrl, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(this.config.timeout),
                });
                if (res.ok) return true;
            } catch { continue; }
        }

        // collections 可能不存在，再试 works/0.json
        const worksProbe = 'index/works/0.json';
        const githubUrl2 = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(worksProbe)}`;
        try {
            const res = await fetch(githubUrl2, {
                method: 'HEAD',
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (res.ok) return true;
        } catch { /* try CDN */ }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(worksProbe)}`;
            try {
                const res = await fetch(cdnUrl, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(this.config.timeout),
                });
                if (res.ok) return true;
            } catch { continue; }
        }

        return false;
    }

    /** 从分片文件加载并合并索引 */
    private async fetchIndex(repo: string): Promise<GithubIndexResponse> {
        // 先探测 repo 是否有索引数据，避免大量 404
        const hasIndex = await this.probeIndex(repo);
        if (!hasIndex) {
            return { books: {}, collections: {}, works: {} };
        }

        const merged: GithubIndexResponse = { books: {}, collections: {}, works: {} };

        // collections (single file)
        try {
            const data = await this.fetchFileWithFallback<Record<string, GithubIndexItem>>(repo, 'index/collections.json');
            merged.collections = data;
        } catch { /* skip */ }

        // books and works (16 shards each, parallel)
        const fetches: Promise<void>[] = [];
        for (const typeKey of ['books', 'works'] as const) {
            for (let shard = 0; shard < NUM_SHARDS; shard++) {
                const path = `index/${typeKey}/${shard.toString(16)}.json`;
                fetches.push(
                    this.fetchFileWithFallback<Record<string, GithubIndexItem>>(repo, path)
                        .then(data => { Object.assign(merged[typeKey]!, data); })
                        .catch(() => { /* skip failed shards */ })
                );
            }
        }
        await Promise.all(fetches);

        return merged;
    }

    /** 通用 JSON fetch */
    private async fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(this.config.timeout),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    /** 解析 index.json 为 IndexEntry[] */
    private parseIndexResponse(data: GithubIndexResponse, isDraft: boolean): IndexEntry[] {
        const entries: IndexEntry[] = [];
        const typeMap: [keyof GithubIndexResponse, IndexType][] = [
            ['books', 'book'],
            ['collections', 'collection'],
            ['works', 'work'],
            ['entities', 'entity'],
        ];

        for (const [key, type] of typeMap) {
            const items = data[key];
            if (!items) continue;
            for (const item of Object.values(items)) {
                const raw = item as GithubIndexItem & {
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
                };
                // Entity 用 primary_name 作为 title 显示
                const displayTitle = type === 'entity'
                    ? (raw.primary_name || item.title || item.name || item.id)
                    : (item.title || item.name || item.id);
                entries.push({
                    id: item.id,
                    title: displayTitle,
                    type,
                    isDraft,
                    author: item.author,
                    dynasty: item.dynasty,
                    role: item.role,
                    path: item.path,
                    additional_titles: raw.additional_titles?.map((t: any) => typeof t === 'string' ? t : t?.book_title).filter(Boolean),
                    attached_texts: raw.attached_texts?.map((t: any) => typeof t === 'string' ? t : t?.book_title).filter(Boolean),
                    edition: raw.edition,
                    juan_count: raw.juan_count,
                    has_text: raw.has_text,
                    has_image: raw.has_image,
                    has_collated: raw.has_collated,
                    subtype: raw.subtype,
                    primary_name: raw.primary_name,
                    birth_year: raw.birth_year,
                    death_year: raw.death_year,
                    cbdb_id: raw.cbdb_id,
                });
                this.pathMap.set(item.id, { path: item.path, isDraft });
            }
        }

        return entries;
    }

    /**
     * 懒加载 opencc-js 并构建简体搜索索引缓存。
     * 首次调用时动态 import opencc-js，将所有条目的文本字段转为简体。
     * 如果 opencc-js 不可用（未安装），降级为不做繁简转换。
     */
    private async ensureSearchSBuilt(): Promise<{ searchS: SearchSIndex; converter: ((text: string) => string) | null }> {
        if (this.searchSCache) {
            return { searchS: this.searchSCache, converter: this.t2sConverter || null };
        }
        if (this.t2sConverter === false) {
            // opencc-js 不可用，跳过
            return { searchS: {}, converter: null };
        }

        try {
            const OpenCC = await import('opencc-js');
            this.t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
        } catch {
            this.t2sConverter = false;
            this.searchSCache = {};
            return { searchS: {}, converter: null };
        }

        const entries = await this.ensureLoaded();
        const t2s = this.t2sConverter as (text: string) => string;
        const searchS: SearchSIndex = {};

        for (const entry of entries) {
            const simplified: { t?: string; a?: string; at?: string[]; axt?: string[] } = {};

            const ts = t2s(entry.title);
            if (ts !== entry.title) simplified.t = ts;

            if (entry.author) {
                const as = t2s(entry.author);
                if (as !== entry.author) simplified.a = as;
            }

            if (entry.additional_titles?.length) {
                const ats = entry.additional_titles.map(t2s);
                if (ats.some((s, i) => s !== entry.additional_titles![i])) {
                    simplified.at = ats;
                }
            }

            if (entry.attached_texts?.length) {
                const axts = entry.attached_texts.map(t2s);
                if (axts.some((s, i) => s !== entry.attached_texts![i])) {
                    simplified.axt = axts;
                }
            }

            if (Object.keys(simplified).length > 0) {
                searchS[entry.id] = simplified;
            }
        }

        this.searchSCache = searchS;
        return { searchS, converter: t2s };
    }

    // --- IndexStorage 实现 ---

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
        const pageEntries = filtered.slice(start, start + pageSize);

        return {
            entries: pageEntries,
            total: filtered.length,
            page,
            pageSize,
        };
    }

    async search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const all = await this.ensureLoaded();
        const { searchS, converter } = await this.ensureSearchSBuilt();
        const typeFiltered = all.filter(e => e.type === type);

        const queryS = converter ? converter(query) : undefined;
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
        const { searchS, converter } = await this.ensureSearchSBuilt();
        const types: IndexType[] = ['work', 'book', 'collection'];

        const queryS = converter ? converter(query) : undefined;
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
            totalWorks: results[0].length,
            totalBooks: results[1].length,
            totalCollections: results[2].length,
        };
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        const entries = await this.ensureLoaded();

        const info = this.pathMap.get(id);

        let item: Record<string, unknown> | null = null;
        // pathMap 有记录：按已知路径获取
        if (info) {
            const repo = info.isDraft ? this.config.repos.draft : this.config.repos.official;
            item = await this.fetchItemByPath(repo, info.path);
            if (item) {
                const entry = entries.find(e => e.id === id);
                if (entry?.has_collated) item.has_collated = true;
            }
        } else {
            // pathMap 无记录（index 未收录）：通过 ID 推导路径查找文件
            item = await this.findItemById(id);
        }

        // Entity：把 primary_name 同步到 title 字段（兼容上层 data.title 访问）
        if (item && item.type === 'entity' && !item.title && item.primary_name) {
            item.title = item.primary_name;
        }
        return item;
    }

    async getEntry(id: string): Promise<IndexEntry | null> {
        const all = await this.ensureLoaded();
        const cached = all.find(e => e.id === id);
        if (cached) return cached;

        // index 中无此 ID：尝试直接获取元数据来构建 entry
        const item = await this.findItemById(id);
        if (!item) return null;
        return this.buildEntryFromItem(id, item);
    }

    async getAllEntries(): Promise<IndexEntry[]> {
        return this.ensureLoaded();
    }

    async saveItem(): Promise<{ id: string; path: string }> {
        throw new Error('GithubStorage 为只读模式，不支持保存');
    }

    async deleteItem(): Promise<void> {
        throw new Error('GithubStorage 为只读模式，不支持删除');
    }

    async generateId(): Promise<string> {
        throw new Error('GithubStorage 为只读模式，不支持生成 ID');
    }

    /** 通过已知路径获取 item JSON */
    private async fetchItemByPath(repo: string, path: string): Promise<Record<string, unknown> | null> {
        let item: Record<string, unknown> | null = null;
        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(path)}`;
        try {
            item = await this.fetchJson(githubUrl);
        } catch {
            // 降级到 CDN
        }

        if (!item) {
            for (const cdn of this.config.cdnUrls) {
                const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(path)}`;
                try {
                    item = await this.fetchJson(cdnUrl);
                    break;
                } catch {
                    continue;
                }
            }
        }

        return item;
    }

    /**
     * 通过 ID 推导路径查找文件（不依赖 index）。
     * 文件路径格式: {Type}/{c1}/{c2}/{c3}/{id}-{title}.json
     * 从 ID 可解析出 type 和 status（决定 repo），用 GitHub Contents API 列出目录找到匹配文件。
     */
    private async findItemById(id: string): Promise<Record<string, unknown> | null> {
        const TYPE_TO_FOLDER: Record<IndexType, string> = { book: 'Book', collection: 'Collection', work: 'Work', entity: 'Entity' };

        let type: IndexType;
        let status: IndexStatus;
        try {
            const parsed = parseId(smartDecode(id));
            type = parsed.type;
            status = parsed.status;
        } catch {
            return null;
        }

        const repo = status === 'draft' ? this.config.repos.draft : this.config.repos.official;
        const folder = TYPE_TO_FOLDER[type];
        const prefix = id.padEnd(3, '_').substring(0, 3);
        const dirPath = `${folder}/${prefix[0]}/${prefix[1]}/${prefix[2]}`;

        // 用 GitHub Contents API 列出目录，找到以 {id}- 开头的文件
        const apiUrl = `https://api.github.com/repos/${this.config.org}/${repo}/contents/${dirPath}`;
        try {
            const res = await fetch(apiUrl, {
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!res.ok) return null;

            const files = await res.json() as Array<{ name: string; path: string }>;
            const match = files.find(f => f.name.startsWith(`${id}-`) && f.name.endsWith('.json'));
            if (!match) return null;

            // 找到文件，用 raw URL 获取内容
            const item = await this.fetchItemByPath(repo, match.path);
            if (item) {
                // 缓存到 pathMap 以便后续使用
                this.pathMap.set(id, { path: match.path, isDraft: status === 'draft' });
            }
            return item;
        } catch {
            return null;
        }
    }

    /** 从 item 元数据构建 IndexEntry */
    private buildEntryFromItem(id: string, item: Record<string, unknown>): IndexEntry {
        const typeStr = (item.type as string || '').toLowerCase();
        const type: IndexType = typeStr === 'work' ? 'work' : typeStr === 'collection' ? 'collection' : 'book';

        let author: string | undefined;
        const authors = item.authors;
        if (Array.isArray(authors) && authors.length > 0) {
            const first = authors[0];
            author = typeof first === 'object' && first !== null ? (first as any).name || '' : String(first);
        }

        let isDraft = true;
        try {
            const parsed = parseId(smartDecode(id));
            isDraft = parsed.status === 'draft';
        } catch { /* default to draft */ }

        const pathInfo = this.pathMap.get(id);

        return {
            id,
            title: (item.title as string) || (item['书名'] as string) || id,
            type,
            isDraft,
            author,
            dynasty: item.dynasty as string | undefined,
            role: item.role as string | undefined,
            path: pathInfo?.path || '',
            juan_count: item.n_juan as number | undefined,
            has_collated: item.has_collated as boolean | undefined,
        };
    }

    /** 通过相对路径获取文件（自动尝试 GitHub raw + CDN fallback） */
    private async fetchFile<T>(repo: string, filePath: string): Promise<T | null> {
        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(filePath)}`;
        try {
            return await this.fetchJson<T>(githubUrl);
        } catch { /* fallback to CDN */ }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(filePath)}`;
            try {
                return await this.fetchJson<T>(cdnUrl);
            } catch { continue; }
        }

        return null;
    }

    /** 获取条目对应的 repo 和目录信息 */
    private async resolveItemPath(id: string): Promise<{ repo: string; dir: string } | null> {
        await this.ensureLoaded();
        let info = this.pathMap.get(id);

        // pathMap 中没有时，尝试通过 findItemById 查找并缓存
        if (!info) {
            await this.findItemById(id);
            info = this.pathMap.get(id);
            if (!info) return null;
        }

        const repo = info.isDraft ? this.config.repos.draft : this.config.repos.official;
        const dir = info.path.substring(0, info.path.lastIndexOf('/'));
        return { repo, dir };
    }

    async getCollectionCatalogs(collectionId: string): Promise<ResourceCatalog[] | null> {
        const resolved = await this.resolveItemPath(collectionId);
        if (!resolved) return null;

        // 先获取 collection 数据以读取 resources 列表
        const item = await this.getItem(collectionId);
        if (!item) return null;

        const resources = (item.resources as Array<{ id: string; short_name?: string }>) || [];
        if (resources.length === 0) return null;

        const catalogs: ResourceCatalog[] = [];
        for (const res of resources) {
            const mappingPath = `${resolved.dir}/${collectionId}/${res.id}/volume_book_mapping.json`;
            const data = await this.fetchFile<Record<string, unknown>>(resolved.repo, mappingPath);
            if (data) {
                catalogs.push({
                    resource_id: res.id,
                    short_name: res.short_name,
                    data: normalizeCatalog(data),
                });
            }
        }

        return catalogs.length > 0 ? catalogs : null;
    }

    async getCollectionCatalog(collectionId: string): Promise<VolumeBookMapping | null> {
        const catalogs = await this.getCollectionCatalogs(collectionId);
        return catalogs?.[0]?.data ?? null;
    }

    async getCollatedEditionIndex(workId: string): Promise<CollatedEditionIndex | null> {
        const resolved = await this.resolveItemPath(workId);
        if (!resolved) return null;

        const indexPath = `${resolved.dir}/${workId}/collated_edition/collated_edition_index.json`;
        return this.fetchFile<CollatedEditionIndex>(resolved.repo, indexPath);
    }

    async getCollatedJuan(workId: string, juanFile: string): Promise<CollatedJuan | null> {
        // 安全检查
        if (juanFile.includes('..') || !juanFile.endsWith('.json')) return null;

        const resolved = await this.resolveItemPath(workId);
        if (!resolved) return null;

        const juanPath = `${resolved.dir}/${workId}/collated_edition/${juanFile}`;
        return this.fetchFile<CollatedJuan>(resolved.repo, juanPath);
    }

    async getCatalogProgress(): Promise<ResourceProgress | null> {
        return this.fetchFile<ResourceProgress>(this.config.repos.draft, 'resource-catalog.json');
    }

    async getCollectionProgress(): Promise<ResourceProgress | null> {
        return this.fetchFile<ResourceProgress>(this.config.repos.draft, 'resource-collection.json');
    }

    async getResourceProgress(): Promise<ResourceProgress | null> {
        return this.fetchFile<ResourceProgress>(this.config.repos.draft, 'resource.json');
    }

    async getSiteProgress(): Promise<ResourceProgress | null> {
        return this.fetchFile<ResourceProgress>(this.config.repos.draft, 'resource-site.json');
    }

    async getRecommended(): Promise<RecommendedData | null> {
        return this.fetchFile<RecommendedData>(this.config.repos.draft, 'recommended.json');
    }

    /** 清除缓存（用于切换数据源后刷新） */
    clearCache(): void {
        this.cache = null;
        this.pathMap.clear();
        this.searchSCache = null;
        this.t2sConverter = null;
    }
}
