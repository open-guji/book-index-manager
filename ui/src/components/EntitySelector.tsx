import React, { useState, useEffect } from 'react';
import type { IndexType, EntityOption } from '../types';

export interface EntitySelectorProps {
    isOpen: boolean;
    entityType: IndexType;
    title: string;
    onSelect: (entity: EntityOption) => void;
    onCancel: () => void;
    onCreate: () => void;
    searchResults: EntityOption[];
    onSearch: (query: string) => void;
    isLoading?: boolean;
    excludeId?: string;
}

export const EntitySelector: React.FC<EntitySelectorProps> = ({
    isOpen, entityType, title, onSelect, onCancel, onCreate,
    searchResults, onSearch, isLoading, excludeId,
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredResults = excludeId
        ? searchResults.filter(e => e.id !== excludeId)
        : searchResults;

    useEffect(() => {
        if (isOpen) { setSearchQuery(''); onSearch(''); }
    }, [isOpen]);

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        onSearch(query);
    };

    if (!isOpen) return null;

    const typeLabel = entityType === 'work' ? '作品' : entityType === 'book' ? '书籍' : '丛编';
    const typeIcon = entityType === 'work' ? '📜' : entityType === 'book' ? '📖' : '📚';

    return (
        <div style={overlayStyle}>
            <div style={dialogStyle}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{title}</div>
                    <button onClick={onCancel} style={closeBtnStyle}>✕</button>
                </div>

                {/* Search */}
                <div style={{ padding: '12px 16px' }}>
                    <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
                        placeholder={`搜索${typeLabel}名称或 ID...`} autoFocus style={searchInputStyle} />
                </div>

                {/* Results */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
                    {isLoading ? (
                        <div style={emptyStyle}>搜索中...</div>
                    ) : filteredResults.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {filteredResults.map(entity => (
                                <div key={entity.id} onClick={() => onSelect(entity)} style={itemStyle}>
                                    <span style={{ fontSize: '16px' }}>{typeIcon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 500 }}>{entity.title}</div>
                                        <div style={{ fontSize: '11px', opacity: 0.7 }}>
                                            {entity.id}{entity.author && ` · ${entity.author}`}{entity.dynasty && ` · ${entity.dynasty}`}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : searchQuery ? (
                        <div style={emptyStyle}>未找到匹配的{typeLabel}</div>
                    ) : (
                        <div style={emptyStyle}>输入关键词搜索{typeLabel}</div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--bim-widget-border, #e0e0e0)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', opacity: 0.7 }}>找不到？</span>
                    <button onClick={onCreate} style={createBtnStyle}>创建新{typeLabel}并关联</button>
                </div>
            </div>
        </div>
    );
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
    background: 'var(--bim-bg, #fff)', border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '8px', width: '500px', maxHeight: '70vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
};

const closeBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', opacity: 0.7, color: 'inherit',
};

const searchInputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--bim-input-border, #ccc)',
    borderRadius: '4px', background: 'var(--bim-input-bg, #fff)', color: 'var(--bim-input-fg, #333)',
    fontSize: '13px', boxSizing: 'border-box',
};

const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
    borderRadius: '4px', cursor: 'pointer', background: 'var(--bim-primary-soft, rgba(0,120,212,0.05))',
};

const emptyStyle: React.CSSProperties = {
    padding: '20px', textAlign: 'center', color: 'var(--bim-desc-fg, #717171)',
};

const createBtnStyle: React.CSSProperties = {
    padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '4px',
    background: 'var(--bim-primary, #0078d4)', color: 'var(--bim-primary-fg, #fff)', cursor: 'pointer',
};
