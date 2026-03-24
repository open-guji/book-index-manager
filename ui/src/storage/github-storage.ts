import type { IndexStorage } from './types';
import type { IndexType, IndexEntry, PageResult, LoadOptions, GroupedSearchResult, VolumeBookMapping, ResourceCatalog, CollatedEditionIndex, CollatedJuan } from '../types';
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
                const raw = item as GithubIndexItem & {
                    additional_titles?: string[];
                    juan_count?: number;
                    has_text?: boolean;
                    has_image?: boolean;
                };
                entries.push({
                    id: item.id,
                    title: item.title || item.name || item.id,
                    type,
                    isDraft,
                    author: item.author,
                    dynasty: item.dynasty,
                    role: item.role,
                    path: item.path,
                    additional_titles: raw.additional_titles,
                    juan_count: raw.juan_count,
                    has_text: raw.has_text,
                    has_image: raw.has_image,
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
        const info = this.pathMap.get(id);
        if (!info) return null;
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
            const data = await this.fetchFile<VolumeBookMapping>(resolved.repo, mappingPath);
            if (data) {
                catalogs.push({
                    resource_id: res.id,
                    short_name: res.short_name,
                    data,
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

        const indexPath = `${resolved.dir}/${workId}/collated_edition_index.json`;
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

    /** 清除缓存（用于切换数据源后刷新） */
    clearCache(): void {
        this.cache = null;
        this.pathMap.clear();
    }
}
