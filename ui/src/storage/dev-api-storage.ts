/**
 * 开发环境 API Storage 实现
 * 通过 Vite dev server 中间件 (/api/*) 读取本地文件系统数据
 */

import type { IndexStorage } from './types';
import type { IndexType, IndexEntry, PageResult, LoadOptions, VolumeBookMapping, CollatedEditionIndex, CollatedJuan } from '../types';

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

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        const res = await fetch(`${this.baseUrl}/api/items/${encodeURIComponent(id)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async getCollectionCatalog(collectionId: string): Promise<VolumeBookMapping | null> {
        const res = await fetch(`${this.baseUrl}/api/catalog/${encodeURIComponent(collectionId)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
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

    async saveItem(): Promise<{ id: string; path: string }> {
        throw new Error('DevApiStorage: 开发模式暂不支持保存');
    }

    async deleteItem(): Promise<void> {
        throw new Error('DevApiStorage: 开发模式暂不支持删除');
    }

    async generateId(): Promise<string> {
        throw new Error('DevApiStorage: 开发模式暂不支持生成 ID');
    }
}
