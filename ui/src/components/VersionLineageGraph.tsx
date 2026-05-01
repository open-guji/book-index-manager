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
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 基于 React Flow + dagre 的版本传承图。
 *
 * 依赖 @xyflow/react 与 @dagrejs/dagre（声明为 optionalDependencies）。
 * 若依赖缺失，组件会渲染提示并指向列表 fallback。
 */
export const VersionLineageGraph: React.FC<VersionLineageGraphProps> = (props) => {
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
    return <Inner modules={modules} {...props} />;
};

// ── 动态加载 ──

interface LoadedModules {
    ReactFlow: typeof import('@xyflow/react').ReactFlow;
    Background: typeof import('@xyflow/react').Background;
    Controls: typeof import('@xyflow/react').Controls;
    MiniMap: typeof import('@xyflow/react').MiniMap;
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
            MiniMap: rf.MiniMap,
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

const Inner: React.FC<InnerProps> = ({ graph, renderLink, height = 600, className, style, modules }) => {
    const { ReactFlow, Background, Controls, MiniMap, Handle, Position, dagre } = modules;

    // 节点类型 —— 用闭包传 Handle/Position
    const nodeTypes = useMemo(() => {
        const VersionNode = (p: { data: NodeData }) => {
            const d = p.data;
            const isHypo = d.kind === 'hypothetical';
            const isLost = d.status === 'lost';
            return (
                <div
                    style={{
                        background: 'var(--bim-bg, #fff)',
                        border: `2px ${isHypo ? 'dashed' : 'solid'} ${d.borderColor ?? '#888'}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                        minWidth: 140,
                        opacity: isLost ? 0.6 : 1,
                        boxShadow: isHypo ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                >
                    <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                        {isHypo || !d.renderLink
                            ? d.label
                            : d.renderLink(d.bookId!, d.label)}
                    </div>
                    {d.yearText && (
                        <div style={{ fontSize: 11, color: 'var(--bim-muted, #777)' }}>
                            {d.yearText}{d.uncertain ? '?' : ''}
                            {d.category ? ` · ${d.category}` : ''}
                        </div>
                    )}
                    {isLost && (
                        <div style={{ fontSize: 10, color: '#c62828', marginTop: 2 }}>已佚</div>
                    )}
                    <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
                </div>
            );
        };
        return { version: VersionNode };
    }, [Handle, Position]);

    // 计算 layout（dagre）
    const { rfNodes, rfEdges } = useMemo(
        () => layoutGraph(graph, dagre, renderLink),
        [graph, dagre, renderLink],
    );

    return (
        <div style={{ width: '100%', height, ...style }} className={className}>
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                edgesFocusable={false}
                minZoom={0.3}
                maxZoom={1.5}
            >
                <Background gap={16} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable />
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
}

function layoutGraph(
    graph: LineageGraph,
    dagre: typeof import('@dagrejs/dagre'),
    renderLink?: (id: string, label: string) => React.ReactNode,
) {
    const NODE_W = 180;
    const NODE_H = 70;
    const isLR = graph.layout === 'LR' || !graph.layout;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: isLR ? 'LR' : 'TB',
        ranksep: 80,
        nodesep: 30,
        edgesep: 10,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // 颜色查表
    const groupColor = new Map(graph.groups.map((gr) => [gr.id, gr.color ?? '#888']));

    for (const n of graph.nodes) {
        g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }
    // 兄弟边不影响 layout（它们是横向，dagre 会拉直，反而扭曲），仅 derive 边参与
    for (const e of graph.edges) {
        if (e.kind === 'derive') {
            g.setEdge(e.source, e.target);
        }
    }
    dagre.layout(g);

    const rfNodes = graph.nodes.map((n) => {
        const pos = g.node(n.id);
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
        };
        return {
            id: n.id,
            type: 'version',
            position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
            data: data as unknown as Record<string, unknown>,
            draggable: false,
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
            fontSize: 10,
            fill: 'var(--bim-muted, #666)',
        } as React.CSSProperties,
        labelBgPadding: [2, 4] as [number, number],
        labelBgBorderRadius: 2,
        labelBgStyle: { fill: 'var(--bim-bg, #fff)', fillOpacity: 0.9 } as React.CSSProperties,
        style: {
            stroke: confidenceColor(e.confidence),
            strokeWidth: isSibling ? 1 : 1.5,
            strokeDasharray: isSibling ? '4 3' : probable ? '6 4' : undefined,
            opacity: probable ? 0.7 : 1,
        } as React.CSSProperties,
        animated: false,
        markerEnd: isSibling ? undefined : 'arrow',
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
