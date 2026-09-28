/**
 * dev app 古籍总目示例页（N4a）的数据：从 book-index（生产）的 Work 现场算分类树和分页卡片。
 * 口径与网站构建期索引（N4b）一致，都走 src/components/catalog/model.ts。
 * 首次请求遍历全部 Work 文件（约 9.5 万个），之后按进程缓存。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    buildCatalogTree, catalogNodeIdsOf, compareCatalogCards, toCatalogWorkCard,
    catalogPageCount, CATALOG_ALL_ID, CATALOG_PAGE_SIZE,
    type ClassificRow, type CatalogWorkSource,
} from '../src/components/catalog/model';
import type { CatalogNode, CatalogWorkCard } from '../src/types';

interface CatalogData {
    tree: CatalogNode[];
    /** 节点 id → 该子树的卡片（已排序） */
    byNode: Map<string, CatalogWorkCard[]>;
    all: CatalogWorkCard[];
}

const cache = new Map<string, CatalogData>();

function walkJson(dir: string, out: string[]) {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
        const p = path.join(dir, n);
        if (n.endsWith('.json')) out.push(p);
        else if (!n.includes('.')) {
            // 分片目录是单字符；条目自带的资产目录（{ID}/）也不含点，一并进去但里面没有 Work JSON 顶层字段
            if (n.length === 1) walkJson(p, out);
        }
    }
}

export function loadCatalog(workspaceRoot: string): CatalogData {
    const repo = path.join(workspaceRoot, 'book-index');
    const hit = cache.get(repo);
    if (hit) return hit;

    const files: string[] = [];
    walkJson(path.join(repo, 'Work'), files);
    let order: ClassificRow[] = [];
    try { order = JSON.parse(fs.readFileSync(path.join(repo, 'classific.json'), 'utf-8')); } catch { /* 无表按名称排 */ }

    const works: (CatalogWorkSource & { type?: string })[] = [];
    for (const f of files) {
        try {
            const w = JSON.parse(fs.readFileSync(f, 'utf-8'));
            if (w && w.type === 'work' && w.id && !w.merged_into) works.push(w);
        } catch { /* 坏文件跳过 */ }
    }

    const tree = buildCatalogTree(works, order);
    const byNode = new Map<string, CatalogWorkCard[]>();
    const all: CatalogWorkCard[] = [];
    for (const w of works) {
        const card = toCatalogWorkCard(w);
        all.push(card);
        for (const id of catalogNodeIdsOf(w.classification)) {
            let list = byNode.get(id);
            if (!list) byNode.set(id, list = []);
            list.push(card);
        }
    }
    all.sort(compareCatalogCards);
    for (const list of byNode.values()) list.sort(compareCatalogCards);

    const data = { tree, byNode, all };
    cache.set(repo, data);
    return data;
}

export function catalogWorksPage(workspaceRoot: string, node: string | null, page: number) {
    const data = loadCatalog(workspaceRoot);
    const list = !node || node === CATALOG_ALL_ID ? data.all : data.byNode.get(node);
    if (!list) return null;
    const pageCount = catalogPageCount(list.length);
    if (page < 1 || page > pageCount) return null;
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    return { works: list.slice(start, start + CATALOG_PAGE_SIZE), page, pageCount, total: list.length };
}
