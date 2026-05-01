/**
 * 版本传承图数据辅助：将 Work.version_graph + 所有相关 Book.lineage
 * 合并成统一的 nodes/edges 数组，便于可视化组件直接消费。
 *
 * 不依赖任何渲染库，便于在 SSR/Node 中预处理。
 */

import type {
    BookDetailData,
    BookLineage,
    LineageConfidence,
    LineageDerivation,
    LineageRelation,
    LineageSibling,
    LineageStatus,
    VersionGraph,
    VersionGraphHypotheticalNode,
    WorkDetailData,
} from '../types';

/** 图节点：实存版本 + 假想祖本统一形态 */
export interface LineageGraphNode {
    id: string;
    /** 'book': 实存版本（Book）；'hypothetical': 已佚祖本/假想节点 */
    kind: 'book' | 'hypothetical';
    /** 显示标签（Book.title 或 hypothetical.label） */
    label: string;
    /** 数字年份（用于排序）。若仅有区间，取下界 */
    year?: number;
    /** 原始年代表述（Book）或假想节点 note */
    year_text?: string;
    year_uncertain?: boolean;
    year_range?: [number, number];
    /** 仅 book 节点：版本类别（抄本/刻本…） */
    category?: string;
    /** 仅 book 节点：现存状态 */
    status?: LineageStatus;
    extant_juan?: string;
    /** 分组 id（来自 work.version_graph.node_groups 或 hypothetical.group） */
    group?: string;
    note?: string;
}

/** 图边：派生关系（derived_from）或横向兄弟本（related_to） */
export interface LineageGraphEdge {
    /** 唯一 id（去重用） */
    id: string;
    source: string;
    target: string;
    /** 'derive': 父→子派生；'sibling': 横向兄弟本（无方向） */
    kind: 'derive' | 'sibling';
    relation: LineageRelation | string;
    confidence: LineageConfidence;
    evidence?: string;
    note?: string;
}

/** buildLineageGraph 返回结果 */
export interface LineageGraph {
    /** 所有节点（实存 book + 假想 hypothetical） */
    nodes: LineageGraphNode[];
    /** 所有边（派生 + 兄弟本） */
    edges: LineageGraphEdge[];
    /** 分组定义（来自 work.version_graph.groups） */
    groups: NonNullable<VersionGraph['groups']>;
    /** 图标题/描述（来自 work.version_graph） */
    title?: string;
    description?: string;
    layout: 'LR' | 'TB';
    /** 因 excluded_books 跳过的 Book ID */
    excluded: string[];
}

/** 假想节点 → 图节点 */
function hypoToNode(h: VersionGraphHypotheticalNode): LineageGraphNode {
    return {
        id: h.id,
        kind: 'hypothetical',
        label: h.label,
        year: h.year ?? h.year_range?.[0],
        year_range: h.year_range,
        year_uncertain: h.year_uncertain,
        group: h.group,
        note: h.note,
    };
}

/** Book → 图节点（仅当有 lineage 时） */
function bookToNode(b: BookDetailData, groupMap: Record<string, string>): LineageGraphNode | null {
    if (!b.lineage) return null;
    const lin: BookLineage = b.lineage;
    return {
        id: b.id,
        kind: 'book',
        label: b.title,
        year: lin.year,
        year_text: lin.year_text,
        year_uncertain: lin.year_uncertain,
        category: lin.category,
        status: lin.status,
        extant_juan: lin.extant_juan,
        group: groupMap[b.id],
        note: lin.note,
    };
}

/** derived_from[i] → 图边（child 已知，需要 child id） */
function derivationToEdge(childId: string, d: LineageDerivation, idx: number): LineageGraphEdge {
    return {
        id: `derive:${d.ref}->${childId}:${idx}`,
        source: d.ref,
        target: childId,
        kind: 'derive',
        relation: d.relation,
        confidence: d.confidence,
        evidence: d.evidence,
        note: d.note,
    };
}

/** related_to[i] → 图边（兄弟本，无方向；用 ID 字典序保证去重） */
function siblingToEdge(myId: string, s: LineageSibling, idx: number): LineageGraphEdge {
    const [a, b] = [myId, s.book_id].sort();
    return {
        id: `sibling:${a}-${b}:${idx}`,
        source: a,
        target: b,
        kind: 'sibling',
        relation: s.relation,
        confidence: s.confidence,
        evidence: s.evidence,
        note: s.note,
    };
}

