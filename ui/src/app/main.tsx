import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { IndexBrowser } from '../components/IndexBrowser';
import { IndexDetail } from '../components/IndexDetail';
import { CollectionCatalog } from '../components/CollectionCatalog';
import { CollatedEdition } from '../components/CollatedEdition';
import { VersionLineageView } from '../components/VersionLineageView';
import { buildLineageGraph } from '../core/lineage-graph';
import type { LineageGraph } from '../core/lineage-graph';
import type { BookDetailData, WorkDetailData } from '../types';
import { FeedbackList } from '../components/FeedbackList';
import { FeedbackForm } from '../components/FeedbackForm';
import type { FeedbackItem } from '../components/FeedbackList';
import { HomePage } from '../components/HomePage';
import type { TabKey } from '../components/HomePage';
import { LocaleToggle } from '../components/LocaleToggle';
import { LocaleProvider } from '../i18n/provider';
import { DevApiStorage } from '../storage/dev-api-storage';
import type { IndexStorage } from '../storage/types';
import type { IndexEntry, IndexDetailData, ResourceCatalog, CollatedEditionIndex } from '../types';
import { useT, useConvert } from '../i18n';
import { useIsMobile } from '../hooks/useIsMobile';
import '../styles/variables.css';

// ── 数据源 ──

function createStorage(): IndexStorage {
    return new DevApiStorage();
}

// ── URL 工具 ──

const DETAIL_PATH = '/book-index';

/** 从当前 URL 提取 book ID：在 /book-index 路径下从 ?id= 读取 */
function getIdFromUrl(): string | null {
    if (window.location.pathname !== DETAIL_PATH) return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || null;
}

/** 从 URL search params 提取参数 */
function getParamsFromUrl(): { tab?: string; juan?: string; node?: string; mode?: string } {
    const params = new URLSearchParams(window.location.search);
    return {
        tab: params.get('tab') || undefined,
        juan: params.get('juan') || undefined,
        node: params.get('node') || undefined,
        mode: params.get('mode') || undefined,
    };
}

function buildUrl(id: string | null, params?: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    if (id) sp.set('id', id);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) sp.set(k, v);
        }
    }
    const qs = sp.toString();
    if (id) return qs ? `${DETAIL_PATH}?${qs}` : DETAIL_PATH;
    return qs ? `/?${qs}` : '/';
}

/** 更新浏览器 URL（不触发页面刷新） */
function pushUrl(id: string | null, params?: Record<string, string | undefined>) {
    const url = buildUrl(id, params);
    const current = window.location.pathname + window.location.search;
    if (current !== url) {
        window.history.pushState(null, '', url);
    }
}

/** replaceState 版本，用于不产生历史记录的更新 */
function replaceUrl(id: string | null, params?: Record<string, string | undefined>) {
    window.history.replaceState(null, '', buildUrl(id, params));
}

// ── 主应用 ──

