import React, { useState } from 'react';
import type { ResourceEntry, ResourceType, DownloadProgress } from '../types';

/** 从 URL 提取默认 id */
function extractIdFromUrl(url: string): string {
    if (!url) return '';
    try {
        const hostname = new URL(url).hostname;
        const domainMap: Record<string, string> = {
            'zh.wikisource.org': 'wikisource',
            'www.shidianguji.com': 'shidianguji',
            'shidianguji.com': 'shidianguji',
            'archive.org': 'archive',
            'ctext.org': 'ctext',
            'read.nlc.cn': 'nlc',
            'www.digital.archives.go.jp': 'japan_archives',
        };
        if (domainMap[hostname]) return domainMap[hostname];
        const parts = hostname.split('.');
        return parts.length >= 2 ? parts[parts.length - 2] : hostname;
    } catch {
        return '';
    }
}

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
    { value: 'text', label: '文字' },
    { value: 'image', label: '图片' },
    { value: 'text+image', label: '文字+图片' },
    { value: 'physical', label: '实体' },
];

const ROOT_TYPES = [
    { value: 'catalog', label: '目录式' },
    { value: 'search', label: '搜索式' },
];

export interface ResourceEditorProps {
    items: ResourceEntry[];
    onChange: (items: ResourceEntry[]) => void;
    onDownload?: (index: number, url: string) => void;
    downloadStatuses?: Record<number, DownloadProgress>;
    /** 按资源类型过滤显示，不传则显示全部 */
    filterType?: ResourceType;
}

function createEmptyEntry(): ResourceEntry {
    return { id: '', name: '', url: '', type: 'text', details: '' };
}

