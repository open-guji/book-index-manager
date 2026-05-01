import React, { useState, useMemo } from 'react';
import type { ResourceEntry, ResourceType, ResourceTypeAtom, ResourceVolume } from '../types';
import { getResourceTypes } from '../types';
import { useT, useConvert } from '../i18n';
import { useBidUrl } from '../core/bid-url';
import type { LocaleMessages } from '../i18n/types';

export interface ResourceListProps {
    items: ResourceEntry[];
    /** 按类型分组显示，默认 true */
    groupByType?: boolean;
    /** 内部实体跳转回调（如点击 group 标题跳到 Work 页） */
    onNavigate?: (id: string) => void;
    /** 渲染内部链接（优先于 onNavigate） */
    renderLink?: (id: string, label?: string) => React.ReactNode;
}

/** 域名 → 显示名称映射 */
const DOMAIN_NAME_MAP: Record<string, string> = {
    'commons.wikimedia.org': '維基共享',
    'zh.wikisource.org': '維基文庫',
    'taiwanebook.ncl.edu.tw': '臺灣華文電子書庫',
    'ctext.org': '中國哲學書電子化計劃',
};

/** 从 URL 提取域名并映射为显示名称 */
function getDisplayNameFromUrl(url: string): string | undefined {
    try {
        const hostname = new URL(url).hostname;
        return DOMAIN_NAME_MAP[hostname];
    } catch {
        return undefined;
    }
}

const TYPE_COLORS: Record<ResourceType, string> = {
    text: '#2196f3',
    image: '#ff9800',
    'text+image': '#9c27b0',
    physical: '#795548',
};

/**
 * 多类型组合的展示标签和颜色。
 * 同时含 text 和 image 用紫色（视为「文字+图片」），其余用首类型色。
 */
function getCombinedTypeColor(types: ResourceTypeAtom[]): string {
    if (types.includes('text') && types.includes('image')) return TYPE_COLORS['text+image'];
    return TYPE_COLORS[types[0] || 'physical'];
}

/** 用于按类型分组的 key（多类型按 text > image > physical 顺序连接） */
const ATOM_ORDER: Record<ResourceTypeAtom, number> = { text: 0, image: 1, physical: 2 };
function getTypeGroupKey(types: ResourceTypeAtom[]): string {
    if (types.length === 0) return 'physical';
    return [...types].sort((a, b) => (ATOM_ORDER[a] ?? 99) - (ATOM_ORDER[b] ?? 99)).join('+');
}

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
        const groupKey = `${baseName}|${getTypeGroupKey(getResourceTypes(item))}`;

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
                    const itemKey = parsed && `${parsed[0]}|${getTypeGroupKey(getResourceTypes(items[i]))}`;
                    const baseKey = `${group.base.name}|${getTypeGroupKey(getResourceTypes(group.base))}`;
                    if (itemKey === baseKey) {
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
    onNavigate,
    renderLink,
}) => {
    const t = useT();

    // 自动合并分册资源
    const mergedItems = useMemo(() => mergeVolumeResources(items || []), [items]);

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

    // 按 types 组合分组（key 形如 'text'、'image+physical'、'text+image'）
    const groupBuckets = new Map<string, ResourceEntry[]>();
    for (const item of mergedItems) {
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

/** Build a URL that navigates to a specific page, based on the site */
function buildPageUrl(baseUrl: string, pageNum: number): string {
    try {
        const url = new URL(baseUrl);
        const host = url.hostname;
        // Wikimedia Commons: /w/index.php?title=File:...&page=N
        if (host.includes('wikimedia.org')) {
            // Extract file title from wiki/File:xxx or already in index.php format
            const wikiFileMatch = baseUrl.match(/\/wiki\/File:(.+?)(?:#|$)/);
            if (wikiFileMatch) {
                const fileTitle = encodeURIComponent(decodeURIComponent(wikiFileMatch[1]));
                return `https://commons.wikimedia.org/w/index.php?title=File%3A${fileTitle}&page=${pageNum}`;
            }
            // Already in index.php format, just update/add page param
            const u = new URL(baseUrl);
            u.searchParams.set('page', String(pageNum));
            return u.toString();
        }
        // Other sites: return as-is (no known page navigation)
        return baseUrl;
    } catch {
        return baseUrl;
    }
}

/** Extract the start page number from metadata (page_range or file_page_range) */
function getStartPage(metadata?: Record<string, unknown>): number | undefined {
    if (!metadata) return undefined;
    const range = (metadata.file_page_range || metadata.page_range) as string | undefined;
    if (!range || typeof range !== 'string') return undefined;
    const match = range.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
}

/** 从 volume 对象中提取最佳 URL（兼容 url / tw_url / wiki_url 等字段） */
function extractVolumeUrl(v: ResourceVolume): string | undefined {
    if (v.url) return v.url;
    for (const [k, val] of Object.entries(v)) {
        if (k.endsWith('_url') && typeof val === 'string') return val;
    }
    return undefined;
}

const COLOR_MODE_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
    bw: { label: '', bg: '#f5f5f5', fg: '#757575' },
    color: { label: '', bg: '#fff8e1', fg: '#f57f17' },
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
        if (!item.volumes || item.volumes.length === 0) return null;
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
                        {uniqueMissing > 0 && <span style={{ color: '#e67e22', marginLeft: '3px' }}>缺{uniqueMissing}</span>}
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
                                color: isMissing ? '#e67e22' : 'var(--bim-desc-fg, #999)',
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
        if (!item.volumes || item.volumes.length === 0) return null;
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
                        {uniqueMissing > 0 && <span style={{ color: '#e67e22', marginLeft: '4px' }}>缺{uniqueMissing}</span>}
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
                            color: isMissing ? '#e67e22' : 'var(--bim-desc-fg, #999)',
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
