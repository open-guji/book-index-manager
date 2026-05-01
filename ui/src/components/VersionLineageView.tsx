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
    className,
    style,
}) => {
    const [mode, setMode] = useState<'list' | 'graph'>(defaultMode);

    if (!graph.nodes.length) {
        return (
            <div style={{ padding: 24, color: 'var(--bim-muted, #999)', textAlign: 'center' }}>
                暂无版本传承数据
            </div>
        );
    }

    return (
        <div className={className} style={style}>
            <div style={toolbarStyle}>
                <button
                    onClick={() => setMode('list')}
                    style={btnStyle(mode === 'list')}
                >
                    列表
                </button>
                <button
                    onClick={() => setMode('graph')}
                    style={btnStyle(mode === 'graph')}
                >
                    关系图
                </button>
            </div>

            {mode === 'list' ? (
                <VersionLineageList graph={graph} renderLink={renderLink} />
            ) : (
                <VersionLineageGraph
                    graph={graph}
                    renderLink={renderLink}
                    height={graphHeight}
                />
            )}
        </div>
    );
};

const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    marginBottom: 12,
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