export const ResourceEditor: React.FC<ResourceEditorProps> = ({
    items,
    onChange,
    onDownload,
    downloadStatuses,
    filterType,
}) => {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const displayItems = filterType
        ? items.map((item, i) => ({ item, originalIndex: i })).filter(({ item }) => item.type === filterType)
        : items.map((item, i) => ({ item, originalIndex: i }));

    const handleAdd = () => {
        const entry = createEmptyEntry();
        if (filterType) entry.type = filterType;
        onChange([...items, entry]);
        setExpandedIndex(items.length);
    };

    const handleRemove = (originalIndex: number) => {
        onChange(items.filter((_, i) => i !== originalIndex));
        setExpandedIndex(null);
    };

    const handleUpdate = (originalIndex: number, field: keyof ResourceEntry, value: unknown) => {
        const newItems = [...items];
        newItems[originalIndex] = { ...newItems[originalIndex], [field]: value };
        // 自动填充 id
        if (field === 'url' && !newItems[originalIndex].id) {
            const autoId = extractIdFromUrl(value as string);
            if (autoId) newItems[originalIndex].id = autoId;
        }
        onChange(newItems);
    };

    const handleStructureChange = (originalIndex: number, text: string) => {
        const structure = text.trim() ? text.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : undefined;
        handleUpdate(originalIndex, 'structure', structure);
    };

    const handleCoverageChange = (originalIndex: number, field: 'level' | 'ranges', value: string) => {
        const item = items[originalIndex];
        const coverage = item.coverage || { level: 1, ranges: '' };
        if (field === 'level') {
            coverage.level = parseInt(value) || 1;
        } else {
            coverage.ranges = value;
        }
        handleUpdate(originalIndex, 'coverage', coverage.ranges ? coverage : undefined);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayItems.map(({ item, originalIndex }) => (
                <div
                    key={originalIndex}
                    style={{
                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                        borderRadius: '4px',
                        background: 'var(--bim-input-bg, #fff)',
                        overflow: 'hidden',
                    }}
                >
                    {/* 折叠头部 */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            gap: '8px',
                        }}
                        onClick={() => setExpandedIndex(expandedIndex === originalIndex ? null : originalIndex)}
                    >
                        <span style={{ opacity: 0.6, fontSize: '12px' }}>
                            {expandedIndex === originalIndex ? '▼' : '▶'}
                        </span>
                        <span style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            background: typeColor(item.type),
                            color: '#fff',
                        }}>
                            {RESOURCE_TYPES.find(t => t.value === item.type)?.label || item.type}
                        </span>
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>
                            {item.name || `资源 ${originalIndex + 1}`}
                        </span>
                        {item.id && (
                            <span style={{ fontSize: '11px', opacity: 0.5 }}>{item.id}</span>
                        )}
                        {item.url && (
                            <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: '12px', opacity: 0.7 }}
                            >
                                🔗
                            </a>
                        )}
                        {onDownload && item.url && renderDownloadBtn(originalIndex, downloadStatuses?.[originalIndex], onDownload)}
                        <button
                            onClick={e => { e.stopPropagation(); handleRemove(originalIndex); }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--bim-danger, #f44336)',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                fontSize: '14px',
                            }}
                            title="删除此资源"
                        >
                            ✕
                        </button>
                    </div>

                    {/* 展开内容 */}
                    {expandedIndex === originalIndex && (
                        <div style={{ padding: '12px', borderTop: '1px solid var(--bim-widget-border, #e0e0e0)' }}>
                            {/* 图片预览 */}
                            {(item.type === 'image' || item.type === 'text+image') && item.url && renderImagePreview(item)}

                            <div style={{ display: 'grid', gap: '8px' }}>
                                {/* 第一行：type + root_type */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <label style={labelStyle}>
                                        <span style={labelTextStyle}>类型</span>
                                        <select
                                            value={item.type}
                                            onChange={e => handleUpdate(originalIndex, 'type', e.target.value)}
                                            style={{ ...inputStyle, flex: 1 }}
                                        >
                                            {RESOURCE_TYPES.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label style={labelStyle}>
                                        <span style={labelTextStyle}>根类型</span>
                                        <select
                                            value={item.root_type || 'catalog'}
                                            onChange={e => handleUpdate(originalIndex, 'root_type', e.target.value)}
                                            style={{ ...inputStyle, flex: 1 }}
                                        >
                                            {ROOT_TYPES.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                {/* id + name */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        value={item.id}
                                        onChange={e => handleUpdate(originalIndex, 'id', e.target.value)}
                                        placeholder="ID (自动从URL提取)"
                                        style={{ ...inputStyle, width: '140px', flexShrink: 0 }}
                                    />
                                    <input
                                        type="text"
                                        value={item.name}
                                        onChange={e => handleUpdate(originalIndex, 'name', e.target.value)}
                                        placeholder="资源名称"
                                        style={{ ...inputStyle, flex: 1 }}
                                    />
                                </div>

                                {/* url */}
                                <input
                                    type="text"
                                    value={item.url}
                                    onChange={e => handleUpdate(originalIndex, 'url', e.target.value)}
                                    placeholder="资源链接 (URL)"
                                    style={inputStyle}
                                />

                                {/* structure */}
                                <input
                                    type="text"
                                    value={item.structure?.join('、') || ''}
                                    onChange={e => handleStructureChange(originalIndex, e.target.value)}
                                    placeholder="层级结构 (如: 册、卷)"
                                    style={inputStyle}
                                />

                                {/* coverage */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <label style={labelStyle}>
                                        <span style={labelTextStyle}>覆盖层级</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={item.coverage?.level ?? ''}
                                            onChange={e => handleCoverageChange(originalIndex, 'level', e.target.value)}
                                            placeholder="1"
                                            style={{ ...inputStyle, width: '60px' }}
                                        />
                                    </label>
                                    <label style={{ ...labelStyle, flex: 1 }}>
                                        <span style={labelTextStyle}>覆盖范围</span>
                                        <input
                                            type="text"
                                            value={item.coverage?.ranges || ''}
                                            onChange={e => handleCoverageChange(originalIndex, 'ranges', e.target.value)}
                                            placeholder="如: 2,3,5-8"
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                    </label>
                                </div>

                                {/* details */}
                                <textarea
                                    value={item.details || ''}
                                    onChange={e => handleUpdate(originalIndex, 'details', e.target.value)}
                                    placeholder="详细说明"
                                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <button
                onClick={handleAdd}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    border: '1px dashed var(--bim-widget-border, #e0e0e0)',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: 'var(--bim-fg, #333)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    opacity: 0.8,
                }}
            >
                <span>+</span>
                <span>添加资源</span>
            </button>
        </div>
    );
};

function typeColor(type: ResourceType): string {
    switch (type) {
        case 'text': return '#2196f3';
        case 'image': return '#ff9800';
        case 'text+image': return '#9c27b0';
        case 'physical': return '#795548';
    }
}

function renderDownloadBtn(
    index: number,
    ds: DownloadProgress | undefined,
    onDownload: (index: number, url: string) => void,
) {
    const isDownloading = ds?.status === 'downloading';
    const isCompleted = ds?.status === 'completed';
    return (
        <button
            onClick={e => { e.stopPropagation(); if (!isDownloading) onDownload(index, ''); }}
            disabled={isDownloading}
            style={{
                background: 'transparent',
                border: 'none',
                color: isCompleted ? 'var(--bim-success, #4caf50)' : isDownloading ? 'var(--bim-desc-fg, #717171)' : 'var(--bim-link-fg, #0066cc)',
                cursor: isDownloading ? 'default' : 'pointer',
                padding: '2px 6px',
                fontSize: '12px',
                opacity: isDownloading ? 0.6 : 0.9,
            }}
            title={isCompleted ? '下载完成' : isDownloading ? `下载中 ${ds?.progress || 0}%` : '下载此资源'}
        >
            {isCompleted ? '✓' : isDownloading ? '⏳' : '⬇'}
        </button>
    );
}

function renderImagePreview(item: ResourceEntry) {
    const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.url) ||
        item.url.includes('iiif') || item.url.includes('image');

    return (
        <div style={{ marginBottom: '12px' }}>
            {isImageUrl ? (
                <div style={{ width: '100%', maxHeight: '150px', overflow: 'hidden', borderRadius: '4px', background: '#00000010' }}>
                    <img
                        src={item.url}
                        alt={item.name}
                        style={{ width: '100%', height: '150px', objectFit: 'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
            ) : (
                <div style={{ padding: '12px', background: '#00000010', borderRadius: '4px', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>
                    图片资源链接
                </div>
            )}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--bim-input-bg, #fff)',
    color: 'var(--bim-input-fg, #333)',
    border: '1px solid var(--bim-input-border, #ccc)',
    borderRadius: '2px',
    fontSize: '13px',
    boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
};

const labelTextStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--bim-desc-fg, #717171)',
    whiteSpace: 'nowrap',
};
