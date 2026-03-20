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

                next();
            });
        },
    };
}
