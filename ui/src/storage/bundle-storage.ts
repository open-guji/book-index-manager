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
import type { IndexCounts } from './types';
import { normalizeCatalog } from '../core/normalize-catalog';
import { extractType } from '../id';

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
 * 数据分层（已剥离 L0 — 23 MB 的 index.json 不再生成）：
 * - L1: /data/chunks/{prefix}.json — 按 ID 前缀分桶的详情数据
 * - L2: /data/tiyao/juan-{start}-{end}.json — 整理本提要（按卷组）
 *
 * 搜索由 worker 索引承担（kaiyuanguji-web 内置），BundleStorage.search* /
 * loadEntries / getAllEntries 已废弃，调用即抛错。
 *
 * 写操作（saveItem/deleteItem/generateId）抛出异常。
 */
export class BundleStorage implements IndexStorage {
    private basePath: string;
    private timeout: number;

    // 缓存
    private chunkCache = new Map<string, Record<string, unknown>>();
    private chunkLoading = new Map<string, Promise<Record<string, unknown>>>();
    private manifest: string[] | null = null;
    private manifestLoading: Promise<string[]> | null = null;
    private tiyaoCache = new Map<string, Record<string, unknown>>();
    private tiyaoLoading = new Map<string, Promise<Record<string, unknown>>>();
    private metaCache: IndexCounts | null = null;
    private metaLoading: Promise<IndexCounts | null> | null = null;

    /** 数据版本（commitId 前 12 位）。null=已尝试加载但失败；undefined=未加载 */
    private version: string | null | undefined = undefined;
    private versionPromise: Promise<string | null> | null = null;

    constructor(config: BundleStorageConfig = {}) {
        this.basePath = config.basePath ?? DEFAULT_BASE_PATH;
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    }

    // ─── 内部工具 ───

