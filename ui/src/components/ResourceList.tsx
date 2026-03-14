import React from 'react';
import type { ResourceEntry, ResourceType } from '../types';

export interface ResourceListProps {
    items: ResourceEntry[];
    /** 按类型分组显示，默认 true */
    groupByType?: boolean;
}

const TYPE_LABELS: Record<ResourceType, string> = {
    text: '文字资源',
    image: '图片资源',
    'text+image': '文字+图片资源',
    physical: '实体资源',
};

const TYPE_COLORS: Record<ResourceType, string> = {
    text: '#2196f3',
    image: '#ff9800',
    'text+image': '#9c27b0',
    physical: '#795548',
};

const TYPE_ORDER: ResourceType[] = ['text', 'image', 'text+image', 'physical'];

/**
 * 只读资源列表
 * 用于 kaiyuanguji-web 等场景的资源展示
 */
export const ResourceList: React.FC<ResourceListProps> = ({
    items,
    groupByType = true,
}) => {
    if (!items || items.length === 0) {
        return (
            <div style={{ padding: '16px', color: 'var(--bim-desc-fg, #717171)', fontSize: '13px', textAlign: 'center' }}>
                暂无资源信息
            </div>
        );
    }

    if (!groupByType) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map((item, i) => <ResourceCard key={item.id || i} item={item} />)}
            </div>
        );
    }

    const groups = TYPE_ORDER
        .map(type => ({ type, items: items.filter(r => r.type === type) }))
        .filter(g => g.items.length > 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {groups.map(({ type, items: groupItems }) => (
                <div key={type}>
                    <h4 style={{
                        margin: '0 0 8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: TYPE_COLORS[type],
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: '4px',
                            height: '14px',
                            borderRadius: '2px',
                            background: TYPE_COLORS[type],
                        }} />
                        {TYPE_LABELS[type]}
                        <span style={{ fontWeight: 400, opacity: 0.6 }}>({groupItems.length})</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {groupItems.map((item, i) => <ResourceCard key={item.id || i} item={item} />)}
                    </div>
                </div>
            ))}
        </div>
    );
};

const ResourceCard: React.FC<{ item: ResourceEntry }> = ({ item }) => (
    <div style={{
        padding: '10px 14px',
        border: '1px solid var(--bim-widget-border, #e0e0e0)',
        borderRadius: '6px',
        background: 'var(--bim-input-bg, #fff)',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: item.details || item.structure ? '6px' : '0' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>{item.name}</span>
            {item.url && (
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: 'var(--bim-link-fg, #0066cc)', textDecoration: 'none' }}
                >
                    访问 →
                </a>
            )}
        </div>
        {(item.details || item.structure || item.coverage) && (
            <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {item.details && <span>{item.details}</span>}
                {item.structure && <span>层级: {item.structure.join(' → ')}</span>}
                {item.coverage && <span>覆盖: L{item.coverage.level} {item.coverage.ranges}</span>}
            </div>
        )}
    </div>
);
