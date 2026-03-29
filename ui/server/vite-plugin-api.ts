/**
 * Vite 插件：本地开发 API 中间件
 * 读取 WSL 文件系统中的 book-index / book-index-draft 数据
 * 暴露与 HttpTransport 兼容的 REST API
 */

import type { Plugin, ViteDevServer } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

/** 繁→简转换器（懒加载 opencc-js） */
let t2sConverter: ((text: string) => string) | null | false = null; // null=未加载, false=不可用

async function ensureT2S(): Promise<((text: string) => string) | null> {
    if (t2sConverter === false) return null;
    if (t2sConverter) return t2sConverter;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const OpenCC = await (Function('return import("opencc-js")')() as Promise<any>);
        t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' }) as (text: string) => string;
        return t2sConverter as (text: string) => string;
    } catch {
        t2sConverter = false;
        return null;
    }
}

/**
 * 搜索匹配：统一在简体空间比较。
 * query 是原文小写，queryS 是简体小写，textS 是字段文本的简体小写。
 * 原文匹配 OR 简体匹配。
 */
function matchesQuery(
    text: string | undefined,
    query: string,
    queryS: string | undefined,
    t2s: ((t: string) => string) | null,
): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    if (lower.includes(query)) return true;
    if (queryS && t2s) {
        const textS = t2s(text).toLowerCase();
        if (textS.includes(queryS)) return true;
    }
    return false;
}

/** 索引条目（允许任意扩展字段） */
interface IndexFileEntry {
    id: string;
    title: string;
    type: string;
    path: string;
    author: string;
    year: string;
    holder: string;
    dynasty?: string;
    role?: string;
    [key: string]: unknown;
}

interface IndexFile {
    books: Record<string, IndexFileEntry>;
    collections: Record<string, IndexFileEntry>;
    works: Record<string, IndexFileEntry>;
}

const TYPE_MAP: Record<string, keyof IndexFile> = {
    book: 'books',
    collection: 'collections',
    work: 'works',
};

const NUM_SHARDS = 16;

/** 从分片文件加载合并索引 */
function loadIndex(repoRoot: string): IndexFile {
    const result: IndexFile = { books: {}, collections: {}, works: {} };

    // collections (single file)
    const colPath = path.join(repoRoot, 'index', 'collections.json');
    try {
        if (fs.existsSync(colPath)) {
            result.collections = JSON.parse(fs.readFileSync(colPath, 'utf-8'));
        }
    } catch { /* ignore */ }

    // books and works (16 shards each)
    for (const typeKey of ['books', 'works'] as const) {
        for (let i = 0; i < NUM_SHARDS; i++) {
            const shardPath = path.join(repoRoot, 'index', typeKey, `${i.toString(16)}.json`);
            try {
                if (fs.existsSync(shardPath)) {
                    Object.assign(result[typeKey], JSON.parse(fs.readFileSync(shardPath, 'utf-8')));
                }
            } catch { /* ignore */ }
        }
    }

    return result;
}

function getAllEntries(workspaceRoot: string, type: string) {
    const typeKey = TYPE_MAP[type];
    if (!typeKey) return [];

    const entries: any[] = [];
    for (const folder of ['book-index', 'book-index-draft']) {
        const repoRoot = path.join(workspaceRoot, folder);
        const index = loadIndex(repoRoot);
        const section = index[typeKey] || {};
        const isDraft = folder === 'book-index-draft';

        for (const [id, entry] of Object.entries(section)) {
            // has_collated：优先读索引，否则运行时检测目录
            let hasCollated = (entry as any).has_collated;
            if (hasCollated === undefined && entry.path && type === 'work') {
                const entryDir = path.join(workspaceRoot, folder, path.dirname(entry.path), id, 'collated_edition');
                hasCollated = fs.existsSync(entryDir) || undefined;
            }

            entries.push({
                ...entry,
                id,
                type,
                isDraft,
                has_collated: hasCollated || undefined,
            });
        }
    }
    return entries;
}

function findItemFile(workspaceRoot: string, id: string): string | null {
    const prefix = id.padEnd(3, '_').substring(0, 3);
    const [c1, c2, c3] = [prefix[0], prefix[1], prefix[2]];

    for (const folder of ['book-index', 'book-index-draft']) {
        for (const typeDir of ['Book', 'Collection', 'Work']) {
            const searchDir = path.join(workspaceRoot, folder, typeDir, c1, c2, c3);
            try {
                if (!fs.existsSync(searchDir)) continue;
                const files = fs.readdirSync(searchDir);
                const match = files.find(f => f.startsWith(`${id}-`) && f.endsWith('.json'));
                if (match) return path.join(searchDir, match);
            } catch { /* ignore */ }
        }
    }
    return null;
}

