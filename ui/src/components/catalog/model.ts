/**
 * 古籍总目的数据派生：Work → 分类树 / 作品卡片。
 *
 * 组件本身只收 props（CatalogNode[] / CatalogWorkCard[]），不取数。这里的函数给
 * dev app 现场算树用，网站构建期脚本（N4b）也可以直接复用，保证两边口径一致：
 * - 节点 id = 各级分类名以「/」连接，如 `史部/紀傳類`；没有分类的作品归顶层「未分類」，id 为 `未分類`
 *   （部、类下的「未分類」如 `史部/未分類` 是普通节点；同名类如各部的「總類」按完整路径区分）
 * - count = 整棵子树的作品数（只分到部、没分到类的作品计入部，不另开「未细分」节点）
 * - 同级顺序按 classific.json 的出现顺序（2026-09-30 起为《中国古籍总目》词表，五部含「叢書部」，
 *   overview#292），表里没有的排在后面按名称；各级的「未分類」一律放在同级最后
 *   （词表里它排在每部、每类的最前）。没有作品的分类（如目前的叢書部）不出现
 */
import type { CatalogNode, CatalogWorkCard, WorkClassification } from '../../types';

/** 未分类节点的 id / 显示名 */
export const CATALOG_UNCLASSIFIED_ID = '未分類';
/** 「全部」行的 id（树里不存在这个节点；selectedId 为它或为空都表示全部） */
export const CATALOG_ALL_ID = 'all';
/** 每页作品数 */
export const CATALOG_PAGE_SIZE = 20;

/** classific.json 的一行 */
export interface ClassificRow {
    cata_l1: string;
    cata_l2?: string;
    cata_l3?: string;
    cata_l4?: string;
}

/** 分类路径（去掉空串的各级），无分类返回 [] */
export function classificationPath(cls: WorkClassification | null | undefined): string[] {
    if (!cls) return [];
    const out: string[] = [];
    for (const v of [cls.l1, cls.l2, cls.l3, cls.l4]) {
        const s = (v ?? '').trim();
        if (!s) break;
        out.push(s);
    }
    return out;
}

/** 作品所在节点的 id（最深一级）；无分类为 CATALOG_UNCLASSIFIED_ID */
export function catalogNodeIdOf(cls: WorkClassification | null | undefined): string {
    const p = classificationPath(cls);
    return p.length ? p.join('/') : CATALOG_UNCLASSIFIED_ID;
}

/** 作品计入哪些节点（祖先链全部 +1）；无分类只计入「未分類」 */
export function catalogNodeIdsOf(cls: WorkClassification | null | undefined): string[] {
    const p = classificationPath(cls);
    if (!p.length) return [CATALOG_UNCLASSIFIED_ID];
    return p.map((_, i) => p.slice(0, i + 1).join('/'));
}

interface MutNode { id: string; label: string; count: number; children: Map<string, MutNode> }

/**
 * 由作品分类算树。`order` 传 classific.json 的内容，决定同级顺序。
 * 没有作品的分类不出现（计数为 0 的节点只会让树变长）。
 */
export function buildCatalogTree(
    works: Iterable<{ classification?: WorkClassification | null }>,
    order: ClassificRow[] = [],
): CatalogNode[] {
    const rank = new Map<string, number>();
    order.forEach((r, i) => {
        const p = [r.cata_l1, r.cata_l2, r.cata_l3, r.cata_l4].filter((x): x is string => !!x);
        p.forEach((_, j) => {
            const id = p.slice(0, j + 1).join('/');
            if (!rank.has(id)) rank.set(id, i);
        });
    });

    const root = new Map<string, MutNode>();
    let unclassified = 0;
    for (const w of works) {
        const p = classificationPath(w.classification);
        if (!p.length) { unclassified++; continue; }
        let level = root;
        p.forEach((label, i) => {
            const id = p.slice(0, i + 1).join('/');
            let n = level.get(label);
            if (!n) { n = { id, label, count: 0, children: new Map() }; level.set(label, n); }
            n.count++;
            level = n.children;
        });
    }

    const finish = (m: Map<string, MutNode>): CatalogNode[] => [...m.values()]
        .sort((a, b) => {
            const ua = a.label === CATALOG_UNCLASSIFIED_ID ? 1 : 0;
            const ub = b.label === CATALOG_UNCLASSIFIED_ID ? 1 : 0;
            if (ua !== ub) return ua - ub;
            const ra = rank.get(a.id) ?? Infinity;
            const rb = rank.get(b.id) ?? Infinity;
            if (ra !== rb) return ra - rb;
            return a.label.localeCompare(b.label, 'zh');
        })
        .map(n => {
            const node: CatalogNode = { id: n.id, label: n.label, count: n.count };
            if (n.children.size) node.children = finish(n.children);
            return node;
        });

    const tree = finish(root);
    if (unclassified > 0) tree.push({ id: CATALOG_UNCLASSIFIED_ID, label: CATALOG_UNCLASSIFIED_ID, count: unclassified });
    return tree;
}

