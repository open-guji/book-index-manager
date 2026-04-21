import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { IndexType, IndexEntry, IndexSource, SyncConfig, GroupedSearchResult } from '../types';
import type { IndexStorage } from '../storage/types';
import { ModeIndicator } from './ModeIndicator';
import { SearchInput } from './SearchInput';
import { useT, useConvert, formatTemplate } from '../i18n';

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

function removeRecentId(id: string) {
    try {
        const list = loadRecentIds().filter(i => i !== id);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

function clearAllRecentIds() {
    try {
        localStorage.removeItem(RECENT_KEY);
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
    /** 标题栏右侧自定义内容 */
    headerRight?: React.ReactNode;
}

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
    headerRight,
}) => {
    const t = useT();

    const TYPE_CONFIG: { type: IndexType; icon: string; name: string; key: keyof GroupedSearchResult }[] = [
        { type: 'work', icon: '✍️', name: t.indexType.work, key: 'works' },
        { type: 'book', icon: '📖', name: t.indexType.book, key: 'books' },
        { type: 'collection', icon: '📚', name: t.indexType.collection, key: 'collections' },
    ];

    const [searchQuery, setSearchQuery] = useState(initialQuery ?? '');
    const [searchResults, setSearchResults] = useState<GroupedSearchResult | null>(null);
    const [expandedType, setExpandedType] = useState<IndexType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [showingRecent, setShowingRecent] = useState(!initialQuery);
    const [recentIds, setRecentIds] = useState<string[]>(loadRecentIds);
    const [recentEntries, setRecentEntries] = useState<(IndexEntry & { notFound?: boolean })[]>([]);
    const [recentLoading, setRecentLoading] = useState(false);
    const [recentExpanded, setRecentExpanded] = useState(false);
    const [stats, setStats] = useState<{ works: number; books: number; collections: number; hasText?: number; hasImage?: number } | null>(null);
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

    // 加载总数统计
    useEffect(() => {
        let cancelled = false;
        const types: IndexType[] = ['work', 'book', 'collection'];
        const entriesP = Promise.all(
            types.map(t => transport.loadEntries(t, { page: 1, pageSize: 1 }).catch(() => ({ total: 0 })))
        );
        const countsP = transport.getResourceCounts?.().catch(() => null) ?? Promise.resolve(null);
        Promise.all([entriesP, countsP]).then(([results, counts]) => {
            if (cancelled) return;
            setStats({
                works: results[0].total,
                books: results[1].total,
                collections: results[2].total,
                hasText: counts?.hasText,
                hasImage: counts?.hasImage,
            });
        });
        return () => { cancelled = true; };
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
            recentIds.slice(0, 10).map(async id => {
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
                            edition: (raw.edition as string) || undefined,
                        } as IndexEntry;
                    }
                } catch { /* ignore */ }
                // 未找到的条目，返回占位卡片
                return { id, title: id, type: 'work' as IndexType, notFound: true };
            })
        ).then(results => {
            if (cancelled) return;
            setRecentEntries(results);
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

    const handleRemoveRecent = (id: string) => {
        removeRecentId(id);
        setRecentIds(loadRecentIds());
    };

    const handleClearAllRecent = () => {
        clearAllRecentIds();
        setRecentIds([]);
    };

    const getConfig = (type: IndexType) => TYPE_CONFIG.find(c => c.type === type)!;
    const hasAnyResults = searchResults &&
        (searchResults.works.length > 0 || searchResults.books.length > 0 || searchResults.collections.length > 0);

    return (
        <div className="bim-browser-container">
            <header style={{ padding: '12px 20px', borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', color: 'var(--bim-fg, #333)' }}>{t.browser.title}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {headerRight}
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
                        {t.action.newEntry}
                    </button>
                )}
            </div>

            {/* 统计摘要 */}
            {stats && showingRecent && (
                <div style={{
                    padding: '0 20px 8px',
                    fontSize: '12px',
                    color: 'var(--bim-desc-fg, #999)',
                    display: 'flex',
                    justifyContent: 'space-between',
                }}>
                    <span>
                        {t.indexType.work} <strong style={{ color: 'var(--bim-fg, #555)' }}>{stats.works.toLocaleString()}</strong>
                        <span style={{ margin: '0 6px' }}>·</span>
                        {t.indexType.book} <strong style={{ color: 'var(--bim-fg, #555)' }}>{stats.books.toLocaleString()}</strong>
                        <span style={{ margin: '0 6px' }}>·</span>
                        {t.indexType.collection} <strong style={{ color: 'var(--bim-fg, #555)' }}>{stats.collections.toLocaleString()}</strong>
                    </span>
                    {stats.hasImage != null && stats.hasText != null && (
                        <span>
                            {t.resourceType.image} <strong style={{ color: 'var(--bim-fg, #555)' }}>{stats.hasImage.toLocaleString()}</strong>
                            <span style={{ margin: '0 6px' }}>·</span>
                            {t.resourceType.text} <strong style={{ color: 'var(--bim-fg, #555)' }}>{stats.hasText.toLocaleString()}</strong>
                        </span>
                    )}
                </div>
            )}

            {/* Content */}
            <div style={{ padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--bim-desc-fg, #717171)' }}>
                        {t.search.searching}
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
                                {t.search.loading}
                            </div>
                        ) : recentEntries.length > 0 ? (
                            <>
                                <div style={{ padding: '8px 0', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{t.search.recentBrowse}</span>
                                    <button
                                        onClick={handleClearAllRecent}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: 'var(--bim-desc-fg, #999)',
                                            cursor: 'pointer',
                                            fontSize: '11px',
                                            padding: '2px 4px',
                                        }}
                                    >
                                        {t.search.clearRecent}
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {recentEntries.slice(0, recentExpanded ? 10 : 3).map(entry => (
                                        entry.notFound ? (
                                            <NotFoundCard
                                                key={entry.id}
                                                id={entry.id}
                                                onRemove={handleRemoveRecent}
                                                t={t}
                                            />
                                        ) : (
                                            <EntryCard
                                                key={entry.id}
                                                entry={entry}
                                                selected={selectedId === entry.id}
                                                onClick={handleEntryClick}
                                                getConfig={getConfig}
                                                onRemove={handleRemoveRecent}
                                            />
                                        )
                                    ))}
                                </div>
                                {!recentExpanded && recentEntries.length > 3 && (
                                    <button
                                        onClick={() => setRecentExpanded(true)}
                                        style={{
                                            display: 'block',
                                            margin: '8px auto 0',
                                            padding: '4px 16px',
                                            fontSize: '12px',
                                            color: 'var(--bim-primary, #0078d4)',
                                            background: 'transparent',
                                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {t.action.expandMore}
                                    </button>
                                )}
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--bim-fg, #333)' }}>{t.search.searchTitle}</h3>
                                <p style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>{t.search.searchSubtitle}</p>
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
                                                {total} {t.unit.items}
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
                                                {t.action.viewAll}
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
                            {formatTemplate(t.search.noResultsFor, { query: searchQuery })}
                        </h3>
                        <p style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>
                            {t.search.tryOther}
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
    onRemove?: (id: string) => void;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, selected, onClick, getConfig, query, onRemove }) => {
    const t = useT();
    const { convert } = useConvert();

    // 检查是否通过别名或附载篇目匹配
    const allAliases = [...(entry.additional_titles || []), ...(entry.attached_texts || [])];
    const matchedAlias = query && allAliases.length
        ? allAliases.find(a => {
            const s = typeof a === 'string' ? a : (a as any)?.book_title;
            return s?.toLowerCase().includes(query.toLowerCase());
        })
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                <span style={{ fontSize: '16px' }}>{getConfig(entry.type).icon}</span>
                <span style={{ fontSize: '9px', color: 'var(--bim-desc-fg, #999)', lineHeight: 1 }}>{getConfig(entry.type).name}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>
                        {convert(entry.title)}
                    </span>
                    {/* 资源图标 */}
                    <span style={{ display: 'flex', gap: '2px', fontSize: '12px', opacity: 0.7 }}>
                        {entry.has_text && <span title={t.misc.textResource}>📝</span>}
                        {entry.has_image && <span title={t.misc.imageResource}>🖼️</span>}
                    </span>
                    {/* 版本 */}
                    {entry.edition && (
                        <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)' }}>
                            {convert(entry.edition)}
                        </span>
                    )}
                    {/* 卷/回数等計量：優先 measure_info，退回 juan_count */}
                    {entry.measure_info ? (
                        <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)' }}>
                            {convert(entry.measure_info)}
                        </span>
                    ) : entry.juan_count != null && entry.juan_count > 0 ? (
                        <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)' }}>
                            {entry.juan_count}{t.unit.juan}
                        </span>
                    ) : null}
                </div>
                {/* 作者朝代 */}
                {(entry.dynasty || entry.author) && (
                    <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                        {entry.dynasty && <span>〔{convert(entry.dynasty)}〕</span>}
                        {entry.author && <span>{convert(entry.author)}</span>}
                        {entry.role && entry.role !== 'author' && <span> {convert(entry.role)}</span>}
                    </div>
                )}
                {/* 别名匹配提示 */}
                {matchedAlias && (
                    <div style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                        {t.search.alias}：{convert(matchedAlias)}
                    </div>
                )}
            </div>
            {onRemove ? (
                <button
                    onClick={e => { e.stopPropagation(); onRemove(entry.id); }}
                    title={t.search.removeFromRecent}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--bim-desc-fg, #999)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '2px 4px',
                        lineHeight: 1,
                        opacity: 0.5,
                        marginTop: '2px',
                    }}
                >
                    ×
                </button>
            ) : (
                <span style={{ opacity: 0.4, marginTop: '2px' }}>→</span>
            )}
        </div>
    );
};

// ── Not Found Card ──

const NotFoundCard: React.FC<{
    id: string;
    onRemove: (id: string) => void;
    t: ReturnType<typeof useT>;
}> = ({ id, onRemove, t }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '6px',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            background: 'var(--bim-input-bg, #fff)',
            opacity: 0.6,
        }}
    >
        <span style={{ fontSize: '16px' }}>❓</span>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: 'var(--bim-fg, #333)', fontFamily: 'monospace' }}>{id}</div>
            <div style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #999)', marginTop: '2px' }}>
                {t.search.itemNotFound}
            </div>
        </div>
        <button
            onClick={() => onRemove(id)}
            title={t.search.removeFromRecent}
            style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--bim-desc-fg, #999)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 4px',
                lineHeight: 1,
            }}
        >
            ×
        </button>
    </div>
);