// ── Catalog volume 缓存 ──

interface CatalogVolumeInfo {
    resource_name: string;
    resource_id: string;
    expected_volumes?: number;
    missing_vols?: number[];
    volumes: Array<{ volume: number; status?: string; url?: string; label?: string }>;
}

/** book_id → CatalogVolumeInfo[] 缓存（懒加载） */
let catalogVolumeCache: Map<string, CatalogVolumeInfo[]> | null = null;

function buildCatalogVolumeCache(workspaceRoot: string): Map<string, CatalogVolumeInfo[]> {
    const cache = new Map<string, CatalogVolumeInfo[]>();

    for (const folder of ['book-index', 'book-index-draft']) {
        const collectionBase = path.join(workspaceRoot, folder, 'Collection');
        if (!fs.existsSync(collectionBase)) continue;
        walkCatalogs(collectionBase, (catalogData, resourceId) => {
            const books = catalogData.books as Array<Record<string, unknown>> | undefined;
            if (!books) return;
            const resName = (catalogData.resource_name || '') as string;

            for (const book of books) {
                const bookId = book.book_id as string;
                if (!bookId) continue;
                const rawVolumes = book.volumes as unknown[];
                if (!rawVolumes || rawVolumes.length === 0) continue;
                // 只处理对象数组格式（有 URL 的）
                if (typeof rawVolumes[0] !== 'object') continue;

                const volumes: CatalogVolumeInfo['volumes'] = [];
                for (const v of rawVolumes as Array<Record<string, unknown>>) {
                    // 根据 resource_id 选择最匹配的 URL
                    let url: string | undefined;
                    if (resourceId === 'ntul' && v.tw_url) {
                        url = v.tw_url as string;
                    } else {
                        url = (v.url || v.wiki_url || v.tw_url) as string | undefined;
                    }
                    volumes.push({
                        volume: v.volume as number,
                        status: (v.status as string) || 'found',
                        url,
                        label: v.file as string | undefined,
                    });
                }

                const info: CatalogVolumeInfo = {
                    resource_name: resName,
                    resource_id: resourceId,
                    expected_volumes: book.expected_volumes as number | undefined,
                    missing_vols: book.missing_vols as number[] | undefined,
                    volumes,
                };

                if (!cache.has(bookId)) cache.set(bookId, []);
                cache.get(bookId)!.push(info);
            }
        });
    }

    return cache;
}

function walkCatalogs(
    base: string,
    callback: (data: Record<string, unknown>, resourceId: string) => void,
): void {
    for (const c1 of safeReaddir(base)) {
        const c1p = path.join(base, c1);
        if (!safeStat(c1p)?.isDirectory()) continue;
        for (const c2 of safeReaddir(c1p)) {
            const c2p = path.join(c1p, c2);
            if (!safeStat(c2p)?.isDirectory()) continue;
            for (const c3 of safeReaddir(c2p)) {
                const c3p = path.join(c2p, c3);
                if (!safeStat(c3p)?.isDirectory()) continue;
                for (const idDir of safeReaddir(c3p)) {
                    const idp = path.join(c3p, idDir);
                    if (!safeStat(idp)?.isDirectory()) continue;
                    for (const resDir of safeReaddir(idp)) {
                        const f = path.join(idp, resDir, 'volume_book_mapping.json');
                        if (fs.existsSync(f)) {
                            try { callback(JSON.parse(fs.readFileSync(f, 'utf-8')), resDir); }
                            catch { /* ignore */ }
                        }
                    }
                }
            }
        }
    }
}

function safeReaddir(dir: string): string[] {
    try { return fs.readdirSync(dir); } catch { return []; }
}

function safeStat(p: string) {
    try { return fs.statSync(p); } catch { return null; }
}

/**
 * 从缓存中查找 catalog volume 信息并注入到 Book 资源中。
 */
