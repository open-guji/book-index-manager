/**
 * 开发环境 API Storage 实现
 * 通过 Vite dev server 中间件 (/api/*) 读取本地文件系统数据
 */

import type { IndexStorage } from './types';
import type { IndexType, IndexEntry, PageResult, LoadOptions, GroupedSearchResult, VolumeBookMapping, ResourceCatalog, CollatedEditionIndex, CollatedJuan, ResourceProgress, RecommendedData } from '../types';
import { normalizeCatalog } from '../core/normalize-catalog';

export class DevApiStorage implements IndexStorage {
    private baseUrl: string;

    constructor(baseUrl: string = '') {
        this.baseUrl = baseUrl;
    }

    async loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const params = new URLSearchParams({
            type,
            page: String(options.page ?? 1),
            pageSize: String(options.pageSize ?? 50),
            sortBy: options.sortBy ?? 'title',
            sortOrder: options.sortOrder ?? 'asc',
        });
        const res = await fetch(`${this.baseUrl}/api/entries?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const params = new URLSearchParams({
            q: query,
            type,
            page: String(options.page ?? 1),
            pageSize: String(options.pageSize ?? 50),
        });
        const res = await fetch(`${this.baseUrl}/api/search?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async searchAll(query: string, limit: number = 5): Promise<GroupedSearchResult> {
        const params = new URLSearchParams({ q: query, limit: String(limit) });
        const res = await fetch(`${this.baseUrl}/api/search-all?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        const res = await fetch(`${this.baseUrl}/api/items/${encodeURIComponent(id)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const item = await res.json();
        // Entity：把 primary_name 同步到 title 字段
        if (item && item.type === 'entity' && !item.title && item.primary_name) {
            item.title = item.primary_name;
        }
        return item;
    }

    /** 单条 entry（用于 EntityDetail 的 works 标题快速查询） */
    async getEntry(id: string): Promise<IndexEntry | null> {
        const list = await this.getEntriesByIds([id]);
        return list[0];
    }

    /** 批量 entry（拆 chunk 避免 URL 过长） */
    async getEntriesByIds(ids: string[]): Promise<(IndexEntry | null)[]> {
        if (ids.length === 0) return [];
        const CHUNK = 100;
        const result: (IndexEntry | null)[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK);
            const url = `${this.baseUrl}/api/entries-by-ids?ids=${chunk.map(encodeURIComponent).join(',')}`;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    result.push(...chunk.map(() => null));
                    continue;
                }
                const data = await res.json() as { entries: (IndexEntry | null)[] };
                result.push(...(data.entries ?? chunk.map(() => null)));
            } catch {
                result.push(...chunk.map(() => null));
            }
        }
        return result;
    }

    async getCollectionCatalogs(collectionId: string): Promise<ResourceCatalog[] | null> {
        const res = await fetch(`${this.baseUrl}/api/catalog/${encodeURIComponent(collectionId)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const catalogs: ResourceCatalog[] = await res.json();
        return catalogs.map(c => ({ ...c, data: normalizeCatalog(c.data) }));
    }

    async getCollectionCatalog(collectionId: string): Promise<VolumeBookMapping | null> {
        const catalogs = await this.getCollectionCatalogs(collectionId);
        return catalogs?.[0]?.data ?? null;
    }

    async getCollatedEditionIndex(workId: string): Promise<CollatedEditionIndex | null> {
        const res = await fetch(`${this.baseUrl}/api/collated/${encodeURIComponent(workId)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getCollatedJuan(workId: string, juanFile: string): Promise<CollatedJuan | null> {
        const res = await fetch(`${this.baseUrl}/api/collated/${encodeURIComponent(workId)}/${encodeURIComponent(juanFile)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getCollatedJuanText(workId: string, juanFile: string): Promise<string | null> {
        const res = await fetch(`${this.baseUrl}/api/collated/${encodeURIComponent(workId)}/${encodeURIComponent(juanFile)}/text`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
    }

    async saveItem(): Promise<{ id: string; path: string }> {
        throw new Error('DevApiStorage: 开发模式暂不支持保存');
    }

    async deleteItem(): Promise<void> {
        throw new Error('DevApiStorage: 开发模式暂不支持删除');
    }

    async generateId(): Promise<string> {
        throw new Error('DevApiStorage: 开发模式暂不支持生成 ID');
    }

    async getCatalogProgress(): Promise<ResourceProgress | null> {
        const res = await fetch(`${this.baseUrl}/api/resource-catalog-progress`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getCollectionProgress(): Promise<ResourceProgress | null> {
        const res = await fetch(`${this.baseUrl}/api/resource-collection-progress`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getResourceProgress(): Promise<ResourceProgress | null> {
        const res = await fetch(`${this.baseUrl}/api/resource-progress`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getWorkCatalog(workId: string): Promise<Array<{ source: string; data: unknown }> | null> {
        const res = await fetch(`${this.baseUrl}/api/work-catalog/${encodeURIComponent(workId)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getSiteProgress(): Promise<ResourceProgress | null> {
        const res = await fetch(`${this.baseUrl}/api/resource-site-progress`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getResourceCounts(): Promise<{ hasText: number; hasImage: number }> {
        const res = await fetch(`${this.baseUrl}/api/resource-counts`);
        if (!res.ok) return { hasText: 0, hasImage: 0 };
        return res.json();
    }

    async getRecommended(): Promise<RecommendedData | null> {
        const res = await fetch(`${this.baseUrl}/api/recommended`);
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json();
    }

    async getSubtypeStats(): Promise<Record<string, number>> {
        const res = await fetch(`${this.baseUrl}/api/subtype-stats`);
        if (!res.ok) return {};
        return res.json();
    }
}