/**
 * 主入口：把 Work + 它的 Books 合成可视化数据。
 *
 * @param work - WorkDetailData（须有 version_graph.enabled === true 才有效）
 * @param books - 与该 Work 关联的 Book 详情数组（应已加载 lineage 字段）
 * @returns LineageGraph，未启用或无数据时返回空图
 */
export function buildLineageGraph(
    work: WorkDetailData,
    books: BookDetailData[],
): LineageGraph {
    const vg = work.version_graph;
    const empty: LineageGraph = {
        nodes: [],
        edges: [],
        groups: [],
        layout: 'LR',
        excluded: [],
    };
    if (!vg || !vg.enabled) return empty;

    const excluded = new Set(vg.excluded_books ?? []);
    const groupMap = vg.node_groups ?? {};

    // 节点
    const bookNodes = books
        .filter((b) => !excluded.has(b.id))
        .map((b) => bookToNode(b, groupMap))
        .filter((n): n is LineageGraphNode => n !== null);

    const hypoNodes = (vg.hypothetical_nodes ?? []).map(hypoToNode);

    const nodes = [...bookNodes, ...hypoNodes];
    const nodeIds = new Set(nodes.map((n) => n.id));

    // 边：来自 books 的 derived_from / related_to
    const seenEdge = new Set<string>();
    const edges: LineageGraphEdge[] = [];

    const pushEdge = (e: LineageGraphEdge) => {
        if (seenEdge.has(e.id)) return;
        // 端点必须存在于 nodes 中，否则丢弃（防止悬挂边）
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;
        seenEdge.add(e.id);
        edges.push(e);
    };

    for (const b of books) {
        if (excluded.has(b.id) || !b.lineage) continue;
        (b.lineage.derived_from ?? []).forEach((d, i) => {
            pushEdge(derivationToEdge(b.id, d, i));
        });
        (b.lineage.related_to ?? []).forEach((s, i) => {
            pushEdge(siblingToEdge(b.id, s, i));
        });
    }

    // 假想节点之间的派生关系
    for (const h of vg.hypothetical_nodes ?? []) {
        (h.derived_from ?? []).forEach((d, i) => {
            pushEdge(derivationToEdge(h.id, d, i));
        });
    }

    return {
        nodes,
        edges,
        groups: vg.groups ?? [],
        title: vg.title,
        description: vg.description,
        layout: vg.layout ?? 'LR',
        excluded: Array.from(excluded),
    };
}

/**
 * 检查 lineage 数据完整性。返回错误消息列表（空数组 = 通过）。
 *
 * 检查项：
 * 1. derived_from.ref 必须能在 nodes 里找到
 * 2. related_to.book_id 必须能在 books 里找到
 * 3. ref_type === 'book' 时 ref 必须是真实 book id
 * 4. ref_type === 'hypothetical' 时 ref 必须是 hypothetical_nodes 里的 id
 */
export function validateLineageGraph(
    work: WorkDetailData,
    books: BookDetailData[],
): string[] {
    const errors: string[] = [];
    const vg = work.version_graph;
    if (!vg) return errors;

    const bookIds = new Set(books.map((b) => b.id));
    const hypoIds = new Set((vg.hypothetical_nodes ?? []).map((h) => h.id));
    const allIds = new Set([...bookIds, ...hypoIds]);

    const checkDerivation = (ownerLabel: string, d: LineageDerivation) => {
        if (!allIds.has(d.ref)) {
            errors.push(`${ownerLabel}: derived_from.ref "${d.ref}" 未在 books 或 hypothetical_nodes 中找到`);
        }
        if (d.ref_type === 'book' && !bookIds.has(d.ref)) {
            errors.push(`${ownerLabel}: derived_from.ref "${d.ref}" 标记为 book 但不在 books 列表中`);
        }
        if (d.ref_type === 'hypothetical' && !hypoIds.has(d.ref)) {
            errors.push(`${ownerLabel}: derived_from.ref "${d.ref}" 标记为 hypothetical 但不在 hypothetical_nodes 中`);
        }
    };

    for (const b of books) {
        if (!b.lineage) continue;
        const owner = `Book ${b.id} (${b.title})`;
        (b.lineage.derived_from ?? []).forEach((d) => checkDerivation(owner, d));
        (b.lineage.related_to ?? []).forEach((s) => {
            if (!bookIds.has(s.book_id)) {
                errors.push(`${owner}: related_to.book_id "${s.book_id}" 不在 books 列表中`);
            }
        });
    }

    for (const h of vg.hypothetical_nodes ?? []) {
        const owner = `Hypothetical ${h.id} (${h.label})`;
        (h.derived_from ?? []).forEach((d) => checkDerivation(owner, d));
    }

    return errors;
}
