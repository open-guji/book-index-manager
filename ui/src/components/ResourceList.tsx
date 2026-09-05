import React, { useState, useMemo } from 'react';
import type { ResourceEntry, ResourceGroupInfo, ResourceType, ResourceTypeAtom, ResourceVolume } from '../types';
import { getResourceTypes } from '../types';
import { useT, useConvert } from '../i18n';
import { useBidUrl } from '../core/bid-url';
import type { LocaleMessages } from '../i18n/types';
// 纯函数统一放 core/resources，与详情页新组件共用同一套语义
// （否则两处各写一份「怎么算册数」「怎么合并分册」，迟早给出不一样的数字）
import {
    getDisplayNameFromUrl,
    getTypeGroupKey,
    mergeVolumeResources,
    extractVolumeUrl,
    getStartPage,
    buildPageUrl,
} from '../core/resources';

export interface ResourceListProps {
    items: ResourceEntry[];
    /** 按类型分组显示，默认 true */
    groupByType?: boolean;
    /** 镜像组元数据（来自 Book.resource_groups） */
    resourceGroups?: Record<string, ResourceGroupInfo>;
    /** 内部实体跳转回调（如点击 group 标题跳到 Work 页） */
    onNavigate?: (id: string) => void;
    /** 渲染内部链接（优先于 onNavigate） */
    renderLink?: (id: string, label?: string) => React.ReactNode;
}

// 回退值即原本的硬编码色，消费者不覆盖时观感不变
const TYPE_COLORS: Record<ResourceType, string> = {
    text: 'var(--bim-restype-text, #2196f3)',
    image: 'var(--bim-restype-image, #ff9800)',
    'text+image': 'var(--bim-restype-text-image, #9c27b0)',
    physical: 'var(--bim-restype-physical, #795548)',
};

/**
 * 多类型组合的展示标签和颜色。
 * 同时含 text 和 image 用紫色（视为「文字+图片」），其余用首类型色。
 */
function getCombinedTypeColor(types: ResourceTypeAtom[]): string {
    if (types.includes('text') && types.includes('image')) return TYPE_COLORS['text+image'];
    return TYPE_COLORS[types[0] || 'physical'];
}

/**
 * 只读资源列表
 * 用于 kaiyuanguji-web 等场景的资源展示
 */
export const ResourceList: React.FC<ResourceListProps> = ({
    items,
    groupByType = true,
    resourceGroups,
    onNavigate,
    renderLink,
}) => {
    const t = useT();
    const { convert } = useConvert();

    // 自动合并分册资源
    const mergedItems = useMemo(() => mergeVolumeResources(items || []), [items]);

    // 拆分有镜像组 vs 独立资源
    const { mirrorGroups, ungroupedItems } = useMemo(() => {
        const groups = new Map<string, ResourceEntry[]>();
        const standalone: ResourceEntry[] = [];
        for (const it of mergedItems) {
            const gk = it.group;
            if (gk) {
                if (!groups.has(gk)) groups.set(gk, []);
                groups.get(gk)!.push(it);
            } else {
                standalone.push(it);
            }
        }
        // origin first, then mirror
        for (const arr of groups.values()) {
            arr.sort((a, b) => {
                const w = (r: ResourceEntry) => r.group_role === 'origin' ? 0 : r.group_role === 'mirror' ? 1 : 2;
                return w(a) - w(b);
            });
        }
        return { mirrorGroups: groups, ungroupedItems: standalone };
    }, [mergedItems]);

    const TYPE_LABELS: Record<string, string> = {
        text: t.resourceType.text,
        image: t.resourceType.image,
        'text+image': t.resourceType.textImage,
        physical: t.resourceType.physical,
    };

    // 多类型组合的标签（拼接，如「文字+圖片」「圖片+館藏」）
    const labelForGroupKey = (key: string): string => {
        if (TYPE_LABELS[key]) return TYPE_LABELS[key];
        // 兜底：按 key 内 atom 拼接
        return key.split('+').map(a => TYPE_LABELS[a] || a).join('+');
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {mergedItems.map((item, i) => <ResourceChip key={item.id || i} item={item} />)}
            </div>
        );
    }

    // 镜像组渲染：每组一个 section（label + description + chips）
    const renderMirrorGroup = (gk: string, gItems: ResourceEntry[]) => {
        const info = resourceGroups?.[gk];
        const label = info?.label || gk;
        const desc = info?.description;
        return (
            <div key={`group-${gk}`} style={{
                padding: '10px 12px',
                border: '1px solid var(--bim-widget-border, #e0e0e0)',
                borderRadius: '6px',
                background: 'var(--bim-input-bg, #fafafa)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bim-fg, #333)' }}>
                    {convert(label)}
                </div>
                {desc && (
                    <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', lineHeight: 1.5 }}>
                        {convert(desc)}
                    </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {gItems.map((item, i) => (
                        <ResourceChip key={item.id || i} item={item} onNavigate={onNavigate} renderLink={renderLink} />
                    ))}
                </div>
            </div>
        );
    };

    // 按 types 组合分组（key 形如 'text'、'image+physical'、'text+image'）
    const groupBuckets = new Map<string, ResourceEntry[]>();
    for (const item of ungroupedItems) {
        const key = getTypeGroupKey(getResourceTypes(item));
        if (!groupBuckets.has(key)) groupBuckets.set(key, []);
        groupBuckets.get(key)!.push(item);
    }

    // 按预设顺序（text、image、text+image、physical 优先），其余字典序
    const PRESET_ORDER = ['text', 'image', 'text+image', 'physical'];
    const sortedKeys = [
        ...PRESET_ORDER.filter(k => groupBuckets.has(k)),
        ...[...groupBuckets.keys()].filter(k => !PRESET_ORDER.includes(k)).sort(),
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* 先渲染同源镜像组（每组一个卡片，带 label + description） */}
            {[...mirrorGroups.entries()].map(([gk, gItems]) => renderMirrorGroup(gk, gItems))}

            {/* 再渲染独立资源（按 type 分桶） */}
            {sortedKeys.map(key => {
                const groupItems = groupBuckets.get(key)!;
                const color = getCombinedTypeColor(key.split('+') as ResourceTypeAtom[]);
                return (
                    <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}>
                            {labelForGroupKey(key)}
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {groupItems.map((item, i) => <ResourceChip key={item.id || i} item={item} onNavigate={onNavigate} renderLink={renderLink} />)}
                        </div>
                    </div>
                );
            })}
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

const formatMetaValue = (key: string, value: unknown, t: LocaleMessages, convert?: (s: string) => string): React.ReactNode => {
    if (key === 'check_type' && typeof value === 'string') return <CheckTypeBadge value={value} />;
    if (key === 'has_translation') return value ? t.misc.hasTranslation : t.misc.noTranslation;
    const str = String(value);
    return convert ? convert(str) : str;
};

const COLOR_MODE_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
    bw: {
        label: '',
        bg: 'var(--bim-colormode-bw-bg, #f5f5f5)',
        fg: 'var(--bim-colormode-bw-fg, #757575)',
    },
    color: {
        label: '',
        bg: 'var(--bim-colormode-color-bg, #fff8e1)',
        fg: 'var(--bim-colormode-color-fg, #f57f17)',
    },
};

