import React, { useState } from 'react';
import type { SourceItem, EntityOption } from '../types';

export interface SourceEditorProps {
    items: SourceItem[];
    onChange: (items: SourceItem[]) => void;
    /** 打开实体选择器的回调 */
    onOpenEntityPicker?: (callback: (entity: EntityOption) => void) => void;
}

function getTypeColor(type: string): string {
    switch (type) {
        case 'url': return '#2196f3';
        case 'bookID': return '#4caf50';
        default: return 'var(--bim-desc-fg, #717171)';
    }
}

function getTypeName(type: string): string {
    switch (type) {
        case 'url': return 'URL';
        case 'bookID': return 'Book ID';
        default: return '未选择';
    }
}

export const SourceEditor: React.FC<SourceEditorProps> = ({ items, onChange, onOpenEntityPicker }) => {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const handleAdd = () => {
        onChange([...items, { id: '', name: '', type: '', details: '', position: '', version: '', processor_version: '' }]);
        setExpandedIndex(items.length);
    };

    const handleRemove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
        if (expandedIndex === index) setExpandedIndex(null);
    };

    const handleUpdate = (index: number, field: keyof SourceItem, value: string) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        onChange(newItems);
    };

    const handleTypeSelect = (index: number, type: 'bookID' | 'url') => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], type, id: '', name: '' };
        onChange(newItems);

        if (type === 'bookID' && onOpenEntityPicker) {
            onOpenEntityPicker((entity) => {
                const updated = [...items];
                updated[index] = { ...updated[index], id: entity.id, name: entity.title, type: 'bookID' };
                onChange(updated);
            });
        }
    };

    const handleSelectBook = (index: number) => {
        if (onOpenEntityPicker) {
            onOpenEntityPicker((entity) => {
                const newItems = [...items];
                newItems[index] = { ...newItems[index], id: entity.id, name: entity.title, type: 'bookID' };
                onChange(newItems);
            });
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, index) => (
                <div key={index} style={{
                    border: '1px solid var(--bim-widget-border, #e0e0e0)',
                    borderRadius: '4px',
                    background: 'var(--bim-input-bg, #fff)',
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div
                        style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', cursor: 'pointer', gap: '8px' }}
                        onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                    >
                        <span style={{ opacity: 0.6, fontSize: '12px' }}>{expandedIndex === index ? '\u25BC' : '\u25B6'}</span>
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>
                            {item.name || `来源 ${index + 1}`}
                        </span>
                        {item.type && (
                            <span style={{ fontSize: '11px', padding: '2px 8px', background: getTypeColor(item.type), color: 'white', borderRadius: '3px', fontWeight: 500 }}>
                                {getTypeName(item.type)}
                            </span>
                        )}
                        <button
                            onClick={e => { e.stopPropagation(); handleRemove(index); }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--bim-danger, #f44336)', cursor: 'pointer', padding: '2px 6px', fontSize: '14px' }}
                            title="删除此来源"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Expanded content */}
                    {expandedIndex === index && (
                        <div style={{ padding: '12px', borderTop: '1px solid var(--bim-widget-border, #e0e0e0)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {/* Type selection */}
                                {!item.type && (
                                    <div>
                                        <label style={labelStyle}>选择来源类型</label>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                            <button onClick={() => handleTypeSelect(index, 'bookID')} style={{ ...typeButtonStyle, borderColor: '#4caf50', color: '#4caf50' }}>
                                                <span style={{ fontSize: '18px' }}>📚</span>
                                                <span>Book ID</span>
                                                <span style={{ fontSize: '11px', opacity: 0.7 }}>从现有书籍选择</span>
                                            </button>
                                            <button onClick={() => handleTypeSelect(index, 'url')} style={{ ...typeButtonStyle, borderColor: '#2196f3', color: '#2196f3' }}>
                                                <span style={{ fontSize: '18px' }}>🔗</span>
                                                <span>URL</span>
                                                <span style={{ fontSize: '11px', opacity: 0.7 }}>输入网址链接</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* BookID mode */}
                                {item.type === 'bookID' && (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={labelStyle}>选择书籍/作品</label>
                                                <button onClick={() => { const n = [...items]; n[index] = { ...n[index], type: '', id: '', name: '' }; onChange(n); }} style={changeTypeBtnStyle}>更换类型</button>
                                            </div>
                                            {item.id && item.name ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--bim-bg, #fff)', border: '1px solid #4caf50', borderRadius: '6px' }}>
                                                    <span style={{ color: '#4caf50', fontSize: '16px' }}>✓</span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                                                        <code style={{ fontSize: '11px', background: 'var(--bim-primary-soft, rgba(0,120,212,0.15))', padding: '2px 6px', borderRadius: '3px' }}>{item.id}</code>
                                                    </div>
                                                    <button onClick={() => handleSelectBook(index)} style={{ background: 'transparent', border: '1px solid var(--bim-widget-border, #e0e0e0)', color: 'var(--bim-fg, #333)', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '12px' }}>重选</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleSelectBook(index)} style={{ width: '100%', padding: '14px', border: '2px dashed var(--bim-widget-border, #e0e0e0)', borderRadius: '6px', background: 'transparent', color: 'var(--bim-fg, #333)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <span>🔍</span><span>点击选择书籍/作品</span>
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* URL mode */}
                                {item.type === 'url' && (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={labelStyle}>来源名称</label>
                                                <button onClick={() => { const n = [...items]; n[index] = { ...n[index], type: '', id: '', name: '' }; onChange(n); }} style={changeTypeBtnStyle}>更换类型</button>
                                            </div>
                                            <input type="text" value={item.name} onChange={e => handleUpdate(index, 'name', e.target.value)} placeholder="如: 维基文库、中国基本古籍库" style={inputStyle} />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>URL 地址</label>
                                            <input type="text" value={item.id} onChange={e => handleUpdate(index, 'id', e.target.value)} placeholder="https://..." style={inputStyle} />
                                        </div>
                                    </>
                                )}

                                {/* Optional fields */}
                                {item.type && (
                                    <>
                                        <div style={{ borderTop: '1px dashed var(--bim-widget-border, #e0e0e0)', paddingTop: '12px', marginTop: '4px' }}>
                                            <label style={{ ...labelStyle, opacity: 0.7 }}>可选信息</label>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={labelStyle}>详细说明 <span style={{ opacity: 0.5 }}>(可选)</span></label>
                                                <input type="text" value={item.details} onChange={e => handleUpdate(index, 'details', e.target.value)} placeholder="补充说明" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>位置/页码 <span style={{ opacity: 0.5 }}>(可选)</span></label>
                                                <input type="text" value={item.position} onChange={e => handleUpdate(index, 'position', e.target.value)} placeholder="如: 卷三, p.52" style={inputStyle} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={labelStyle}>数据版本 <span style={{ opacity: 0.5 }}>(可选)</span></label>
                                                <input type="text" value={item.version} onChange={e => handleUpdate(index, 'version', e.target.value)} placeholder="如: v1.0, 2024-01" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>处理器版本 <span style={{ opacity: 0.5 }}>(可选)</span></label>
                                                <input type="text" value={item.processor_version} onChange={e => handleUpdate(index, 'processor_version', e.target.value)} placeholder="如: v0.1" style={inputStyle} />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <button onClick={handleAdd} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '8px 16px', border: '1px dashed var(--bim-widget-border, #e0e0e0)', borderRadius: '4px',
                background: 'transparent', color: 'var(--bim-fg, #333)', cursor: 'pointer', fontSize: '13px', opacity: 0.8,
            }}>
                <span>+</span><span>添加来源</span>
            </button>
        </div>
    );
};

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', color: 'var(--bim-desc-fg, #717171)', marginBottom: '4px', fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', background: 'var(--bim-input-bg, #fff)', color: 'var(--bim-input-fg, #333)',
    border: '1px solid var(--bim-input-border, #ccc)', borderRadius: '2px', fontSize: '13px', boxSizing: 'border-box',
};

const typeButtonStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    padding: '16px 12px', background: 'var(--bim-bg, #fff)', border: '2px solid', borderRadius: '8px',
    cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s',
};

const changeTypeBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', color: 'var(--bim-link-fg, #0066cc)', cursor: 'pointer', fontSize: '11px', padding: 0,
};

/** 解析 JSON 格式的来源数组 */
export function parseSourceString(str: string): SourceItem[] {
    if (!str || !str.trim()) return [];
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
            return parsed.map(item => ({
                id: item.id || '', name: item.name || '', type: item.type || '',
                details: item.details || '', position: item.position || '',
                version: item.version || '', processor_version: item.processor_version || '',
            }));
        }
    } catch { /* ignore */ }
    return [];
}

/** 将结构化数组转换为字符串格式 */
export function stringifySources(items: SourceItem[]): string {
    if (!items || items.length === 0) return '';
    return JSON.stringify(items);
}
