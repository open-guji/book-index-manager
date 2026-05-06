import React, { useState } from 'react';
import type { LineageGraph } from '../core/lineage-graph';
import { VersionLineageList } from './VersionLineageList';
import { VersionLineageGraph } from './VersionLineageGraph';

export interface VersionLineageViewProps {
    /** 由 buildLineageGraph 生成 */
    graph: LineageGraph;
    /** 默认视图 */
    defaultMode?: 'list' | 'graph';
    /** Book 节点链接渲染（点击跳详情） */
    renderLink?: (id: string, label: string) => React.ReactNode;
    /** 图视图高度（像素） */
    graphHeight?: number;
    /** 选中的节点 ID（用于高亮显示） */
    selectedNodeId?: string;
    /** 模式切换回调（用于更新URL） */
    onModeChange?: (mode: 'list' | 'graph') => void;
    /** 当前集合 key（任意 collections 字典 key 或 'all'）。仅当 collectionsAvailable 非空时才显示 toggle */
    collection?: string;
    /** 切换集合回调 */
    onCollectionChange?: (collection: string) => void;
    /** 集合元数据字典（key → { label, description }）；
     *  通常由调用方从 work.version_graph.collections 派生，并可选择性附加 'all' 项。 */
    collectionsAvailable?: Record<string, { label: string; description?: string }>;
    /** 各集合 Book 总数（key → count，用于按钮上显示数字徽标） */
    collectionCounts?: Record<string, number>;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 版本传承视图。提供「列表」与「关系图」两种展示，切换即可。
 * 关系图依赖 @xyflow/react 与 @dagrejs/dagre（optionalDependencies），
 * 缺失时仅展示列表。
 */
export const VersionLineageView: React.FC<VersionLineageViewProps> = ({
    graph,
    defaultMode = 'list',
    renderLink,
    graphHeight = 600,
    selectedNodeId,
    onModeChange,
    collection,
    onCollectionChange,
    collectionsAvailable,
    collectionCounts,
    className,
    style,
}) => {
    const [mode, setMode] = useState<'list' | 'graph'>(defaultMode);

    const handleModeChange = (newMode: 'list' | 'graph') => {
        setMode(newMode);
        onModeChange?.(newMode);
    };

    const collectionEntries = collectionsAvailable
        ? Object.entries(collectionsAvailable)
        : [];
    const showCollectionToggle = !!(
        onCollectionChange && collectionEntries.length > 0
    );

    if (!graph.nodes.length) {
        return (
            <div style={{ padding: 24, color: 'var(--bim-muted, #999)', textAlign: 'center' }}>
                暂无版本传承数据
            </div>
        );
    }

    const activeDesc = collection ? collectionsAvailable?.[collection]?.description : undefined;

    return (
        <div className={className} style={style}>
            <div style={toolbarStyle}>
                <button
                    onClick={() => handleModeChange('list')}
                    style={btnStyle(mode === 'list')}
                >
                    列表
                </button>
                <button
                    onClick={() => handleModeChange('graph')}
                    style={btnStyle(mode === 'graph')}
                >
                    关系图
                </button>
                {showCollectionToggle && (
                    <div style={{ marginLeft: 'auto', marginRight: 80, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--bim-muted, #888)', marginRight: 4 }}>
                            集合：
                        </span>
                        {collectionEntries.map(([key, meta]) => {
                            const count = collectionCounts?.[key];
                            return (
                                <button
                                    key={key}
                                    onClick={() => onCollectionChange?.(key)}
                                    style={btnStyle(collection === key)}
                                    title={meta.description}
                                >
                                    {meta.label}{count != null ? ` ${count}` : ''}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            {showCollectionToggle && activeDesc && (
                <div style={{ fontSize: 12, color: 'var(--bim-muted, #888)', marginBottom: 8, padding: '4px 8px', background: 'var(--bim-bg-subtle, #fafafa)', borderRadius: 4 }}>
                    {activeDesc}
                </div>
            )}

            {mode === 'list' ? (
                <VersionLineageList graph={graph} renderLink={renderLink} />
            ) : (
                <VersionLineageGraph
                    graph={graph}
                    renderLink={renderLink}
                    height={graphHeight}
                    selectedNodeId={selectedNodeId}
                />
            )}
        </div>
    );
};

const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    marginBottom: 12,
    // 防止外部 absolute 元素（如页面右上角的 LocaleToggle z-10）遮挡集合切换按钮
    position: 'relative',
    zIndex: 20,
    flexWrap: 'wrap',
};

const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    fontSize: 12,
    border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: 4,
    background: active ? 'var(--bim-primary, #0078d4)' : 'transparent',
    color: active ? 'var(--bim-primary-fg, #fff)' : 'var(--bim-fg, #333)',
    cursor: 'pointer',
});
