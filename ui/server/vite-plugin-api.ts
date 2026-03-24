/**
 * Vite 插件：本地开发 API 中间件
 * 读取 WSL 文件系统中的 book-index / book-index-draft 数据
 * 暴露与 HttpTransport 兼容的 REST API
 */

import type { Plugin, ViteDevServer } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

/** index.json 中的条目 */
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

function loadIndex(indexPath: string): IndexFile {
    const defaultIndex: IndexFile = { books: {}, collections: {}, works: {} };
    try {
        if (!fs.existsSync(indexPath)) return defaultIndex;
        const content = fs.readFileSync(indexPath, 'utf-8');
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

function getAllEntries(workspaceRoot: string, type: string) {
    const typeKey = TYPE_MAP[type];
    if (!typeKey) return [];

    const entries: any[] = [];
    for (const folder of ['book-index', 'book-index-draft']) {
        const indexPath = path.join(workspaceRoot, folder, 'index.json');
        const index = loadIndex(indexPath);
        const section = index[typeKey] || {};
        const isDraft = folder === 'book-index-draft';

        for (const [id, entry] of Object.entries(section)) {
            entries.push({
                id,
                title: entry.title,
                type,
                isDraft,
                author: entry.author || undefined,
                dynasty: entry.dynasty || undefined,
                role: entry.role || undefined,
                path: entry.path,
                additional_titles: (entry as any).additional_titles,
                juan_count: (entry as any).juan_count,
                has_text: (entry as any).has_text,
                has_image: (entry as any).has_image,
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
                    const query = (url.searchParams.get('q') || '').toLowerCase();
                    const type = url.searchParams.get('type') || 'book';
                    const page = parseInt(url.searchParams.get('page') || '1');
                    const pageSize = parseInt(url.searchParams.get('pageSize') || '50');

                    let entries = getAllEntries(workspaceRoot, type);

                    if (query) {
                        entries = entries.filter((e: any) =>
                            e.title?.toLowerCase().includes(query) ||
                            e.id?.toLowerCase().includes(query) ||
                            e.author?.toLowerCase().includes(query)
                        );
                    }

                    const total = entries.length;
                    const start = (page - 1) * pageSize;
                    const sliced = entries.slice(start, start + pageSize);

                    sendJson({ entries: sliced, total, page, pageSize });
                    return;
                }

                // GET /api/search-all?q=xxx&limit=5
                if (pathname === '/api/search-all' && req.method === 'GET') {
                    const query = (url.searchParams.get('q') || '').toLowerCase();
                    const limit = parseInt(url.searchParams.get('limit') || '5');

                    const result: Record<string, unknown> = {};
                    for (const [type, key] of [['work', 'works'], ['book', 'books'], ['collection', 'collections']] as const) {
                        let entries = getAllEntries(workspaceRoot, type);
                        if (query) {
                            entries = entries.filter((e: any) =>
                                e.title?.toLowerCase().includes(query) ||
                                e.id?.toLowerCase().includes(query) ||
                                e.author?.toLowerCase().includes(query) ||
                                (e.additional_titles || []).some((t: string) => t?.toLowerCase().includes(query))
                            );
                        }
                        result[key] = entries.slice(0, limit);
                        result[`total${key.charAt(0).toUpperCase() + key.slice(1)}` as string] = entries.length;
                    }

                    sendJson(result);
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
                        sendJson(JSON.parse(content));
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

                next();
            });
        },
    };
}
