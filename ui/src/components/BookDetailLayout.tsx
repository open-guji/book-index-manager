import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
    IndexEntry,
    IndexDetailData,
    ResourceCatalog,
    CollatedEditionIndex,
    BookFullTextIndex,
    WorkDetailData,
    BookDetailData,
    EmendatedByEntry,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { IndexDetail, EmendatedBySection } from './IndexDetail';
import { CollectionCatalog } from './CollectionCatalog';
import { CollatedEdition } from './CollatedEdition';
import { BookFullText } from './BookFullText';
import { VersionLineageView } from './VersionLineageView';
import { buildLineageGraph } from '../core/lineage-graph';
import type { LineageGraph } from '../core/lineage-graph';
import { FeedbackTab } from './FeedbackTab';
import { LocaleToggle } from './LocaleToggle';
import { RepoSourceLink } from './common/RepoSourceLink';
import { useT, useConvert } from '../i18n';

// 内联 CSS：mobile (≤768px) 隐藏 SideNav，desktop 隐藏 TopNav。
// 用 CSS media query 代替 useIsMobile，避免 SSR/hydrate 时序不一致。
const LAYOUT_CSS = `
.bim-detail-root { flex-direction: row; }
.bim-detail-top-nav { display: none; }
.bim-detail-content { padding: 24px 32px 32px; }
@media (max-width: 768px) {
  .bim-detail-root { flex-direction: column; }
  .bim-detail-side-nav { display: none !important; }
  .bim-detail-top-nav { display: block; }
  .bim-detail-content { padding: 16px 16px 32px; }
}
`;

// ── 类型 ──

export type BookDetailTabKey = 'basic' | 'collated' | 'fulltext' | 'lineage' | 'emendated' | 'feedback' | string;

export interface ExtraTabContext {
    detail: IndexDetailData;
    entry: IndexEntry;
    transport: IndexStorage;
    onNavigate?: (id: string) => void;
}

export interface ExtraTab {
    /** 唯一 key */
    key: string;
    /** 显示文案 */
    label: string;
    /** 是否在当前 detail 下显示该 tab */
    shouldShow: (detail: IndexDetailData) => boolean;
    /** tab 内容渲染 */
    render: (ctx: ExtraTabContext) => React.ReactNode;
    /** 插入位置（默认 before-feedback） */
    position?: 'before-feedback' | 'after-feedback';
}

export interface SourceLinkContext {
    activeTab: string;
    activeJuan: string | null;
    entry: IndexEntry;
    detail: IndexDetailData;
}

export interface BookDetailLayoutProps {
    /** 要展示的条目 ID */
    id: string;
    /** 数据传输层 */
    transport: IndexStorage;

    // ── 受控 tab/卷状态 ──
    activeTab: BookDetailTabKey;
    onTabChange: (tab: BookDetailTabKey) => void;
    activeJuan?: string | null;
    onJuanChange?: (juan: string | null) => void;
    lineageMode?: 'list' | 'graph';
    onLineageModeChange?: (mode: 'list' | 'graph') => void;
    lineageCollection?: string;
    onLineageCollectionChange?: (key: string) => void;
    /** 整理本初始页（透传给 extraTabs 的 digital 等） */
    initialPage?: number;
    selectedLineageNodeId?: string;

    // ── 导航回调 ──
    onNavigate?: (id: string) => void;
    onBack?: () => void;
    backLabel?: string;
    renderLink?: (id: string, label?: string) => React.ReactNode;

    // ── 外部钩子 ──
    /** 加载 detail 后的额外加工（如注入 digital_assets） */
    enrichDetail?: (entry: IndexEntry, detail: IndexDetailData) => void;
    /** 当前 tab 的源文件链接解析器 */
    getSourceLink?: (ctx: SourceLinkContext) => { href: string; label: string } | null;

    // ── tab 扩展 ──
    /** 注入额外 tab（如 kyg 的「数字化」） */
    extraTabs?: ExtraTab[];

    // ── 内置反馈 tab ──
    /** 是否显示内置反馈 tab，默认 true。设为 false 时调用方可用 extraTabs 自定义。 */
    showFeedbackTab?: boolean;
    /** 反馈 API 端点（默认 `/api/feedback`） */
    feedbackApiUrl?: string | (() => string);

