import React, { useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { IndexBrowser } from '../components/IndexBrowser';
import { HomePage } from '../components/HomePage';
import type { TabKey } from '../components/HomePage';
import { LocaleToggle } from '../components/LocaleToggle';
import { RepoSourceLink } from '../components/common/RepoSourceLink';
import { BookDetailLayout } from '../components/BookDetailLayout';
import type { SourceLinkContext } from '../components/BookDetailLayout';
import { cleanName } from '../core/storage';
import { extractStatus } from '../id';
import { LocaleProvider } from '../i18n/provider';
import { DevApiStorage } from '../storage/dev-api-storage';
import type { IndexStorage } from '../storage/types';
import type { IndexEntry, IndexDetailData } from '../types';
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
function getParamsFromUrl(): { tab?: string; juan?: string; node?: string; mode?: string; collection?: string } {
    const params = new URLSearchParams(window.location.search);
    return {
        tab: params.get('tab') || undefined,
        juan: params.get('juan') || undefined,
        node: params.get('node') || undefined,
        mode: params.get('mode') || undefined,
        collection: params.get('collection') || undefined,
    };
}

function buildUrl(id: string | null, params?: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    if (id) sp.set('id', id);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') sp.set(k, v);
        }
    }
    const qs = sp.toString();
    if (id) return qs ? `${DETAIL_PATH}?${qs}` : DETAIL_PATH;
    return qs ? `/?${qs}` : '/';
}

function pushUrl(id: string | null, params?: Record<string, string | undefined>) {
    const url = buildUrl(id, params);
    const current = window.location.pathname + window.location.search;
    if (current !== url) {
        window.history.pushState(null, '', url);
    }
}

function replaceUrl(id: string | null, params?: Record<string, string | undefined>) {
    window.history.replaceState(null, '', buildUrl(id, params));
}

// ── GitHub 源文件链接推导 ──

const REPO_DRAFT = 'https://github.com/open-guji/book-index-draft';
const REPO_OFFICIAL = 'https://github.com/open-guji/book-index';
const TYPE_TO_FOLDER: Record<string, string> = {
    book: 'Book', collection: 'Collection', work: 'Work', entity: 'Entity',
};

function deriveEntryPath(entry: IndexEntry, detail: IndexDetailData | null): string {
    if (entry.path) return entry.path;
    const id = entry.id;
    const c1 = id[0] ?? '_';
    const c2 = id[1] ?? '_';
    const c3 = id[2] ?? '_';
    const folder = TYPE_TO_FOLDER[entry.type] ?? 'Work';
    const title = entry.title
        || (detail as { title?: string; primary_name?: string } | null)?.title
        || (detail as { title?: string; primary_name?: string } | null)?.primary_name
        || '';
    return `${folder}/${c1}/${c2}/${c3}/${id}-${cleanName(title)}.json`;
}

function buildSourceLink(ctx: SourceLinkContext): { href: string; label: string } | null {
    const { activeTab, activeJuan, entry, detail } = ctx;
    if (activeTab === 'feedback') return null;
    let isDraft = entry.isDraft;
    if (isDraft === undefined) {
        try { isDraft = extractStatus(entry.id) === 'draft'; } catch { isDraft = true; }
    }
    const base = isDraft ? REPO_DRAFT : REPO_OFFICIAL;
    const repoLabel = isDraft ? 'book-index-draft' : 'book-index';
    const path = deriveEntryPath(entry, detail);
    const dir = path.slice(0, path.lastIndexOf('/'));
    const id = entry.id;

    if (activeTab === 'collated') {
        if (activeJuan) {
            return {
                href: `${base}/blob/main/${dir}/${id}/collated_edition/${activeJuan}`,
                label: `在 GitHub 查看本卷源文件（${repoLabel}）`,
            };
        }
        return {
            href: `${base}/tree/main/${dir}/${id}/collated_edition`,
            label: `在 GitHub 查看整理本源文件目录（${repoLabel}）`,
        };
    }
    if (activeTab.startsWith('catalog:')) {
        const rid = activeTab.slice('catalog:'.length);
        return {
            href: `${base}/blob/main/${dir}/${id}/${rid}/volume_book_mapping.json`,
            label: `在 GitHub 查看丛编目录源文件（${repoLabel}）`,
        };
    }
    if (activeTab === 'lineage') {
        return {
            href: `${base}/blob/main/${dir}/${id}/lineage_graph.json`,
            label: `在 GitHub 查看版本传承源文件（${repoLabel}）`,
        };
    }
    return {
        href: `${base}/blob/main/${path}`,
        label: `在 GitHub 查看本条目源文件（${repoLabel}）`,
    };
}

// ── 主应用 ──

