import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { IndexType, IndexEntry, IndexSource, SyncConfig, GroupedSearchResult } from '../types';
import type { IndexStorage } from '../storage/types';
import { ModeIndicator } from './ModeIndicator';
import { SearchInput } from './SearchInput';
import { useT, useConvert, formatTemplate } from '../i18n';
import { splitHighlightSnippet } from '../core/highlight';
import { bim } from '../styles/tokens';
import { useBidUrl } from '../core/bid-url';

/** 「最近浏览」存 localStorage 的键（值为 ID 数组，新的在前）；宿主要读写或清空时用它 */
export const RECENT_IDS_STORAGE_KEY = 'bim-recent-ids';
const RECENT_KEY_LEGACY = 'bim-recent-entries';
const MAX_RECENT = 50;
const SEARCH_LIMIT = 5;
const SEARCH_LIMIT_EXPANDED = 50;
const DEBOUNCE_MS = 200;

function loadRecentIds(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_IDS_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
        const legacy = localStorage.getItem(RECENT_KEY_LEGACY);
        if (legacy) {
            const ids = (JSON.parse(legacy) as { id: string }[]).map(e => e.id);
            localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(ids));
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
        localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

function removeRecentId(id: string) {
    try {
        const list = loadRecentIds().filter(i => i !== id);
        localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

function clearAllRecentIds() {
    try {
        localStorage.removeItem(RECENT_IDS_STORAGE_KEY);
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
    /**
     * 容器最小高度占满一屏（默认 false，由宿主按需打开）：搜索占位 → 结果等会改变内容高度，
     * 占满一屏后紧跟其后的宿主页脚始终在首屏之外，不会被顶动（CLS）。
     * 宿主一般只在有检索词、结果区会变高时才传 true；不带检索词时下面若还有别的内容
     * （如网站首页的推荐/目录页签），占满一屏会把它们推出首屏。
     */
    reserveViewportHeight?: boolean;
    /**
     * 结果条目的展示形态。
     * - 'compact'（默认）：紧凑单行列表，适合插件侧栏等窄容器
     * - 'card'：书目卡片（竖排书名「封面」+ 信息区），适合宽屏站点
     * 默认值保持 'compact'，既有消费者观感不变。
     */
    resultVariant?: 'compact' | 'card';
    /** 完全自定义条目渲染，优先级高于 resultVariant */
    renderEntry?: (entry: IndexEntry) => React.ReactNode;
}

const TOTAL_KEYS: Record<string, keyof GroupedSearchResult> = {
    works: 'totalWorks',
    books: 'totalBooks',
    collections: 'totalCollections',
    entities: 'totalEntities',
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
    resultVariant = 'compact',
    renderEntry,
    initialQuery,
    onQueryChange,
    headerRight,
    reserveViewportHeight = false,
}) => {
    const t = useT();

    const TYPE_CONFIG: { type: IndexType; icon: string; name: string; key: keyof GroupedSearchResult }[] = [
        { type: 'work', icon: '✍️', name: t.indexType.work, key: 'works' },
        { type: 'book', icon: '📖', name: t.indexType.book, key: 'books' },
        { type: 'collection', icon: '📚', name: t.indexType.collection, key: 'collections' },
        { type: 'entity', icon: '👤', name: t.indexType.entity, key: 'entities' },
    ];

    const [searchQuery, setSearchQuery] = useState(initialQuery ?? '');
    const [searchResults, setSearchResults] = useState<GroupedSearchResult | null>(null);
    const [expandedType, setExpandedType] = useState<IndexType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [showingRecent, setShowingRecent] = useState(!initialQuery?.trim());
    const [recentIds, setRecentIds] = useState<string[]>(loadRecentIds);
    const [recentEntries, setRecentEntries] = useState<(IndexEntry & { notFound?: boolean })[]>([]);
    const [recentLoading, setRecentLoading] = useState(false);
    const [recentExpanded, setRecentExpanded] = useState(false);
    const [stats, setStats] = useState<{ works: number; books: number; collections: number; entities: number; hasText?: number; hasImage?: number } | null>(null);
    const [subtypeStats, setSubtypeStats] = useState<Record<string, number> | null>(null);
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
                const types: IndexType[] = ['work', 'book', 'collection', 'entity'];
                const results = await Promise.all(
                    types.map(t => transport.search(query, t, { page: 1, pageSize: limit ?? SEARCH_LIMIT }))
                );
                setSearchResults({
                    works: results[0].entries,
                    books: results[1].entries,
                    collections: results[2].entries,
                    entities: results[3].entries,
                    totalWorks: results[0].total,
                    totalBooks: results[1].total,
                    totalCollections: results[2].total,
                    totalEntities: results[3].total,
                });
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
            setSearchResults(null);
        } finally {
            setIsLoading(false);
        }
    }, [transport]);

    // 加载总数统计：优先读 transport.getCounts()（一个 < 1 KB 的 meta.json）。
    // 在 BundleStorage 下避免触发 7 次并发的 /data/index.json 下载。
    useEffect(() => {
        let cancelled = false;

        const fallback = () => {
            const types: IndexType[] = ['work', 'book', 'collection', 'entity'];
            const entriesP = Promise.all(
                types.map(t => transport.loadEntries(t, { page: 1, pageSize: 1 }).catch(() => ({ total: 0 })))
            );
            const countsP = transport.getResourceCounts?.().catch(() => null) ?? Promise.resolve(null);
            const subtypeP = transport.getSubtypeStats?.().catch(() => null) ?? Promise.resolve(null);
            Promise.all([entriesP, countsP, subtypeP]).then(([results, counts, subtypes]) => {
                if (cancelled) return;
                setStats({
                    works: results[0].total,
                    books: results[1].total,
                    collections: results[2].total,
                    entities: results[3].total,
                    hasText: counts?.hasText,
                    hasImage: counts?.hasImage,
                });
                if (subtypes) setSubtypeStats(subtypes);
            });
        };

        if (transport.getCounts) {
            transport.getCounts().then(c => {
                if (cancelled) return;
                setStats({
                    works: c.works,
                    books: c.books,
                    collections: c.collections,
                    entities: c.entities,
                    hasText: c.resourceCounts?.hasText,
                    hasImage: c.resourceCounts?.hasImage,
                });
                if (c.subtypeStats) setSubtypeStats(c.subtypeStats);
            }).catch(() => { if (!cancelled) fallback(); });
        } else {
            fallback();
        }
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
        if (!value.trim()) {
            // 清空时立即同步给上层（router.push 回 /book-index 不带 q，无副作用）
            onQueryChange?.(value);
            setShowingRecent(true);
            setSearchResults(null);
            setExpandedType(null);
            return;
        }
        // debounce — 上抛 onQueryChange 也走同一个 timer，避免每个字符都 router.push
        // 触发 page re-render 中断用户输入（尤其是 IME 拼音）。
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setExpandedType(null);
            onQueryChange?.(value);
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

    /**
     * 结果卡片（真 <a href>）的点击。普通左键 + 有 onEntryClick → 拦下走客户端路由；
     * 修饰键 / 中键 / 无 onEntryClick → 交给浏览器（新标签、整页跳转）。
     * 两种情况都记最近浏览。
     */
    const handleEntryLinkClick = (entry: IndexEntry, e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onEntryClick && isPlainLeftClick(e)) {
            e.preventDefault();
            handleEntryClick(entry);
            return;
        }
        saveRecentId(entry.id);
        setRecentIds(loadRecentIds());
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
    // 带 ?q= 首次渲染时搜索 effect 还没跑：searchResults 为空、isLoading 也还是 false，
    // 不加这一档会先闪出约 238px 高的「无结果」区块，结果到达后又整块移除（CLS 0.26）。
    const searchPending = !showingRecent && !searchResults && !errorMessage;
    const hasAnyResults = searchResults &&
        (searchResults.works.length > 0 || searchResults.books.length > 0 || searchResults.collections.length > 0);

    return (
        <div
            className="bim-browser-container"
            // 内容（搜索占位 → 结果，或最近浏览）高度会在数据到达时变，下面紧跟宿主页脚：
            // 容器先占满一屏，页脚始终在首屏之外，就不会被结果撑高而整块下推（overview#268，CLS）
            style={reserveViewportHeight ? { minHeight: '100svh' } : undefined}
        >
            <style>{STATS_CSS}</style>
            <header style={{ padding: '12px 20px', borderBottom: `1px solid ${bim('widget-border')}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', color: bim('fg') }}>{t.browser.title}</h1>
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
                            border: `1px solid ${bim('primary')}`,
                            borderRadius: '6px',
                            background: 'transparent',
                            color: bim('primary'),
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        {t.action.newEntry}
                    </button>
                )}
            </div>

            {/* 统计摘要 */}
            {showingRecent && (
                <div className="bim-ib-stats" style={{
                    padding: '0 20px 8px',
                    fontSize: '12px',
                    color: bim('desc-fg'),
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '4px',
                }}>
                    {stats && (<>
                    <span>
                        {subtypeStats ? (
                            <>
                                {(subtypeStats['book'] ?? 0) > 0 && (
                                    <>
                                        書 <strong style={{ color: bim('fg') }}>{subtypeStats['book'].toLocaleString()}</strong> 部
                                        ，<strong style={{ color: bim('fg') }}>{stats.books.toLocaleString()}</strong> 本
                                    </>
                                )}
                                {subtypeStats['article'] ? (
                                    <>
                                        <span style={{ margin: '0 6px' }}>·</span>
                                        文章 <strong style={{ color: bim('fg') }}>{subtypeStats['article'].toLocaleString()}</strong> 篇
                                    </>
                                ) : null}
                                {subtypeStats['poem'] ? (
                                    <>
                                        <span style={{ margin: '0 6px' }}>·</span>
                                        詩詞 <strong style={{ color: bim('fg') }}>{subtypeStats['poem'].toLocaleString()}</strong> 首
                                    </>
                                ) : null}
                                <span style={{ margin: '0 6px' }}>·</span>
                                叢編 <strong style={{ color: bim('fg') }}>{stats.collections.toLocaleString()}</strong>
                            </>
                        ) : (
                            <>
                                {t.indexType.work} <strong style={{ color: bim('fg') }}>{stats.works.toLocaleString()}</strong>
                                <span style={{ margin: '0 6px' }}>·</span>
                                {t.indexType.book} <strong style={{ color: bim('fg') }}>{stats.books.toLocaleString()}</strong>
                                <span style={{ margin: '0 6px' }}>·</span>
                                {t.indexType.collection} <strong style={{ color: bim('fg') }}>{stats.collections.toLocaleString()}</strong>
                                {stats.entities > 0 && (
                                    <>
                                        <span style={{ margin: '0 6px' }}>·</span>
                                        {t.indexType.entity} <strong style={{ color: bim('fg') }}>{stats.entities.toLocaleString()}</strong>
                                    </>
                                )}
                            </>
                        )}
                    </span>
                    {stats.hasImage != null && stats.hasText != null && (
                        <span>
                            {t.resourceType.image} <strong style={{ color: bim('fg') }}>{stats.hasImage.toLocaleString()}</strong>
                            <span style={{ margin: '0 6px' }}>·</span>
                            {t.resourceType.text} <strong style={{ color: bim('fg') }}>{stats.hasText.toLocaleString()}</strong>
                        </span>
                    )}
                    </>)}
                </div>
            )}

            {/* Content */}
            <div style={{ padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                {isLoading || searchPending ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: bim('desc-fg'), minHeight: SEARCH_PLACEHOLDER_MIN_HEIGHT, boxSizing: 'border-box' }}>
                        {t.search.searching}
                    </div>
                ) : errorMessage ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                        <p style={{ color: bim('desc-fg') }}>{errorMessage}</p>
                    </div>
                ) : showingRecent ? (
                    /* Recent entries view */
                    <div style={{ flex: 1 }}>
                        {recentLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: bim('desc-fg') }}>
                                {t.search.loading}
                            </div>
                        ) : recentEntries.length > 0 ? (
                            <>
                                <div style={{ padding: '8px 0', fontSize: '12px', color: bim('desc-fg'), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{t.search.recentBrowse}</span>
                                    <button
                                        onClick={handleClearAllRecent}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: bim('desc-fg'),
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
                                                onClick={handleEntryLinkClick}
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
                                            color: bim('primary'),
                                            background: 'transparent',
                                            border: `1px solid ${bim('widget-border')}`,
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
                                <h2 style={{ margin: '0 0 8px', fontSize: '1.17em', color: bim('fg') }}>{t.search.searchTitle}</h2>
                                <p style={{ color: bim('desc-fg'), fontSize: '13px' }}>{t.search.searchSubtitle}</p>
                            </div>
                        )}
                    </div>
                ) : hasAnyResults ? (
                    /* Grouped search results */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <style>{VIEW_ALL_CSS}</style>
                        {TYPE_CONFIG.map(({ type, icon, name, key }) => {
                            const entries = (searchResults[key] as IndexEntry[] | undefined) ?? [];
                            const totalKey = TOTAL_KEYS[key];
                            const total = (searchResults[totalKey] as number | undefined) ?? 0;
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
                                        borderBottom: `1px solid ${bim('widget-border')}`,
                                        marginBottom: '6px',
                                    }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: bim('fg') }}>
                                            {icon} {name}
                                            <span style={{ fontWeight: 400, color: bim('desc-fg'), marginLeft: '6px' }}>
                                                {total} {t.unit.items}
                                            </span>
                                        </span>
                                        {showExpandBtn && (
                                            <button
                                                className="bim-ib-viewall"
                                                onClick={() => handleExpandType(type)}
                                                style={{
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: bim('primary'),
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                {t.action.viewAll}
                                            </button>
                                        )}
                                    </div>
                                    <div style={resultVariant === 'card'
                                        // 卡片形态用自适应网格：容器窄时退化为单列，宽时自动多列。
                                        // 仅影响显式 opt-in 的 card 形态，compact 维持原有纵向列表。
                                        ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: '14px' }
                                        : { display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {entries.map(entry => {
                                            if (renderEntry) {
                                                return (
                                                    <React.Fragment key={entry.id}>
                                                        {renderEntry(entry)}
                                                    </React.Fragment>
                                                );
                                            }
                                            const Item = resultVariant === 'card' ? EntryBookCard : EntryCard;
                                            return (
                                                <Item
                                                    key={entry.id}
                                                    entry={entry}
                                                    selected={selectedId === entry.id}
                                                    onClick={handleEntryLinkClick}
                                                    getConfig={getConfig}
                                                    query={searchQuery}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '1.17em', color: bim('fg') }}>
                            {formatTemplate(t.search.noResultsFor, { query: searchQuery })}
                        </h2>
                        <p style={{ color: bim('desc-fg'), fontSize: '13px' }}>
                            {t.search.tryOther}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

/** 搜索中 / 待搜索占位的最小高度，与「无结果」区块等高，避免结果到达时页面跳动 */
const SEARCH_PLACEHOLDER_MIN_HEIGHT = 240;

// ── Entry Card ──

interface EntryCardProps {
    entry: IndexEntry;
    selected: boolean;
    onClick: (entry: IndexEntry, e: React.MouseEvent<HTMLAnchorElement>) => void;
    getConfig: (type: IndexType) => { icon: string; name: string };
    query?: string;
    onRemove?: (id: string) => void;
}

/** 普通左键单击（无修饰键）。其余情况交给浏览器默认行为：新标签、新窗口、下载等 */
function isPlainLeftClick(e: React.MouseEvent): boolean {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** 「查看全部 →」触屏 / 窄屏：外观不变，伪元素把热区扩到至少 44×44（INT Q4，做法同 detail/layout.tsx） */
/**
 * 统计摘要行的占位高度：getCounts 晚到，行原先在数据到达时才插入，把下面的内容整体下推。
 * 现在数据到达前先占位：宽屏一行，窄屏两行（左右两段各自换行）。
 */
export const STATS_CSS = `
.bim-ib-stats { min-height: 25px; box-sizing: content-box; }
@media (max-width: 719px) { .bim-ib-stats { min-height: 46px; } }
`;

export const VIEW_ALL_CSS = `
@media (max-width: 719px), (pointer: coarse) {
  .bim-ib-viewall { position: relative; }
  .bim-ib-viewall::after {
    content: ""; position: absolute; left: 50%; top: 50%;
    width: max(calc(100% + 8px), 44px); height: max(100%, 44px); transform: translate(-50%, -50%);
  }
}`;

/** 结果卡片 <a> 的基础样式：去掉链接默认的下划线与颜色 */
const cardLinkReset: React.CSSProperties = {
    color: 'inherit',
    textDecoration: 'none',
};

/**
 * 简介搜索命中片段（A4，2026-09-27）。entry.descriptionSnippet 只在 L1/Meili
 * 搜索命中简介时才有值，按 SNIPPET_MARK_START/END 切段渲染，不用
 * dangerouslySetInnerHTML（简介原文可能含 `<`/`>`，直接当 HTML 注入不安全）。
 */
const DescriptionSnippet: React.FC<{ snippet: string }> = ({ snippet }) => {
    const { convert } = useConvert();
    return (
        <div style={{ fontSize: '12px', color: bim('desc-fg'), lineHeight: 1.6 }}>
            {splitHighlightSnippet(snippet).map((seg, i) => seg.marked
                ? (
                    <mark
                        key={i}
                        style={{
                            background: bim('highlight-bg'),
                            color: bim('highlight-fg'),
                            padding: '0 1px',
                            borderRadius: '2px',
                        }}
                    >
                        {convert(seg.text)}
                    </mark>
                )
                : <React.Fragment key={i}>{convert(seg.text)}</React.Fragment>
            )}
        </div>
    );
};

/**
 * 书目卡片形态（resultVariant='card'）。
 *
 * 对齐设计稿的 .bi-book-card：左侧「封面」用竖排书名生成（不需要真实书影图，
 * 站点也没有封面图资源），右侧为书名/著者/计量/标记。
 * 仅在消费者显式传 resultVariant="card" 时使用，默认不影响任何既有调用方。
 */
const EntryBookCard: React.FC<EntryCardProps> = ({ entry, selected, onClick, getConfig, query }) => {
    const t = useT();
    const { convert } = useConvert();

    const title = convert(entry.title || entry.primary_name || entry.id);
    const measure = entry.measure_info
        ? convert(entry.measure_info)
        : entry.juan_count != null && entry.juan_count > 0
            ? `${entry.juan_count}${t.unit.juan}`
            : '';

    const allAliases = [...(entry.additional_titles || []), ...(entry.attached_texts || [])];
    const matchedAlias = query && allAliases.length
        ? allAliases.find(a => {
            const str = typeof a === 'string' ? a : (a as { book_title?: string })?.book_title;
            return str?.toLowerCase().includes(query.toLowerCase());
        })
        : undefined;

    const accent = bim('cover-accent');
    const buildUrl = useBidUrl();

    return (
        <a
            href={buildUrl(entry.id)}
            onClick={e => onClick(entry, e)}
            className="bim-result-card"
            style={{
                ...cardLinkReset,
                display: 'flex',
                gap: '1.2rem',
                alignItems: 'stretch',
                padding: '1.1rem 1.3rem',
                borderRadius: '12px',
                cursor: 'pointer',
                background: bim('bg'),
                border: selected
                    ? `1px solid ${bim('primary')}`
                    : `1px solid ${bim('widget-border')}`,
                transition: 'border-color .2s ease, transform .2s ease, box-shadow .2s ease',
            }}
        >
            {/* 竖排书名「封面」 */}
            <div
                aria-hidden="true"
                style={{
                    position: 'relative',
                    width: '92px',
                    minHeight: '126px',
                    flexShrink: 0,
                    borderRadius: '4px',
                    border: `1px solid color-mix(in srgb, ${accent} 50%, ${bim('widget-border')})`,
                    background: `linear-gradient(color-mix(in srgb, ${accent} 14%, ${bim('bg')}), color-mix(in srgb, ${accent} 7%, ${bim('bg')}))`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.6rem 0.3rem',
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        left: '6px',
                        top: 0,
                        bottom: 0,
                        borderLeft: `1px dashed color-mix(in srgb, ${accent} 45%, transparent)`,
                    }}
                />
                {/*
                  * 逐字竖排而非 writing-mode: vertical-rl。
                  * 后者依赖字体的竖排度量（vmtx），部分中文字体缺失时字符步进会变成 0、
                  * 全部叠在一起（已在无 CJK 竖排度量的环境实测到）。逐字排布与字体无关，
                  * 各平台表现一致。
                  */}
                <span
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        height: '108px',
                        flexShrink: 0,
                        overflow: 'hidden',
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        lineHeight: 1.25,
                        color: accent,
                    }}
                >
                    {Array.from(title).map((ch, i) => (
                        <span key={i}>{ch}</span>
                    ))}
                </span>
            </div>

            {/* 信息区 */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '17px', fontWeight: 600, color: bim('fg') }}>{title}</span>
                    {measure && (
                        <span style={{ fontSize: '12px', color: bim('desc-fg') }}>{measure}</span>
                    )}
                </div>

                {(entry.dynasty || entry.author) && (
                    <div style={{ fontSize: '13px', color: bim('desc-fg') }}>
                        {entry.dynasty && <span>〔{convert(entry.dynasty)}〕</span>}
                        {entry.author && <span>{convert(entry.author)}</span>}
                        {entry.role && entry.role !== 'author' && <span> {convert(entry.role)}</span>}
                    </div>
                )}

                {/* 刊刻朝代 + 版本。era 是这个本子的朝代（dating.era），与上一行撰人的 dynasty 不同：
                    史記·武英殿本 撰人〔西漢〕、刊刻〔清〕。 */}
                {(entry.era || entry.edition) && (
                    <div style={{ fontSize: '12px', color: bim('desc-fg') }}>
                        {entry.era && <span>〔{convert(entry.era)}〕</span>}
                        {entry.edition && <span>{convert(entry.edition)}</span>}
                    </div>
                )}

                {matchedAlias && (
                    <div style={{ fontSize: '12px', color: bim('desc-fg') }}>
                        {t.search.alias}：{convert(typeof matchedAlias === 'string' ? matchedAlias : (matchedAlias as { book_title?: string }).book_title || '')}
                    </div>
                )}

                {entry.descriptionSnippet && <DescriptionSnippet snippet={entry.descriptionSnippet} />}

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '4px' }}>
                    <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                        color: bim('desc-fg'),
                        border: `1px solid ${bim('widget-border')}`,
                    }}>
                        {getConfig(entry.type).icon} {getConfig(entry.type).name}
                    </span>
                    {entry.has_text && (
                        <span style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                            color: bim('desc-fg'),
                            border: `1px solid ${bim('widget-border')}`,
                        }}>📝 {t.misc.textResource}</span>
                    )}
                    {entry.has_image && (
                        <span style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                            color: bim('desc-fg'),
                            border: `1px solid ${bim('widget-border')}`,
                        }}>🖼️ {t.misc.imageResource}</span>
                    )}
                </div>
            </div>
        </a>
    );
};

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
    const buildUrl = useBidUrl();

    // 链接与「移出最近浏览」按钮并列放在外框里，<a> 内不嵌套其他交互元素
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                borderRadius: '6px',
                border: selected ? `1px solid ${bim('primary')}` : `1px solid ${bim('widget-border')}`,
                background: bim('input-bg'),
            }}
        >
            <a
                href={buildUrl(entry.id)}
                onClick={e => onClick(entry, e)}
                className="bim-result-card"
                style={{
                    ...cardLinkReset,
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: onRemove ? '10px 0 10px 12px' : '10px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                    <span style={{ fontSize: '16px' }}>{getConfig(entry.type).icon}</span>
                    <span style={{ fontSize: '9px', color: bim('desc-fg'), lineHeight: 1 }}>{getConfig(entry.type).name}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: bim('fg') }}>
                            {convert(entry.title || entry.primary_name || entry.id)}
                        </span>
                        {/* 资源图标 */}
                        <span style={{ display: 'flex', gap: '2px', fontSize: '12px', opacity: 0.7 }}>
                            {entry.has_text && <span title={t.misc.textResource}>📝</span>}
                            {entry.has_image && <span title={t.misc.imageResource}>🖼️</span>}
                        </span>
                        {/* 刊刻朝代 + 版本（era 是本子的朝代，非撰人 dynasty） */}
                        {(entry.era || entry.edition) && (
                            <span style={{ fontSize: '11px', color: bim('desc-fg') }}>
                                {entry.era && <>〔{convert(entry.era)}〕</>}
                                {entry.edition && convert(entry.edition)}
                            </span>
                        )}
                        {/* 卷/回数等計量：優先 measure_info，退回 juan_count */}
                        {entry.measure_info ? (
                            <span style={{ fontSize: '11px', color: bim('desc-fg') }}>
                                {convert(entry.measure_info)}
                            </span>
                        ) : entry.juan_count != null && entry.juan_count > 0 ? (
                            <span style={{ fontSize: '11px', color: bim('desc-fg') }}>
                                {entry.juan_count}{t.unit.juan}
                            </span>
                        ) : null}
                    </div>
                    {/* 作者朝代 */}
                    {(entry.dynasty || entry.author) && (
                        <div style={{ fontSize: '12px', color: bim('desc-fg'), marginTop: '2px' }}>
                            {entry.dynasty && <span>〔{convert(entry.dynasty)}〕</span>}
                            {entry.author && <span>{convert(entry.author)}</span>}
                            {entry.role && entry.role !== 'author' && <span> {convert(entry.role)}</span>}
                            {/* Entity 生卒年 */}
                            {entry.type === 'entity' && (entry.birth_year != null || entry.death_year != null) && (
                                <span style={{ marginLeft: entry.dynasty ? '4px' : 0 }}>
                                    {entry.birth_year ?? '?'}—{entry.death_year ?? '?'}
                                </span>
                            )}
                        </div>
                    )}
                    {/* 别名匹配提示 */}
                    {matchedAlias && (
                        <div style={{ fontSize: '11px', color: bim('desc-fg'), marginTop: '2px' }}>
                            {t.search.alias}：{convert(matchedAlias)}
                        </div>
                    )}
                </div>
                {!onRemove && <span aria-hidden="true" style={{ opacity: 0.4, marginTop: '2px' }}>→</span>}
            </a>
            {onRemove && (
                <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    title={t.search.removeFromRecent}
                    aria-label={t.search.removeFromRecent}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        color: bim('desc-fg'),
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '12px 12px 12px 8px',
                        lineHeight: 1,
                        opacity: 0.5,
                    }}
                >
                    ×
                </button>
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
            border: `1px solid ${bim('widget-border')}`,
            background: bim('input-bg'),
            opacity: 0.6,
        }}
    >
        <span style={{ fontSize: '16px' }}>❓</span>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: bim('fg'), fontFamily: 'monospace' }}>{id}</div>
            <div style={{ fontSize: '11px', color: bim('desc-fg'), marginTop: '2px' }}>
                {t.search.itemNotFound}
            </div>
        </div>
        <button
            onClick={() => onRemove(id)}
            title={t.search.removeFromRecent}
            style={{
                border: 'none',
                background: 'transparent',
                color: bim('desc-fg'),
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