/** 从根到 id 的节点链；找不到返回 [] */
export function findCatalogPath(tree: CatalogNode[], id: string | null | undefined): CatalogNode[] {
    if (!id) return [];
    for (const n of tree) {
        if (n.id === id) return [n];
        if (n.children) {
            const sub = findCatalogPath(n.children, id);
            if (sub.length) return [n, ...sub];
        }
    }
    return [];
}

/** 顶层节点计数之和（「全部」的数目） */
export function catalogTotal(tree: CatalogNode[]): number {
    return tree.reduce((s, n) => s + n.count, 0);
}

/** Work JSON 里卡片要用到的字段（宽松，兼容索引分片与完整条目） */
export interface CatalogWorkSource {
    id: string;
    title?: string;
    juan_count?: { number?: number; description?: string } | number | null;
    measure_info?: string;
    dynasty?: string;
    authors?: { name?: string; dynasty?: string }[];
    description?: { text?: string } | string | null;
    classification?: WorkClassification | null;
}

/** 提要去掉 markdown 强调记号（`**` / `__`），卡片上只显示纯文字 */
function plainSummary(text: string | undefined): string {
    return (text ?? '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
}

/** Work → 卡片 */
export function toCatalogWorkCard(w: CatalogWorkSource): CatalogWorkCard {
    const card: CatalogWorkCard = { id: w.id, title: w.title || w.id };
    const jc = w.juan_count;
    const juanNum = typeof jc === 'number' ? jc : jc?.number;
    if (typeof juanNum === 'number' && juanNum > 0) card.juan = juanNum;
    else if (w.measure_info) card.juan = w.measure_info;
    const authors = (w.authors ?? [])
        .filter(a => a?.name)
        .map(a => {
            const dynasty = a.dynasty || (w.authors!.length === 1 ? w.dynasty : undefined);
            return dynasty ? { name: a.name!, dynasty } : { name: a.name! };
        });
    if (authors.length) card.authors = authors;
    const summary = plainSummary(typeof w.description === 'string' ? w.description : w.description?.text);
    if (summary) card.summary = summary;
    const cls = classificationPath(w.classification);
    if (cls.length) card.classification = cls;
    return card;
}

/** 页内排序：有提要优先，再按书名 */
export function compareCatalogCards(a: CatalogWorkCard, b: CatalogWorkCard): number {
    const sa = a.summary ? 0 : 1;
    const sb = b.summary ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title, 'zh');
}

/** 页数（至少 1） */
export function catalogPageCount(total: number, pageSize = CATALOG_PAGE_SIZE): number {
    return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * 页码条：总是显示首末页与当前页左右各 `radius` 页，其余折成省略号（null）。
 * 例：page=7, count=20 → [1, null, 5, 6, 7, 8, 9, null, 20]
 */
export function paginationItems(page: number, pageCount: number, radius = 2): (number | null)[] {
    if (pageCount <= 1) return [1];
    const set = new Set<number>([1, pageCount]);
    for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= pageCount) set.add(p);
    const nums = [...set].sort((a, b) => a - b);
    const out: (number | null)[] = [];
    nums.forEach((n, i) => {
        if (i > 0) {
            const gap = n - nums[i - 1];
            if (gap === 2) out.push(n - 1);       // 只隔一页就直接显示，不用省略号
            else if (gap > 2) out.push(null);
        }
        out.push(n);
    });
    return out;
}
