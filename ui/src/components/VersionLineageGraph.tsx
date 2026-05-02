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
    BaseEdge: typeof import('@xyflow/react').BaseEdge;
    EdgeLabelRenderer: typeof import('@xyflow/react').EdgeLabelRenderer;
    getSmoothStepPath: typeof import('@xyflow/react').getSmoothStepPath;
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
            BaseEdge: rf.BaseEdge,
            EdgeLabelRenderer: rf.EdgeLabelRenderer,
            getSmoothStepPath: rf.getSmoothStepPath,
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
    const { ReactFlow, Background, Controls, Handle, Position, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, dagre } = modules;

    // 自定义边类型 —— 把标签放在靠近 target 的水平段（最后 ~15% 处），
    // 避免多条平行竖线时标签悬浮中部歧义
    const edgeTypes = useMemo(() => {
        type EdgePropsLike = {
            id: string;
            sourceX: number;
            sourceY: number;
            targetX: number;
            targetY: number;
            sourcePosition: import('@xyflow/react').Position;
            targetPosition: import('@xyflow/react').Position;
            label?: React.ReactNode;
            style?: React.CSSProperties;
            markerStart?: string;
            markerEnd?: string;
            data?: { labelStyle?: React.CSSProperties; labelBgStyle?: React.CSSProperties };
        };
        const LineageEdge = (p: EdgePropsLike) => {
            const [path] = getSmoothStepPath({
                sourceX: p.sourceX,
                sourceY: p.sourceY,
                sourcePosition: p.sourcePosition,
                targetX: p.targetX,
                targetY: p.targetY,
                targetPosition: p.targetPosition,
                stepPosition: 0.85,
                borderRadius: 5,
            });
            // 自己计算 label 位置：在最后一段水平线上（接近 target）
            // sourcePosition=Right, targetPosition=Left → 走的是 horizontalSplit
            // 路径最后一段是从 (centerX, targetY) 到 (targetX, targetY) 的水平线
            // labelX 取 target 前 ~30px，labelY 取 targetY
            const labelX = p.targetX - 30;
            const labelY = p.targetY;

            const labelStyle = p.data?.labelStyle;
            const labelBgStyle = p.data?.labelBgStyle;

            return (
                <>
                    <BaseEdge
                        id={p.id}
                        path={path}
                        style={p.style}
                        markerStart={p.markerStart}
                        markerEnd={p.markerEnd}
                    />
                    {p.label && (
                        <EdgeLabelRenderer>
                            <div
                                style={{
                                    position: 'absolute',
                                    transform: `translate(-100%, -50%) translate(${labelX}px,${labelY}px)`,
                                    pointerEvents: 'none',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    background: 'var(--bim-bg, #fff)',
                                    border: '0.5px solid var(--bim-widget-border, #ddd)',
                                    ...labelBgStyle,
                                    ...labelStyle,
                                }}
                            >
                                {p.label}
                            </div>
                        </EdgeLabelRenderer>
                    )}
                </>
            );
        };
        return { lineage: LineageEdge };
    }, [BaseEdge, EdgeLabelRenderer, getSmoothStepPath]);

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
                edgeTypes={edgeTypes}
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
    });
    g.setDefaultEdgeLabel(() => ({}));

    // 颜色查表
    const groupColor = new Map(graph.groups.map((gr) => [gr.id, gr.color ?? '#888']));

    for (const n of graph.nodes) {
        g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }

    // "配补"关系是反向连接（脂本子节点反过来引用程高刻本来补全后40回），
    // 它会把脂本节点错误地拉到 fanke 组中间，破坏布局。完全跳过 layout，仅在图中显示这条边。
    // 其他次要关系（如"参校"）仍然参与 layout，因为它们是正向时间线（如程甲本参校 transit 抄本）
    const SKIP_LAYOUT_RELATIONS = new Set(['配补']);

    for (const e of graph.edges) {
        if (e.kind !== 'derive') continue;
        if (SKIP_LAYOUT_RELATIONS.has(e.relation as string)) continue;
        g.setEdge(e.source, e.target);
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
    const color = confidenceColor(e.confidence);

    // 箭头方向：
    // - 派生关系（derive）：单向，source（父本）→ target（子本）
    // - 兄弟本（sibling）：双向，互为对等关系
    const arrowMarker = {
        type: 'arrowclosed' as const,
        color,
        width: 14,
        height: 14,
    };

    return {
        id: e.id,
        source: e.source,
        target: e.target,
        // 自定义边类型：把 label 放在靠近 target 的水平段（见 LineageEdge）
        type: 'lineage' as const,
        label: e.relation,
        // labelStyle/labelBgStyle 通过 data 传给自定义边组件
        data: {
            labelStyle: {
                color,
            } as React.CSSProperties,
        },
        style: {
            stroke: color,
            strokeWidth: isSibling ? 1 : 1.5,
            strokeDasharray: isSibling ? '4 3' : probable ? '6 4' : undefined,
            opacity: probable ? 0.75 : 1,
        } as React.CSSProperties,
        animated: false,
        // 兄弟本：双向箭头；派生关系：单向（source→target）
        markerEnd: arrowMarker,
        markerStart: isSibling ? arrowMarker : undefined,
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
