import React from 'react';
import type {
    LineageGraph,
    LineageGraphEdge,
    LineageGraphNode,
} from '../core/lineage-graph';
import { formatLineageYear } from '../core/lineage-graph';
import { useI18n } from '../i18n';
import { bim } from '../styles/tokens';

export interface VersionLineageListProps {
    /** 由 buildLineageGraph 生成的数据 */
    graph: LineageGraph;
    /** 渲染节点链接（实存 Book 才有；假想节点无链接） */
    renderLink?: (id: string, label: string) => React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 版本传承列表视图：按 group 分组、按 year 排序展示节点，
 * 每个节点列出其上游来源（derived_from）和兄弟本（related_to）。
 *
 * 这是无重依赖的 fallback。完整图可视化请用上层（如 kaiyuanguji-web）
 * 提供的基于 React Flow 的组件。
 */
export const VersionLineageList: React.FC<VersionLineageListProps> = ({
    graph,
    renderLink,
    className,
    style,
}) => {
    const { t, convert } = useI18n();
    if (!graph.nodes.length) {
        return (
            <div style={{ ...placeholderStyle, ...style }} className={className}>
                {t('lineage.emptyGraph')}
            </div>
        );
    }

    // 边索引：target -> 上游边
    const incomingMap = new Map<string, LineageGraphEdge[]>();
    const siblingMap = new Map<string, LineageGraphEdge[]>();
    for (const e of graph.edges) {
        if (e.kind === 'derive') {
            const arr = incomingMap.get(e.target) ?? [];
            arr.push(e);
            incomingMap.set(e.target, arr);
        } else {
            // sibling 双向加索引
            for (const id of [e.source, e.target]) {
                const arr = siblingMap.get(id) ?? [];
                arr.push(e);
                siblingMap.set(id, arr);
            }
        }
    }

    // 节点索引（用于显示兄弟本另一端的 label）
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    // 按 group 分组
    const byGroup = new Map<string, LineageGraphNode[]>();
    const ungrouped: LineageGraphNode[] = [];
    for (const n of graph.nodes) {
        if (n.group) {
            const arr = byGroup.get(n.group) ?? [];
            arr.push(n);
            byGroup.set(n.group, arr);
        } else {
            ungrouped.push(n);
        }
    }
    // 各组内按年份排序
    const sortByYear = (a: LineageGraphNode, b: LineageGraphNode) => (a.year ?? 9999) - (b.year ?? 9999);
    byGroup.forEach((arr) => arr.sort(sortByYear));
    ungrouped.sort(sortByYear);

    // 按 groups 定义的顺序渲染
    const orderedGroups = graph.groups.filter((g) => byGroup.has(g.id));

    return (
        <div className={className} style={{ ...containerStyle, ...style }}>
            {graph.title && <div style={titleStyle}>{convert(graph.title)}</div>}
            {graph.description && <div style={descStyle}>{convert(graph.description)}</div>}

            {orderedGroups.map((g) => (
                <GroupSection
                    key={g.id}
                    label={g.label}
                    color={g.color}
                    nodes={byGroup.get(g.id)!}
                    incomingMap={incomingMap}
                    siblingMap={siblingMap}
                    nodeMap={nodeMap}
                    renderLink={renderLink}
                />
            ))}

            {ungrouped.length > 0 && (
                <GroupSection
                    label={t('lineage.otherGroup')}
                    nodes={ungrouped}
                    incomingMap={incomingMap}
                    siblingMap={siblingMap}
                    nodeMap={nodeMap}
                    renderLink={renderLink}
                />
            )}
        </div>
    );
};

interface GroupSectionProps {
    label: string;
    color?: string;
    nodes: LineageGraphNode[];
    incomingMap: Map<string, LineageGraphEdge[]>;
    siblingMap: Map<string, LineageGraphEdge[]>;
    nodeMap: Map<string, LineageGraphNode>;
    renderLink?: (id: string, label: string) => React.ReactNode;
}

const GroupSection: React.FC<GroupSectionProps> = ({
    label,
    color,
    nodes,
    incomingMap,
    siblingMap,
    nodeMap,
    renderLink,
}) => {
    const { convert } = useI18n();
    return (
    <div style={groupStyle}>
        <div style={{ ...groupLabelStyle, borderLeftColor: color ?? bim('widget-border') }}>
            {convert(label)}
        </div>
        {nodes.map((n) => (
            <NodeCard
                key={n.id}
                node={n}
                incoming={incomingMap.get(n.id) ?? []}
                siblings={siblingMap.get(n.id) ?? []}
                nodeMap={nodeMap}
                renderLink={renderLink}
            />
        ))}
    </div>
    );
};

interface NodeCardProps {
    node: LineageGraphNode;
    incoming: LineageGraphEdge[];
    siblings: LineageGraphEdge[];
    nodeMap: Map<string, LineageGraphNode>;
    renderLink?: (id: string, label: string) => React.ReactNode;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, incoming, siblings, nodeMap, renderLink }) => {
    const isHypo = node.kind === 'hypothetical';
    const isBridge = node.bridge;
    const { t, convert } = useI18n();
    return (
        <div style={{
            ...cardStyle,
            borderStyle: (isHypo || isBridge) ? 'dashed' : 'solid',
            opacity: isBridge ? 0.55 : (node.status === 'lost' ? 0.7 : 1),
            background: isBridge ? bim('bg-subtle') : undefined,
        }}
        title={isBridge ? t('lineage.bridgeTitle') : undefined}>
            <div style={cardHeaderStyle}>
                <span style={cardTitleStyle}>
                    {isHypo || !renderLink ? convert(node.label) : renderLink(node.id, convert(node.label))}
                </span>
                {(node.year_text || node.year != null) && (
                    <span style={cardYearStyle}>
                        {formatLineageYear(convert(node.year_text), node.year, node.year_uncertain)}
                    </span>
                )}
            </div>

            <div style={cardMetaStyle}>
                {node.category && <Tag>{convert(node.category)}</Tag>}
                {node.status === 'lost' && <Tag tone="warn">{t('lineage.lost')}</Tag>}
                {node.status === 'fragment' && <Tag tone="warn">{t('lineage.fragment')}</Tag>}
                {isHypo && <Tag tone="info">{t('lineage.hypothetical')}</Tag>}
                {isBridge && <Tag tone="info">{t('lineage.bridge')}</Tag>}
            </div>

            {node.extant_juan && (
                <div style={cardLineStyle}>{t('lineage.extant', { juan: convert(node.extant_juan) })}</div>
            )}
            {node.note && (
                <div style={cardNoteStyle}>{convert(node.note)}</div>
            )}

            {incoming.length > 0 && (
                <div style={cardSectionStyle}>
                    <div style={cardSectionLabelStyle}>{t('lineage.sources')}</div>
                    {incoming.map((e) => {
                        const src = nodeMap.get(e.source);
                        return (
                            <div key={e.id} style={cardEdgeStyle(e.confidence)}>
                                <span style={relationTagStyle}>{convert(e.relation)}</span>
                                <span>
                                    {src?.kind === 'book' && renderLink
                                        ? renderLink(src.id, convert(src.label))
                                        : convert(src?.label ?? e.source)}
                                </span>
                                {e.confidence !== 'consensus' && e.confidence !== 'certain' && (
                                    <ConfidenceBadge level={e.confidence} />
                                )}
                                {e.evidence && <span style={evidenceStyle}>· {convert(e.evidence)}</span>}
                            </div>
                        );
                    })}
                </div>
            )}

            {siblings.length > 0 && (
                <div style={cardSectionStyle}>
                    <div style={cardSectionLabelStyle}>{t('lineage.related')}</div>
                    {siblings.map((e) => {
                        const otherId = e.source === node.id ? e.target : e.source;
                        const other = nodeMap.get(otherId);
                        return (
                            <div key={e.id} style={cardEdgeStyle(e.confidence)}>
                                <span style={relationTagStyle}>{convert(e.relation)}</span>
                                <span>
                                    {other?.kind === 'book' && renderLink
                                        ? renderLink(other.id, convert(other.label))
                                        : convert(other?.label ?? otherId)}
                                </span>
                                <ConfidenceBadge level={e.confidence} />
                                {e.evidence && <span style={evidenceStyle}>· {convert(e.evidence)}</span>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Tag: React.FC<{ children: React.ReactNode; tone?: 'default' | 'warn' | 'info' }> = ({ children, tone = 'default' }) => {
    const colors: Record<string, { bg: string; fg: string }> = {
        default: { bg: bim('tag-bg'), fg: bim('fg') },
        warn:    { bg: bim('warn-bg'), fg: bim('warn-fg') },
        info:    { bg: bim('info-bg'), fg: bim('info-fg') },
    };
    const c = colors[tone];
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 8px',
            fontSize: '11px',
            borderRadius: '10px',
            background: c.bg,
            color: c.fg,
            marginRight: '4px',
        }}>{children}</span>
    );
};

const ConfidenceBadge: React.FC<{ level: string }> = ({ level }) => {
    const { t } = useI18n();
    const map: Record<string, { key: 'certain' | 'consensus' | 'probable' | 'disputed'; color: string }> = {
        certain:   { key: 'certain',   color: bim('confidence-certain') },
        consensus: { key: 'consensus', color: bim('confidence-consensus') },
        probable:  { key: 'probable',  color: bim('confidence-probable') },
        disputed:  { key: 'disputed',  color: bim('confidence-disputed') },
    };
    const e = map[level];
    if (!e) return null;
    return (
        <span style={{
            display: 'inline-block',
            padding: '0 6px',
            fontSize: '10px',
            border: `1px solid ${e.color}`,
            color: e.color,
            borderRadius: '8px',
            marginLeft: '4px',
        }}>{t(`lineage.confidence.${e.key}`)}</span>
    );
};

// ── styles ──

const containerStyle: React.CSSProperties = {
    fontSize: '14px',
    color: bim('fg'),
};
const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '8px',
};
const descStyle: React.CSSProperties = {
    fontSize: '13px',
    color: bim('muted'),
    marginBottom: '16px',
    lineHeight: 1.6,
};
const groupStyle: React.CSSProperties = {
    marginBottom: '16px',
};
const groupLabelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    padding: '4px 12px',
    borderLeft: '4px solid',
    marginBottom: '8px',
    color: bim('fg'),
};
const cardStyle: React.CSSProperties = {
    border: `1px solid ${bim('widget-border')}`,
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '8px',
    background: bim('bg'),
};
const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '4px',
};
const cardTitleStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
};
const cardYearStyle: React.CSSProperties = {
    fontSize: '12px',
    color: bim('muted'),
};
const cardMetaStyle: React.CSSProperties = {
    marginBottom: '6px',
};
const cardLineStyle: React.CSSProperties = {
    fontSize: '12px',
    color: bim('muted'),
    margin: '2px 0',
};
const cardNoteStyle: React.CSSProperties = {
    fontSize: '12px',
    color: bim('muted'),
    fontStyle: 'italic',
    margin: '4px 0',
};
const cardSectionStyle: React.CSSProperties = {
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: `1px dashed ${bim('widget-border')}`,
};
const cardSectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: bim('muted'),
    marginBottom: '2px',
};
const cardEdgeStyle = (confidence: string): React.CSSProperties => ({
    fontSize: '12px',
    margin: '2px 0',
    opacity: confidence === 'probable' || confidence === 'disputed' ? 0.85 : 1,
});
const relationTagStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0 6px',
    fontSize: '11px',
    background: bim('tag-bg'),
    color: bim('fg'),
    borderRadius: '3px',
    marginRight: '6px',
};
const evidenceStyle: React.CSSProperties = {
    fontSize: '11px',
    color: bim('muted'),
};
const placeholderStyle: React.CSSProperties = {
    padding: '20px',
    textAlign: 'center',
    color: bim('muted'),
    fontSize: '13px',
};
