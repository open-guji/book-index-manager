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
    /** 节点上展示的描述（label 之外的副标题，如「繁本，早於嘉靖殘本，已佚」）。
     *  当前仅 hypothetical 节点透传 hypothetical.description；book 节点暂未使用。 */
    description?: string;
    /** 桥接节点：本身不在核心集，但为了保持核心节点间派生链不断而引入。
     *  视觉上应淡化（半透明、虚边框）。仅在 collection==='core' 模式下出现。 */
    bridge?: boolean;
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
        description: h.description,
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
 * @param collection - 'core' | 'all'，缺省按 vg.default_collection 或 'all'
 * @returns LineageGraph，未启用或无数据时返回空图
 */
export function buildLineageGraph(
    work: WorkDetailData,
    books: BookDetailData[],
    collection?: 'core' | 'all',
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

    // 集合过滤：当 collection==='core' 且 core_books 已定义时，只保留核心集合内的节点
    const useCore = (collection ?? vg.default_collection ?? 'all') === 'core'
        && Array.isArray(vg.core_books) && vg.core_books.length > 0;
    const coreBookSet = useCore ? new Set(vg.core_books) : null;
    const coreHypoSet = useCore && vg.core_hypotheticals
        ? new Set(vg.core_hypotheticals)
        : null;

    // 桥接节点计算：核心模式下，沿 derived_from 链向上回溯，把不在核心集的中间节点补出来，
    // 保持派生链不断。补出来的节点 bridge=true，前端淡化显示。
    const bridgeBookSet = new Set<string>();
    const bridgeHypoSet = new Set<string>();
    if (useCore) {
        const bookById = new Map(books.map(b => [b.id, b]));
        const hypoById = new Map(
            (vg.hypothetical_nodes ?? []).map(h => [h.id, h])
        );

        const getParents = (id: string): string[] => {
            const b = bookById.get(id);
            if (b && b.lineage) {
                return (b.lineage.derived_from ?? []).map(d => d.ref);
            }
            const h = hypoById.get(id);
            if (h) {
                return (h.derived_from ?? []).map(d => d.ref);
            }
            return [];
        };
        const isCore = (id: string): boolean => {
            if (hypoById.has(id)) return !coreHypoSet || coreHypoSet.has(id);
            return !coreBookSet || coreBookSet.has(id);
        };

        const visited = new Set<string>();
        const trace = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);
            for (const parent of getParents(id)) {
                if (excluded.has(parent)) continue;
                if (!isCore(parent)) {
                    if (hypoById.has(parent)) {
                        bridgeHypoSet.add(parent);
                    } else if (bookById.has(parent)) {
                        bridgeBookSet.add(parent);
                    }
                }
                trace(parent);
            }
        };
        // 从所有核心节点起回溯
        for (const b of books) {
            if (coreBookSet && coreBookSet.has(b.id) && !excluded.has(b.id)) trace(b.id);
        }
        for (const h of vg.hypothetical_nodes ?? []) {
            if (coreHypoSet && coreHypoSet.has(h.id)) trace(h.id);
        }
    }

    // 节点：核心集 + 桥接补全（标 bridge=true）
    const bookNodes = books
        .filter((b) => !excluded.has(b.id))
        .filter((b) => !coreBookSet || coreBookSet.has(b.id) || bridgeBookSet.has(b.id))
        .map((b) => {
            const n = bookToNode(b, groupMap);
            if (n && bridgeBookSet.has(b.id)) n.bridge = true;
            return n;
        })
        .filter((n): n is LineageGraphNode => n !== null);

    const hypoNodes = (vg.hypothetical_nodes ?? [])
        .filter((h) => !coreHypoSet || coreHypoSet.has(h.id) || bridgeHypoSet.has(h.id))
        .map((h) => {
            const n = hypoToNode(h);
            if (bridgeHypoSet.has(h.id)) n.bridge = true;
            return n;
        });

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
        // 核心模式下：核心节点 + 桥接节点 都参与边遍历
        if (coreBookSet && !coreBookSet.has(b.id) && !bridgeBookSet.has(b.id)) continue;
        (b.lineage.derived_from ?? []).forEach((d, i) => {
            pushEdge(derivationToEdge(b.id, d, i));
        });
        (b.lineage.related_to ?? []).forEach((s, i) => {
            pushEdge(siblingToEdge(b.id, s, i));
        });
    }

    // 假想节点之间的派生关系
    for (const h of vg.hypothetical_nodes ?? []) {
        if (coreHypoSet && !coreHypoSet.has(h.id) && !bridgeHypoSet.has(h.id)) continue;
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