function enrichResourcesFromCatalog(
    workspaceRoot: string,
    bookId: string,
    data: Record<string, unknown>,
): void {
    const resources = data.resources as Array<Record<string, unknown>> | undefined;
    if (!resources || resources.length === 0) return;

    if (!catalogVolumeCache) {
        catalogVolumeCache = buildCatalogVolumeCache(workspaceRoot);
    }

    const infos = catalogVolumeCache.get(bookId);
    if (!infos) return;

    for (const info of infos) {
        // 匹配资源：按 resource_name 或 id
        let target = resources.find(r =>
            r.short_name === info.resource_name || r.name === info.resource_name
        );
        if (!target && info.resource_name) {
            target = resources.find(r =>
                typeof r.name === 'string' && r.name.includes(info.resource_name.slice(0, 4))
            );
        }
        if (!target) continue;

        // 构建完整的 volumes 列表（包含缺失册）
        const allVolumes = [...info.volumes];
        if (info.missing_vols) {
            for (const mv of info.missing_vols) {
                if (!allVolumes.find(v => v.volume === mv)) {
                    allVolumes.push({ volume: mv, status: 'missing' });
                }
            }
            allVolumes.sort((a, b) => a.volume - b.volume);
        }

        target.volumes = allVolumes;
        target.expected_volumes = info.expected_volumes || allVolumes.length;
    }
}

