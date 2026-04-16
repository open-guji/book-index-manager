/**
 * BookIndexManager: high-level facade for Book Index operations.
 * Port of Python book_index_manager.manager
 *
 * Combines BookIndexStorage + IdGenerator into a single API.
 */

import type { IndexType, IndexStatus } from '../types';
import type { FileSystem } from './filesystem';
import { BookIndexStorage } from './storage';
import { IdGenerator } from './id-generator';
import { base36Encode, smartDecode, decodeIdString } from '../id';
import { BookIndexError } from './exceptions';

export class BookIndexManager {
    private storage: BookIndexStorage;
    private idGen: IdGenerator;

    constructor(fs: FileSystem, storageRoot: string, machineId: number = 1) {
        this.storage = new BookIndexStorage(fs, storageRoot);
        this.idGen = new IdGenerator(machineId);
    }

    /** Generate a new unique ID (returns raw bigint). */
    generateId(type: IndexType = 'book', status: IndexStatus = 'draft'): bigint {
        return this.idGen.nextIdRaw(status, type);
    }

    /** Encode a bigint ID to Base36 string. */
    encodeId(idVal: bigint): string {
        return base36Encode(idVal);
    }

    /** Decode an ID string to bigint (supports base36 and legacy base58). */
    decodeId(idStr: string): bigint {
        return smartDecode(idStr);
    }

    /** Save a book/collection/work record. Auto-generates ID if not present. */
    async saveItem(
        metadata: Record<string, unknown>,
        type?: IndexType,
        status: IndexStatus = 'draft',
    ): Promise<string> {
        let idStr = (metadata.id as string) || (metadata.ID as string);

        if (idStr) {
            try {
                const components = decodeIdString(idStr);
                if (!type) {
                    type = components.type;
                }
            } catch {
                throw new BookIndexError(`Invalid ID format: ${idStr}`);
            }
        } else {
            if (!type) {
                const typeName = (metadata.type as string) || 'book';
                type = typeName as IndexType;
            }
            idStr = this.idGen.nextId(status, type);
            metadata.id = idStr;
        }

        const path = await this.storage.saveItem(type!, idStr, metadata);
        return path;
    }

    /** Retrieve metadata by ID string. */
    async getItem(idStr: string): Promise<Record<string, unknown> | null> {
        return this.storage.getItem(idStr);
    }

    /** Find the filesystem path for an ID. */
    async findItemPath(idStr: string): Promise<string | null> {
        return this.storage.findFileById(idStr);
    }

    /** Update a specific field in the JSON file. */
    async updateField(idStr: string, key: string, content: unknown): Promise<boolean> {
        const filePath = await this.storage.findFileById(idStr);
        if (!filePath) return false;

        try {
            const metadata = await this.storage.loadMetadata(filePath);

            // Section name mapping (Chinese → English key)
            const mapping: Record<string, string | null> = {
                '基本信息': null,
                '介绍': 'description',
                '资源': 'resources',
                '收藏历史': 'history',
                '其他版本': 'related_books',
            };

            const resolvedKey = key in mapping ? mapping[key] : key;
            if (resolvedKey === null) return false;

            if (resolvedKey === 'description' && typeof content === 'string') {
                const existing = (metadata[resolvedKey] as Record<string, unknown>) || {};
                metadata[resolvedKey] = { text: content, sources: existing.sources || [] };
            } else {
                metadata[resolvedKey!] = content;
            }

            const components = decodeIdString(idStr);
            await this.storage.saveItem(components.type, idStr, metadata);
            return true;
        } catch {
            return false;
        }
    }

    /** Delete an entity by ID. */
    async deleteItem(idStr: string): Promise<boolean> {
        return this.storage.deleteItem(idStr);
    }

    /** Rebuild index.json for both official and draft. */
    async rebuildIndices(): Promise<void> {
        await this.storage.rebuildIndex('official');
        await this.storage.rebuildIndex('draft');
    }

    // ── Asset Directory ──

    /** Get the asset directory path for an ID (without creating it). */
    getAssetDir(idStr: string): string {
        return this.storage.getAssetDir(idStr);
    }

    /** Create the asset directory for an ID. Returns the directory path. */
    async initAssetDir(idStr: string): Promise<string> {
        return this.storage.initAssetDir(idStr);
    }

    /** Check if asset directory exists. */
    async hasAssetDir(idStr: string): Promise<boolean> {
        return this.storage.hasAssetDir(idStr);
    }

    /** Access the underlying BookIndexStorage. */
    getStorage(): BookIndexStorage {
        return this.storage;
    }
}
