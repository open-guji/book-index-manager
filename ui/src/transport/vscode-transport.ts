import type { IndexTransport } from './types';
import type { IndexType, IndexEntry, PageResult, LoadOptions } from '../types';

/**
 * VS Code postMessage 通信实现
 * 用于 guji-platform 扩展内的 webview
 */
export class VscodeTransport implements IndexTransport {
    private vscode: {
        postMessage(message: unknown): void;
        getState(): unknown;
        setState(state: unknown): void;
    };

    private pendingRequests = new Map<string, {
        resolve: (value: unknown) => void;
        reject: (reason: unknown) => void;
    }>();

    private requestId = 0;

    constructor(vscodeApi?: unknown) {
        this.vscode = (vscodeApi || (window as any).acquireVsCodeApi()) as typeof this.vscode;
        window.addEventListener('message', this.handleMessage);
    }

    private handleMessage = (event: MessageEvent) => {
        const { requestId, command, data, error } = event.data || {};
        if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, reject } = this.pendingRequests.get(requestId)!;
            this.pendingRequests.delete(requestId);
            if (error) {
                reject(new Error(error));
            } else {
                resolve(data);
            }
        }
    };

    private request<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
        return new Promise((resolve, reject) => {
            const id = `req_${++this.requestId}`;
            this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
            this.vscode.postMessage({ command, requestId: id, ...params });
            // 超时 30s
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request ${command} timed out`));
                }
            }, 30000);
        });
    }

    async loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        return this.request('loadEntries', { type, ...options });
    }

    async search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        return this.request('search', { query, type, ...options });
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        return this.request('getItem', { id });
    }

    async saveItem(metadata: Record<string, unknown>): Promise<{ id: string; path: string }> {
        return this.request('saveItem', { metadata });
    }

    async deleteItem(id: string): Promise<void> {
        return this.request('deleteItem', { id });
    }

    async generateId(type: IndexType, status: 'draft' | 'official'): Promise<string> {
        return this.request('generateId', { type, status });
    }

    dispose() {
        window.removeEventListener('message', this.handleMessage);
        this.pendingRequests.clear();
    }
}