    // ── 布局调整 ──
    /** 整个组件的外层高度（默认 100vh） */
    height?: string;
    /** 桌面侧边栏宽度（默认 144 — 对应 Tailwind w-36） */
    sideNavWidth?: number;
    /** 内容区域最大宽度（默认 1024） */
    contentMaxWidth?: number;
    /** 是否在加载/未找到状态下隐藏整体导航（默认 false：仍显示返回链接） */
    hideNavWhenLoading?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

interface NavItem {
    key: BookDetailTabKey;
    label: string;
}

// ── 子组件：SideNav (桌面) ──

function SideNav({
    items,
    activeKey,
    onSelect,
    onBack,
    backLabel,
    width,
}: {
    items: NavItem[];
    activeKey: string;
    onSelect: (key: BookDetailTabKey) => void;
    onBack?: () => void;
    backLabel: string;
    width: number;
}) {
    return (
        <nav
            style={{
                display: 'flex',
                flexDirection: 'column',
                paddingTop: 16,
                width,
                flexShrink: 0,
                borderRight: '1px solid var(--bim-widget-border, #e0e0e0)',
                background: 'var(--bim-bg, transparent)',
            }}
        >
            {onBack && (
                <>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 20px',
                            fontSize: 14,
                            color: 'var(--bim-fg, #2c2c2c)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--bim-primary, #8B0000)';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--bim-fg, #2c2c2c)';
                        }}
                    >
                        <svg width="14" height="14" fill="none" strokeWidth={2} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {backLabel}
                    </button>
                    <div style={{
                        margin: '8px 16px',
                        borderTop: '1px solid var(--bim-widget-border, #e0e0e0)',
                        opacity: 0.6,
                    }} />
                </>
            )}
            {items.map(item => {
                const isActive = item.key === activeKey;
                return (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => onSelect(item.key)}
                        style={{
                            position: 'relative',
                            textAlign: 'left',
                            padding: '8px 20px',
                            fontSize: 14,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: isActive ? 'var(--bim-primary, #8B0000)' : 'var(--bim-fg, #2c2c2c)',
                            fontWeight: isActive ? 500 : 400,
                            transition: 'color 120ms',
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--bim-primary, #8B0000)';
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--bim-fg, #2c2c2c)';
                        }}
                    >
                        {isActive && (
                            <span style={{
                                position: 'absolute',
                                left: 0,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 3,
                                height: 16,
                                background: 'var(--bim-primary, #8B0000)',
                                borderRadius: '0 2px 2px 0',
                            }} />
                        )}
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
}

// ── 子组件：TopNav (移动端) ──

function TopNav({
    items,
    activeKey,
    onSelect,
    onBack,
    backLabel,
}: {
    items: NavItem[];
    activeKey: string;
    onSelect: (key: BookDetailTabKey) => void;
    onBack?: () => void;
    backLabel: string;
}) {
    return (
        <div style={{
            flexShrink: 0,
            borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
            background: 'var(--bim-bg, transparent)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto' }}>
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '10px 12px',
                            fontSize: 14,
                            color: 'var(--bim-fg, #2c2c2c)',
                            background: 'transparent',
                            border: 'none',
                            borderRight: '1px solid var(--bim-widget-border, #e0e0e0)',
                            cursor: 'pointer',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <svg width="14" height="14" fill="none" strokeWidth={2} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {backLabel}
                    </button>
                )}
                {items.map(item => {
                    const isActive = item.key === activeKey;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onSelect(item.key)}
                            style={{
                                padding: '10px 16px',
                                fontSize: 14,
                                background: 'transparent',
                                border: 'none',
                                borderBottom: isActive
                                    ? '2px solid var(--bim-primary, #8B0000)'
                                    : '2px solid transparent',
                                color: isActive ? 'var(--bim-primary, #8B0000)' : 'var(--bim-fg, #2c2c2c)',
                                fontWeight: isActive ? 500 : 400,
                                cursor: 'pointer',
                                flexShrink: 0,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── 浮动右上角的「LocaleToggle + 源文件」按钮组 ──

function FloatingActions({ sourceLink }: { sourceLink: { href: string; label: string } | null }) {
    return (
        <div style={{
            position: 'absolute',
            top: 24,
            right: 32,
            zIndex: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
        }}>
            <LocaleToggle />
            {sourceLink && <RepoSourceLink {...sourceLink} />}
        </div>
    );
}

// ── 主组件 ──

export const BookDetailLayout: React.FC<BookDetailLayoutProps> = ({
    id,
    transport,
    activeTab,
    onTabChange,
    activeJuan: activeJuanProp,
    onJuanChange,
    lineageMode = 'list',
    onLineageModeChange,
    lineageCollection: lineageCollectionProp,
    onLineageCollectionChange,
    initialPage = 1,
    selectedLineageNodeId,
    onNavigate,
    onBack,
    backLabel,
    renderLink,
    enrichDetail,
    getSourceLink,
    extraTabs = [],
    showFeedbackTab = true,
    feedbackApiUrl,
    height = '100vh',
    sideNavWidth = 144,
    contentMaxWidth = 1024,
    className,
    style,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [entry, setEntry] = useState<IndexEntry | null>(null);
    const [detail, setDetail] = useState<IndexDetailData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // 类型化的副数据
    const [catalogList, setCatalogList] = useState<ResourceCatalog[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [collatedIndex, setCollatedIndex] = useState<CollatedEditionIndex | null>(null);
    const [collatedLoading, setCollatedLoading] = useState(false);
    const [bookFullTextIndex, setBookFullTextIndex] = useState<BookFullTextIndex | null>(null);
    const [bookFullTextLoading, setBookFullTextLoading] = useState(false);
    const [lineageGraph, setLineageGraph] = useState<LineageGraph | null>(null);
    const [lineageLoading, setLineageLoading] = useState(false);
    const lineageSourceRef = useRef<{ work: WorkDetailData; books: BookDetailData[] } | null>(null);

    // activeJuan 内部 fallback（当未受控时）
    const [internalJuan, setInternalJuan] = useState<string | null>(null);
    const activeJuan = activeJuanProp !== undefined ? activeJuanProp : internalJuan;
    const setActiveJuan = useCallback((j: string | null) => {
        if (onJuanChange) onJuanChange(j);
        else setInternalJuan(j);
    }, [onJuanChange]);

    // ── 数据加载 ──

    const loadCatalogs = useCallback(async (collectionId: string) => {
        if (!transport.getCollectionCatalogs && !transport.getCollectionCatalog) {
            setCatalogList([]);
            return;
        }
        setCatalogLoading(true);
        try {
            if (transport.getCollectionCatalogs) {
                const catalogs = await transport.getCollectionCatalogs(collectionId);
                setCatalogList(catalogs || []);
            } else if (transport.getCollectionCatalog) {
                const cat = await transport.getCollectionCatalog(collectionId);
                setCatalogList(cat ? [{ resource_id: '', data: cat }] : []);
            }
        } catch {
            setCatalogList([]);
        } finally {
            setCatalogLoading(false);
        }
    }, [transport]);

    const loadCollated = useCallback(async (workId: string) => {
        if (!transport.getCollatedEditionIndex) {
            setCollatedIndex(null);
            return;
        }
        setCollatedLoading(true);
        try {
            const idx = await transport.getCollatedEditionIndex(workId);
            setCollatedIndex(idx);
        } catch {
            setCollatedIndex(null);
        } finally {
            setCollatedLoading(false);
        }
    }, [transport]);

    const loadBookFullText = useCallback(async (bookId: string) => {
        if (!transport.getBookFullTextIndex) {
            setBookFullTextIndex(null);
            return;
        }
        setBookFullTextLoading(true);
        try {
            const idx = await transport.getBookFullTextIndex(bookId);
            setBookFullTextIndex(idx);
        } catch {
            setBookFullTextIndex(null);
        } finally {
            setBookFullTextLoading(false);
        }
    }, [transport]);

    const loadLineage = useCallback(async (workId: string, workData: IndexDetailData) => {
        setLineageLoading(true);
        try {
            // 优先尝试 transport 上的预构建 graph
            if (transport.getLineageGraph) {
                const pre = await transport.getLineageGraph(workId);
                if (pre) {
                    setLineageGraph(pre);
                    // 仍然需要 source ref 来支持集合切换 — fallback 时填充
                }
            }

            const vg = (workData as WorkDetailData).version_graph;
            if (!vg || !vg.enabled) {
                if (!lineageGraph) setLineageGraph(null);
                lineageSourceRef.current = null;
                return;
            }

            const bookIds = (workData as WorkDetailData).books ?? [];
            const books: BookDetailData[] = [];
            for (const bid of bookIds) {
                try {
                    const b = await transport.getItem(bid);
                    if (b) books.push(b as unknown as BookDetailData);
                } catch { /* skip */ }
            }
            lineageSourceRef.current = { work: workData as WorkDetailData, books };

            // 使用受控 collection 或默认值
            const desired = lineageCollectionProp
                ?? vg.default_collection
                ?? (vg.core_books && vg.core_books.length > 0 ? 'core' : 'all');
            const usable = (desired === 'core'
                && Array.isArray(vg.core_books) && vg.core_books.length > 0)
                ? 'core'
                : (desired ?? 'all');
            setLineageGraph(buildLineageGraph(workData as WorkDetailData, books, usable));
        } catch {
            setLineageGraph(null);
            lineageSourceRef.current = null;
        } finally {
            setLineageLoading(false);
        }
        // 故意只依赖 transport：lineageCollectionProp 在 effect 里读最新值即可
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport]);

    // ── 加载详情 ──

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setNotFound(false);
            setEntry(null);
            setDetail(null);
            setCatalogList([]);
            setCollatedIndex(null);
            setLineageGraph(null);
            lineageSourceRef.current = null;

            try {
                const raw = await transport.getItem(id);
                if (cancelled) return;
                if (!raw) {
                    setNotFound(true);
                    return;
                }
                const detailData = raw as unknown as IndexDetailData;

                // 优先用 transport.getEntry；不支持时从 detail 推断最小 entry
                let entryData: IndexEntry | null = null;
                if (transport.getEntry) {
                    entryData = await transport.getEntry(id);
                    if (cancelled) return;
                }
                if (!entryData) {
                    entryData = {
                        id,
                        title: (detailData as { title?: string; primary_name?: string }).title
                            ?? (detailData as { primary_name?: string }).primary_name
                            ?? id,
                        type: (detailData.type as IndexEntry['type']) ?? 'book',
                    } as IndexEntry;
                }

                if (enrichDetail) enrichDetail(entryData, detailData);
                setEntry(entryData);
                setDetail(detailData);

                if (detailData.type === 'collection') {
                    loadCatalogs(id);
                } else if (detailData.type === 'work') {
                    if ((detailData as { has_collated?: boolean }).has_collated || transport.getCollatedEditionIndex) {
                        loadCollated(id);
                    }
                    if ((detailData as WorkDetailData).version_graph || transport.getLineageGraph) {
                        loadLineage(id, detailData);
                    }
                } else if (detailData.type === 'book') {
                    if ((detailData as { has_full_text?: boolean }).has_full_text && transport.getBookFullTextIndex) {
                        loadBookFullText(id);
                    }
                }
            } catch {
                if (!cancelled) setNotFound(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [id, transport, enrichDetail, loadCatalogs, loadCollated, loadLineage, loadBookFullText]);

    // 切换 collection 时仅 rebuild graph，不重新拉 books
    useEffect(() => {
        const src = lineageSourceRef.current;
        if (!src) return;
        if (!lineageCollectionProp) return;
        setLineageGraph(buildLineageGraph(src.work, src.books, lineageCollectionProp));
    }, [lineageCollectionProp]);

    // ── 构建 nav 项 ──

    const navItems: NavItem[] = [];
    if (detail) {
        navItems.push({ key: 'basic', label: t.detailTab?.basicInfo ?? '基本信息' });

        if (detail.type === 'collection') {
            if (catalogLoading && catalogList.length === 0) {
                navItems.push({ key: 'catalog:loading', label: `${t.detailTab?.catalog ?? '目录'}...` });
            }
            for (const cat of catalogList) {
                const baseLabel = cat.short_name ? `${convert(cat.short_name)}` : (t.detailTab?.collectionCatalog ?? '丛编目录');
                const suffix = t.detailTab?.catalogSuffix ?? '·目录';
                navItems.push({
                    key: `catalog:${cat.resource_id}`,
                    label: cat.short_name ? `${baseLabel}${suffix}` : baseLabel,
                });
            }
        }

        if (detail.type === 'work' && (collatedIndex || collatedLoading)) {
            navItems.push({
                key: 'collated',
                label: collatedLoading ? `${t.detailTab?.collatedEdition ?? '整理本'}...` : (t.detailTab?.collatedEdition ?? '整理本'),
            });
        }

        if (detail.type === 'book' && (bookFullTextIndex || bookFullTextLoading)) {
            navItems.push({
                key: 'fulltext',
                label: bookFullTextLoading ? '全文...' : '全文',
            });
        }

        if (detail.type === 'work' && (lineageGraph || lineageLoading)) {
            navItems.push({
                key: 'lineage',
                label: lineageLoading ? '版本传承...' : '版本传承',
            });
        }

        // emendated_by
        const emendated = (detail as { emendated_by?: unknown[] }).emendated_by;
        if (Array.isArray(emendated) && emendated.length > 0) {
            navItems.push({ key: 'emendated', label: '考證' });
        }

        // extraTabs - before feedback
        for (const tab of extraTabs) {
            if ((tab.position ?? 'before-feedback') === 'before-feedback' && tab.shouldShow(detail)) {
                navItems.push({ key: tab.key, label: tab.label });
            }
        }

        if (showFeedbackTab) {
            navItems.push({ key: 'feedback', label: '反馈' });
        }

        // extraTabs - after feedback
        for (const tab of extraTabs) {
            if (tab.position === 'after-feedback' && tab.shouldShow(detail)) {
                navItems.push({ key: tab.key, label: tab.label });
            }
        }
    }

    const sourceLink = (entry && detail && getSourceLink)
        ? getSourceLink({ activeTab, activeJuan, entry, detail })
        : null;

    // ── 渲染 tab 内容 ──

    const renderContent = (): React.ReactNode => {
        if (isLoading) {
            return (
                <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--bim-desc-fg, #717171)' }}>
                    加载中…
                </div>
            );
        }
        if (notFound) {
            return (
                <div style={{ padding: '48px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 32 }}>📭</span>
                    <span style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: 14 }}>
                        找不到該條目，可能已被刪除或 ID 不正確
                    </span>
                </div>
            );
        }
        if (!entry || !detail) return null;

        // padding 由 CSS class .bim-detail-content 负责（media query 切换）
        const containerStyle: React.CSSProperties = {
            maxWidth: contentMaxWidth,
            position: 'relative',
        };
        const containerClassName = 'bim-detail-content';

        if (activeTab === 'basic') {
            return (
                <div className={containerClassName} style={containerStyle}>
                    <IndexDetail
                        data={detail}
                        transport={transport}
                        onNavigate={onNavigate}
                        renderLink={renderLink}
                        headerExtra={
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <LocaleToggle />
                                {sourceLink && <RepoSourceLink {...sourceLink} />}
                            </span>
                        }
                        relatedBooksFooter={
                            lineageGraph && lineageGraph.nodes.length > 0 ? (
                                <LineageBanner
                                    graph={lineageGraph}
                                    totalBookCount={(() => {
                                        const src = lineageSourceRef.current;
                                        if (!src) return undefined;
                                        const excluded = new Set(src.work.version_graph?.excluded_books ?? []);
                                        return (src.work.books ?? []).filter(bid => !excluded.has(bid)).length;
                                    })()}
                                    onOpen={() => onTabChange('lineage')}
                                />
                            ) : null
                        }
                    />
                </div>
            );
        }

        if (typeof activeTab === 'string' && activeTab.startsWith('catalog:')) {
            const catData = catalogList.find(c => `catalog:${c.resource_id}` === activeTab)?.data;
            return (
                <div className={containerClassName} style={containerStyle}>
                    <FloatingActions sourceLink={sourceLink} />
                    <CollectionCatalog
                        data={catData}
                        onNavigate={onNavigate}
                        renderLink={renderLink}
                    />
                </div>
            );
        }

        if (activeTab === 'collated') {
            return (
                <div className={containerClassName} style={containerStyle}>
                    <FloatingActions sourceLink={sourceLink} />
                    <CollatedEdition
                        index={collatedIndex || undefined}
                        workId={id}
                        transport={transport}
                        onNavigate={onNavigate}
                        activeJuan={activeJuan}
                        onJuanChange={setActiveJuan}
                    />
                </div>
            );
        }

        if (activeTab === 'fulltext') {
            return (
                <div className={containerClassName} style={containerStyle}>
                    <FloatingActions sourceLink={sourceLink} />
                    <BookFullText
                        index={bookFullTextIndex || undefined}
                        bookId={id}
                        transport={transport}
                        activeChapter={activeJuan}
                        onChapterChange={setActiveJuan}
                    />
                </div>
            );
        }

        if (activeTab === 'lineage') {
            if (!lineageGraph) {
                return (
                    <div style={{ ...containerStyle, color: 'var(--bim-desc-fg, #999)' }}>
                        {lineageLoading ? '加载中…' : '暂无版本图数据'}
                    </div>
                );
            }
            const workData = detail.type === 'work' ? (detail as WorkDetailData) : null;
            return (
                <div className={containerClassName} style={containerStyle}>
                    <FloatingActions sourceLink={sourceLink} />
                    <VersionLineageView
                        graph={lineageGraph}
                        renderLink={renderLink}
                        graphHeight={Math.max(500, (typeof window !== 'undefined' ? window.innerHeight : 800) - 250)}
                        defaultMode={lineageMode}
                        onModeChange={onLineageModeChange}
                        selectedNodeId={selectedLineageNodeId}
                        collection={lineageCollectionProp ?? workData?.version_graph?.default_collection}
                        onCollectionChange={onLineageCollectionChange}
                        collectionsAvailable={workData?.version_graph?.collections}
                        collectionCounts={(() => {
                            if (!workData) return undefined;
                            const out: Record<string, number> = {};
                            const srcBooks = lineageSourceRef.current?.books ?? [];
                            out.all = (workData.books?.length ?? 0)
                                - (workData.version_graph?.excluded_books?.length ?? 0);
                            const cs = workData.version_graph?.collections;
                            if (cs) {
                                for (const k of Object.keys(cs)) {
                                    out[k] = buildLineageGraph(workData, srcBooks, k).nodes
                                        .filter(n => n.kind === 'book' && !n.bridge).length;
                                }
                            }
                            if (out.core == null && workData.version_graph?.core_books?.length) {
                                out.core = workData.version_graph.core_books.length;
                            }
                            return out;
                        })()}
                    />
                </div>
            );
        }

        if (activeTab === 'emendated') {
            const items = (detail as { emendated_by?: unknown[] }).emendated_by;
            if (!Array.isArray(items) || items.length === 0) return null;
            return (
                <div className={containerClassName} style={containerStyle}>
                    <FloatingActions sourceLink={sourceLink} />
                    <EmendatedBySection
                        items={items as EmendatedByEntry[]}
                        onNavigate={onNavigate}
                        renderLink={renderLink}
                    />
                </div>
            );
        }

        if (activeTab === 'feedback' && showFeedbackTab) {
            return (
                <div className={containerClassName} style={containerStyle}>
                    <FeedbackTab resourceId={id} apiUrl={feedbackApiUrl} />
                </div>
            );
        }

        // extraTabs
        const extra = extraTabs.find(tab => tab.key === activeTab);
        if (extra) {
            return extra.render({ detail, entry, transport, onNavigate });
        }

        return null;
    };

    // ── 整体布局 ──
    // flex-direction、SideNav/TopNav 可见性都靠 CSS media query 切换，
    // 不依赖 useIsMobile，SSR 与 hydration 一致。

    const rootStyle: React.CSSProperties = {
        height,
        display: 'flex',
        background: 'var(--bim-bg, transparent)',
        color: 'var(--bim-fg, #2c2c2c)',
        ...style,
    };

    const resolvedBackLabel = backLabel ?? '返回索引';
    const hasContent = entry || isLoading;
    const rootClassName = ['bim-detail-root', className].filter(Boolean).join(' ');

    return (
        <>
            <style>{LAYOUT_CSS}</style>
            <div className={rootClassName} style={rootStyle}>
                {hasContent && (
                    <div className="bim-detail-side-nav">
                        <SideNav
                            items={navItems}
                            activeKey={activeTab}
                            onSelect={onTabChange}
                            onBack={onBack}
                            backLabel={resolvedBackLabel}
                            width={sideNavWidth}
                        />
                    </div>
                )}
                {hasContent && (
                    <div className="bim-detail-top-nav">
                        <TopNav
                            items={navItems}
                            activeKey={activeTab}
                            onSelect={onTabChange}
                            onBack={onBack}
                            backLabel="返回"
                        />
                    </div>
                )}
                <div style={{ flex: 1, overflow: 'auto' }}>{renderContent()}</div>
            </div>
        </>
    );
};

// ── 内置：版本源流引导横幅 ──

function LineageBanner({
    graph,
    totalBookCount,
    onOpen,
}: {
    graph: LineageGraph;
    totalBookCount?: number;
    onOpen: () => void;
}) {
    const bookCount = totalBookCount ?? graph.nodes.filter((n) => n.kind === 'book').length;
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