/** 紧凑 chip 风格的资源条目，适合水平排列 */
const ResourceChip: React.FC<{
    item: ResourceEntry;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}> = ({ item }) => {
    const t = useT();
    const { convert } = useConvert();
    const [expanded, setExpanded] = useState(false);

    const displayName = useMemo(() => {
        const domainName = item.url ? getDisplayNameFromUrl(item.url) : undefined;
        return domainName || convert(item.name);
    }, [item.url, item.name, convert]);

    const volumes = useMemo(() => {
        if (!Array.isArray(item.volumes) || item.volumes.length === 0) return null;
        return item.volumes.map(v => ({ ...v, url: v.url || extractVolumeUrl(v) }));
    }, [item.volumes]);

    const hasVolumes = volumes && volumes.length > 0;
    const uniqueFound = hasVolumes ? new Set(volumes.filter(v => v.status !== 'missing').map(v => v.volume)).size : 0;
    const uniqueMissing = hasVolumes ? new Set(volumes.filter(v => v.status === 'missing').map(v => v.volume)).size : 0;
    const expectedTotal = item.expected_volumes ?? (hasVolumes ? uniqueFound + uniqueMissing : 0);

    const colorModeInfo = item.color_mode ? { ...COLOR_MODE_STYLES[item.color_mode], label: t.colorMode[item.color_mode] } : null;

    const details = item.details && !hasVolumes ? convert(item.details) : null;

    const chipStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 10px',
        border: '1px solid var(--bim-widget-border, #e0e0e0)',
        borderRadius: '5px',
        background: 'var(--bim-input-bg, #fff)',
        fontSize: '12px',
        color: 'var(--bim-fg, #333)',
        lineHeight: 1.4,
        verticalAlign: 'middle',
    };

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
            <div style={chipStyle}>
                <span style={{ fontWeight: 500 }}>{displayName}</span>
                {colorModeInfo && (
                    <span style={{
                        padding: '0 5px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 500,
                        background: colorModeInfo.bg,
                        color: colorModeInfo.fg,
                    }}>
                        {colorModeInfo.label}
                    </span>
                )}
                {details && (
                    <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #999)' }}>{details}</span>
                )}
                {hasVolumes && (
                    <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #999)' }}>
                        {uniqueFound}/{expectedTotal}{t.unit.volume}
                        {uniqueMissing > 0 && <span style={{ color: 'var(--bim-missing-fg, #e67e22)', marginLeft: '3px' }}>缺{uniqueMissing}</span>}
                    </span>
                )}
                {item.url && (
                    <a
                        href={(() => {
                            const startPage = getStartPage(item.metadata);
                            return startPage ? buildPageUrl(item.url!, startPage) : item.url!;
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: 'var(--bim-link-fg, #0066cc)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                        {t.action.visit}
                    </a>
                )}
                {hasVolumes && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            padding: '0 6px',
                            fontSize: '11px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--bim-desc-fg, #999)',
                            cursor: 'pointer',
                            lineHeight: 1.4,
                        }}
                    >
                        {expanded ? '▲' : '▼'}
                    </button>
                )}
            </div>
            {hasVolumes && expanded && (
                <div style={{
                    padding: '6px 10px',
                    border: '1px solid var(--bim-widget-border, #e0e0e0)',
                    borderRadius: '5px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    maxWidth: '360px',
                }}>
                    {volumes.map(v => {
                        const isMissing = v.status === 'missing';
                        return v.url && !isMissing ? (
                            <a key={v.volume} href={v.url} target="_blank" rel="noopener noreferrer" style={{
                                display: 'inline-block', padding: '1px 5px', fontSize: '11px',
                                borderRadius: '3px', border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                color: 'var(--bim-link-fg, #0066cc)', textDecoration: 'none',
                            }}>
                                {v.volume}
                            </a>
                        ) : (
                            <span key={v.volume} style={{
                                display: 'inline-block', padding: '1px 5px', fontSize: '11px',
                                color: isMissing ? 'var(--bim-missing-fg, #e67e22)' : 'var(--bim-desc-fg, #999)',
                                textDecoration: isMissing ? 'line-through' : 'none', opacity: isMissing ? 0.6 : 1,
                            }}>
                                {v.volume}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const ResourceCard: React.FC<{
    item: ResourceEntry;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}> = ({ item, onNavigate, renderLink }) => {
    const t = useT();
    const { convert } = useConvert();
    const buildUrl = useBidUrl();
    const [expanded, setExpanded] = useState(false);

    // 域名映射显示名称
    const displayName = useMemo(() => {
        const domainName = item.url ? getDisplayNameFromUrl(item.url) : undefined;
        return domainName || convert(item.name);
    }, [item.url, item.name, convert]);

    // 归一化 volumes：提取 URL，补充 missing 状态
    const volumes = useMemo(() => {
        if (!Array.isArray(item.volumes) || item.volumes.length === 0) return null;
        return item.volumes.map(v => ({
            ...v,
            url: v.url || extractVolumeUrl(v),
        }));
    }, [item.volumes]);

    const hasVolumes = volumes && volumes.length > 0;
    // 按 volume 编号去重统计（同一册可在多个 group 中出现，如跨 Work 共冊）
    const uniqueFound = hasVolumes
        ? new Set(volumes.filter(v => v.status !== 'missing').map(v => v.volume)).size
        : 0;
    const uniqueMissing = hasVolumes
        ? new Set(volumes.filter(v => v.status === 'missing').map(v => v.volume)).size
        : 0;
    const expectedTotal = item.expected_volumes ?? (hasVolumes ? uniqueFound + uniqueMissing : 0);

    // color_mode badge 样式
    const colorModeInfo = item.color_mode ? {
        ...COLOR_MODE_STYLES[item.color_mode],
        label: t.colorMode[item.color_mode],
    } : null;

    return (
        <div style={{
            padding: '10px 14px',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '6px',
            background: 'var(--bim-input-bg, #fff)',
        }}>
            {/* 标题行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: (hasExtra(item) || hasVolumes) ? '6px' : '0' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>{displayName}</span>
                {colorModeInfo && (
                    <span style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: colorModeInfo.bg,
                        color: colorModeInfo.fg,
                    }}>
                        {colorModeInfo.label}
                    </span>
                )}
                {item.source_label && (
                    <span style={{
                        fontSize: '11px',
                        color: 'var(--bim-desc-fg, #717171)',
                        fontStyle: 'italic',
                    }}>
                        {item.source_label}
                    </span>
                )}
                {item.metadata?.check_type && <CheckTypeBadge value={item.metadata.check_type as string} />}

                {/* 分册数量（被动 badge，不可点击） */}
                {hasVolumes && (
                    <span style={{
                        padding: '1px 8px',
                        fontSize: '11px',
                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                        borderRadius: '3px',
                        background: 'transparent',
                        color: 'var(--bim-desc-fg, #717171)',
                    }}>
                        {uniqueFound}/{expectedTotal}{t.unit.volume}
                        {uniqueMissing > 0 && <span style={{ color: 'var(--bim-missing-fg, #e67e22)', marginLeft: '4px' }}>缺{uniqueMissing}</span>}
                    </span>
                )}

                {/* 总链接（仅在有 url 且不是分册展开时显示），如有页码范围则直接导航到起始页 */}
                {item.url && (
                    <a
                        href={(() => {
                            const startPage = getStartPage(item.metadata);
                            return startPage ? buildPageUrl(item.url!, startPage) : item.url!;
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: 'var(--bim-link-fg, #0066cc)', textDecoration: 'none' }}
                    >
                        {t.action.visit}
                    </a>
                )}

                {/* 展开/收起按钮（独立、最右） */}
                {hasVolumes && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        title={expanded ? '收起分册' : '展开分册'}
                        style={{
                            marginLeft: 'auto',
                            padding: '1px 10px',
                            fontSize: '12px',
                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '3px',
                            background: expanded ? 'var(--bim-widget-border, #e0e0e0)' : 'transparent',
                            color: 'var(--bim-fg, #333)',
                            cursor: 'pointer',
                            lineHeight: 1.4,
                        }}
                    >
                        {expanded ? '收起 ▲' : '展开 ▼'}
                    </button>
                )}
            </div>

            {/* 元数据 */}
            {hasExtra(item) && (
                <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {item.metadata && Object.entries(item.metadata)
                        .filter(([key]) => key !== 'check_type')
                        .map(([key, value]) => (
                            <span key={key}>{t.metadata[key] || key}: {formatMetaValue(key, value, t, convert)}</span>
                        ))}
                    {item.details && !hasVolumes && <span>{convert(item.details)}</span>}
                    {item.structure && <span>{t.misc.structure}: {item.structure.join(' → ')}</span>}
                    {item.coverage && <span>{t.misc.coverage}: L{item.coverage.level} {item.coverage.ranges}</span>}
                </div>
            )}

            {/* 分册展开列表 */}
            {hasVolumes && expanded && (() => {
                const hasGroups = volumes.some(v => v.group);
                const groups: { title?: string; group_id?: string; vols: typeof volumes }[] = [];
                if (hasGroups) {
                    let current: { title?: string; group_id?: string; vols: typeof volumes } | null = null;
                    for (const v of volumes) {
                        const g = v.group || '';
                        if (!current || current.title !== g) {
                            current = { title: g, group_id: v.group_id as string | undefined, vols: [] };
                            groups.push(current);
                        }
                        current.vols.push(v);
                    }
                } else {
                    groups.push({ vols: volumes });
                }

                const renderVol = (v: typeof volumes[number]) => {
                    const isMissing = v.status === 'missing';
                    if (v.url && !isMissing) {
                        return (
                            <a
                                key={v.volume}
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
                        );
                    }
                    return (
                        <span key={v.volume} style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            fontSize: '11px',
                            borderRadius: '3px',
                            border: '1px solid transparent',
                            color: isMissing ? 'var(--bim-missing-fg, #e67e22)' : 'var(--bim-desc-fg, #999)',
                            textDecoration: isMissing ? 'line-through' : 'none',
                            opacity: isMissing ? 0.6 : 1,
                            lineHeight: 1.4,
                        }}>
                            {v.volume}
                        </span>
                    );
                };

                return (
                    <div style={{
                        marginTop: '8px',
                        padding: '8px 0',
                        borderTop: '1px solid var(--bim-widget-border, #f0f0f0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}>
                        {groups.map((g, gi) => {
                            const titleLabel = g.title ? convert(g.title) : '';
                            let titleNode: React.ReactNode = titleLabel;
                            if (g.title && g.group_id) {
                                if (renderLink) {
                                    titleNode = renderLink(g.group_id, titleLabel);
                                } else if (onNavigate) {
                                    titleNode = (
                                        <a
                                            href={buildUrl(g.group_id)}
                                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(g.group_id!); }}
                                            style={{
                                                color: 'var(--bim-link-fg, #0066cc)',
                                                cursor: 'pointer',
                                                textDecoration: 'none',
                                                borderBottom: '1px dashed var(--bim-link-fg, #0066cc)',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.borderBottomStyle = 'solid')}
                                            onMouseLeave={e => (e.currentTarget.style.borderBottomStyle = 'dashed')}
                                        >
                                            {titleLabel}
                                        </a>
                                    );
                                }
                            }
                            return (
                                <div key={gi}>
                                    {g.title && (
                                        <div style={{
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            color: 'var(--bim-fg, #333)',
                                            marginBottom: '4px',
                                        }}>
                                            {titleNode}
                                            <span style={{ color: 'var(--bim-desc-fg, #999)', fontWeight: 400, marginLeft: '6px' }}>
                                                ({g.vols.length})
                                            </span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {g.vols.map(renderVol)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })()}
        </div>
    );
};
