/**
 * 文件系统存储
 * 翻译自 Python book_index_manager.storage
 * 使用 FileSystem 抽象接口，不直接依赖 node:fs
 */

import type { IndexType, IndexEntry, IndexStatus } from '../types';
import type { FileSystem } from './filesystem';
import { base58Encode, base58Decode, parseId } from '../id';

const TYPE_TO_FOLDER: Record<IndexType, string> = { book: 'Book', collection: 'Collection', work: 'Work' };
const FOLDER_TO_TYPE: Record<string, IndexType> = { Book: 'book', Collection: 'collection', Work: 'work' };

/** index.json 结构 */
export interface IndexFile {
    books: Record<string, IndexFileEntry>;
    collections: Record<string, IndexFileEntry>;
    works: Record<string, IndexFileEntry>;
}

export interface IndexFileEntry {
    id: string;
    title: string;
    type: string;
    path: string;
    author: string;
    year: string;
    holder: string;
    dynasty?: string;
    role?: string;
}

/**
 * 路径工具函数
 */
function joinPath(...parts: string[]): string {
    const joined = parts.join('/');
    // 保留 UNC 路径开头的 // (如 //wsl$/...)
    if (joined.startsWith('//')) {
        return '//' + joined.slice(2).replace(/\/+/g, '/');
    }
    return joined.replace(/\/+/g, '/');
}

function cleanName(name: string): string {
    // 只保留中文、英文、数字
    const cleaned = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    return cleaned || 'Undefined';
}

export class BookIndexStorage {
    private officialRoot: string;
    private draftRoot: string;

    constructor(private fs: FileSystem, workspaceRoot: string) {
        this.officialRoot = joinPath(workspaceRoot, 'book-index');
        this.draftRoot = joinPath(workspaceRoot, 'book-index-draft');
    }

    getRootByStatus(status: IndexStatus): string {
        return status === 'draft' ? this.draftRoot : this.officialRoot;
    }

    getRootById(idStr: string): string {
        const idVal = base58Decode(idStr);
        const components = parseId(idVal);
        return this.getRootByStatus(components.status);
    }

    /**
     * 计算文件路径: {root}/{Type}/{c1}/{c2}/{c3}/{ID}-{name}.json
     */
    getPath(type: IndexType, idStr: string, name: string): string {
        const root = this.getRootById(idStr);
        const prefix = idStr.padEnd(3, '_').substring(0, 3);
        const [c1, c2, c3] = [prefix[0], prefix[1], prefix[2]];
        const folder = TYPE_TO_FOLDER[type];
        return joinPath(root, folder, c1, c2, c3, `${idStr}-${cleanName(name)}.json`);
    }

    /**
     * 保存条目并更新索引
     */
    async saveItem(type: IndexType, idStr: string, metadata: Record<string, unknown>): Promise<string> {
        const title = (metadata.title as string) || (metadata['书名'] as string) || '未命名';
        const version = (metadata.version as string) || '';
        const name = version ? `${title}${version}` : title;
        const filePath = this.getPath(type, idStr, name);

        // 检查是否已存在，需要重命名
        const existingPath = await this.findFileById(idStr);
        if (existingPath && existingPath !== filePath) {
            try { await this.fs.deleteFile(existingPath); } catch { /* ignore */ }
        }

        // 确保目录存在
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        await this.fs.mkdir(dir);

        // 设置 id 和 type
        metadata.id = idStr;
        metadata.type = type;

        // 写入文件（过滤 null 值以节省空间）
        await this.fs.writeFile(filePath, JSON.stringify(metadata, stripNulls, 2));

        // 更新索引
        const root = this.getRootById(idStr);
        const relPath = filePath.substring(root.length + 1); // 去掉 root/ 前缀
        await this.updateIndexEntry(root, metadata, type, relPath);

        return filePath;
    }

    /**
     * 更新 index.json 中的条目
     */
    async updateIndexEntry(root: string, metadata: Record<string, unknown>, type: IndexType, relativePath: string): Promise<void> {
        const indexFile = joinPath(root, 'index.json');
        const index = await this.loadIndex(indexFile);

        const idStr = (metadata.id as string) || '';
        if (!idStr) return;

        const typeKey = `${type}s` as keyof IndexFile;
        if (!index[typeKey]) index[typeKey] = {} as any;

        // 提取 author
        let author = '';
        const authors = metadata.authors;
        if (Array.isArray(authors) && authors.length > 0) {
            const first = authors[0];
            author = typeof first === 'object' && first !== null ? (first as any).name || '' : String(first);
        } else if (typeof authors === 'string') {
            author = authors;
        }

        // 提取 year
        let year = '';
        const pub = metadata.publication_info;
        if (typeof pub === 'object' && pub !== null) {
            year = (pub as any).year || '';
        } else if (typeof pub === 'string') {
            year = pub;
        }

        // 提取 holder
        let holder = '';
        const loc = metadata.current_location;
        if (typeof loc === 'object' && loc !== null) {
            holder = (loc as any).name || '';
        } else if (typeof loc === 'string') {
            holder = loc;
        }

        (index[typeKey] as Record<string, IndexFileEntry>)[idStr] = {
            id: idStr,
            title: (metadata.title as string) || '未命名',
            type: TYPE_TO_FOLDER[type],
            path: relativePath,
            author,
            year,
            holder,
        };

        await this.saveIndex(indexFile, index);
    }

