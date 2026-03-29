import React, { useState, useMemo } from 'react';
import type { ResourceEntry, ResourceType, ResourceVolume } from '../types';
import { useT, useConvert } from '../i18n';
import type { LocaleMessages } from '../i18n/types';

export interface ResourceListProps {
    items: ResourceEntry[];
    /** 按类型分组显示，默认 true */
    groupByType?: boolean;
}

const TYPE_COLORS: Record<ResourceType, string> = {
    text: '#2196f3',
    image: '#ff9800',
    'text+image': '#9c27b0',
    physical: '#795548',
};

const TYPE_ORDER: ResourceType[] = ['text', 'image', 'text+image', 'physical'];

/**
 * 将同名模式的分册资源自动合并为一条带 volumes 的资源。
 * 匹配模式：名称包含 "第N冊" 或结尾为 "·N" 的同名系列。
 */
function mergeVolumeResources(items: ResourceEntry[]): ResourceEntry[] {
    // 尝试提取册号，返回 [基础名, 册号] 或 null
    const extractVolume = (name: string): [string, number] | null => {
        // 模式1: "XXX·第N冊" 或 "XXX·第N册"
        const m1 = name.match(/^(.+?)·第(\d+)[冊册]$/);
        if (m1) return [m1[1], parseInt(m1[2])];
        // 模式2: "XXX (N)" 或 "XXX·N"
        const m2 = name.match(/^(.+?)[·(](\d+)[)]?$/);
        if (m2) return [m2[1], parseInt(m2[2])];
        return null;
    };

    const groups = new Map<string, { base: ResourceEntry; volumes: ResourceVolume[] }>();
    const result: ResourceEntry[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // 已经有 volumes 的资源直接保留
        if (item.volumes && item.volumes.length > 0) continue;

        const parsed = extractVolume(item.name);
        if (!parsed) continue;

        const [baseName, vol] = parsed;
        const groupKey = `${baseName}|${item.type}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                base: { ...item, name: baseName, url: '', volumes: [] },
                volumes: [],
            });
        }
        groups.get(groupKey)!.volumes.push({
            volume: vol,
            url: item.url || undefined,
            status: 'found',
        });
        usedIndices.add(i);
    }

    // 只有 2 册以上才合并
    for (const [, group] of groups) {
        if (group.volumes.length >= 2) {
            group.volumes.sort((a, b) => a.volume - b.volume);
            group.base.volumes = group.volumes;
            group.base.expected_volumes = group.volumes.length;
            result.push(group.base);
        } else {
            // 单册不合并，清除 usedIndices
            for (let i = 0; i < items.length; i++) {
                if (usedIndices.has(i)) {
                    const parsed = extractVolume(items[i].name);
                    if (parsed && `${parsed[0]}|${items[i].type}` === `${group.base.name}|${group.base.type}`) {
                        usedIndices.delete(i);
                    }
                }
            }
        }
    }

    // 加入未合并的项（保持原顺序）
    for (let i = 0; i < items.length; i++) {
        if (!usedIndices.has(i)) {
            result.push(items[i]);
        }
    }

    return result;
}

/**
 * 只读资源列表
 * 用于 kaiyuanguji-web 等场景的资源展示
 */
export const ResourceList: React.FC<ResourceListProps> = ({
    items,
    groupByType = true,
}) => {
    const t = useT();

    // 自动合并分册资源
    const mergedItems = useMemo(() => mergeVolumeResources(items || []), [items]);

    const TYPE_LABELS: Record<ResourceType, string> = {
        text: t.resourceType.text,
        image: t.resourceType.image,
        'text+image': t.resourceType.textImage,
        physical: t.resourceType.physical,
    };

    if (!mergedItems || mergedItems.length === 0) {
        return (
            <div style={{ padding: '16px', color: 'var(--bim-desc-fg, #717171)', fontSize: '13px', textAlign: 'center' }}>
                {t.misc.noResources}
            </div>
        );
    }

    if (!groupByType) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mergedItems.map((item, i) => <ResourceCard key={item.id || i} item={item} />)}
            </div>
        );
    }

    const groups = TYPE_ORDER
        .map(type => ({ type, items: mergedItems.filter(r => r.type === type) }))
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

const hasExtra = (item: ResourceEntry) => {
    const hasVolumes = item.volumes && item.volumes.length > 0;
    return (item.details && !hasVolumes) || item.structure || item.coverage || (item.metadata && Object.keys(item.metadata).length > 0);
};

const CheckTypeBadge: React.FC<{ value: string }> = ({ value }) => {
    const t = useT();
    const checkInfo = t.checkType[value];
    if (!checkInfo) return <span>{value}</span>;
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: '3px',
            fontSize: '11px',
            fontWeight: 500,
            background: checkInfo.bg,
            color: checkInfo.fg,
        }}>
            {checkInfo.label}
        </span>
    );
};

const formatMetaValue = (key: string, value: unknown, t: LocaleMessages): React.ReactNode => {
    if (key === 'check_type' && typeof value === 'string') return <CheckTypeBadge value={value} />;
    if (key === 'has_translation') return value ? t.misc.hasTranslation : t.misc.noTranslation;
    return String(value);
};

/** 从 volume 对象中提取最佳 URL（兼容 url / tw_url / wiki_url 等字段） */
function extractVolumeUrl(v: ResourceVolume): string | undefined {
    if (v.url) return v.url;
    for (const [k, val] of Object.entries(v)) {
        if (k.endsWith('_url') && typeof val === 'string') return val;
    }
    return undefined;
}

const ResourceCard: React.FC<{ item: ResourceEntry }> = ({ item }) => {
    const t = useT();
    const { convert } = useConvert();
    const [expanded, setExpanded] = useState(false);

    // 归一化 volumes：提取 URL，补充 missing 状态
    const volumes = useMemo(() => {
        if (!item.volumes || item.volumes.length === 0) return null;
        return item.volumes.map(v => ({
            ...v,
            url: v.url || extractVolumeUrl(v),
        }));
    }, [item.volumes]);

    const hasVolumes = volumes && volumes.length > 0;
    const foundCount = hasVolumes ? volumes.filter(v => v.status !== 'missing').length : 0;
    const missingCount = hasVolumes ? volumes.length - foundCount : 0;
    const expectedTotal = item.expected_volumes ?? (hasVolumes ? volumes.length : 0);

    return (
        <div style={{
            padding: '10px 14px',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '6px',
            background: 'var(--bim-input-bg, #fff)',
        }}>
            {/* 标题行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: (hasExtra(item) || hasVolumes) ? '6px' : '0' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>{convert(item.name)}</span>
                {item.metadata?.check_type && <CheckTypeBadge value={item.metadata.check_type as string} />}

                {/* 分册摘要 */}
                {hasVolumes && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            padding: '1px 8px',
                            fontSize: '11px',
                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: 'var(--bim-desc-fg, #717171)',
                            cursor: 'pointer',
                        }}
                    >
                        {foundCount}/{expectedTotal}{t.unit.volume}
                        {missingCount > 0 && <span style={{ color: '#e67e22', marginLeft: '4px' }}>缺{missingCount}</span>}
                        <span style={{ marginLeft: '4px' }}>{expanded ? '▲' : '▼'}</span>
                    </button>
                )}

                {/* 总链接（仅在有 url 且不是分册展开时显示） */}
                {item.url && (
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: 'var(--bim-link-fg, #0066cc)', textDecoration: 'none' }}
                    >
                        {t.action.visit}
                    </a>
                )}
            </div>

            {/* 元数据 */}
            {hasExtra(item) && (
                <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {item.metadata && Object.entries(item.metadata)
                        .filter(([key]) => key !== 'check_type')
                        .map(([key, value]) => (
                            <span key={key}>{t.metadata[key] || key}: {formatMetaValue(key, value, t)}</span>
                        ))}
                    {item.details && !hasVolumes && <span>{item.details}</span>}
                    {item.structure && <span>{t.misc.structure}: {item.structure.join(' → ')}</span>}
                    {item.coverage && <span>{t.misc.coverage}: L{item.coverage.level} {item.coverage.ranges}</span>}
                </div>
            )}

            {/* 分册展开列表 */}
            {hasVolumes && expanded && (
                <div style={{
                    marginTop: '8px',
                    padding: '8px 0',
                    borderTop: '1px solid var(--bim-widget-border, #f0f0f0)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                }}>
                    {volumes.map(v => {
                        const isMissing = v.status === 'missing';
                        return (
                            <span key={v.volume} style={{ display: 'inline-flex' }}>
                                {v.url && !isMissing ? (
                                    <a
                                        href={v.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            display: 'inline-block',
                                            padding: '2px 6px',
                                            fontSize: '11px',
                                            borderRadius: '3px',
                                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                            color: 'var(--bim-link-fg, #0066cc)',
                                            textDecoration: 'none',
                                            lineHeight: 1.4,
                                        }}
                                        title={v.label || `${v.volume}`}
                                    >
                                        {v.volume}
                                    </a>
                                ) : (
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 6px',
                                        fontSize: '11px',
                                        borderRadius: '3px',
                                        border: '1px solid transparent',
                                        color: isMissing ? '#e67e22' : 'var(--bim-desc-fg, #999)',
                                        textDecoration: isMissing ? 'line-through' : 'none',
                                        opacity: isMissing ? 0.6 : 1,
                                        lineHeight: 1.4,
                                    }}>
                                        {v.volume}
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
