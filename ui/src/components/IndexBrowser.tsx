import React, { useState, useEffect, useCallback } from 'react';
import type { IndexType, IndexEntry, IndexSource, SyncConfig, LoadOptions, PageResult } from '../types';
import type { IndexTransport } from '../transport/types';
import { ModeIndicator } from './ModeIndicator';

const PAGE_SIZE = 50;
const RECENT_KEY = 'bim-recent-entries';
const MAX_RECENT = 50;

function loadRecentEntries(): IndexEntry[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveRecentEntry(entry: IndexEntry) {
    try {
        const list = loadRecentEntries().filter(e => e.id !== entry.id);
        list.unshift(entry);
        if (list.length > MAX_RECENT) list.length = MAX_RECENT;
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

export interface IndexBrowserProps {
    transport: IndexTransport;
    indexSource?: IndexSource;
    syncConfig?: SyncConfig;
    onEntryClick?: (entry: IndexEntry) => void;
    onNewEntry?: (type: IndexType) => void;
    onSwitchMode?: () => void;
    onToggleDraft?: () => void;
    onConfigurePath?: () => void;
    onSelectFolder?: () => void;
    /** 隐藏 ModeIndicator */
    hideModeIndicator?: boolean;
}

const TYPE_CONFIG: { type: IndexType; icon: string; name: string }[] = [
    { type: 'work', icon: '✍️', name: '作品' },
    { type: 'book', icon: '📖', name: '书籍' },
    { type: 'collection', icon: '📚', name: '丛编' },
];

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
}) => {
    const [activeTab, setActiveTab] = useState<IndexType>('work');
    const [searchQuery, setSearchQuery] = useState('');
    const [entries, setEntries] = useState<IndexEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortBy, setSortBy] = useState('title');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [showingRecent, setShowingRecent] = useState(true);
    const [recentEntries, setRecentEntries] = useState<IndexEntry[]>(loadRecentEntries);

    const buildOptions = useCallback((page: number): LoadOptions => ({
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        sortOrder,
    }), [sortBy, sortOrder]);

    const loadEntries = useCallback(async (type: IndexType, page: number) => {
        setIsLoading(true);
        setErrorMessage('');
        try {
            const result: PageResult<IndexEntry> = await transport.loadEntries(type, buildOptions(page));
            setEntries(result.entries);
            setTotalCount(result.total);
            setCurrentPage(result.page);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [transport, buildOptions]);

    const handleSearch = useCallback(async (page: number = 1) => {
        if (!searchQuery.trim()) {
            setShowingRecent(true);
            setEntries([]);
            setTotalCount(0);
            return;
        }
        setShowingRecent(false);
        setIsLoading(true);
        setErrorMessage('');
        try {
            const result = await transport.search(searchQuery, activeTab, buildOptions(page));
            setEntries(result.entries);
            setTotalCount(result.total);
            setCurrentPage(result.page);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [transport, searchQuery, activeTab, buildOptions]);

    useEffect(() => {
        setCurrentPage(1);
        if (!showingRecent) {
            loadEntries(activeTab, 1);
        }
    }, [activeTab, sortBy, sortOrder, loadEntries, showingRecent]);

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        handleSearch(newPage);
    };

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const handleEntryClick = (entry: IndexEntry) => {
        setSelectedId(entry.id);
        saveRecentEntry(entry);
        setRecentEntries(loadRecentEntries());
        onEntryClick?.(entry);
    };

    const getConfig = (type: IndexType) => TYPE_CONFIG.find(c => c.type === type)!;

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

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', padding: '8px 20px' }}>
                {TYPE_CONFIG.map(({ type, icon, name }) => (
                    <button
                        key={type}
                        onClick={() => setActiveTab(type)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 14px',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === type ? 'var(--bim-primary, #0078d4)' : 'transparent',
                            color: activeTab === type ? 'var(--bim-primary-fg, #fff)' : 'var(--bim-fg, #333)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: activeTab === type ? 600 : 400,
                        }}
                    >
                        <span>{icon}</span>
                        <span>{name}</span>
                    </button>
                ))}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '8px', padding: '8px 20px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                    <input
                        type="text"
                        placeholder={`搜索${getConfig(activeTab).name}...`}
                        value={searchQuery}
                        onChange={e => {
                            setSearchQuery(e.target.value);
                            if (!e.target.value.trim()) {
                                setShowingRecent(true);
                                setEntries([]);
                                setTotalCount(0);
                            }
                        }}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        style={{
                            flex: 1,
                            padding: '6px 10px',
                            border: '1px solid var(--bim-input-border, #ccc)',
                            borderRadius: '4px',
                            background: 'var(--bim-input-bg, #fff)',
                            color: 'var(--bim-input-fg, #333)',
                            fontSize: '13px',
                        }}
                    />
                    <button
                        onClick={() => handleSearch()}
                        style={{
                            padding: '6px 14px',
                            border: 'none',
                            borderRadius: '4px',
                            background: 'var(--bim-primary, #0078d4)',
                            color: 'var(--bim-primary-fg, #fff)',
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        搜索
                    </button>
                </div>
                {onNewEntry && (
                    <button
                        onClick={() => onNewEntry(activeTab)}
                        style={{
                            padding: '6px 14px',
                            border: '1px solid var(--bim-primary, #0078d4)',
                            borderRadius: '4px',
                            background: 'transparent',
                            color: 'var(--bim-primary, #0078d4)',
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        + 新建{getConfig(activeTab).name}
                    </button>
                )}
            </div>

            {/* Content */}
            <div style={{ padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--bim-desc-fg, #717171)' }}>
                        加载中...
                    </div>
                ) : errorMessage ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                        <p style={{ color: 'var(--bim-desc-fg, #717171)' }}>{errorMessage}</p>
                    </div>
                ) : showingRecent ? (
                    /* Recent entries view */
                    <div style={{ flex: 1 }}>
                        {recentEntries.length > 0 ? (
                            <>
                                <div style={{ padding: '8px 0', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>
                                    最近浏览
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {recentEntries.map(entry => (
                                        <div
                                            key={entry.id}
                                            onClick={() => handleEntryClick(entry)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 12px',
                                                borderRadius: '6px',
                                                border: selectedId === entry.id ? '1px solid var(--bim-primary, #0078d4)' : '1px solid var(--bim-widget-border, #e0e0e0)',
                                                cursor: 'pointer',
                                                background: 'var(--bim-input-bg, #fff)',
                                            }}
                                        >
                                            <span style={{ fontSize: '18px' }}>{getConfig(entry.type).icon}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>{entry.title}</div>
                                                {(entry.dynasty || entry.author) && (
                                                    <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                                                        {entry.dynasty && <span>〔{entry.dynasty}〕</span>}
                                                        {entry.author && <span>{entry.author}</span>}
                                                        {entry.role && entry.role !== 'author' && <span> {entry.role}</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <span style={{ opacity: 0.4 }}>→</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{getConfig(activeTab).icon}</div>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--bim-fg, #333)' }}>输入关键词搜索{getConfig(activeTab).name}</h3>
                                <p style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>浏览过的条目会显示在这里</p>
                            </div>
                        )}
                    </div>
                ) : entries.length > 0 ? (
                    <>
                        {/* Results bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>
                            <span>共 {totalCount} 条{getConfig(activeTab).name}{totalPages > 1 && ` (第 ${currentPage}/${totalPages} 页)`}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>排序:</span>
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                    style={{ fontSize: '12px', border: '1px solid var(--bim-input-border, #ccc)', borderRadius: '3px', padding: '2px 4px' }}
                                >
                                    <option value="title">标题</option>
                                    <option value="id">ID</option>
                                    <option value="author">作者</option>
                                    <option value="dynasty">朝代</option>
                                </select>
                                <button
                                    onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px' }}
                                    title={sortOrder === 'asc' ? '升序' : '降序'}
                                >
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                </button>
                            </div>
                        </div>

                        {/* Entry list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {entries.map(entry => (
                                <div
                                    key={entry.id}
                                    onClick={() => handleEntryClick(entry)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '6px',
                                        border: selectedId === entry.id ? '1px solid var(--bim-primary, #0078d4)' : '1px solid var(--bim-widget-border, #e0e0e0)',
                                        cursor: 'pointer',
                                        background: 'var(--bim-input-bg, #fff)',
                                    }}
                                >
                                    <span style={{ fontSize: '18px' }}>{getConfig(entry.type).icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>{entry.title}</div>
                                        {(entry.dynasty || entry.author) && (
                                            <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                                                {entry.dynasty && <span>〔{entry.dynasty}〕</span>}
                                                {entry.author && <span>{entry.author}</span>}
                                                {entry.role && entry.role !== 'author' && <span> {entry.role}</span>}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ opacity: 0.4 }}>→</span>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
                                <button
                                    disabled={currentPage <= 1}
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    style={pageBtnStyle(currentPage <= 1)}
                                >
                                    上一页
                                </button>
                                <span style={{ fontSize: '13px', color: 'var(--bim-desc-fg, #717171)' }}>
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    disabled={currentPage >= totalPages}
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    style={pageBtnStyle(currentPage >= totalPages)}
                                >
                                    下一页
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>{getConfig(activeTab).icon}</div>
                        <h3 style={{ margin: '0 0 8px', color: 'var(--bim-fg, #333)' }}>未找到匹配的{getConfig(activeTab).name}</h3>
                        <p style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>尝试其他搜索关键词</p>
                    </div>
                )}

                {/* Footer: total count */}
                {!isLoading && !errorMessage && totalCount > 0 && !showingRecent && (
                    <div style={{
                        textAlign: 'center',
                        padding: '16px 0 4px',
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #717171)',
                        borderTop: '1px solid var(--bim-widget-border, #e0e0e0)',
                        marginTop: 'auto',
                    }}>
                        共收录 {totalCount} 部{getConfig(activeTab).name}
                    </div>
                )}
            </div>
        </div>
    );
};

function pageBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        padding: '6px 14px',
        border: '1px solid var(--bim-widget-border, #e0e0e0)',
        borderRadius: '4px',
        background: 'transparent',
        color: 'var(--bim-fg, #333)',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px',
        opacity: disabled ? 0.4 : 1,
    };
}
