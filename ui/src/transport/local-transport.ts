/**
 * 本地文件系统 Transport 实现
 * 使用 BookIndexStorage + IdGenerator 实现完整的 IndexTransport
 * 适用于 VS Code 插件和 Node.js 环境
 */

import type { IndexType, IndexStatus, IndexEntry, PageResult, LoadOptions, RelationData, EntityOption, CreateEntityParams } from '../types';
import type { IndexTransport } from './types';
import type { FileSystem } from '../core/filesystem';
import { BookIndexStorage } from '../core/storage';
import { IdGenerator } from '../core/id-generator';
import { base58Decode, parseId } from '../id';

/** LocalTransport 配置 */
export interface LocalTransportConfig {
    /** 文件系统实现 */
    fs: FileSystem;
    /** 工作区根目录 */
    workspaceRoot: string;
    /** 机器 ID (0-2047) */
    machineId?: number;
}

export class LocalTransport implements IndexTransport {
    private storage: BookIndexStorage;
    private idGen: IdGenerator;
    private recentEntities: EntityOption[] = [];

    constructor(config: LocalTransportConfig) {
        this.storage = new BookIndexStorage(config.fs, config.workspaceRoot);
        this.idGen = new IdGenerator(config.machineId ?? 0);
    }

    async loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const all = await this.storage.loadEntries(type);
        return this.paginate(all, options);
    }

    async search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>> {
        const results = await this.storage.searchEntries(query, type);
        return this.paginate(results, options);
    }

    async getItem(id: string): Promise<Record<string, unknown> | null> {
        return this.storage.getItem(id);
    }

    async saveItem(metadata: Record<string, unknown>): Promise<{ id: string; path: string }> {
        const idStr = metadata.id as string;
        if (!idStr) throw new Error('metadata.id is required');

        const type = (metadata.type as IndexType) || this.extractTypeFromId(idStr);
        const path = await this.storage.saveItem(type, idStr, metadata);
        return { id: idStr, path };
    }

    async deleteItem(id: string): Promise<void> {
        const success = await this.storage.deleteItem(id);
        if (!success) throw new Error(`Item not found: ${id}`);
    }

    async generateId(type: IndexType, status: IndexStatus): Promise<string> {
        return this.idGen.nextId(status, type);
    }

    async getEntry(id: string): Promise<IndexEntry | null> {
        const metadata = await this.storage.getItem(id);
        if (!metadata) return null;

        const type = (metadata.type as IndexType) || this.extractTypeFromId(id);
        return {
            id,
            title: (metadata.title as string) || '未命名',
            type,
            author: this.extractAuthor(metadata),
            dynasty: this.extractYear(metadata),
        };
    }

    async getAllEntries(): Promise<IndexEntry[]> {
        const types: IndexType[] = ['book', 'collection', 'work'];
        const all: IndexEntry[] = [];
        for (const type of types) {
            const entries = await this.storage.loadEntries(type);
            all.push(...entries);
        }
        return all;
    }

    // ── 关联关系 ──

    async getRelations(id: string): Promise<RelationData | null> {
        const metadata = await this.storage.getItem(id);
        if (!metadata) return null;

        const relations: RelationData = {};
        const type = (metadata.type as IndexType) || this.extractTypeFromId(id);

        if (type === 'book') {
            // Book 可属于 Work 和 Collection
            if (metadata.work_id) {
                const work = await this.resolveEntity(metadata.work_id as string);
                if (work) relations.belongsToWork = { ...work, type: 'work' };
            }
            if (metadata.contained_in && Array.isArray(metadata.contained_in) && metadata.contained_in.length > 0) {
                const col = await this.resolveEntity(metadata.contained_in[0] as string);
                if (col) relations.belongsToCollection = { ...col, type: 'collection' };
            }
        } else if (type === 'collection') {
            // Collection 包含 Books
            if (metadata.books && Array.isArray(metadata.books)) {
                const books = await Promise.all(
                    (metadata.books as string[]).map(bid => this.resolveEntity(bid))
                );
                relations.containedBooks = books.filter((b): b is NonNullable<typeof b> => b !== null)
                    .map(b => ({ ...b, type: 'book' as IndexType }));
            }
        } else if (type === 'work') {
            // Work 可有父 Work，包含 Books
            if (metadata.parent_work && typeof metadata.parent_work === 'object') {
                const pw = metadata.parent_work as { id: string; title: string };
                relations.parentWork = { id: pw.id, title: pw.title, type: 'work' };
            }
            if (metadata.books && Array.isArray(metadata.books)) {
                const books = await Promise.all(
                    (metadata.books as string[]).map(bid => this.resolveEntity(bid))
                );
                relations.containedBooks = books.filter((b): b is NonNullable<typeof b> => b !== null)
                    .map(b => ({ ...b, type: 'book' as IndexType }));
            }
        }

        return relations;
    }

    async linkEntity(sourceId: string, field: string, targetId: string): Promise<void> {
        const metadata = await this.storage.getItem(sourceId);
        if (!metadata) throw new Error(`Source not found: ${sourceId}`);

        const type = (metadata.type as IndexType) || this.extractTypeFromId(sourceId);

        // 根据 field 更新对应字段
        switch (field) {
            case 'belongsToWork':
            case 'work_id':
                metadata.work_id = targetId;
                break;
            case 'belongsToCollection':
            case 'contained_in':
                if (!Array.isArray(metadata.contained_in)) metadata.contained_in = [];
                if (!(metadata.contained_in as string[]).includes(targetId)) {
                    (metadata.contained_in as string[]).push(targetId);
                }
                break;
            case 'parentWork':
            case 'parent_work': {
                const target = await this.storage.getItem(targetId);
                metadata.parent_work = { id: targetId, title: (target?.title as string) || '' };
                break;
            }
            case 'containedBooks':
            case 'books':
                if (!Array.isArray(metadata.books)) metadata.books = [];
                if (!(metadata.books as string[]).includes(targetId)) {
                    (metadata.books as string[]).push(targetId);
                }
                break;
            default:
                throw new Error(`Unknown relation field: ${field}`);
        }

        await this.storage.saveItem(type, sourceId, metadata);
    }

    async unlinkEntity(sourceId: string, field: string): Promise<void> {
        const metadata = await this.storage.getItem(sourceId);
        if (!metadata) throw new Error(`Source not found: ${sourceId}`);

        const type = (metadata.type as IndexType) || this.extractTypeFromId(sourceId);

        switch (field) {
            case 'belongsToWork':
            case 'work_id':
                delete metadata.work_id;
                break;
            case 'belongsToCollection':
            case 'contained_in':
                metadata.contained_in = [];
                break;
            case 'parentWork':
            case 'parent_work':
                delete metadata.parent_work;
                break;
            case 'containedBooks':
            case 'books':
                metadata.books = [];
                break;
            default:
                throw new Error(`Unknown relation field: ${field}`);
        }

        await this.storage.saveItem(type, sourceId, metadata);
    }

    async createAndLink(sourceId: string, field: string, newEntity: CreateEntityParams): Promise<{ id: string }> {
        // 生成新 ID
        const newId = this.idGen.nextId('draft', newEntity.type);

        // 创建新实体
        const metadata: Record<string, unknown> = {
            id: newId,
            type: newEntity.type,
            title: newEntity.title,
            ...(newEntity.inheritData || {}),
        };
        await this.storage.saveItem(newEntity.type, newId, metadata);

        // 建立关联
        await this.linkEntity(sourceId, field, newId);

        return { id: newId };
    }

    // ── 实体搜索 ──

    async searchEntities(query: string, type?: IndexType | 'all'): Promise<EntityOption[]> {
        const types: IndexType[] = type && type !== 'all' ? [type] : ['book', 'collection', 'work'];
        const results: EntityOption[] = [];

        for (const t of types) {
            const entries = await this.storage.searchEntries(query, t);
            for (const e of entries) {
                results.push({
                    id: e.id,
                    title: e.title,
                    type: e.type,
                    author: e.author,
                    dynasty: e.dynasty,
                });
            }
        }

        return results;
    }

    async getRecentEntities(): Promise<EntityOption[]> {
        return this.recentEntities;
    }

    async addRecentEntity(entity: EntityOption): Promise<void> {
        // 去重，最多保留 20 条
        this.recentEntities = [
            entity,
            ...this.recentEntities.filter(e => e.id !== entity.id),
        ].slice(0, 20);
    }

    // ── 工具方法 ──

    /** 获取底层 storage 实例（高级用法） */
    getStorage(): BookIndexStorage {
        return this.storage;
    }

    /** 重建索引 */
    async rebuildIndex(status: IndexStatus): Promise<void> {
        await this.storage.rebuildIndex(status);
    }

    // ── Private ──

    private extractTypeFromId(idStr: string): IndexType {
        try {
            const idVal = base58Decode(idStr);
            return parseId(idVal).type;
        } catch {
            return 'book';
        }
    }

    private extractAuthor(metadata: Record<string, unknown>): string | undefined {
        const authors = metadata.authors;
        if (Array.isArray(authors) && authors.length > 0) {
            const first = authors[0];
            return typeof first === 'object' && first !== null ? (first as any).name || '' : String(first);
        }
        return undefined;
    }

    private extractYear(metadata: Record<string, unknown>): string | undefined {
        const pub = metadata.publication_info;
        if (typeof pub === 'object' && pub !== null) {
            return (pub as any).year || undefined;
        }
        return undefined;
    }

    private async resolveEntity(id: string): Promise<{ id: string; title: string } | null> {
        const metadata = await this.storage.getItem(id);
        if (!metadata) return null;
        return { id, title: (metadata.title as string) || '未命名' };
    }

    private paginate(entries: IndexEntry[], options: LoadOptions): PageResult<IndexEntry> {
        const page = options.page ?? 1;
        const pageSize = options.pageSize ?? 50;

        // 排序
        if (options.sortBy) {
            const key = options.sortBy as keyof IndexEntry;
            const order = options.sortOrder === 'desc' ? -1 : 1;
            entries.sort((a, b) => {
                const va = a[key] ?? '';
                const vb = b[key] ?? '';
                return va < vb ? -order : va > vb ? order : 0;
            });
        }

        const total = entries.length;
        const start = (page - 1) * pageSize;
        const sliced = entries.slice(start, start + pageSize);

        return { entries: sliced, total, page, pageSize };
    }
}
