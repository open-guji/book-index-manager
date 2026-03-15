import type { IndexType, IndexEntry, PageResult, LoadOptions } from '../types';

/**
 * 索引数据传输接口
 * 隔离 VS Code postMessage / HTTP REST 等通信方式
 */
export interface IndexTransport {
    /** 加载指定类型的条目列表 */
    loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>>;

    /** 搜索条目 */
    search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>>;

    /** 获取单条元数据 */
    getItem(id: string): Promise<Record<string, unknown> | null>;

    /** 保存元数据 */
    saveItem(metadata: Record<string, unknown>): Promise<{ id: string; path: string }>;

    /** 删除条目 */
    deleteItem(id: string): Promise<void>;

    /** 生成新 ID */
    generateId(type: IndexType, status: 'draft' | 'official'): Promise<string>;

    /** 获取单个索引条目（从缓存中查找） */
    getEntry?(id: string): Promise<IndexEntry | null>;

    /** 获取所有索引条目（不分页） */
    getAllEntries?(): Promise<IndexEntry[]>;
}
