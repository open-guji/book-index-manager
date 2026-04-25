/**
 * 文件系统存储
 * 翻译自 Python book_index_manager.storage
 * 使用 FileSystem 抽象接口，不直接依赖 node:fs
 */

import type { IndexType, IndexEntry, IndexStatus, GroupedSearchResult } from '../types';
import type { FileSystem } from './filesystem';
import { base36Encode, smartDecode, parseId } from '../id';

const TYPE_TO_FOLDER: Record<IndexType, string> = { book: 'Book', collection: 'Collection', work: 'Work', entity: 'Entity' };
const FOLDER_TO_TYPE: Record<string, IndexType> = { Book: 'book', Collection: 'collection', Work: 'work', Entity: 'entity' };

export const NUM_SHARDS = 16;

/** Deterministic hash — identical results in Python (h*31+ord(c)) & 0xFFFFFFFF */
export function shardOf(id: string, n = NUM_SHARDS): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
    }
    return h % n;
}

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
    /** Work 别名 */
    additional_titles?: string[];
    /** Book 附载篇目 */
    attached_texts?: string[];
    edition?: string;
    juan_count?: number;
    /** UI 展示用計量文本，優先於 juan_count 單獨顯示 */
    measure_info?: string;
    has_text?: boolean;
    has_image?: boolean;
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
        const idVal = smartDecode(idStr);
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
        const edition = (metadata.edition as string) || '';
        const name = edition ? `${title}${edition}` : title;
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
     * 更新索引分片中的条目
     */
    async updateIndexEntry(root: string, metadata: Record<string, unknown>, type: IndexType, relativePath: string): Promise<void> {
        const idStr = (metadata.id as string) || '';
        if (!idStr) return;

        const typeKey = `${type}s`;
        const shardData = await this.loadShard(root, typeKey, idStr);

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

        // 提取 additional_titles（Work 别名，兼容 string 和 {book_title} 两种格式）
        const additionalTitles = Array.isArray(metadata.additional_titles)
            ? (metadata.additional_titles as any[]).map(t => typeof t === 'string' ? t : t?.book_title).filter(Boolean) as string[]
            : undefined;

        // 提取 attached_texts（Book 附载篇目，兼容 string 和 {book_title} 两种格式）
        const attachedTexts = Array.isArray(metadata.attached_texts)
            ? (metadata.attached_texts as any[]).map(t => typeof t === 'string' ? t : t?.book_title).filter(Boolean) as string[]
            : undefined;

        // 提取 juan_count
        let juanCount: number | undefined;
        const jc = metadata.juan_count;
        if (typeof jc === 'number') {
            juanCount = jc;
        } else if (typeof jc === 'object' && jc !== null) {
            juanCount = (jc as any).number || undefined;
        }

        // 提取 measure_info（UI 展示用計量文本）
        const measureInfo = typeof metadata.measure_info === 'string' ? metadata.measure_info : '';

        // 提取资源类型标记
        let hasText = false;
        let hasImage = false;
        const resources = metadata.resources;
        if (Array.isArray(resources)) {
            for (const r of resources) {
                const rt = typeof r === 'object' && r !== null ? (r as any).type : '';
                if (rt === 'text' || rt === 'text+image') hasText = true;
                if (rt === 'image' || rt === 'text+image') hasImage = true;
            }
        }

        const entry: IndexFileEntry = {
            id: idStr,
            title: (metadata.title as string) || '未命名',
            type: TYPE_TO_FOLDER[type],
            path: relativePath,
            author,
            year,
            holder,
        };
        if (additionalTitles && additionalTitles.length > 0) entry.additional_titles = additionalTitles;
        if (attachedTexts && attachedTexts.length > 0) entry.attached_texts = attachedTexts;
        if (juanCount) entry.juan_count = juanCount;
        if (measureInfo) entry.measure_info = measureInfo;
        const edition = typeof metadata.edition === 'string' ? metadata.edition : '';
        if (edition) entry.edition = edition;
        if (hasText) entry.has_text = true;
        if (hasImage) entry.has_image = true;

        shardData[idStr] = entry;
        await this.saveShard(root, typeKey, idStr, shardData);
    }

    /**
     * 删除条目和索引记录
     */
    async deleteItem(idStr: string): Promise<boolean> {
        const filePath = await this.findFileById(idStr);
        if (!filePath) return false;

        const idVal = smartDecode(idStr);
        const components = parseId(idVal);
        const root = this.getRootByStatus(components.status);
        const typeKey = `${components.type}s`;

        // 从索引分片中移除
        const shardData = await this.loadShard(root, typeKey, idStr);
        if (shardData[idStr]) {
            delete shardData[idStr];
            await this.saveShard(root, typeKey, idStr, shardData);
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
     * 加载指定类型的所有条目（从分片索引文件）
     */
    async loadEntries(type: IndexType, status?: IndexStatus): Promise<IndexEntry[]> {
        const roots = status ? [this.getRootByStatus(status)] : [this.officialRoot, this.draftRoot];
        const entries: IndexEntry[] = [];
        const typeKey = `${type}s`;

        for (const root of roots) {
            const section = await this.loadAllShards(root, typeKey);

            for (const [id, entry] of Object.entries(section)) {
                entries.push({
                    id,
                    title: entry.title,
                    type,
                    author: entry.author || undefined,
                    dynasty: entry.dynasty || undefined,
                    role: entry.role || undefined,
                    path: joinPath(root, entry.path),
                    additional_titles: entry.additional_titles,
                    attached_texts: entry.attached_texts,
                    edition: entry.edition,
                    juan_count: entry.juan_count,
                    has_text: entry.has_text,
                    has_image: entry.has_image,
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
     * 统一搜索：同时搜索三种类型，返回分组结果
     * @param limit 每组最多返回的条数，默认 5
     */
    async searchAll(query: string, limit: number = 5, status?: IndexStatus): Promise<GroupedSearchResult> {
        const types: IndexType[] = ['work', 'book', 'collection'];
        const results = await Promise.all(
            types.map(t => this.searchEntries(query, t, status))
        );
        return {
            works: results[0].slice(0, limit),
            books: results[1].slice(0, limit),
            collections: results[2].slice(0, limit),
            totalWorks: results[0].length,
            totalBooks: results[1].length,
            totalCollections: results[2].length,
        };
    }

    /**
     * 重建索引分片文件
     */
    async rebuildIndex(status: IndexStatus): Promise<void> {
        const root = this.getRootByStatus(status);

        // shards[typeKey][shardNum] = {id: entry}
        const shards: Record<string, Record<number, Record<string, IndexFileEntry>>> = {
            books: Object.fromEntries(Array.from({ length: NUM_SHARDS }, (_, i) => [i, {}])),
            collections: { 0: {} },
            works: Object.fromEntries(Array.from({ length: NUM_SHARDS }, (_, i) => [i, {}])),
        };

        for (const typeDir of ['Book', 'Collection', 'Work']) {
            const typePath = joinPath(root, typeDir);
            if (!(await this.fs.exists(typePath))) continue;

            const type = FOLDER_TO_TYPE[typeDir];
            const typeKey = `${type}s`;

            const files = await this.fs.glob(typePath, '**/*.json');
            for (const file of files) {
                // Skip index shard files
                if (file.includes('/index/')) continue;
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

                    const additionalTitles = Array.isArray(metadata.additional_titles)
                        ? (metadata.additional_titles as any[]).map(t => typeof t === 'string' ? t : t?.book_title).filter(Boolean) as string[]
                        : undefined;

                    const attachedTexts = Array.isArray(metadata.attached_texts)
                        ? (metadata.attached_texts as any[]).map(t => typeof t === 'string' ? t : t?.book_title).filter(Boolean) as string[]
                        : undefined;

                    let juanCount: number | undefined;
                    const jc = metadata.juan_count;
                    if (typeof jc === 'number') {
                        juanCount = jc;
                    } else if (typeof jc === 'object' && jc !== null) {
                        juanCount = (jc as any).number || undefined;
                    }

                    const measureInfo = typeof metadata.measure_info === 'string' ? metadata.measure_info : '';

                    let hasText = false;
                    let hasImage = false;
                    const resources = metadata.resources;
                    if (Array.isArray(resources)) {
                        for (const r of resources) {
                            const rt = typeof r === 'object' && r !== null ? (r as any).type : '';
                            if (rt === 'text' || rt === 'text+image') hasText = true;
                            if (rt === 'image' || rt === 'text+image') hasImage = true;
                        }
                    }

                    const entry: IndexFileEntry = {
                        id: idStr,
                        title: (metadata.title as string) || '未命名',
                        type: typeDir,
                        path: relPath,
                        author,
                        year: typeof metadata.publication_info === 'object' ? ((metadata.publication_info as any)?.year || '') : '',
                        holder: typeof metadata.current_location === 'object' ? ((metadata.current_location as any)?.name || '') : '',
                    };
                    if (additionalTitles && additionalTitles.length > 0) entry.additional_titles = additionalTitles;
                    if (attachedTexts && attachedTexts.length > 0) entry.attached_texts = attachedTexts;
                    if (juanCount) entry.juan_count = juanCount;
                    if (measureInfo) entry.measure_info = measureInfo;
                    const edition = typeof metadata.edition === 'string' ? metadata.edition : '';
                    if (edition) entry.edition = edition;
                    if (hasText) entry.has_text = true;
                    if (hasImage) entry.has_image = true;

                    const shardNum = typeKey === 'collections' ? 0 : shardOf(idStr);
                    shards[typeKey][shardNum][idStr] = entry;
                } catch { /* skip invalid files */ }
            }
        }

        // Write all shard files
        for (const [typeKey, typeShards] of Object.entries(shards)) {
            for (const [shardNum, data] of Object.entries(typeShards)) {
                const shardPath = this.shardPath(root, typeKey, Number(shardNum));
                const dir = shardPath.substring(0, shardPath.lastIndexOf('/'));
                await this.fs.mkdir(dir);
                await this.fs.writeFile(shardPath, JSON.stringify(data, null, 2));
            }
        }
    }

    // ── Asset Directory ──

    /**
     * 计算资源目录路径: {root}/{Type}/{c1}/{c2}/{c3}/{ID}/
     * 与 JSON 文件同级，以 ID 命名
     */
    getAssetDir(idStr: string): string {
        const root = this.getRootById(idStr);
        const idVal = smartDecode(idStr);
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

    // ── Sharded index I/O ──

    private shardPath(root: string, typeKey: string, shard: number): string {
        if (typeKey === 'collections') {
            return joinPath(root, 'index', 'collections.json');
        }
        return joinPath(root, 'index', typeKey, `${shard.toString(16)}.json`);
    }

    private async loadShard(root: string, typeKey: string, idStr: string): Promise<Record<string, IndexFileEntry>> {
        const shard = shardOf(idStr);
        const path = this.shardPath(root, typeKey, shard);
        try {
            if (!(await this.fs.exists(path))) return {};
            const content = await this.fs.readFile(path);
            return JSON.parse(content);
        } catch {
            return {};
        }
    }

    private async saveShard(root: string, typeKey: string, idStr: string, data: Record<string, IndexFileEntry>): Promise<void> {
        const shard = shardOf(idStr);
        const path = this.shardPath(root, typeKey, shard);
        const dir = path.substring(0, path.lastIndexOf('/'));
        await this.fs.mkdir(dir);
        await this.fs.writeFile(path, JSON.stringify(data, null, 2));
    }

    private async loadAllShards(root: string, typeKey: string): Promise<Record<string, IndexFileEntry>> {
        const merged: Record<string, IndexFileEntry> = {};
        if (typeKey === 'collections') {
            const path = this.shardPath(root, typeKey, 0);
            try {
                if (await this.fs.exists(path)) {
                    const content = await this.fs.readFile(path);
                    Object.assign(merged, JSON.parse(content));
                }
            } catch { /* ignore */ }
            return merged;
        }
        for (let shard = 0; shard < NUM_SHARDS; shard++) {
            const path = this.shardPath(root, typeKey, shard);
            try {
                if (await this.fs.exists(path)) {
                    const content = await this.fs.readFile(path);
                    Object.assign(merged, JSON.parse(content));
                }
            } catch { /* ignore */ }
        }
        return merged;
    }
}

// ── 搜索评分 ──

/**
 * 计算单条条目与查询的匹配分数。
 *
 * 评分模型：
 * - 标题：完全=200, 前缀=150, 包含=100
 * - 别名：完全=120, 前缀=90, 包含=60
 * - 作者：完全=80, 包含=50
 * - 朝代：包含=30
 * - 类型加成：work ×1.1, collection ×1.05
 * - 资源加成：有文字+15, 有图片+10
 * - 同分按标题长度升序（更短=更精确）
 */
/** 简体搜索索引中每条记录的格式 */
export interface SearchSEntry {
    /** 简体标题 */
    t?: string;
    /** 简体作者 */
    a?: string;
    /** 简体别名列表 */
    at?: string[];
    /** 简体附载篇目列表 */
    axt?: string[];
}

/** 简体搜索索引：id → 简体文本字段 */
export type SearchSIndex = Record<string, SearchSEntry>;

export function scoreEntry(entry: IndexEntry, query: string): number {
    const q = query.toLowerCase();

    // 标题和别名取最高分（不累加）
    let nameScore = 0;
    const title = entry.title.toLowerCase();
    if (title === q) {
        nameScore = 200;
    } else if (title.startsWith(q)) {
        nameScore = 150;
    } else if (title.includes(q)) {
        nameScore = 100;
    }

    // 别名 + 附载篇目均参与匹配
    const allAliases = [...(entry.additional_titles || []), ...(entry.attached_texts || [])];
    for (const alias of allAliases) {
        const a = alias.toLowerCase();
        if (a === q) {
            nameScore = Math.max(nameScore, 120);
        } else if (a.startsWith(q)) {
            nameScore = Math.max(nameScore, 90);
        } else if (a.includes(q)) {
            nameScore = Math.max(nameScore, 60);
        }
    }

    // author（独立维度）
    let authorScore = 0;
    if (entry.author) {
        const author = entry.author.toLowerCase();
        if (author === q) {
            authorScore = 80;
        } else if (author.includes(q)) {
            authorScore = 50;
        }
    }

    // dynasty
    let dynastyScore = 0;
    if (entry.dynasty && entry.dynasty.toLowerCase().includes(q)) {
        dynastyScore = 30;
    }

    // 总分 = 名称得分（最高） + 作者/朝代（仅当名称未匹配时作为主分，否则不加）
    let score = nameScore;
    if (score === 0) {
        score = Math.max(authorScore, dynastyScore);
    }

    if (score === 0) return 0;

    // 标题越短 = 匹配越精确，微调
    score += Math.max(0, 20 - title.length);

    // 类型加成
    if (entry.type === 'work') {
        score = Math.round(score * 1.05);
    } else if (entry.type === 'collection') {
        score = Math.round(score * 1.02);
    }

    // 资源加成（微小，不应反转排序）
    if (entry.has_text) score += 3;
    if (entry.has_image) score += 2;

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
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // 同分按标题长度升序（更短=更精确的匹配）
        return a.entry.title.length - b.entry.title.length;
    });
    return scored.map(s => s.entry);
}

/**
 * 带繁简双索引的相关度排序。
 *
 * 对每条记录同时用原文和简体文本评分，取较高分。
 * simplifiedMap 来自预构建的 search_s.json 或运行时 opencc-js 转换。
 *
 * @param entries 原始索引条目
 * @param query 用户查询词（原文）
 * @param queryS 简体化的查询词（若与 query 相同可省略）
 * @param simplifiedMap 简体搜索索引
 */
export function rankByRelevanceWithSimplified(
    entries: IndexEntry[],
    query: string,
    queryS: string | undefined,
    simplifiedMap: SearchSIndex,
): IndexEntry[] {
    const scored = entries.map(e => {
        // 原文匹配
        const originalScore = scoreEntry(e, query);

        // 简体匹配
        let simplifiedScore = 0;
        const s = simplifiedMap[e.id];
        if (s && queryS) {
            const sEntry: IndexEntry = {
                ...e,
                title: s.t ?? e.title,
                author: s.a ?? e.author,
                additional_titles: s.at ?? e.additional_titles,
                attached_texts: s.axt ?? e.attached_texts,
            };
            simplifiedScore = scoreEntry(sEntry, queryS);
        }

        return { entry: e, score: Math.max(originalScore, simplifiedScore) };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.entry.title.length - b.entry.title.length;
    });

    return scored.map(s => s.entry);
}
