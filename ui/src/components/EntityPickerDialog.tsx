import React, { useState, useEffect, useCallback } from 'react';
import type { IndexType, EntityOption } from '../types';
import { bim } from '../styles/tokens';

export interface EntityPickerDialogProps {
    isOpen: boolean;
    title?: string;
    filterType?: IndexType | 'all';
    recentEntities?: EntityOption[];
    excludeId?: string;
    showCreateButton?: boolean;
    createButtonText?: string;
    onSelect: (entity: EntityOption) => void;
    onCancel: () => void;
    onCreate?: () => void;
    onSearch: (query: string, type: IndexType | 'all') => Promise<EntityOption[]>;
}

function getTypeIcon(type: string): string {
    switch (type) { case 'work': return '📜'; case 'collection': return '📚'; case 'book': return '📖'; default: return '📄'; }
}

function getTypeName(type: string): string {
    switch (type) { case 'work': return '作品'; case 'collection': return '丛编'; case 'book': return '书籍'; default: return '实体'; }
}

function getTypeColor(type: string): string {
    switch (type) { case 'work': return bim('editor-type-work'); case 'collection': return bim('editor-type-collection'); case 'book': return bim('editor-type-book'); default: return bim('desc-fg'); }
}

export const EntityPickerDialog: React.FC<EntityPickerDialogProps> = ({
    isOpen, title, filterType = 'all', recentEntities = [], excludeId,
    showCreateButton = false, createButtonText, onSelect, onCancel, onCreate, onSearch,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<EntityOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeTab, setActiveTab] = useState<'recent' | 'search'>('recent');

    useEffect(() => {
        if (isOpen) {
            setSearchQuery(''); setSearchResults([]);
            setActiveTab(recentEntities.length > 0 ? 'recent' : 'search');
        }
    }, [isOpen, recentEntities.length]);

    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try { setSearchResults(await onSearch(searchQuery, filterType)); }
            catch { setSearchResults([]); }
            finally { setIsSearching(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, filterType, onSearch]);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        if (e.target.value.trim()) setActiveTab('search');
    }, []);

    const filterExcluded = useCallback((entities: EntityOption[]) =>
        excludeId ? entities.filter(e => e.id !== excludeId) : entities, [excludeId]);

    if (!isOpen) return null;

    const displayTitle = title || (filterType === 'all' ? '选择实体' : `选择${getTypeName(filterType)}`);
    const filteredRecent = filterExcluded(recentEntities);
    const filteredResults = filterExcluded(searchResults);

    return (
        <div style={overlayStyle}>
            <div style={dialogStyle}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${bim('widget-border')}` }}>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>{displayTitle}</div>
                    <button onClick={onCancel} style={closeBtnStyle}>✕</button>
                </div>

                {/* Search */}
                <div style={{ padding: '16px 20px 12px' }}>
                    <div style={{ position: 'relative' }}>
                        <input type="text" value={searchQuery} onChange={handleSearchChange}
                            placeholder="输入名称或 ID 搜索..." autoFocus style={searchInputStyle} />
                        <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '14px' }}>🔍</span>
                        {isSearching && <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', opacity: 0.6 }}>搜索中...</span>}
                    </div>
                </div>

                {/* Tabs */}
                {filteredRecent.length > 0 && (
                    <div style={{ display: 'flex', padding: '0 20px', gap: '4px', borderBottom: `1px solid ${bim('widget-border')}` }}>
                        <TabBtn active={activeTab === 'recent'} onClick={() => setActiveTab('recent')}>最近使用 ({filteredRecent.length})</TabBtn>
                        <TabBtn active={activeTab === 'search'} onClick={() => setActiveTab('search')}>搜索结果 {filteredResults.length > 0 && `(${filteredResults.length})`}</TabBtn>
                    </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', minHeight: '200px', maxHeight: '400px' }}>
                    {activeTab === 'recent' && filteredRecent.length > 0 ? (
                        <EntityList entities={filteredRecent} onSelect={onSelect} />
                    ) : searchQuery.trim() ? (
                        isSearching ? <EmptyState message="搜索中..." /> :
                        filteredResults.length > 0 ? <EntityList entities={filteredResults} onSelect={onSelect} /> :
                        <EmptyState message="未找到匹配的结果" />
                    ) : (
                        <EmptyState message="输入关键词开始搜索" />
                    )}
                </div>

                {/* Footer */}
                {showCreateButton && onCreate && (
                    <div style={{ padding: '12px 20px', borderTop: `1px solid ${bim('widget-border')}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>找不到？</span>
                        <button onClick={onCreate} style={createBtnStyle}>{createButtonText || '创建新实体'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
        padding: '10px 16px', border: 'none',
        borderBottom: active ? `2px solid ${bim('primary')}` : '2px solid transparent',
        background: 'transparent',
        color: active ? bim('fg') : bim('desc-fg'),
        cursor: 'pointer', fontSize: '12px', fontWeight: active ? 600 : 400, marginBottom: '-1px',
    }}>
        {children}
    </button>
);

const EntityList: React.FC<{ entities: EntityOption[]; onSelect: (e: EntityOption) => void }> = ({ entities, onSelect }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {entities.map(entity => (
            <EntityItem key={entity.id} entity={entity} onClick={() => onSelect(entity)} />
        ))}
    </div>
);

const EntityItem: React.FC<{ entity: EntityOption; onClick: () => void }> = ({ entity, onClick }) => {
    const [hovered, setHovered] = useState(false);
    return (
        <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '6px',
                cursor: 'pointer', background: hovered ? bim('primary-soft') : bim('primary-soft'),
                transition: 'background 0.1s',
            }}>
            <span style={{ fontSize: '18px' }}>{getTypeIcon(entity.type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entity.title}
                    {entity.edition && <span style={{ fontSize: '11px', fontWeight: 400, color: bim('desc-fg'), marginLeft: '4px' }}>{entity.edition}</span>}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <code style={{ fontSize: '10px', background: bim('primary-soft'), padding: '1px 4px', borderRadius: '2px' }}>{entity.id}</code>
                    {entity.author && <span>{entity.author}</span>}
                    {entity.dynasty && <span>{entity.dynasty}</span>}
                </div>
            </div>
            <span style={{ fontSize: '10px', padding: '3px 8px', background: getTypeColor(entity.type), color: bim('on-color-fg'), borderRadius: '4px', fontWeight: 500, flexShrink: 0 }}>
                {getTypeName(entity.type)}
            </span>
        </div>
    );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: bim('desc-fg'), fontSize: '13px' }}>{message}</div>
);

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: bim('backdrop'), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
    background: bim('bg'), border: `1px solid ${bim('widget-border')}`,
    borderRadius: '8px', width: '550px', maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column', boxShadow: bim('shadow-dialog'),
};

const closeBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', opacity: 0.7, color: 'inherit', padding: '4px 8px',
};

const searchInputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', paddingLeft: '40px',
    border: `1px solid ${bim('input-border')}`, borderRadius: '6px',
    background: bim('input-bg'), color: bim('input-fg'),
    fontSize: '13px', boxSizing: 'border-box',
};

const createBtnStyle: React.CSSProperties = {
    padding: '6px 14px', fontSize: '12px', border: 'none', borderRadius: '4px',
    background: bim('primary'), color: bim('primary-fg'), cursor: 'pointer',
};
