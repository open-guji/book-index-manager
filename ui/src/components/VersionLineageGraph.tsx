import React, { useEffect, useMemo, useState } from 'react';
import type {
    LineageGraph,
    LineageGraphEdge,
    LineageGraphNode,
} from '../core/lineage-graph';

export interface VersionLineageGraphProps {
    graph: LineageGraph;
    /** 实存 Book 节点的链接渲染（点击节点跳转详情） */
    renderLink?: (id: string, label: string) => React.ReactNode;
    /** 容器高度（像素） */
    height?: number;
    /** 选中的节点 ID（用于高亮显示） */
    selectedNodeId?: string;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 基于 React Flow + dagre 的版本传承图。
 *
 * 依赖 @xyflow/react 与 @dagrejs/dagre（声明为 optionalDependencies）。
 * 若依赖缺失，组件会渲染提示并指向列表 fallback。
 */
export const VersionLineageGraph: React.FC<VersionLineageGraphProps> = ({ selectedNodeId, ...props }) => {
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing'>('loading');
    const [modules, setModules] = useState<LoadedModules | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadModules().then((m) => {
            if (cancelled) return;
            if (m) {
                setModules(m);
                setLoadState('ready');
            } else {
                setLoadState('missing');
            }
        });
        return () => { cancelled = true; };
    }, []);

    if (loadState === 'loading') {
        return <div style={placeholderStyle}>加载图组件中…</div>;
    }
    if (loadState === 'missing' || !modules) {
        return (
            <div style={placeholderStyle}>
                <div>图组件未安装。请安装 <code>@xyflow/react</code> 与 <code>@dagrejs/dagre</code>。</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    或使用 <code>VersionLineageList</code> 列表视图。
                </div>
            </div>
        );
    }
    return <Inner modules={modules} selectedNodeId={selectedNodeId} {...props} />;
};

// ── 动态加载 ──

interface LoadedModules {
    ReactFlow: typeof import('@xyflow/react').ReactFlow;
    Background: typeof import('@xyflow/react').Background;
    Controls: typeof import('@xyflow/react').Controls;
    Handle: typeof import('@xyflow/react').Handle;
    Position: typeof import('@xyflow/react').Position;
    dagre: typeof import('@dagrejs/dagre');
    cssLoaded: boolean;
}

async function loadModules(): Promise<LoadedModules | null> {
    try {
        const [rf, dg] = await Promise.all([
            import('@xyflow/react'),
            import('@dagrejs/dagre'),
        ]);
        // 加载 React Flow 的样式（仅一次）
        let cssLoaded = false;
        try {
            await import('@xyflow/react/dist/style.css');
            cssLoaded = true;
        } catch {
            cssLoaded = false;
        }
        return {
            ReactFlow: rf.ReactFlow,
            Background: rf.Background,
            Controls: rf.Controls,
            Handle: rf.Handle,
            Position: rf.Position,
            dagre: dg as unknown as typeof import('@dagrejs/dagre'),
            cssLoaded,
        };
    } catch {
        return null;
    }
}

// ── 内部渲染 ──

interface InnerProps extends VersionLineageGraphProps {
    modules: LoadedModules;
}