function App() {
    const t = useT();
    const { convert } = useConvert();
    const isMobile = useIsMobile();
    const [transport] = useState<IndexStorage>(() => createStorage());
    const [selectedEntry, setSelectedEntry] = useState<IndexEntry | null>(null);
    const [detailData, setDetailData] = useState<IndexDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailNotFound, setDetailNotFound] = useState(false);
    const [activeTab, setActiveTabState] = useState<string>('detail');
    const [activeJuan, setActiveJuanState] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(() => getParamsFromUrl().node);
    const [lineageMode, setLinageMode] = useState<'list' | 'graph'>(() => {
        const mode = getParamsFromUrl().mode;
        return mode === 'graph' || mode === 'list' ? mode : 'list';
    });
    const [catalogList, setCatalogList] = useState<ResourceCatalog[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [collatedIndex, setCollatedIndex] = useState<CollatedEditionIndex | null>(null);
    const [lineageGraph, setLineageGraph] = useState<LineageGraph | null>(null);
    const [lineageLoading, setLineageLoading] = useState(false);
    /** lineage 集合：'core'（核心）/ 'all'（完整）。仅当 work.version_graph.core_books 非空时有意义 */
    const [lineageCollection, setLineageCollection] = useState<string>('core');
    /** 缓存原始 work + books 用于切换 collection 时 rebuild graph，无需重新 fetch */
    const lineageSourceRef = useRef<{ work: WorkDetailData; books: BookDetailData[] } | null>(null);
    const [collatedLoading, setCollatedLoading] = useState(false);
    const [homeTab, setHomeTab] = useState<TabKey>(() => {
        const id = getIdFromUrl();
        if (id) return 'recommend';
        const params = getParamsFromUrl();
        return ((params.tab === 'catalog' || params.tab === 'site') ? params.tab : 'recommend') as TabKey;
    });

    /** 获取当前 entity ID */
    const currentId = selectedEntry?.id || getIdFromUrl();

    /** 切换 tab 并同步 URL */
    const setActiveTab = useCallback((tab: string) => {
        setActiveTabState(tab);
        const juan = tab === 'collated' ? activeJuan : undefined;
        pushUrl(currentId, { tab: tab !== 'detail' ? tab : undefined, juan: juan || undefined });
    }, [currentId, activeJuan]);

    /** 切换卷并同步 URL */
    const setActiveJuan = useCallback((juan: string | null) => {
        setActiveJuanState(juan);
        replaceUrl(currentId, { tab: 'collated', juan: juan || undefined });
    }, [currentId]);

    /** 切换版本源流视图模式并同步 URL */
    const handleLineageModeChange = useCallback((mode: 'list' | 'graph') => {
        setLinageMode(mode);
        replaceUrl(currentId, { tab: 'lineage', mode: mode !== 'list' ? mode : undefined });
    }, [currentId]);

    const loadCollated = useCallback(async (id: string) => {
        if (!transport.getCollatedEditionIndex) {
            setCollatedIndex(null);
            return;
        }
        setCollatedLoading(true);
        try {
            const idx = await transport.getCollatedEditionIndex(id);
            setCollatedIndex(idx);
        } catch {
            setCollatedIndex(null);
        } finally {
            setCollatedLoading(false);
        }
    }, [transport]);

    const loadLineage = useCallback(async (work: WorkDetailData) => {
        const vg = work.version_graph;
        if (!vg || !vg.enabled) {
            setLineageGraph(null);
            lineageSourceRef.current = null;
            return;
        }
        setLineageLoading(true);
        try {
            const bookIds = work.books ?? [];
            const books = await Promise.all(
                bookIds.map(async (bid) => {
                    try {
                        const b = await transport.getItem(bid);
                        return b ? (b as unknown as BookDetailData) : null;
                    } catch {
                        return null;
                    }
                }),
            );
            const validBooks = books.filter((b): b is BookDetailData => !!b);
            lineageSourceRef.current = { work, books: validBooks };
            // 初始集合：work 指定 default_collection（多为 'core'），否则 'all'
            const initialCollection = (vg.default_collection ?? 'all') as string;
            // 仅当 core_books 实际配置时才默认 core，否则强制 all（避免空集合）
            const usableCollection = (initialCollection === 'core'
                && Array.isArray(vg.core_books) && vg.core_books.length > 0)
                ? 'core' : 'all';
            setLineageCollection(usableCollection);
            setLineageGraph(buildLineageGraph(work, validBooks, usableCollection));
        } catch (err) {
            console.error('加载 lineage 失败:', err);
            setLineageGraph(null);
            lineageSourceRef.current = null;
        } finally {
            setLineageLoading(false);
        }
    }, [transport]);

    /** 切换核心/完整集合（不重新 fetch books，仅 rebuild graph）。 */
    const handleLineageCollectionChange = useCallback((collection: string) => {
        setLineageCollection(collection);
        const src = lineageSourceRef.current;
        if (src) {
            setLineageGraph(buildLineageGraph(src.work, src.books, collection));
        }
    }, []);

    const loadCatalog = useCallback(async (id: string) => {
        if (!transport.getCollectionCatalogs && !transport.getCollectionCatalog) {
            setCatalogList([]);
            return;
        }
        setCatalogLoading(true);
        try {
            if (transport.getCollectionCatalogs) {
                const catalogs = await transport.getCollectionCatalogs(id);
                setCatalogList(catalogs || []);
            } else if (transport.getCollectionCatalog) {
                const catalog = await transport.getCollectionCatalog(id);
                if (catalog) {
                    setCatalogList([{ resource_id: '', data: catalog }]);
                } else {
                    setCatalogList([]);
                }
            }
        } catch {
            setCatalogList([]);
        } finally {
            setCatalogLoading(false);
        }
    }, [transport]);

    /** 通过 ID 加载详情（内部复用，不操作 URL） */
    const loadById = useCallback(async (id: string, restoreParams?: { tab?: string; juan?: string; node?: string; mode?: string }) => {
        setDetailData(null);
        setDetailNotFound(false);
        setCatalogList([]);
        setCollatedIndex(null);
        setLineageGraph(null);
        setActiveTabState(restoreParams?.tab || 'detail');
        setActiveJuanState(restoreParams?.juan || null);
        setSelectedNodeId(restoreParams?.node || undefined);
        setLinageMode((restoreParams?.mode === 'graph' || restoreParams?.mode === 'list') ? restoreParams.mode : 'list');
        setDetailLoading(true);
        try {
            const data = await transport.getItem(id);
            if (data) {
                setDetailData(data as unknown as IndexDetailData);
                setSelectedEntry({
                    id,
                    title: (data.title as string) || id,
                    type: (data.type as any) || 'book',
                });
                if (data.type === 'collection') {
                    loadCatalog(id);
                }
                if (data.type === 'work' && data.has_collated) {
                    loadCollated(id);
                }
                if (data.type === 'work' && (data as Record<string, unknown>).version_graph) {
                    loadLineage(data as unknown as WorkDetailData);
                }
            } else {
                setDetailNotFound(true);
            }
        } catch (err) {
            console.error('加载详情失败:', err);
            setDetailNotFound(true);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, loadCatalog, loadCollated, loadLineage]);

    const handleEntryClick = useCallback(async (entry: IndexEntry) => {
        setSelectedEntry(entry);
        pushUrl(entry.id);
        setDetailData(null);
        setDetailNotFound(false);
        setCatalogList([]);
        setCollatedIndex(null);
        setActiveTabState('detail');
        setActiveJuanState(null);
        setDetailLoading(true);
        try {
            const data = await transport.getItem(entry.id);
            if (data) {
                setDetailData(data as unknown as IndexDetailData);
                if (data.type === 'collection') {
                    loadCatalog(entry.id);
                }
                if (data.type === 'work' && data.has_collated) {
                    loadCollated(entry.id);
                }
                if (data.type === 'work' && (data as Record<string, unknown>).version_graph) {
                    loadLineage(data as unknown as WorkDetailData);
                }
            } else {
                setDetailNotFound(true);
            }
        } catch (err) {
            console.error('加载详情失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, loadCatalog, loadCollated, loadLineage]);

    const handleNavigate = useCallback(async (id: string) => {
        pushUrl(id);
        await loadById(id);
    }, [loadById]);

    // 初始化：从 URL 加载书籍
    useEffect(() => {
        const id = getIdFromUrl();
        if (id) {
            const params = getParamsFromUrl();
            loadById(id, params);
        }
    }, [loadById]);

    // 浏览器前进/后退
    useEffect(() => {
        const onPopState = () => {
            const id = getIdFromUrl();
            if (id) {
                const params = getParamsFromUrl();
                loadById(id, params);
            } else {
                setSelectedEntry(null);
                setDetailData(null);
                setCatalogList([]);
                setCollatedIndex(null);
                const params = getParamsFromUrl();
                setHomeTab(((params.tab === 'catalog' || params.tab === 'site') ? params.tab : 'recommend') as TabKey);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [loadById]);

    /** 首页 tab 切换 */
    const handleHomeTabChange = useCallback((tab: TabKey) => {
        setHomeTab(tab);
        pushUrl(null, tab !== 'recommend' ? { tab } : undefined);
    }, []);

    /** 返回首页 */
    const handleBack = useCallback(() => {
        setSelectedEntry(null);
        setDetailData(null);
        setDetailNotFound(false);
        setCatalogList([]);
        setCollatedIndex(null);
        pushUrl(null);
    }, []);

    // 更新浏览器标签页标题
    useEffect(() => {
        document.title = detailData?.title
            ? `${detailData.title} - 古籍索引`
            : '古籍索引';
    }, [detailData?.title]);

    // 是否在详情页
    const showDetail = detailLoading || detailData || detailNotFound;

    return (
        <div style={{
            minHeight: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
            background: 'var(--bim-bg, #f5f5f5)',
            color: 'var(--bim-fg, #333)',
        }}>
            {showDetail ? (
                /* ── 详情页 ── */
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                    {/* 顶部返回栏 */}
                    <div style={{
                        padding: isMobile ? '12px 16px' : '12px 48px',
                        borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                        background: 'var(--bim-input-bg, #fff)',
                        flexShrink: 0,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <button
                            onClick={handleBack}
                            style={{
                                padding: '4px 12px',
                                border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                borderRadius: '4px',
                                background: 'transparent',
                                color: 'var(--bim-fg, #333)',
                                cursor: 'pointer',
                                fontSize: '13px',
                            }}
                        >
                            ← 返回索引
                        </button>
                        <LocaleToggle />
                    </div>
                    {detailLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                            <span style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>加载中...</span>
                        </div>
                    ) : detailNotFound ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px' }}>
                            <span style={{ fontSize: '32px' }}>📭</span>
                            <span style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>
                                找不到該條目，可能已被刪除或 ID 不正確
                            </span>
                            <button
                                onClick={handleBack}
                                style={{
                                    padding: '6px 16px',
                                    border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                    borderRadius: '4px',
                                    background: 'transparent',
                                    color: 'var(--bim-primary, #0078d4)',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                }}
                            >
                                返回首頁
                            </button>
                        </div>
                    ) : detailData ? (
                        <>
                            {/* Tab 栏 */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                                padding: isMobile ? '0 12px' : '0 48px',
                                background: 'var(--bim-input-bg, #fff)',
                                flexShrink: 0,
                                overflowX: isMobile ? 'auto' : undefined,
                            }}>
                                <button
                                    onClick={() => setActiveTab('detail')}
                                    style={tabBtnStyle(activeTab === 'detail')}
                                >
                                    {t.detailTab.basicInfo}
                                </button>
                                {detailData.type === 'collection' && catalogLoading && catalogList.length === 0 && (
                                    <button
                                        onClick={() => {}}
                                        style={tabBtnStyle(false)}
                                    >
                                        {t.detailTab.catalog}<span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>
                                    </button>
                                )}
                                {detailData.type === 'collection' && catalogList.map((cat) => (
                                    <button
                                        key={cat.resource_id}
                                        onClick={() => setActiveTab(`catalog:${cat.resource_id}`)}
                                        style={tabBtnStyle(activeTab === `catalog:${cat.resource_id}`)}
                                    >
                                        {cat.short_name ? `${convert(cat.short_name)}${t.detailTab.catalogSuffix}` : t.detailTab.collectionCatalog}
                                    </button>
                                ))}
                                {detailData.type === 'work' && (collatedIndex || collatedLoading) && (
                                    <button
                                        onClick={() => setActiveTab('collated')}
                                        style={tabBtnStyle(activeTab === 'collated')}
                                    >
                                        {t.detailTab.collatedEdition}
                                        {collatedLoading && (
                                            <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>
                                        )}
                                    </button>
                                )}
                                {detailData.type === 'work' && (lineageGraph || lineageLoading) && (
                                    <button
                                        onClick={() => setActiveTab('lineage')}
                                        style={tabBtnStyle(activeTab === 'lineage')}
                                    >
                                        版本源流
                                        {lineageLoading && (
                                            <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>
                                        )}
                                    </button>
                                )}
                                <button
                                    onClick={() => setActiveTab('feedback')}
                                    style={tabBtnStyle(activeTab === 'feedback')}
                                >
                                    反馈
                                </button>
                                <div style={{ marginLeft: 'auto', flexShrink: 0, padding: '4px 0' }}>
                                    <LocaleToggle />
                                </div>
                            </div>
                            <div style={{ padding: isMobile ? '16px 12px' : '32px 48px', maxWidth: '900px', flex: 1, overflow: 'auto' }}>
                                {activeTab === 'detail' ? (
                                    <IndexDetail
                                        data={detailData}
                                        transport={transport}
                                        onNavigate={handleNavigate}
                                        relatedBooksFooter={
                                            lineageGraph && lineageGraph.nodes.length > 0 ? (
                                                <LineageBanner
                                                    graph={lineageGraph}
                                                    onOpen={() => setActiveTab('lineage')}
                                                />
                                            ) : null
                                        }
                                    />
                                ) : activeTab.startsWith('catalog:') ? (
                                    <CollectionCatalog
                                        data={catalogList.find(c => `catalog:${c.resource_id}` === activeTab)?.data}
                                        onNavigate={handleNavigate}
                                    />
                                ) : activeTab === 'collated' ? (
                                    <CollatedEdition
                                        index={collatedIndex || undefined}
                                        workId={detailData.id}
                                        transport={transport}
                                        onNavigate={handleNavigate}
                                        activeJuan={activeJuan}
                                        onJuanChange={setActiveJuan}
                                    />
                                ) : activeTab === 'lineage' ? (
                                    lineageGraph ? (
                                        <VersionLineageView
                                            graph={lineageGraph}
                                            defaultMode={lineageMode}
                                            onModeChange={handleLineageModeChange}
                                            renderLink={(linkId, label) => (
                                                <a
                                                    href="#"
                                                    onClick={(e) => { e.preventDefault(); handleNavigate(linkId); }}
                                                    style={{ color: 'var(--bim-primary, #0078d4)', textDecoration: 'none' }}
                                                >
                                                    {label}
                                                </a>
                                            )}
                                            graphHeight={Math.max(500, window.innerHeight - 250)}
                                            selectedNodeId={selectedNodeId}
                                            collection={lineageCollection}
                                            onCollectionChange={handleLineageCollectionChange}
                                            collectionsAvailable={
                                                detailData.type === 'work'
                                                    ? (detailData as WorkDetailData).version_graph?.collections
                                                    : undefined
                                            }
                                            collectionCounts={
                                                detailData.type === 'work'
                                                    ? (() => {
                                                        const w = detailData as WorkDetailData;
                                                        const core = w.version_graph?.core_books?.length;
                                                        const all = (w.books?.length ?? 0)
                                                            - (w.version_graph?.excluded_books?.length ?? 0);
                                                        const out: Record<string, number> = { all };
                                                        if (core != null) out.core = core;
                                                        return out;
                                                    })()
                                                    : undefined
                                            }
                                        />
                                    ) : (
                                        <div style={{ padding: 24, color: 'var(--bim-muted, #999)' }}>
                                            {lineageLoading ? '加载中…' : '暂无版本图数据'}
                                        </div>
                                    )
                                ) : activeTab === 'feedback' ? (
                                    <FeedbackTabContent resourceId={detailData.id} />
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </div>
            ) : (
                /* ── 首页：搜索 + 推荐 ── */
                <div style={{ maxWidth: '800px', margin: '0 auto', padding: isMobile ? '16px 12px' : '32px 16px' }}>
                    <IndexBrowser
                        transport={transport}
                        onEntryClick={handleEntryClick}
                        hideModeIndicator
                        headerRight={<LocaleToggle />}
                    />
                    <HomePage
                        transport={transport}
                        onNavigate={handleNavigate}
                        activeTab={homeTab}
                        onTabChange={handleHomeTabChange}
                    />
                </div>
            )}
        </div>
    );
}

function LineageBanner({ graph, onOpen }: { graph: LineageGraph; onOpen: () => void }) {
    const bookCount = graph.nodes.filter((n) => n.kind === 'book').length;
    return (
        <div
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                marginBottom: 0,
                background: 'var(--bim-info-bg, #e7f3ff)',
                color: 'var(--bim-info-fg, #0c5380)',
                border: '1px solid var(--bim-info-border, #b3dbff)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1.5,
            }}
        >
            <div style={{ fontSize: 18, lineHeight: 1 }}>📜</div>
            <div style={{ flex: 1 }}>
                本作品共有 <strong>{bookCount}</strong> 个版本，已整理出版本之间的传承关系。
                {graph.description && <span style={{ opacity: 0.85 }}>　{graph.description.slice(0, 40)}…</span>}
            </div>
            <span style={{
                padding: '2px 10px',
                background: 'var(--bim-info-fg, #0c5380)',
                color: 'var(--bim-info-bg, #fff)',
                borderRadius: 4,
                fontSize: 12,
                whiteSpace: 'nowrap',
            }}>查看版本源流 →</span>
        </div>
    );
}

const FEEDBACK_API = '/api/feedback';

function FeedbackTabContent({ resourceId }: { resourceId: string }) {
    const [items, setItems] = React.useState<FeedbackItem[]>([]);
    const [loading, setLoading] = React.useState(true);

    const loadFeedback = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${FEEDBACK_API}?resourceId=${encodeURIComponent(resourceId)}`);
            const data = await res.json();
            if (data.success) setItems(data.items);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [resourceId]);

    React.useEffect(() => { loadFeedback(); }, [loadFeedback]);

    const handleSubmit = async (data: { type: string; content: string }) => {
        const res = await fetch(FEEDBACK_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, pageUrl: window.location.href, resourceId }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error || '提交失败');
        }
        setTimeout(() => loadFeedback(), 500);
    };

    return (
        <div>
            <FeedbackList items={items} loading={loading} />
            <div style={{ marginTop: '24px' }}>
                <FeedbackForm onSubmit={handleSubmit} />
            </div>
        </div>
    );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
    return {
        padding: '10px 16px',
        border: 'none',
        borderBottom: active ? '2px solid var(--bim-primary, #0078d4)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--bim-primary, #0078d4)' : 'var(--bim-desc-fg, #717171)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
    };
}

const root = createRoot(document.getElementById('root')!);
root.render(
    <LocaleProvider>
        <App />
    </LocaleProvider>
);