    /**
     * 删除条目和索引记录
     */
    async deleteItem(idStr: string): Promise<boolean> {
        const filePath = await this.findFileById(idStr);
        if (!filePath) return false;

        const idVal = base58Decode(idStr);
        const components = parseId(idVal);
        const root = this.getRootByStatus(components.status);
        const indexFile = joinPath(root, 'index.json');

        // 从索引中移除
        const index = await this.loadIndex(indexFile);
        const typeKey = `${components.type}s` as keyof IndexFile;
        if (index[typeKey] && (index[typeKey] as Record<string, IndexFileEntry>)[idStr]) {
            delete (index[typeKey] as Record<string, IndexFileEntry>)[idStr];
            await this.saveIndex(indexFile, index);
        }

        // 删除文件
        await this.fs.deleteFile(filePath);
        return true;
    }

    /**
     * 通过 ID 查找文件
     */
    async findFileById(idStr: string): Promise<string | null> {
        const prefix = idStr.padEnd(3, '_').substring(0, 3);
        const [c1, c2, c3] = [prefix[0], prefix[1], prefix[2]];

        for (const root of [this.officialRoot, this.draftRoot]) {
            for (const typeDir of ['Book', 'Collection', 'Work']) {
                const searchDir = joinPath(root, typeDir, c1, c2, c3);
                if (!(await this.fs.exists(searchDir))) continue;
                try {
                    const files = await this.fs.readdir(searchDir);
                    const match = files.find(f => f.startsWith(`${idStr}-`) && f.endsWith('.json'));
                    if (match) return joinPath(searchDir, match);
                } catch { /* ignore */ }
            }
        }
        return null;
    }

    /**
     * 加载元数据
     */
    async loadMetadata(filePath: string): Promise<Record<string, unknown>> {
        try {
            const content = await this.fs.readFile(filePath);
            return JSON.parse(content);
        } catch {
            return {};
        }
    }

    /**
     * 通过 ID 获取元数据
     */
    async getItem(idStr: string): Promise<Record<string, unknown> | null> {
        const filePath = await this.findFileById(idStr);
        if (!filePath) return null;
        const metadata = await this.loadMetadata(filePath);
        return Object.keys(metadata).length > 0 ? metadata : null;
    }

    /**
     * 加载指定类型的所有条目（从 index.json）
     */
    async loadEntries(type: IndexType, status?: IndexStatus): Promise<IndexEntry[]> {
        const roots = status ? [this.getRootByStatus(status)] : [this.officialRoot, this.draftRoot];
        const entries: IndexEntry[] = [];

        for (const root of roots) {
            const indexFile = joinPath(root, 'index.json');
            const index = await this.loadIndex(indexFile);
            const typeKey = `${type}s` as keyof IndexFile;
            const section = index[typeKey] || {};

            for (const [id, entry] of Object.entries(section)) {
                entries.push({
                    id,
                    title: entry.title,
                    type,
                    author: entry.author || undefined,
                    dynasty: entry.dynasty || undefined,
                    role: entry.role || undefined,
                    path: joinPath(root, entry.path),
                });
            }
        }
        return entries;
    }

    /**
     * 搜索条目（带匹配度评分排序）
     *
     * 评分规则：
     * - title 完全匹配 100, 开头匹配 80, 包含匹配 60
     * - author 完全匹配 50, 包含匹配 40
     * - 其他字段 (dynasty/role/id) 包含匹配 20
     * 多字段命中时分数累加，按总分降序排列。
     */
    async searchEntries(query: string, type: IndexType, status?: IndexStatus): Promise<IndexEntry[]> {
        const all = await this.loadEntries(type, status);
        return rankByRelevance(all, query);
    }

