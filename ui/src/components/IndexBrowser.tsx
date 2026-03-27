import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { IndexType, IndexEntry, IndexSource, SyncConfig, GroupedSearchResult } from '../types';
import type { IndexStorage } from '../storage/types';
import { ModeIndicator } from './ModeIndicator';
import { SearchInput } from './SearchInput';

const RECENT_KEY = 'bim-recent-ids';
const RECENT_KEY_LEGACY = 'bim-recent-entries';
const MAX_RECENT = 50;
const SEARCH_LIMIT = 5;
const SEARCH_LIMIT_EXPANDED = 50;
const DEBOUNCE_MS = 200;

function loadRecentIds(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (raw) return JSON.parse(raw);
        const legacy = localStorage.getItem(RECENT_KEY_LEGACY);
        if (legacy) {
            const ids = (JSON.parse(legacy) as { id: string }[]).map(e => e.id);
            localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
            localStorage.removeItem(RECENT_KEY_LEGACY);
            return ids;
        }
        return [];
    } catch {
        return [];
    }
}

function saveRecentId(id: string) {
    try {
        const list = loadRecentIds().filter(i => i !== id);
        list.unshift(id);
        if (list.length > MAX_RECENT) list.length = MAX_RECENT;
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

export interface IndexBrowserProps {
    transport: IndexStorage;
    indexSource?: IndexSource;
    syncConfig?: SyncConfig;
    onEntryClick?: (entry: IndexEntry) => void;
    onNewEntry?: (type: IndexType) => void;
    onSwitchMode?: () => void;
    onToggleDraft?: () => void;
    onConfigurePath?: () => void;
    onSelectFolder?: () => void;
    hideModeIndicator?: boolean;
    /** 初始搜索词（用于从 URL 恢复搜索状态） */
    initialQuery?: string;
    /** 搜索词变化回调（用于同步到 URL） */
    onQueryChange?: (query: string) => void;
}

const TYPE_CONFIG: { type: IndexType; icon: string; name: string; key: keyof GroupedSearchResult }[] = [
    { type: 'work', icon: '✍️', name: '作品', key: 'works' },
    { type: 'book', icon: '📖', name: '书籍', key: 'books' },
    { type: 'collection', icon: '📚', name: '丛编', key: 'collections' },
];

const TOTAL_KEYS: Record<string, keyof GroupedSearchResult> = {
    works: 'totalWorks',
    books: 'totalBooks',
    collections: 'totalCollections',
};

export const IndexBrowser: React.FC<IndexBrowserProps> = ({
    transport,
    indexSource = 'local',
    syncConfig,
    onEntryClick,
    onNewEntry,
    onSwitchMode,
    onToggleDraft,
    onConfigurePath,
    onSelectFolder,
    hideModeIndicator,
    initialQuery,
    onQueryChange,
}) => {
    const [searchQuery, setSearchQuery] = useState(initialQuery ?? '');
    const [searchResults, setSearchResults] = useState<GroupedSearchResult | null>(null);
    const [expandedType, setExpandedType] = useState<IndexType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [showingRecent, setShowingRecent] = useState(!initialQuery);
    const [recentIds, setRecentIds] = useState<string[]>(loadRecentIds);
    const [recentEntries, setRecentEntries] = useState<IndexEntry[]>([]);
    const [recentLoading, setRecentLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const initialSearchDone = useRef(false);

    const doSearch = useCallback(async (query: string, limit?: number) => {
        if (!query.trim()) {
            setShowingRecent(true);
            setSearchResults(null);
            setExpandedType(null);
            return;
        }
        setShowingRecent(false);
        setIsLoading(true);
        setErrorMessage('');
        try {
            if (transport.searchAll) {
                const result = await transport.searchAll(query, limit ?? SEARCH_LIMIT);
                setSearchResults(result);
            } else {
                // Fallback: search each type separately
                const types: IndexType[] = ['work', 'book', 'collection'];
                const results = await Promise.all(
                    types.map(t => transport.search(query, t, { page: 1, pageSize: limit ?? SEARCH_LIMIT }))
                );
                setSearchResults({
                    works: results[0].entries,
                    books: results[1].entries,
                    collections: results[2].entries,
                    totalWorks: results[0].total,
                    totalBooks: results[1].total,
                    totalCollections: results[2].total,
                });
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
            setSearchResults(null);
        } finally {
            setIsLoading(false);
        }
    }, [transport]);

    // Execute initial search from URL query
    useEffect(() => {
        if (initialSearchDone.current || !initialQuery?.trim()) return;
        initialSearchDone.current = true;
        doSearch(initialQuery);
    }, [initialQuery, doSearch]);

    const handleInputChange = useCallback((value: string) => {
        setSearchQuery(value);
        onQueryChange?.(value);
        if (!value.trim()) {
            setShowingRecent(true);
            setSearchResults(null);
            setExpandedType(null);
            return;
        }
        // debounce search
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setExpandedType(null);
            doSearch(value);
        }, DEBOUNCE_MS);
    }, [doSearch, onQueryChange]);

    const handleSearchCommit = useCallback((query: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        onQueryChange?.(query);
        doSearch(query);
    }, [doSearch, onQueryChange]);

    const handleExpandType = useCallback((type: IndexType) => {
        setExpandedType(type);
        doSearch(searchQuery, SEARCH_LIMIT_EXPANDED);
    }, [searchQuery, doSearch]);

    // 从 ID 列表解析最近浏览条目
    useEffect(() => {
        if (!recentIds.length) { setRecentEntries([]); return; }
        let cancelled = false;
        setRecentLoading(true);
        Promise.all(
            recentIds.slice(0, 8).map(async id => {
                try {
                    if (transport.getEntry) {
                        const entry = await transport.getEntry(id);
                        if (entry) return entry;
                    }
                    const raw = await transport.getItem(id);
                    if (raw) {
                        const authors = raw.authors as { name?: string; dynasty?: string; role?: string }[] | undefined;
                        return {
                            id,
                            title: (raw.title as string) || id,
                            type: (raw.type as IndexType) || 'work',
                            author: authors?.[0]?.name,
                            dynasty: authors?.[0]?.dynasty,
                            role: authors?.[0]?.role,
                        } as IndexEntry;
                    }
                } catch { /* ignore */ }
                return null;
            })
        ).then(results => {
            if (cancelled) return;
            setRecentEntries(results.filter((e): e is IndexEntry => e !== null));
            setRecentLoading(false);
        });
        return () => { cancelled = true; };
    }, [recentIds, transport]);

    const handleEntryClick = (entry: IndexEntry) => {
        setSelectedId(entry.id);
        saveRecentId(entry.id);
        setRecentIds(loadRecentIds());
        onEntryClick?.(entry);
    };

    const getConfig = (type: IndexType) => TYPE_CONFIG.find(c => c.type === type)!;
    const hasAnyResults = searchResults &&
        (searchResults.works.length > 0 || searchResults.books.length > 0 || searchResults.collections.length > 0);

    return (
        <div className="bim-browser-container">
            <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '18px', color: 'var(--bim-fg, #333)' }}>索引浏览器</h1>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>
                            浏览和管理古籍元数据
                        </p>
                    </div>
                    {!hideModeIndicator && (
                        <ModeIndicator
                            variant="index-browser"
                            indexSource={indexSource}
                            syncConfig={syncConfig}
                            onSwitchMode={onSwitchMode}
                            onToggleDraft={onToggleDraft}
                            onConfigurePath={onConfigurePath}
                            onSelectFolder={onSelectFolder}
                        />
                    )}
                </div>
            </header>

            {/* Search bar */}
            <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', alignItems: 'center' }}>
                <SearchInput
                    transport={transport}
                    value={searchQuery}
                    onChange={handleInputChange}
                    onSearch={handleSearchCommit}
                    onEntrySelect={handleEntryClick}
                />
                {onNewEntry && (
                    <button
                        onClick={() => onNewEntry('work')}
                        style={{
                            padding: '8px 14px',
                            border: '1px solid var(--bim-primary, #0078d4)',
                            borderRadius: '6px',
                            background: 'transparent',
                            color: 'var(--bim-primary, #0078d4)',
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        + 新建
                    </button>
                )}
            </div>

            {/* Content */}
            <div style={{ padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--bim-desc-fg, #717171)' }}>
                        搜索中...
                    </div>
                ) : errorMessage ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                        <p style={{ color: 'var(--bim-desc-fg, #717171)' }}>{errorMessage}</p>
                    </div>
                ) : showingRecent ? (
                    /* Recent entries view */
                    <div style={{ flex: 1 }}>
                        {recentLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--bim-desc-fg, #717171)' }}>
                                加载中...
                            </div>
                        ) : recentEntries.length > 0 ? (
                            <>
                                <div style={{ padding: '8px 0', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>
                                    最近浏览
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {recentEntries.map(entry => (
                                        <EntryCard
                                            key={entry.id}
                                            entry={entry}
                                            selected={selectedId === entry.id}
                                            onClick={handleEntryClick}
                                            getConfig={getConfig}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--bim-fg, #333)' }}>搜索古籍索引</h3>
                                <p style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>输入关键词搜索作品、书籍或丛编</p>
                            </div>
                        )}
                    </div>
                ) : hasAnyResults ? (
                    /* Grouped search results */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {TYPE_CONFIG.map(({ type, icon, name, key }) => {
                            const entries = searchResults[key] as IndexEntry[];
                            const totalKey = TOTAL_KEYS[key];
                            const total = searchResults[totalKey] as number;
                            if (entries.length === 0) return null;

                            const isExpanded = expandedType === type;
                            const showExpandBtn = !isExpanded && total > SEARCH_LIMIT;

                            return (
                                <div key={type}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '6px 0',
                                        borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                                        marginBottom: '6px',
                                    }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bim-fg, #333)' }}>
                                            {icon} {name}
                                            <span style={{ fontWeight: 400, color: 'var(--bim-desc-fg, #717171)', marginLeft: '6px' }}>
                                                {total} 条
                                            </span>
                                        </span>
                                        {showExpandBtn && (
                                            <button
                                                onClick={() => handleExpandType(type)}
                                                style={{
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: 'var(--bim-primary, #0078d4)',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                查看全部 →
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {entries.map(entry => (
                                            <EntryCard
                                                key={entry.id}
                                                entry={entry}
                                                selected={selectedId === entry.id}
                                                onClick={handleEntryClick}
                                                getConfig={getConfig}
                                                query={searchQuery}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
                        <h3 style={{ margin: '0 0 8px', color: 'var(--bim-fg, #333)' }}>
                            未找到与「{searchQuery}」相关的结果
                        </h3>
                        <p style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>
                            试试其他关键词、别名或作者名
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Entry Card ──

interface EntryCardProps {
    entry: IndexEntry;
    selected: boolean;
    onClick: (entry: IndexEntry) => void;
    getConfig: (type: IndexType) => { icon: string; name: string };
    query?: string;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, selected, onClick, getConfig, query }) => {
    // 检查是否通过别名匹配
    const matchedAlias = query && entry.additional_titles
        ? entry.additional_titles.find(a => a.toLowerCase().includes(query.toLowerCase()))
        : undefined;

    return (
        <div
            onClick={() => onClick(entry)}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: selected ? '1px solid var(--bim-primary, #0078d4)' : '1px solid var(--bim-widget-border, #e0e0e0)',
                cursor: 'pointer',
                background: 'var(--bim-input-bg, #fff)',
            }}
        >
            <span style={{ fontSize: '16px', marginTop: '2px' }}>{getConfig(entry.type).icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>
                        {entry.title}
                    </span>
                    {/* 资源图标 */}
                    <span style={{ display: 'flex', gap: '2px', fontSize: '12px', opacity: 0.7 }}>
                        {entry.has_text && <span title="文字资源">📝</span>}
                        {entry.has_image && <span title="图片资源">🖼️</span>}
                    </span>
                    {/* 版本 */}
                    {entry.edition && (
                        <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)' }}>
                            {entry.edition}
                        </span>
                    )}
                    {/* 卷数 */}
                    {entry.juan_count != null && entry.juan_count > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)' }}>
                            {entry.juan_count}卷
                        </span>
                    )}
                </div>
                {/* 作者朝代 */}
                {(entry.dynasty || entry.author) && (
                    <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                        {entry.dynasty && <span>〔{entry.dynasty}〕</span>}
                        {entry.author && <span>{entry.author}</span>}
                        {entry.role && entry.role !== 'author' && <span> {entry.role}</span>}
                    </div>
                )}
                {/* 别名匹配提示 */}
                {matchedAlias && (
                    <div style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                        别名：{matchedAlias}
                    </div>
                )}
            </div>
            <span style={{ opacity: 0.4, marginTop: '2px' }}>→</span>
        </div>
    );
};