    /**
     * 强制 revalidate 拉取 /data/version.json，作为所有其他 fetch 的 cache key。
     * 失败/缺失时回退为不拼 version（退化为旧行为）。
     */
    private async ensureVersion(): Promise<string | null> {
        if (this.version !== undefined) return this.version;
        if (this.versionPromise) return this.versionPromise;
        this.versionPromise = (async () => {
            try {
                const res = await fetch(`${this.basePath}/version.json`, {
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(this.timeout),
                });
                if (!res.ok) return null;
                const data = await res.json() as { commitId?: string };
                const commitId = data?.commitId;
                if (!commitId || commitId === 'unknown') return null;
                return commitId.slice(0, 12);
            } catch {
                return null;
            }
        })();
        this.version = await this.versionPromise;
        return this.version;
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const version = await this.ensureVersion();
        const fullUrl = version
            ? `${url}${url.includes('?') ? '&' : '?'}v=${version}`
            : url;
        // EdgeOne 历史曾给 404 设过 max-age=31536000，浏览器会按一年缓存这条 404；
        // 即便服务端事后被 purge 也不会主动 invalidate。用 'no-cache' 强制每次
        // conditional revalidate（304 仍复用本地 body），让服务端状态变化立刻生效。
        const response = await fetch(fullUrl, {
            cache: 'no-cache',
            signal: AbortSignal.timeout(this.timeout),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    // ─── L1: 详情 chunk ───

    /** Load manifest listing all chunk prefixes */
    private async loadManifest(): Promise<string[]> {
        if (this.manifest) return this.manifest;
        if (this.manifestLoading) return this.manifestLoading;
        this.manifestLoading = (async () => {
            try {
                this.manifest = await this.fetchJson<string[]>(
                    `${this.basePath}/chunks/_manifest.json`
                );
            } catch {
                this.manifest = [];
            }
            return this.manifest;
        })();
        try {
            return await this.manifestLoading;
        } finally {
            if (!this.manifest) this.manifestLoading = null;
        }
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
        const inflight = this.chunkLoading.get(prefix);
        if (inflight) return inflight;
        const p = (async () => {
            try {
                const data = await this.fetchJson<Record<string, unknown>>(
                    `${this.basePath}/chunks/${prefix}.json`
                );
                this.chunkCache.set(prefix, data);
                return data;
            } catch {
                this.chunkCache.set(prefix, {});
                return {} as Record<string, unknown>;
            }
        })();
        this.chunkLoading.set(prefix, p);
        try {
            return await p;
        } finally {
            this.chunkLoading.delete(prefix);
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
        const inflight = this.tiyaoLoading.get(key);
        if (inflight) return inflight;
        const pad = (n: number) => String(n).padStart(3, '0');
        const p = (async () => {
            const data = await this.fetchJson<Record<string, unknown>>(
                `${this.basePath}/tiyao/juan-${pad(start)}-${pad(end)}.json`
            );
            this.tiyaoCache.set(key, data);
            return data;
        })();
        this.tiyaoLoading.set(key, p);
        try {
            return await p;
        } finally {
            this.tiyaoLoading.delete(key);
        }
    }

    // ─── IndexStorage 实现 ───

    /** 获取轻量元数据（< 1 KB）。仅读 /data/meta.json，无 fallback。 */
    async getCounts(): Promise<IndexCounts> {
        if (this.metaCache) return this.metaCache;
        if (this.metaLoading) {
            const r = await this.metaLoading;
            if (r) return r;
            throw new Error('BundleStorage: meta.json 加载失败');
        }
        this.metaLoading = (async () => {
            const data = await this.fetchJson<IndexCounts>(`${this.basePath}/meta.json`);
            if (!data || typeof data.works !== 'number') {
                throw new Error('BundleStorage: meta.json 格式无效');
            }
            this.metaCache = data;
            return data;
        })();
        try {
            const r = await this.metaLoading;
            if (!r) throw new Error('BundleStorage: meta.json 加载失败');
            return r;
        } finally {
            this.metaLoading = null;
        }
    }

    async getResourceCounts(): Promise<{ hasText: number; hasImage: number }> {
        const counts = await this.getCounts();
        return counts.resourceCounts ?? { hasText: 0, hasImage: 0 };
    }

    async getSubtypeStats(): Promise<Record<string, number>> {
        const counts = await this.getCounts();
        return counts.subtypeStats ?? {};
    }

    /** 已废弃 — index.json 已剥离，搜索/列表必须走 worker 索引。 */
    async loadEntries(_type: IndexType, _options: LoadOptions): Promise<PageResult<IndexEntry>> {
        throw new Error('BundleStorage.loadEntries 已废弃：请使用 worker 搜索');
    }

    async search(_query: string, _type: IndexType, _options: LoadOptions): Promise<PageResult<IndexEntry>> {
        throw new Error('BundleStorage.search 已废弃：请使用 worker 搜索');
    }

    async searchAll(_query: string, _limit: number = 5): Promise<GroupedSearchResult> {
        throw new Error('BundleStorage.searchAll 已废弃：请使用 worker 搜索');
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        try {
            const chunk = await this.loadChunkForId(id);
            const item = (chunk[id] as Record<string, unknown>) || null;
            if (item) {
                // bundle-data.mjs 在打包时已经把 index 上的 has_collated /
                // has_text / has_image / subtype / primary_name 注入到
                // chunk[id]，所以这里不再需要 await ensureLoaded()。
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

    /** 从 chunk 读取详情构造 IndexEntry。chunk miss 即返回 null（无 fallback）。 */
    async getEntry(id: string): Promise<IndexEntry | null> {
        try {
            const chunk = await this.loadChunkForId(id);
            const detail = chunk[id] as Record<string, any> | undefined;
            if (!detail) return null;
            const type = extractType(id);
            const displayTitle = type === 'entity'
                ? (detail.primary_name || detail.title || detail.name || id)
                : (detail.title || detail.name || id);
            return {
                id,
                title: displayTitle,
                type,
                isDraft: true,
                author: detail.author,
                dynasty: detail.dynasty,
                role: detail.role,
                additional_titles: detail.additional_titles?.map((t: any) => typeof t === 'string' ? t : t?.book_title).filter(Boolean),
                attached_texts: detail.attached_texts?.map((t: any) => typeof t === 'string' ? t : t?.book_title).filter(Boolean),
                edition: detail.edition,
                juan_count: detail.juan_count,
                has_text: detail.has_text,
                has_image: detail.has_image,
                has_collated: detail.has_collated,
                subtype: detail.subtype,
                primary_name: detail.primary_name,
                birth_year: detail.birth_year,
                death_year: detail.death_year,
                cbdb_id: detail.cbdb_id,
            };
        } catch {
            return null;
        }
    }

    /** 已废弃 — index.json 已剥离。 */
    async getAllEntries(): Promise<IndexEntry[]> {
        throw new Error('BundleStorage.getAllEntries 已废弃：请使用 getEntry / worker 搜索');
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
                `${this.basePath}/items/${workId}/collated_edition/collated_edition_index.json`
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

    async getCollatedJuanText(workId: string, juanFile: string): Promise<string | null> {
        if (juanFile.includes('..') || !juanFile.endsWith('.json')) return null;
        const mdFile = juanFile.replace(/\.json$/, '.md');
        const version = await this.ensureVersion();
        const url = `${this.basePath}/items/${workId}/collated_edition/text/${mdFile}`;
        const fullUrl = version ? `${url}?v=${version}` : url;
        try {
            const res = await fetch(fullUrl, { cache: 'no-cache' });
            if (!res.ok) return null;
            return await res.text();
        } catch {
            return null;
        }
    }

    // ─── 版本传承 ───

    async getLineageGraph(workId: string): Promise<any | null> {
        // fetchJson 会自动拼 ?v=version，无需手动加。
        try {
            return await this.fetchJson<any>(`${this.basePath}/items/${workId}/lineage_graph.json`);
        } catch {
            return null;
        }
    }

    // ─── 资源导入进度 ───

    async getCatalogProgress(): Promise<ResourceProgress | null> {
        try {
            return await this.fetchJson<ResourceProgress>(`${this.basePath}/resource-catalog.json`);
        } catch {
            return null;
        }
    }

    async getCollectionProgress(): Promise<ResourceProgress | null> {
        try {
            return await this.fetchJson<ResourceProgress>(`${this.basePath}/resource-collection.json`);
        } catch {
            return null;
        }
    }

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
        this.chunkCache.clear();
        this.chunkLoading.clear();
        this.manifest = null;
        this.manifestLoading = null;
        this.tiyaoCache.clear();
        this.tiyaoLoading.clear();
        this.metaCache = null;
        this.metaLoading = null;
        this.version = undefined;
        this.versionPromise = null;
    }
}