function App() {
    const isMobile = useIsMobile();
    const [transport] = useState<IndexStorage>(() => createStorage());
    const [currentId, setCurrentId] = useState<string | null>(() => getIdFromUrl());
    const [activeTab, setActiveTabState] = useState<string>(() => getParamsFromUrl().tab || 'basic');
    const [activeJuan, setActiveJuanState] = useState<string | null>(() => getParamsFromUrl().juan || null);
    const [lineageMode, setLineageModeState] = useState<'list' | 'graph'>(() => {
        const m = getParamsFromUrl().mode;
        return m === 'graph' ? 'graph' : 'list';
    });
    const [lineageCollection, setLineageCollection] = useState<string | undefined>(() => getParamsFromUrl().collection);
    const [homeTab, setHomeTab] = useState<TabKey>(() => {
        const id = getIdFromUrl();
        if (id) return 'recommend';
        const params = getParamsFromUrl();
        return ((params.tab === 'catalog' || params.tab === 'site') ? params.tab : 'recommend') as TabKey;
    });

    // ── URL 同步辅助 ──

    const syncUrl = useCallback((id: string | null, opts?: { tab?: string; juan?: string; mode?: string; collection?: string; replace?: boolean }) => {
        const fn = opts?.replace ? replaceUrl : pushUrl;
        fn(id, {
            tab: opts?.tab && opts.tab !== 'basic' ? opts.tab : undefined,
            juan: opts?.juan || undefined,
            mode: opts?.mode && opts.mode !== 'list' ? opts.mode : undefined,
            collection: opts?.collection || undefined,
        });
    }, []);

    const handleTabChange = useCallback((tab: string) => {
        setActiveTabState(tab);
        const juan = tab === 'collated' ? activeJuan : null;
        syncUrl(currentId, { tab, juan: juan ?? undefined, mode: tab === 'lineage' ? lineageMode : undefined, collection: tab === 'lineage' ? lineageCollection : undefined });
    }, [currentId, activeJuan, lineageMode, lineageCollection, syncUrl]);

    const handleJuanChange = useCallback((juan: string | null) => {
        setActiveJuanState(juan);
        syncUrl(currentId, { tab: 'collated', juan: juan ?? undefined, replace: true });
    }, [currentId, syncUrl]);

    const handleLineageModeChange = useCallback((mode: 'list' | 'graph') => {
        setLineageModeState(mode);
        syncUrl(currentId, { tab: 'lineage', mode, collection: lineageCollection, replace: true });
    }, [currentId, lineageCollection, syncUrl]);

    const handleLineageCollectionChange = useCallback((key: string) => {
        setLineageCollection(key || undefined);
        syncUrl(currentId, { tab: 'lineage', mode: lineageMode, collection: key, replace: true });
    }, [currentId, lineageMode, syncUrl]);

    // 进入某条记录详情
    const navigateToDetail = useCallback((id: string) => {
        setCurrentId(id);
        setActiveTabState('basic');
        setActiveJuanState(null);
        setLineageModeState('list');
        setLineageCollection(undefined);
        pushUrl(id);
    }, []);

    const handleEntryClick = useCallback((entry: IndexEntry) => {
        navigateToDetail(entry.id);
    }, [navigateToDetail]);

    const handleNavigate = useCallback((id: string) => {
        navigateToDetail(id);
    }, [navigateToDetail]);

    const handleBack = useCallback(() => {
        setCurrentId(null);
        pushUrl(null);
    }, []);

    // 浏览器前进/后退
    useEffect(() => {
        const onPopState = () => {
            const id = getIdFromUrl();
            const params = getParamsFromUrl();
            setCurrentId(id);
            setActiveTabState(params.tab || 'basic');
            setActiveJuanState(params.juan || null);
            setLineageModeState(params.mode === 'graph' ? 'graph' : 'list');
            setLineageCollection(params.collection);
            if (!id) {
                setHomeTab(((params.tab === 'catalog' || params.tab === 'site') ? params.tab : 'recommend') as TabKey);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // 首页 tab 切换
    const handleHomeTabChange = useCallback((tab: TabKey) => {
        setHomeTab(tab);
        pushUrl(null, tab !== 'recommend' ? { tab } : undefined);
    }, []);

    // 更新浏览器标签页标题（详情页）
    useEffect(() => {
        if (!currentId) {
            document.title = '古籍索引';
        }
    }, [currentId]);

    return (
        <div style={{
            minHeight: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
            background: 'var(--bim-bg, #f5f5f5)',
            color: 'var(--bim-fg, #333)',
        }}>
            {currentId ? (
                <BookDetailLayout
                    id={currentId}
                    transport={transport}
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    activeJuan={activeJuan}
                    onJuanChange={handleJuanChange}
                    lineageMode={lineageMode}
                    onLineageModeChange={handleLineageModeChange}
                    lineageCollection={lineageCollection}
                    onLineageCollectionChange={handleLineageCollectionChange}
                    onNavigate={handleNavigate}
                    onBack={handleBack}
                    backLabel="返回索引"
                    getSourceLink={buildSourceLink}
                    feedbackApiUrl="/api/feedback"
                />
            ) : (
                <div style={{ maxWidth: '800px', margin: '0 auto', padding: isMobile ? '16px 12px' : '32px 16px' }}>
                    <IndexBrowser
                        transport={transport}
                        onEntryClick={handleEntryClick}
                        hideModeIndicator
                        headerRight={
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <LocaleToggle />
                                <RepoSourceLink
                                    href={REPO_DRAFT}
                                    label="book-index-draft：所有索引数据的开源仓库"
                                />
                            </span>
                        }
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

const root = createRoot(document.getElementById('root')!);
root.render(
    <LocaleProvider>
        <App />
    </LocaleProvider>,
);
