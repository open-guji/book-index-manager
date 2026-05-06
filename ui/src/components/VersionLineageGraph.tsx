import React, { useEffect, useMemo, useState } from 'react';
import type {
    LineageGraph,
    LineageGraphEdge,
    LineageGraphNode,
} from '../core/lineage-graph';
import { formatLineageYear } from '../core/lineage-graph';

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
            data?: {
                labelStyle?: React.CSSProperties;
                labelBgStyle?: React.CSSProperties;
                isSibling?: boolean;
                /** 同一 source 多条出边时的 stepPosition 偏移（让多条竖线错开，不重合）。
                 *  由 buildRfEdge 在 layout 后批量分配。基础值 0.85，每条边偏移 ±N*step。 */
                stepPosition?: number;
            };
        };
        const LineageEdge = (p: EdgePropsLike) => {
            const stepPos = p.data?.stepPosition ?? 0.85;
            const [path, autoLabelX, autoLabelY] = getSmoothStepPath({
                sourceX: p.sourceX,
                sourceY: p.sourceY,
                sourcePosition: p.sourcePosition,
                targetX: p.targetX,
                targetY: p.targetY,
                targetPosition: p.targetPosition,
                stepPosition: stepPos,
                borderRadius: 5,
            });
            // 标签位置：
            // - 派生关系（有方向）：紧贴 target，浮在水平线上方（labelX = targetX - 18, labelY = targetY - 12）
            // - 兄弟本（双向、无主次）：用 React Flow 自动算的中点位置（路径中间段）
            // 通过 data.isSibling 区分（buildRfEdge 写入）
            const isSibling = !!p.data?.isSibling;
            const labelX = isSibling ? autoLabelX : p.targetX - 18;
            const labelY = isSibling ? autoLabelY : p.targetY - 12;

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
                                    // -50%/-50% 让标签中心对齐 (labelX, labelY)，叠在水平线上
                                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
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
            const isBridge = d.bridge;
            const borderColor = d.borderColor ?? '#888';
            // 桥接节点：虚边框 + 半透明 + 灰色背景，提示"非核心，仅为链路完整而显示"
            const borderStyle = isBridge ? 'dashed' : (isHypo ? 'dashed' : 'solid');
            const baseOpacity = isBridge ? 0.5 : (isLost ? 0.6 : 1);
            return (
                <div
                    style={{
                        background: isBridge ? 'var(--bim-bg-subtle, #fafafa)' : 'var(--bim-bg, #fff)',
                        border: `2px ${borderStyle} ${isSelected ? '#0078d4' : borderColor}`,
                        borderRadius: 8,
                        padding: '6px 10px',
                        minWidth: 120,
                        maxWidth: 160,
                        wordWrap: 'break-word',
                        wordBreak: 'break-word',
                        opacity: baseOpacity,
                        boxShadow: isSelected
                            ? '0 0 0 3px rgba(0, 120, 212, 0.2), 0 2px 8px rgba(0, 120, 212, 0.3)'
                            : (isHypo || isBridge) ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                    title={isBridge ? '桥接节点：本身不在核心集，为保持派生链完整而显示' : undefined}
                >
                    <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 1, lineHeight: 1.3 }}>
                        {isHypo || !d.renderLink
                            ? d.label
                            : d.renderLink(d.bookId!, d.label)}
                    </div>
                    {d.description && (
                        <div style={{ fontSize: 10, color: 'var(--bim-muted, #777)', lineHeight: 1.25, marginTop: 1 }}>
                            {d.description}
                        </div>
                    )}
                    {d.yearText && (
                        <div style={{ fontSize: 10, color: 'var(--bim-muted, #777)', lineHeight: 1.2 }}>
                            {formatLineageYear(d.yearText, undefined, d.uncertain)}
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
    /** 节点上展示的副标题/描述（hypothetical.description 透传） */
    description?: string;
    /** 桥接节点：核心集模式下为保持派生链不断而引入的非核心中间节点。视觉淡化。 */
    bridge?: boolean;
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
        ranksep: 160,
        nodesep: 40,
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

    // 跳过 layout 的关系：这些关系不是"时间向上游派生"（要么是逆向、要么是横向），
    // 让 dagre 参与会扭曲节点列序，引发左→右流向被打破。仅显示边，不排版。
    //   配补    脂本节点反指程高，逆向
    //   形式仿照 横向"看起来像但血缘不同"
    //   综合    繁简综合本同时连多个上游，无主次
    //   兄弟本/同源/互校 — sibling kind 已经过滤但加这里更稳
    // 注：「节选」属正向派生（上游 → 节选出的下游），仍参与 layout，
    // 否则下游节点会被 dagre 当游离节点放到最左 rank 0（如征四寇本是李渔序本节选，必须接其右）
    const SKIP_LAYOUT_RELATIONS = new Set([
        '配补', '形式仿照', '综合',
        '兄弟本', '同源', '互校',
    ]);

    for (const e of graph.edges) {
        if (e.kind !== 'derive') continue;
        if (SKIP_LAYOUT_RELATIONS.has(e.relation as string)) continue;
        g.setEdge(e.source, e.target);
    }

    dagre.layout(g);

    // dagre 的 barycenter 排序自动让上游节点对齐下游、下游对齐上游，
    // 减少跨派生链交叉。早期版本曾在 dagre 之后强制按 (group, year) 重排
    // —— 对纯派生链友好，但破坏 barycenter，导致跨支系交叉（如水滸傳第二
    // 列簡本祖本 1500 在上、繁本祖本 1540 在下，但下游卻反向，造成交叉）。
    // 现策略：完全信任 dagre。group 仅用于节点配色（borderColor），不参与 layout。

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
            description: n.description,
            bridge: n.bridge,
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

    // 错开同一 source 多条出边的折弯位置（stepPosition），避免多条竖线
    // 在同一 X 处堆叠重合。规则：基础 0.85，同 source 出边按 target.y 升序，
    // 第 i 条 = 0.85 - (i - (n-1)/2) * step。step 取 0.06，最多扇形展开 ±0.18，
    // 仍保持靠近 target（>0.5）使标签不偏离。仅 derive 边参与；sibling 用默认。
    // STEP_BASE=0.78 + 单边最多 ±0.12 → range [0.66, 0.90]，
    // 同 source 多达 5 条边可错开；折弯仍偏 target 侧，label（贴 target 渲染）不离段。
    const STEP_BASE = 0.78;
    const STEP_SPREAD = 0.06;
    const outEdgesBySource = new Map<string, LineageGraphEdge[]>();
    for (const e of graph.edges) {
        if (e.kind !== 'derive') continue;
        if (!outEdgesBySource.has(e.source)) outEdgesBySource.set(e.source, []);
        outEdgesBySource.get(e.source)!.push(e);
    }
    const stepPosByEdgeId = new Map<string, number>();
    for (const [src, edges] of outEdgesBySource) {
        if (edges.length <= 1) continue;
        // 按 target.y 升序（target 在上的边折弯靠源；target 在下的折弯靠目标）
        const sorted = [...edges].sort((a, b) => {
            const ya = g.node(a.target)?.y ?? 0;
            const yb = g.node(b.target)?.y ?? 0;
            return ya - yb;
        });
        const n = sorted.length;
        sorted.forEach((e, i) => {
            const offset = (i - (n - 1) / 2) * STEP_SPREAD;
            stepPosByEdgeId.set(e.id, STEP_BASE + offset);
        });
        void src;
    }

    const rfEdges = graph.edges.map((e) => buildRfEdge(e, stepPosByEdgeId.get(e.id)));
    return { rfNodes, rfEdges };
}

function buildRfEdge(e: LineageGraphEdge, stepPosition?: number) {
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
        // 标签字色统一为深灰（保持视觉简洁），confidence 通过线条颜色和样式表达
        // labelStyle/labelBgStyle 通过 data 传给自定义边组件
        data: {
            labelStyle: {
                color: '#444',
            } as React.CSSProperties,
            isSibling,
            stepPosition,
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