export function bookIndexApiPlugin(workspaceRoot: string): Plugin {
    return {
        name: 'book-index-api',
        configureServer(server: ViteDevServer) {
            server.middlewares.use((req, res, next) => {
                const url = new URL(req.url || '', `http://${req.headers.host}`);
                const pathname = url.pathname;

                // 设置 JSON 响应头
                const sendJson = (data: unknown, status = 200) => {
                    res.statusCode = status;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                };

                // GET /api/entries?type=book&page=1&pageSize=50&sortBy=title&sortOrder=asc
                if (pathname === '/api/entries' && req.method === 'GET') {
                    const type = url.searchParams.get('type') || 'book';
                    const page = parseInt(url.searchParams.get('page') || '1');
                    const pageSize = parseInt(url.searchParams.get('pageSize') || '50');
                    const sortBy = url.searchParams.get('sortBy') || 'title';
                    const sortOrder = url.searchParams.get('sortOrder') || 'asc';

                    let entries = getAllEntries(workspaceRoot, type);

                    // 排序
                    entries.sort((a: any, b: any) => {
                        const va = String(a[sortBy] ?? '');
                        const vb = String(b[sortBy] ?? '');
                        const cmp = va.localeCompare(vb, 'zh');
                        return sortOrder === 'asc' ? cmp : -cmp;
                    });

                    const total = entries.length;
                    const start = (page - 1) * pageSize;
                    const sliced = entries.slice(start, start + pageSize);

                    sendJson({ entries: sliced, total, page, pageSize });
                    return;
                }

                // GET /api/search?q=xxx&type=book&page=1&pageSize=50
                if (pathname === '/api/search' && req.method === 'GET') {
                    (async () => {
                        const query = (url.searchParams.get('q') || '').toLowerCase();
                        const type = url.searchParams.get('type') || 'book';
                        const page = parseInt(url.searchParams.get('page') || '1');
                        const pageSize = parseInt(url.searchParams.get('pageSize') || '50');

                        const t2s = await ensureT2S();
                        const queryS = t2s ? t2s(query).toLowerCase() : undefined;

                        let entries = getAllEntries(workspaceRoot, type);

                        if (query) {
                            entries = entries.filter((e: any) =>
                                matchesQuery(e.title, query, queryS, t2s) ||
                                matchesQuery(e.id, query, queryS, t2s) ||
                                matchesQuery(e.author, query, queryS, t2s)
                            );
                        }

                        const total = entries.length;
                        const start = (page - 1) * pageSize;
                        const sliced = entries.slice(start, start + pageSize);

                        sendJson({ entries: sliced, total, page, pageSize });
                    })().catch(() => sendJson({ error: 'Search error' }, 500));
                    return;
                }

                // GET /api/search-all?q=xxx&limit=5
                if (pathname === '/api/search-all' && req.method === 'GET') {
                    (async () => {
                        const query = (url.searchParams.get('q') || '').toLowerCase();
                        const limit = parseInt(url.searchParams.get('limit') || '5');

                        const t2s = await ensureT2S();
                        const queryS = t2s ? t2s(query).toLowerCase() : undefined;

                        const result: Record<string, unknown> = {};
                        for (const [type, key] of [['work', 'works'], ['book', 'books'], ['collection', 'collections']] as const) {
                            let entries = getAllEntries(workspaceRoot, type);
                            if (query) {
                                entries = entries.filter((e: any) =>
                                    matchesQuery(e.title, query, queryS, t2s) ||
                                    matchesQuery(e.id, query, queryS, t2s) ||
                                    matchesQuery(e.author, query, queryS, t2s) ||
                                    (e.additional_titles || []).some((at: string) => matchesQuery(at, query, queryS, t2s))
                                );
                            }
                            result[key] = entries.slice(0, limit);
                            result[`total${key.charAt(0).toUpperCase() + key.slice(1)}` as string] = entries.length;
                        }

                        sendJson(result);
                    })().catch(() => sendJson({ error: 'Search error' }, 500));
                    return;
                }

                // GET /api/items/:id
                if (pathname.startsWith('/api/items/') && req.method === 'GET') {
                    const id = decodeURIComponent(pathname.slice('/api/items/'.length));
                    const filePath = findItemFile(workspaceRoot, id);

                    if (!filePath) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }

                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const data = JSON.parse(content);
                        // 附加 has_collated：检测 collated_edition 子目录
                        if (data.type === 'Work') {
                            const collatedDir = path.join(path.dirname(filePath), id, 'collated_edition');
                            if (fs.existsSync(collatedDir)) {
                                data.has_collated = true;
                            }
                        }
                        // 附加 has_catalog：检测子目录下的 *_catalog.json
                        {
                            const itemDir = path.join(path.dirname(filePath), id);
                            if (fs.existsSync(itemDir)) {
                                try {
                                    for (const sub of fs.readdirSync(itemDir)) {
                                        const subDir = path.join(itemDir, sub);
                                        if (!fs.statSync(subDir).isDirectory()) continue;
                                        const catalogFiles = fs.readdirSync(subDir).filter((f: string) => f.endsWith('_catalog.json'));
                                        if (catalogFiles.length > 0) {
                                            data.has_catalog = true;
                                            break;
                                        }
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                        // Book 类型：从 catalog 注入分册信息
                        if (data.type === 'Book') {
                            enrichResourcesFromCatalog(workspaceRoot, id, data);
                        }
                        sendJson(data);
                    } catch {
                        sendJson({ error: 'Read error' }, 500);
                    }
                    return;
                }

                // GET /api/collated/:id — 整理本卷列表
                if (pathname.match(/^\/api\/collated\/[^/]+$/) && req.method === 'GET') {
                    const id = decodeURIComponent(pathname.slice('/api/collated/'.length));
                    const itemFile = findItemFile(workspaceRoot, id);
                    if (!itemFile) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }

                    const dir = path.dirname(itemFile);
                    const assetDir = path.join(dir, id, 'collated_edition');

                    if (!fs.existsSync(assetDir)) {
                        sendJson({ error: 'No collated edition' }, 404);
                        return;
                    }

                    try {
                        const files = fs.readdirSync(assetDir)
                            .filter((f: string) => f.endsWith('.json') && f !== 'juan_groups.json')
                            .sort((a: string, b: string) => {
                                // juanshouX < juanXXX < fulu
                                const order = (name: string) => {
                                    if (name.startsWith('juanshou')) return 0;
                                    if (name.startsWith('juan')) return 1;
                                    return 2; // fulu etc
                                };
                                const oa = order(a), ob = order(b);
                                if (oa !== ob) return oa - ob;
                                return a.localeCompare(b);
                            });
                        const result: Record<string, unknown> = {
                            work_id: id,
                            total_juan: files.length,
                            juan_files: files,
                        };
                        const groupsFile = path.join(assetDir, 'juan_groups.json');
                        if (fs.existsSync(groupsFile)) {
                            try {
                                result.juan_groups = JSON.parse(fs.readFileSync(groupsFile, 'utf-8'));
                            } catch { /* ignore */ }
                        }
                        sendJson(result);
                    } catch {
                        sendJson({ error: 'Read error' }, 500);
                    }
                    return;
                }

                // GET /api/collated/:id/:juanFile — 整理本单卷内容
                if (pathname.match(/^\/api\/collated\/[^/]+\/[^/]+$/) && req.method === 'GET') {
                    const parts = pathname.slice('/api/collated/'.length).split('/');
                    const id = decodeURIComponent(parts[0]);
                    const juanFile = decodeURIComponent(parts[1]);

                    // 安全检查
                    if (juanFile.includes('..') || !juanFile.endsWith('.json')) {
                        sendJson({ error: 'Invalid file name' }, 400);
                        return;
                    }

                    const itemFile = findItemFile(workspaceRoot, id);
                    if (!itemFile) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }

                    const filePath = path.join(path.dirname(itemFile), id, 'collated_edition', juanFile);
                    if (!fs.existsSync(filePath)) {
                        sendJson({ error: 'Juan not found' }, 404);
                        return;
                    }

                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        sendJson(JSON.parse(content));
                    } catch {
                        sendJson({ error: 'Read error' }, 500);
                    }
                    return;
                }

                // GET /api/work-catalog/:id — Work 下的分类目录 (*_catalog.json)
                if (pathname.startsWith('/api/work-catalog/') && req.method === 'GET') {
                    const id = decodeURIComponent(pathname.slice('/api/work-catalog/'.length));
                    const itemFile = findItemFile(workspaceRoot, id);
                    if (!itemFile) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }
                    const itemDir = path.join(path.dirname(itemFile), id);
                    const results: Array<{ source: string; data: unknown }> = [];
                    if (fs.existsSync(itemDir)) {
                        try {
                            for (const sub of fs.readdirSync(itemDir)) {
                                const subDir = path.join(itemDir, sub);
                                if (!fs.statSync(subDir).isDirectory()) continue;
                                for (const file of fs.readdirSync(subDir)) {
                                    if (file.endsWith('_catalog.json')) {
                                        const content = fs.readFileSync(path.join(subDir, file), 'utf-8');
                                        results.push({ source: sub, data: JSON.parse(content) });
                                    }
                                }
                            }
                        } catch { /* ignore */ }
                    }
                    if (results.length === 0) {
                        sendJson({ error: 'No catalog data' }, 404);
                        return;
                    }
                    sendJson(results);
                    return;
                }

                // GET /api/catalog/:id — 丛编目录 (volume_book_mapping.json)
                // 扫描 {dir}/{id}/{resourceId}/volume_book_mapping.json
                if (pathname.startsWith('/api/catalog/') && req.method === 'GET') {
                    const id = decodeURIComponent(pathname.slice('/api/catalog/'.length));
                    const itemFile = findItemFile(workspaceRoot, id);

                    if (!itemFile) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }

                    const dir = path.dirname(itemFile);
                    const idDir = path.join(dir, id);

                    // 读取 Collection JSON 获取资源列表
                    let resources: Array<{ id: string; short_name?: string }> = [];
                    try {
                        const itemContent = fs.readFileSync(itemFile, 'utf-8');
                        const itemData = JSON.parse(itemContent);
                        resources = (itemData.resources || []).map((r: any) => ({
                            id: r.id,
                            short_name: r.short_name,
                        }));
                    } catch { /* ignore */ }

                    const catalogs: Array<{ resource_id: string; short_name?: string; data: any }> = [];

                    if (fs.existsSync(idDir)) {
                        try {
                            const subdirs = fs.readdirSync(idDir).filter((f: string) => {
                                return fs.statSync(path.join(idDir, f)).isDirectory();
                            });
                            for (const subdir of subdirs) {
                                const mappingFile = path.join(idDir, subdir, 'volume_book_mapping.json');
                                if (fs.existsSync(mappingFile)) {
                                    const content = fs.readFileSync(mappingFile, 'utf-8');
                                    const resource = resources.find(r => r.id === subdir);
                                    catalogs.push({
                                        resource_id: subdir,
                                        short_name: resource?.short_name,
                                        data: JSON.parse(content),
                                    });
                                }
                            }
                        } catch { /* ignore */ }
                    }

                    if (catalogs.length === 0) {
                        sendJson({ error: 'No catalog data' }, 404);
                        return;
                    }

                    sendJson(catalogs);
                    return;
                }

                // GET /api/resource-progress — 叢書目錄整理進度
                if (pathname === '/api/resource-progress' && req.method === 'GET') {
                    const resourceFile = path.join(workspaceRoot, 'book-index-draft', 'resource.json');
                    if (!fs.existsSync(resourceFile)) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }
                    try {
                        const content = fs.readFileSync(resourceFile, 'utf-8');
                        sendJson(JSON.parse(content));
                    } catch {
                        sendJson({ error: 'Failed to read resource.json' }, 500);
                    }
                    return;
                }

                // GET /api/resource-site-progress — 在線資源網站整理進度
                if (pathname === '/api/resource-site-progress' && req.method === 'GET') {
                    const resourceFile = path.join(workspaceRoot, 'book-index-draft', 'resource-site.json');
                    if (!fs.existsSync(resourceFile)) {
                        sendJson({ error: 'Not found' }, 404);
                        return;
                    }
                    try {
                        const content = fs.readFileSync(resourceFile, 'utf-8');
                        sendJson(JSON.parse(content));
                    } catch {
                        sendJson({ error: 'Failed to read resource-site.json' }, 500);
                    }
                    return;
                }

                next();
            });
        },
    };
}
