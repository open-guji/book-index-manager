import type { IndexTransport } from './types';
import type { IndexType, IndexEntry, PageResult, LoadOptions } from '../types';

/**
 * HTTP REST API 通信实现
 * 用于 kaiyuanguji-web 等 Web 应用
 */
export class HttpTransport implements IndexTransport {
    constructor(private baseUrl: string) {
        // 去除末尾斜杠
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        return res.json();
    }

    private buildQuery(params: Record<string, unknown>): string {
        const entries = Object.entries(params).filter(([, v]) => v != null);
        if (entries.length === 0) return '';
        return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    }

    async loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const query = this.buildQuery({
            type,
            page: options.page,
            pageSize: options.pageSize,
            sortBy: options.sortBy,
            sortOrder: options.sortOrder,
        });
        return this.request(`/entries${query}`);
    }

    async search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const params = this.buildQuery({
            q: query,
            type,
            page: options.page,
            pageSize: options.pageSize,
            sortBy: options.sortBy,
            sortOrder: options.sortOrder,
        });
        return this.request(`/search${params}`);
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        try {
            return await this.request(`/items/${encodeURIComponent(id)}`);
        } catch (err) {
            if (err instanceof Error && err.message.includes('404')) return null;
            throw err;
        }
    }

    async saveItem(metadata: Record<string, unknown>): Promise<{ id: string; path: string }> {
        return this.request('/items', {
            method: 'POST',
            body: JSON.stringify(metadata),
        });
    }

    async deleteItem(id: string): Promise<void> {
        await this.request(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }

    async generateId(type: IndexType, status: 'draft' | 'official'): Promise<string> {
        const result = await this.request<{ id: string }>(`/generate-id${this.buildQuery({ type, status })}`);
        return result.id;
    }
}