    /**
     * 重建 index.json
     */
    async rebuildIndex(status: IndexStatus): Promise<void> {
        const root = this.getRootByStatus(status);
        const index: IndexFile = { books: {}, collections: {}, works: {} };

        for (const typeDir of ['Book', 'Collection', 'Work']) {
            const typePath = joinPath(root, typeDir);
            if (!(await this.fs.exists(typePath))) continue;

            const type = FOLDER_TO_TYPE[typeDir];
            const typeKey = `${type}s` as keyof IndexFile;

            const files = await this.fs.glob(typePath, '**/*.json');
            for (const file of files) {
                if (file.endsWith('index.json')) continue;
                try {
                    const metadata = await this.loadMetadata(file);
                    let idStr = (metadata.id as string) || (metadata.ID as string) || '';
                    if (!idStr) {
                        const fileName = file.substring(file.lastIndexOf('/') + 1);
                        if (fileName.includes('-')) idStr = fileName.split('-')[0];
                    }
                    if (!idStr) continue;

                    const relPath = file.substring(root.length + 1);

                    let author = '';
                    const authors = metadata.authors;
                    if (Array.isArray(authors) && authors.length > 0) {
                        const first = authors[0];
                        author = typeof first === 'object' && first !== null ? (first as any).name || '' : String(first);
                    }

                    (index[typeKey] as Record<string, IndexFileEntry>)[idStr] = {
                        id: idStr,
                        title: (metadata.title as string) || '未命名',
                        type: typeDir,
                        path: relPath,
                        author,
                        year: typeof metadata.publication_info === 'object' ? ((metadata.publication_info as any)?.year || '') : '',
                        holder: typeof metadata.current_location === 'object' ? ((metadata.current_location as any)?.name || '') : '',
                    };
                } catch { /* skip invalid files */ }
            }
        }

        await this.saveIndex(joinPath(root, 'index.json'), index);
    }

    // ── Asset Directory ──

    /**
     * 计算资源目录路径: {root}/{Type}/{c1}/{c2}/{c3}/{ID}/
     * 与 JSON 文件同级，以 ID 命名
     */
    getAssetDir(idStr: string): string {
        const root = this.getRootById(idStr);
        const idVal = base58Decode(idStr);
        const components = parseId(idVal);
        const type = components.type;
        const prefix = idStr.padEnd(3, '_').substring(0, 3);
        const [c1, c2, c3] = [prefix[0], prefix[1], prefix[2]];
        const folder = TYPE_TO_FOLDER[type];
        return joinPath(root, folder, c1, c2, c3, idStr);
    }

    /**
     * 初始化资源目录：创建 {ID}/ 文件夹
     * @returns 资源目录路径
     */
    async initAssetDir(idStr: string): Promise<string> {
        const dir = this.getAssetDir(idStr);
        await this.fs.mkdir(dir);
        return dir;
    }

    /**
     * 检查资源目录是否存在
     */
    async hasAssetDir(idStr: string): Promise<boolean> {
        const dir = this.getAssetDir(idStr);
        return this.fs.exists(dir);
    }

    // ── Private ──

    private async loadIndex(indexFile: string): Promise<IndexFile> {
        const defaultIndex: IndexFile = { books: {}, collections: {}, works: {} };
        try {
            if (!(await this.fs.exists(indexFile))) return defaultIndex;
            const content = await this.fs.readFile(indexFile);
            const data = JSON.parse(content);
            return {
                books: data.books || {},
                collections: data.collections || {},
                works: data.works || {},
            };
        } catch {
            return defaultIndex;
        }
    }

    private async saveIndex(indexFile: string, index: IndexFile): Promise<void> {
        const dir = indexFile.substring(0, indexFile.lastIndexOf('/'));
        await this.fs.mkdir(dir);
        await this.fs.writeFile(indexFile, JSON.stringify(index, null, 2));
    }
}

// ── 搜索评分 ──

/**
 * 计算单条条目与查询的匹配分数。
 * 多字段命中时分数累加。
 */
function scoreEntry(entry: IndexEntry, query: string): number {
    const q = query.toLowerCase();
    let score = 0;

    // title（权重最高）
    const title = entry.title.toLowerCase();
    if (title === q) {
        score += 100;
    } else if (title.startsWith(q)) {
        score += 80;
    } else if (title.includes(q)) {
        score += 60;
    }

    // author（权重次之）
    if (entry.author) {
        const author = entry.author.toLowerCase();
        if (author === q) {
            score += 50;
        } else if (author.includes(q)) {
            score += 40;
        }
    }

    // 其他字段：dynasty, role, id
    const others = [entry.dynasty, entry.role, entry.id];
    for (const val of others) {
        if (val && val.toLowerCase().includes(q)) {
            score += 20;
            break;          // 其他字段只加一次
        }
    }

    return score;
}

/**
 * 对条目列表按匹配度排序，过滤掉无匹配的条目。
 * 供 BookIndexStorage.searchEntries / GithubStorage.search 等统一调用。
 */
/**
 * JSON.stringify replacer：过滤值为 null 的字段
 */
function stripNulls(_key: string, value: unknown): unknown {
    return value === null ? undefined : value;
}

export function rankByRelevance(entries: IndexEntry[], query: string): IndexEntry[] {
    const scored = entries
        .map(e => ({ entry: e, score: scoreEntry(e, query) }))
        .filter(s => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.entry);
}