const Inner: React.FC<InnerProps> = ({ graph, renderLink, height = 600, className, style, selectedNodeId, modules }) => {
    const { ReactFlow, Background, Controls, Handle, Position, dagre } = modules;

    // 节点类型 —— 用闭包传 Handle/Position
    const nodeTypes = useMemo(() => {
        const VersionNode = (p: { data: NodeData }) => {
            const d = p.data;
            const isHypo = d.kind === 'hypothetical';
            const isLost = d.status === 'lost';
            const isSelected = d.isSelected;
            const borderColor = d.borderColor ?? '#888';
            return (
                <div
                    style={{
                        background: 'var(--bim-bg, #fff)',
                        border: `2px ${isHypo ? 'dashed' : 'solid'} ${isSelected ? '#0078d4' : borderColor}`,
                        borderRadius: 8,
                        padding: '6px 10px',
                        minWidth: 120,
                        maxWidth: 160,
                        wordWrap: 'break-word',
                        wordBreak: 'break-word',
                        opacity: isLost ? 0.6 : 1,
                        boxShadow: isSelected
                            ? '0 0 0 3px rgba(0, 120, 212, 0.2), 0 2px 8px rgba(0, 120, 212, 0.3)'
                            : isHypo ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                >
                    <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 1, lineHeight: 1.3 }}>
                        {isHypo || !d.renderLink
                            ? d.label
                            : d.renderLink(d.bookId!, d.label)}
                    </div>
                    {d.yearText && (
                        <div style={{ fontSize: 10, color: 'var(--bim-muted, #777)', lineHeight: 1.2 }}>
                            {d.yearText}{d.uncertain ? '?' : ''}
                            {d.category ? ` · ${d.category}` : ''}
                        </div>
                    )}
                    {isLost && (
                        <div style={{ fontSize: 9, color: '#c62828', marginTop: 1 }}>已佚</div>
                    )}
                    <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
                </div>
            );
        };
        return { version: VersionNode };
    }, [Handle, Position]);

    // 计算 layout（dagre）
    const { rfNodes, rfEdges } = useMemo(
        () => layoutGraph(graph, dagre, renderLink, selectedNodeId),
        [graph, dagre, renderLink, selectedNodeId],
    );

    return (
        <div style={{ width: '100%', height, ...style }} className={className}>
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                edgesFocusable={false}
                minZoom={0.2}
                maxZoom={1.8}
            >
                <Background gap={16} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
};

// ── dagre layout ──

interface NodeData {
    kind: 'book' | 'hypothetical';
    label: string;
    bookId?: string;
    yearText?: string;
    uncertain?: boolean;
    category?: string;
    status?: string;
    borderColor?: string;
    renderLink?: (id: string, label: string) => React.ReactNode;
    isSelected?: boolean;
}

function layoutGraph(
    graph: LineageGraph,
    dagre: typeof import('@dagrejs/dagre'),
    renderLink?: (id: string, label: string) => React.ReactNode,
    selectedNodeId?: string,
) {
    const NODE_W = 160;
    const NODE_H = 90;
    const isLR = graph.layout === 'LR' || !graph.layout;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: isLR ? 'LR' : 'TB',
        ranksep: 160,   // 增加行间距以避免连线标签被覆盖
        nodesep: 40,    // 增加列间距
        edgesep: 16,
        marginx: 20,
        marginy: 20,
        // 使用 tight-tree ranker 让节点更紧凑地靠近其父节点，减少远距离跨级连线
        ranker: 'tight-tree',
        // 多次迭代以减少交叉
        // @ts-expect-error - dagre runtime supports these options
        acyclicer: 'greedy',
    });
    g.setDefaultEdgeLabel(() => ({}));

    // 颜色查表
    const groupColor = new Map(graph.groups.map((gr) => [gr.id, gr.color ?? '#888']));

    // 按 group + 时间排序节点，让同组节点尽量相邻，减少跨组交叉
    const groupOrder = new Map(graph.groups.map((gr, idx) => [gr.id, idx]));
    const sortedNodes = [...graph.nodes].sort((a, b) => {
        const ga = a.group ? groupOrder.get(a.group) ?? 999 : 999;
        const gb = b.group ? groupOrder.get(b.group) ?? 999 : 999;
        if (ga !== gb) return ga - gb;
        // 同组内按年份升序
        const ya = a.year ?? a.year_range?.[0] ?? 9999;
        const yb = b.year ?? b.year_range?.[0] ?? 9999;
        return ya - yb;
    });

    for (const n of sortedNodes) {
        g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }

    // 次要派生关系（如"配补"、"参校"）：对布局的引力较弱，避免把跨组节点拉到错误位置
    const SECONDARY_RELATIONS = new Set(['配补', '参校', '参考', '佚文輯入']);

    // 兄弟边不影响 layout（它们是横向，dagre 会拉直，反而扭曲），仅 derive 边参与
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const e of graph.edges) {
        if (e.kind === 'derive') {
            const sourceNode = nodeMap.get(e.source);
            const targetNode = nodeMap.get(e.target);
            const sameGroup = sourceNode?.group && sourceNode.group === targetNode?.group;
            const isSecondary = SECONDARY_RELATIONS.has(e.relation as string);

            // weight 越大，dagre 越倾向于让这条边变短/直
            // - 次要关系（配补/参校）：weight=0，几乎不影响布局，避免跨组拉扯
            // - 同组主关系：weight=3，让同组节点紧密靠近
            // - 跨组主关系：weight=1，正常派生
            let weight = 1;
            if (isSecondary) weight = 0;
            else if (sameGroup) weight = 3;

            g.setEdge(e.source, e.target, {
                weight,
                minlen: isSecondary ? 0 : 1,
            });
        }
    }
    dagre.layout(g);

    const rfNodes = graph.nodes.map((n) => {
        const pos = g.node(n.id);
        const isSelected = selectedNodeId && n.id === selectedNodeId;
        const data: NodeData = {
            kind: n.kind,
            label: n.label,
            bookId: n.kind === 'book' ? n.id : undefined,
            yearText: n.year_text ?? formatYear(n),
            uncertain: n.year_uncertain,
            category: n.category,
            status: n.status,
            borderColor: n.group ? groupColor.get(n.group) : undefined,
            renderLink,
            isSelected,
        };
        return {
            id: n.id,
            type: 'version',
            position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
            data: data as unknown as Record<string, unknown>,
            draggable: false,
            selected: isSelected,
        };
    });

    const rfEdges = graph.edges.map((e) => buildRfEdge(e));
    return { rfNodes, rfEdges };
}

