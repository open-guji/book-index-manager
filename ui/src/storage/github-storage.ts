import type { IndexStorage } from './types';
import type { IndexType, IndexEntry, PageResult, LoadOptions, CeBookMapping } from '../types';
import { rankByRelevance } from '../core/storage';

/**
 * GitHub index.json 中的条目格式
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
 * GitHub index.json 响应格式
 */
interface GithubIndexResponse {
    books?: Record<string, GithubIndexItem>;
    collections?: Record<string, GithubIndexItem>;
    works?: Record<string, GithubIndexItem>;
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

    /** 从 GitHub 或 CDN 获取 index.json */
    private async fetchIndex(repo: string): Promise<GithubIndexResponse> {
        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/index.json`;
        try {
            return await this.fetchJson(githubUrl);
        } catch {
            // 降级到 CDN
        }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/index.json`;
            try {
                return await this.fetchJson(cdnUrl);
            } catch {
                continue;
            }
        }

        throw new Error(`Failed to fetch index.json for ${repo} from all sources`);
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
        ];

        for (const [key, type] of typeMap) {
            const items = data[key];
            if (!items) continue;
            for (const item of Object.values(items)) {
                entries.push({
                    id: item.id,
                    title: item.title || item.name || item.id,
                    type,
                    isDraft,
                    author: item.author,
                    dynasty: item.dynasty,
                    role: item.role,
                    path: item.path,
                });
                this.pathMap.set(item.id, { path: item.path, isDraft });
            }
        }

        return entries;
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
        const typeFiltered = all.filter(e => e.type === type);
        const ranked = rankByRelevance(typeFiltered, query);

        const page = options.page || 1;
        const pageSize = options.pageSize || 50;
        const start = (page - 1) * pageSize;
        const pageEntries = ranked.slice(start, start + pageSize);

        return {
            entries: pageEntries,
            total: ranked.length,
            page,
            pageSize,
        };
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        await this.ensureLoaded();

        const info = this.pathMap.get(id);
        if (!info) return null;

        const repo = info.isDraft ? this.config.repos.draft : this.config.repos.official;

        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(info.path)}`;
        try {
            return await this.fetchJson(githubUrl);
        } catch {
            // 降级到 CDN
        }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(info.path)}`;
            try {
                return await this.fetchJson(cdnUrl);
            } catch {
                continue;
            }
        }

        return null;
    }

    async getEntry(id: string): Promise<IndexEntry | null> {
        const all = await this.ensureLoaded();
        return all.find(e => e.id === id) || null;
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

    async getCollectionCatalog(collectionId: string): Promise<CeBookMapping | null> {
        await this.ensureLoaded();
        const info = this.pathMap.get(collectionId);
        if (!info) return null;

        // ce_book_mapping.json 与索引文件同目录
        const dir = info.path.substring(0, info.path.lastIndexOf('/'));
        const mappingPath = dir + '/ce_book_mapping.json';
        const repo = info.isDraft ? this.config.repos.draft : this.config.repos.official;

        const githubUrl = `${this.config.baseUrl}/${this.config.org}/${repo}/main/${encodeURI(mappingPath)}`;
        try {
            return await this.fetchJson<CeBookMapping>(githubUrl);
        } catch { /* fallback to CDN */ }

        for (const cdn of this.config.cdnUrls) {
            const cdnUrl = `${cdn}/${this.config.org}/${repo}@main/${encodeURI(mappingPath)}`;
            try {
                return await this.fetchJson<CeBookMapping>(cdnUrl);
            } catch { continue; }
        }

        return null;
    }

    /** 清除缓存（用于切换数据源后刷新） */
    clearCache(): void {
        this.cache = null;
        this.pathMap.clear();
    }
}
