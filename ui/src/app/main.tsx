import React, { useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { IndexBrowser } from '../components/IndexBrowser';
import { IndexDetail } from '../components/IndexDetail';
import { CollectionCatalog } from '../components/CollectionCatalog';
import { CollatedEdition } from '../components/CollatedEdition';
import { HomePage } from '../components/HomePage';
import type { TabKey } from '../components/HomePage';
import { LocaleToggle } from '../components/LocaleToggle';
import { LocaleProvider } from '../i18n/provider';
import { DevApiStorage } from '../storage/dev-api-storage';
import type { IndexStorage } from '../storage/types';
import type { IndexEntry, IndexDetailData, ResourceCatalog, CollatedEditionIndex } from '../types';
import '../styles/variables.css';

// ── 数据源 ──

function createStorage(): IndexStorage {
    return new DevApiStorage();
}

// ── URL 工具 ──

/** 从当前 URL pathname 提取 book ID（第一段路径） */
function getIdFromUrl(): string | null {
    const path = window.location.pathname.replace(/^\/+/, '');
    return path || null;
}

/** 从 URL search params 提取参数 */
function getParamsFromUrl(): { tab?: string; juan?: string } {
    const params = new URLSearchParams(window.location.search);
    return {
        tab: params.get('tab') || undefined,
        juan: params.get('juan') || undefined,
    };
}

/** 更新浏览器 URL（不触发页面刷新） */
function pushUrl(id: string | null, params?: Record<string, string | undefined>) {
    let url = id ? `/${id}` : '/';
    if (params) {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v) sp.set(k, v);
        }
        const qs = sp.toString();
        if (qs) url += `?${qs}`;
    }
    const current = window.location.pathname + window.location.search;
    if (current !== url) {
        window.history.pushState(null, '', url);
    }
}

/** replaceState 版本，用于不产生历史记录的更新 */
function replaceUrl(id: string | null, params?: Record<string, string | undefined>) {
    let url = id ? `/${id}` : '/';
    if (params) {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v) sp.set(k, v);
        }
        const qs = sp.toString();
        if (qs) url += `?${qs}`;
    }
    window.history.replaceState(null, '', url);
}

// ── 主应用 ──

function App() {
    const [transport] = useState<IndexStorage>(() => createStorage());
    const [selectedEntry, setSelectedEntry] = useState<IndexEntry | null>(null);
    const [detailData, setDetailData] = useState<IndexDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeTab, setActiveTabState] = useState<string>('detail');
    const [activeJuan, setActiveJuanState] = useState<string | null>(null);
    const [catalogList, setCatalogList] = useState<ResourceCatalog[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [collatedIndex, setCollatedIndex] = useState<CollatedEditionIndex | null>(null);
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
    const loadById = useCallback(async (id: string, restoreParams?: { tab?: string; juan?: string }) => {
        setDetailData(null);
        setCatalogList([]);
        setCollatedIndex(null);
        setActiveTabState(restoreParams?.tab || 'detail');
        setActiveJuanState(restoreParams?.juan || null);
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
            }
        } catch (err) {
            console.error('加载详情失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, loadCatalog, loadCollated]);

    const handleEntryClick = useCallback(async (entry: IndexEntry) => {
        setSelectedEntry(entry);
        pushUrl(entry.id);
        setDetailData(null);
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
            }
        } catch (err) {
            console.error('加载详情失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, loadCatalog, loadCollated]);

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
    const showDetail = detailLoading || detailData;

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
                        padding: '12px 48px',
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
                    ) : detailData ? (
                        <>
                            {/* Tab 栏：丛编目录 / 整理本 / 分类目录 */}
                            {((detailData.type === 'collection' && (catalogList.length > 0 || catalogLoading)) ||
                              (detailData.type === 'work' && (collatedIndex || collatedLoading))) && (
                                <div style={{
                                    display: 'flex',
                                    gap: '0',
                                    borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                                    padding: '0 48px',
                                    background: 'var(--bim-input-bg, #fff)',
                                    flexShrink: 0,
                                }}>
                                    <button
                                        onClick={() => setActiveTab('detail')}
                                        style={tabBtnStyle(activeTab === 'detail')}
                                    >
                                        基本信息
                                    </button>
                                    {detailData.type === 'collection' && catalogLoading && catalogList.length === 0 && (
                                        <button
                                            onClick={() => {}}
                                            style={tabBtnStyle(false)}
                                        >
                                            目錄<span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>
                                        </button>
                                    )}
                                    {detailData.type === 'collection' && catalogList.map((cat) => (
                                        <button
                                            key={cat.resource_id}
                                            onClick={() => setActiveTab(`catalog:${cat.resource_id}`)}
                                            style={tabBtnStyle(activeTab === `catalog:${cat.resource_id}`)}
                                        >
                                            {cat.short_name ? `${cat.short_name}·目錄` : '叢編目錄'}
                                        </button>
                                    ))}
                                    {detailData.type === 'work' && (collatedIndex || collatedLoading) && (
                                        <button
                                            onClick={() => setActiveTab('collated')}
                                            style={tabBtnStyle(activeTab === 'collated')}
                                        >
                                            整理本
                                            {collatedLoading && (
                                                <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}
                            <div style={{ padding: '32px 48px', maxWidth: '900px', flex: 1, overflow: 'auto' }}>
                                {activeTab === 'detail' ? (
                                    <IndexDetail
                                        data={detailData}
                                        transport={transport}
                                        onNavigate={handleNavigate}
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
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </div>
            ) : (
                /* ── 首页：搜索 + 推荐 ── */
                <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 16px' }}>
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