function buildRfEdge(e: LineageGraphEdge) {
    const probable = e.confidence === 'probable' || e.confidence === 'disputed';
    const isSibling = e.kind === 'sibling';
    return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep' as const,
        label: e.relation,
        labelStyle: {
            fontSize: 11,
            fontWeight: 500,
            fill: confidenceColor(e.confidence),
        } as React.CSSProperties,
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: {
            fill: 'var(--bim-bg, #fff)',
            fillOpacity: 1,
            stroke: 'var(--bim-widget-border, #ddd)',
            strokeWidth: 0.5,
        } as React.CSSProperties,
        labelShowBg: true,
        style: {
            stroke: confidenceColor(e.confidence),
            strokeWidth: isSibling ? 1 : 1.5,
            strokeDasharray: isSibling ? '4 3' : probable ? '6 4' : undefined,
            opacity: probable ? 0.75 : 1,
        } as React.CSSProperties,
        animated: false,
        markerEnd: isSibling ? undefined : 'arrow',
        zIndex: 1000,   // 让边及其标签显示在节点之上
    };
}

function formatYear(n: LineageGraphNode): string | undefined {
    if (n.year_range) return `~${n.year_range[0]}–${n.year_range[1]}`;
    if (typeof n.year === 'number') return String(n.year);
    return undefined;
}

function confidenceColor(level: string) {
    switch (level) {
        case 'certain':   return '#2e7d32';
        case 'consensus': return '#555';
        case 'probable':  return '#ed6c02';
        case 'disputed':  return '#c62828';
        default:          return '#888';
    }
}

const placeholderStyle: React.CSSProperties = {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--bim-muted, #888)',
    fontSize: '13px',
    border: '1px dashed var(--bim-widget-border, #ddd)',
    borderRadius: 8,
    background: 'var(--bim-bg, #fafafa)',
};
