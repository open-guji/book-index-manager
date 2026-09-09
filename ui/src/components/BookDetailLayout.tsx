/**
 * 条目详情页外壳。
 *
 * 2026-09 版式重构：从「左侧栏 + 固定高度内滚动」改为「单栏 1000px 文档流」。
 *
 * 旧版把 height 传进来（kaiyuanguji-web 算 calc(100vh - …)），内容区
 * overflow:auto —— 于是史記 4914px 的内容被塞进 836px 的窗口里，
 * 滚动条出现在页面中央，浏览器原生的滚动位置记忆、Ctrl+F、锚点跳转全失效。
 * 现在整页随文档流滚动，height prop 保留但仅作最小高度。
 *
 * 导航从左侧竖排改成 header 下方横排 chips：常态只有 2–3 项
 * （概覽 / 整理本 / 反饋），竖着占 144px 宽实在不划算。
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
    IndexEntry,
    IndexDetailData,
    ResourceCatalog,
    CollatedEditionIndex,
    BookFullTextIndex,
    WorkDetailData,
    BookDetailData,
    CollectionDetailData,
    EntityDetailData,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { CollectionCatalog } from './CollectionCatalog';
import { CollatedEdition } from './CollatedEdition';
import { BookFullText } from './BookFullText';
import { VersionLineageView } from './VersionLineageView';
import { buildLineageGraph } from '../core/lineage-graph';
import type { LineageGraph } from '../core/lineage-graph';
import { FeedbackTab } from './FeedbackTab';
import { LocaleToggle } from './LocaleToggle';
import { RepoSourceLink } from '../components/common/RepoSourceLink';
import { useT, useConvert } from '../i18n';
import { extractStatus } from '../id';
import {
    PageFrame, TopStrip, Breadcrumb, DetailHeader, DetailFooter,
    GlyphBadge, FilterChip, DETAIL_CSS,
    Section,
    type RenderLink, type CrumbItem,
} from './detail/primitives';
import { WorkPage } from './detail/WorkPage';
import { BookPage } from './detail/BookPage';
import { CollectionPage } from './detail/CollectionPage';
import { EntityPage } from './detail/EntityPage';
import { measureText, displayAuthorRole } from '../core/detail-model';

// ── 类型 ──

export type BookDetailTabKey = 'basic' | 'collated' | 'fulltext' | 'lineage' | 'feedback' | string;

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
    renderLink?: RenderLink;

    // ── 外部钩子 ──
    /** 加载 detail 后的额外加工（如注入 digital_assets） */
    enrichDetail?: (entry: IndexEntry, detail: IndexDetailData) => void;
    /** 当前 tab 的源文件链接解析器 */
    getSourceLink?: (ctx: SourceLinkContext) => { href: string; label: string } | null;

    // ── tab 扩展 ──
    /** 注入额外 tab（如 kyg 的「数字化」） */
    extraTabs?: ExtraTab[];

    // ── 内置反馈 tab ──
    showFeedbackTab?: boolean;
    feedbackApiUrl?: string | (() => string);

    // ── 布局 ──
    /**
     * 最小高度。旧版这里是「固定高度 + 内滚动」，现已改为文档流，
     * 只用来保证短内容时页面不塌陷。
     */
    height?: string;
    /** 页脚左侧附加内容（如站点的引用信息条） */
    footerExtra?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

interface NavItem {
    key: BookDetailTabKey;
    label: string;
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
    height,
    footerExtra,
    className,
    style,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [entry, setEntry] = useState<IndexEntry | null>(null);
    const [detail, setDetail] = useState<IndexDetailData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [catalogList, setCatalogList] = useState<ResourceCatalog[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [collatedIndex, setCollatedIndex] = useState<CollatedEditionIndex | null>(null);
    const [collatedLoading, setCollatedLoading] = useState(false);
    const [bookFullTextIndex, setBookFullTextIndex] = useState<BookFullTextIndex | null>(null);
    const [bookFullTextLoading, setBookFullTextLoading] = useState(false);
    const [lineageGraph, setLineageGraph] = useState<LineageGraph | null>(null);
    const [lineageLoading, setLineageLoading] = useState(false);
    const lineageSourceRef = useRef<{ work: WorkDetailData; books: BookDetailData[] } | null>(null);

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
                setCatalogList((await transport.getCollectionCatalogs(collectionId)) || []);
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
        if (!transport.getCollatedEditionIndex) { setCollatedIndex(null); return; }
        setCollatedLoading(true);
        try {
            setCollatedIndex(await transport.getCollatedEditionIndex(workId));
        } catch {
            setCollatedIndex(null);
        } finally {
            setCollatedLoading(false);
        }
    }, [transport]);

    const loadBookFullText = useCallback(async (bookId: string) => {
        if (!transport.getBookFullTextIndex) { setBookFullTextIndex(null); return; }
        setBookFullTextLoading(true);
        try {
            setBookFullTextIndex(await transport.getBookFullTextIndex(bookId));
        } catch {
            setBookFullTextIndex(null);
        } finally {
            setBookFullTextLoading(false);
        }
    }, [transport]);

    const loadLineage = useCallback(async (workId: string, workData: IndexDetailData) => {
        setLineageLoading(true);
        try {
            if (transport.getLineageGraph) {
                const pre = await transport.getLineageGraph(workId);
                if (pre) setLineageGraph(pre);
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
                if (!raw) { setNotFound(true); return; }
                const detailData = raw as unknown as IndexDetailData;

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
        if (!src || !lineageCollectionProp) return;
        setLineageGraph(buildLineageGraph(src.work, src.books, lineageCollectionProp));
    }, [lineageCollectionProp]);

    // ── nav 项 ──
    // 注意：不再有 emendated tab —— 考證已并入作品页正文的「歷代考證」区块，
    // 旧的 ?tab=emendated 链接由下面的 effect 转成锚点滚动。
    const navItems: NavItem[] = [];
    if (detail) {
        navItems.push({ key: 'basic', label: t.detailTab.basicInfo });

        if (detail.type === 'collection') {
            if (catalogLoading && catalogList.length === 0) {
                navItems.push({ key: 'catalog:loading', label: `${t.detailTab.catalog}…` });
            }
            for (const cat of catalogList) {
                navItems.push({
                    key: `catalog:${cat.resource_id}`,
                    label: cat.short_name
                        ? `${convert(cat.short_name)}${t.detailTab.catalogSuffix}`
                        : t.detailTab.collectionCatalog,
                });
            }
        }

        /*
         * 整理本 / 全文**不再进 nav**：正文里的横幅已是更显眼的入口，
         * 顶部再挂一个 tab 就成了同一目的地的两个按钮。只在**已经身处**
         * 该 tab 时才列出来——否则 nav 只剩「概覽」一项会被整行隐藏，
         * 读者进了全文页就没有返回入口（只能按浏览器后退）。
         * 与下面 feedback 的处理同理。
         */
        if (detail.type === 'work' && (collatedIndex || collatedLoading) && activeTab === 'collated') {
            navItems.push({
                key: 'collated',
                label: collatedLoading ? `${t.detailTab.collatedEdition}…` : t.detailTab.collatedEdition,
            });
        }

        if (detail.type === 'book' && (bookFullTextIndex || bookFullTextLoading) && activeTab === 'fulltext') {
            navItems.push({
                key: 'fulltext',
                label: bookFullTextLoading ? `${t.detailTab.fullText}…` : t.detailTab.fullText,
            });
        }

        if (detail.type === 'work' && (lineageGraph || lineageLoading)) {
            navItems.push({
                key: 'lineage',
                label: lineageLoading ? `${t.detailTab.lineage}…` : t.detailTab.lineage,
            });
        }

        for (const tab of extraTabs) {
            if ((tab.position ?? 'before-feedback') === 'before-feedback' && tab.shouldShow(detail)) {
                navItems.push({ key: tab.key, label: tab.label });
            }
        }
        /*
         * 反馈平时不进次级导航：顶条右侧已有「勘誤反饋」、页脚还有
         * 「提交新版本」，再放进 tab 行就是同一个动作一屏出现三次，
         * 设计稿也只在顶条给了它。
         *
         * 但**正处在反馈页时必须列出来**——否则像史記这种只有「概览」
         * 一项的条目，nav 只剩 1 项就被整行隐藏，读者进了反馈页就没有
         * 任何返回入口（只能按浏览器后退）。
         */
        if (showFeedbackTab && activeTab === 'feedback') {
            navItems.push({ key: 'feedback', label: t.detailTab.feedback });
        }
        for (const tab of extraTabs) {
            if (tab.position === 'after-feedback' && tab.shouldShow(detail)) {
                navItems.push({ key: tab.key, label: tab.label });
            }
        }
    }

    // 旧链接 ?tab=emendated 兼容：考證 tab 已并入正文，改为滚到锚点
    useEffect(() => {
        if (activeTab !== 'emendated' || !detail) return;
        onTabChange('basic');
        // 等 basic 内容挂载后再滚
        const timer = setTimeout(() => {
            document.getElementById('studies')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        return () => clearTimeout(timer);
    }, [activeTab, detail, onTabChange]);

    const sourceLink = (entry && detail && getSourceLink)
        ? getSourceLink({ activeTab, activeJuan, entry, detail })
        : null;

    // ── header 内容（按类型派生） ──
    const headerProps = useMemo(() => {
        if (!detail) return null;
        const authors = detail.authors ?? [];
        const authorLine = authors.map(a => {
            const role = displayAuthorRole(a.role);
            return `${a.dynasty ? `〔${convert(a.dynasty)}〕` : ''}${convert(a.name)}${role ? ` ${convert(role)}` : ''}`;
        }).join(' · ');

        let isDraft = false;
        try { isDraft = extractStatus(detail.id) === 'draft'; } catch { /* 非标准 ID */ }

        if (detail.type === 'book') {
            const b = detail as BookDetailData;
            return {
                title: convert(b.title),
                subtitle: b.edition ? convert(b.edition) : (authorLine || undefined),
                aside: [isDraft ? t.status.draft : '', authorLine && b.edition ? authorLine : '']
                    .filter(Boolean).join(' · ') || undefined,
                secondLine: undefined,
            };
        }
        if (detail.type === 'collection') {
            const c = detail as CollectionDetailData;
            return {
                title: convert(c.title),
                subtitle: convert(measureText(c, t.unit.juan)) || undefined,
                aside: [
                    c.publication_info?.year,
                    isDraft ? t.status.draft : '',
                ].filter(Boolean).join(' · ') || undefined,
                secondLine: authorLine || undefined,
            };
        }
        if (detail.type === 'entity') {
            const e = detail as EntityDetailData;
            // 生卒：负数是公元前
            const yr = (n?: number) => n == null ? '' : (n < 0 ? `前${-n}` : String(n));
            const life = (e.birth_year != null || e.death_year != null)
                ? `${yr(e.birth_year) || '?'}—${yr(e.death_year) || '?'}`
                : '';
            return {
                title: convert(e.primary_name || e.title),
                subtitle: [
                    e.dynasty ? `〔${convert(e.dynasty)}〕` : '',
                    life,
                ].filter(Boolean).join(' ') || undefined,
                aside: isDraft ? t.status.draft : undefined,
                secondLine: undefined,
            };
        }

        // work
        const measure = convert(measureText(detail, t.unit.juan));
        return {
            title: convert(detail.title),
            subtitle: [measure, authorLine].filter(Boolean).join(' · ') || undefined,
            aside: [
                // subtype 是英文枚举（article/poem/chapter/book），直出会在标题旁
                // 露出一个 `chapter`。全库 2,980 条 Work 有此字段。
                workSubtypeLabel(t, (detail as { subtype?: string }).subtype),
                isDraft ? t.status.draft : '',
            ].filter(Boolean).join(' · ') || undefined,
            secondLine: undefined,
        };
    }, [detail, convert, t]);

    // ── 内容 ──

    const renderBasic = (): React.ReactNode => {
        if (!detail) return null;
        if (detail.type === 'work') {
            return (
                <WorkPage
                    data={detail as WorkDetailData}
                    transport={transport}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                    collatedSection={
                        collatedIndex && (collatedIndex.juan_files?.length ?? 0) > 0 ? (
                            <FullTextBanner
                                title={detail.title}
                                measure={`${collatedIndex.juan_files!.length} ${convert(t.unit.juan)}`}
                                onOpen={() => {
                                    setActiveJuan(collatedIndex.juan_files![0]);
                                    onTabChange('collated');
                                }}
                            />
                        ) : null
                    }
                    lineageAction={
                        lineageGraph && lineageGraph.nodes.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => onTabChange('lineage')}
                                className="bim-d-ui"
                                style={{
                                    background: 'none', border: 'none', padding: '2px 0',
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                                    color: 'var(--bim-accent, #9c3a2c)',
                                    borderBottom: '1px solid var(--bim-rule, #d6c9ae)',
                                }}
                            >
                                {t.detailTab.lineage} →
                            </button>
                        ) : null
                    }
                />
            );
        }
        if (detail.type === 'book') {
            return (
                <BookPage
                    data={detail as BookDetailData}
                    transport={transport}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                    fullTextSection={
                        bookFullTextIndex && bookFullTextIndex.chapters.length > 0 ? (
                            <FullTextBanner
                                /* 版本页的标题用作品名，副行才点出是哪个本子——
                                   横幅上写「進入《程甲本（紅樓夢）》」会很怪 */
                                title={detail.title}
                                measure={[
                                    `${bookFullTextIndex.total_chapters} ${convert('章')}`,
                                    convert(bookFullTextIndex.version_label),
                                ].filter(Boolean).join(' · ')}
                                onOpen={() => {
                                    setActiveJuan(null);
                                    onTabChange('fulltext');
                                }}
                            />
                        ) : null
                    }
                />
            );
        }
        if (detail.type === 'collection') {
            return (
                <CollectionPage
                    data={detail as CollectionDetailData}
                    catalog={catalogList[0]?.data}
                    transport={transport}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                    catalogAction={
                        catalogList.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => onTabChange(`catalog:${catalogList[0].resource_id}`)}
                                className="bim-d-ui"
                                style={{
                                    background: 'none', border: 'none', padding: '2px 0',
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                                    color: 'var(--bim-accent, #9c3a2c)',
                                    borderBottom: '1px solid var(--bim-rule, #d6c9ae)',
                                }}
                            >
                                {t.detailTab.collectionCatalog} →
                            </button>
                        ) : null
                    }
                />
            );
        }
        return (
            <EntityPage
                data={detail as EntityDetailData}
                transport={transport}
                onNavigate={onNavigate}
                renderLink={renderLink}
            />
        );
    };

    const renderContent = (): React.ReactNode => {
        if (!entry || !detail) return null;

        if (activeTab === 'basic' || activeTab === 'emendated') return renderBasic();

        if (typeof activeTab === 'string' && activeTab.startsWith('catalog:')) {
            const catData = catalogList.find(c => `catalog:${c.resource_id}` === activeTab)?.data;
            return <CollectionCatalog data={catData} onNavigate={onNavigate} renderLink={renderLink} />;
        }

        if (activeTab === 'collated') {
            return (
                <CollatedEdition
                    index={collatedIndex || undefined}
                    workId={id}
                    transport={transport}
                    onNavigate={onNavigate}
                    activeJuan={activeJuan}
                    onJuanChange={setActiveJuan}
                />
            );
        }

        if (activeTab === 'fulltext') {
            return (
                <BookFullText
                    index={bookFullTextIndex || undefined}
                    bookId={id}
                    transport={transport}
                    activeChapter={activeJuan}
                    onChapterChange={setActiveJuan}
                />
            );
        }

        if (activeTab === 'lineage') {
            if (!lineageGraph) {
                return (
                    <div style={{ color: 'var(--bim-label-fg, #a3937b)', padding: '24px 0' }}>
                        {lineageLoading ? '加載中…' : '暫無版本圖數據'}
                    </div>
                );
            }
            const workData = detail.type === 'work' ? (detail as WorkDetailData) : null;
            return (
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
            );
        }

        if (activeTab === 'feedback' && showFeedbackTab) {
            return <FeedbackTab resourceId={id} apiUrl={feedbackApiUrl} />;
        }

        const extra = extraTabs.find(tab => tab.key === activeTab);
        if (extra) return extra.render({ detail, entry, transport, onNavigate });

        return null;
    };

    // ── 骨架 ──

    if (isLoading) {
        return (
            <PageFrame style={{ minHeight: height, ...style }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 48 }}>
                    {[180, 320, 160].map((w, i) => (
                        <div key={i} style={{
                            height: i === 1 ? 40 : 16, width: w, opacity: 0.35,
                            background: 'var(--bim-rule, #e0d6c0)',
                        }} />
                    ))}
                </div>
            </PageFrame>
        );
    }

    if (notFound || !detail || !entry || !headerProps) {
        return (
            <PageFrame style={{ minHeight: height, ...style }}>
                <div style={{
                    padding: '64px 0', textAlign: 'center',
                    color: 'var(--bim-label-fg, #a3937b)', fontSize: 14,
                }}>
                    找不到該條目，可能已被刪除或 ID 不正確
                </div>
            </PageFrame>
        );
    }

    const isBasic = activeTab === 'basic' || activeTab === 'emendated';

    // 面包屑：品牌（＝返回索引）／作品（版本页专有）／当前类型
    const crumbs: CrumbItem[] = [
        { label: backLabel ?? t.detailTab.backToIndex, onClick: onBack },
    ];
    if (detail.type === 'book' && (detail as BookDetailData).work_id) {
        const wid = (detail as BookDetailData).work_id!;
        // 带 id：面包屑拿到真实 href，Ctrl+点击 / 右键复制链接才可用
        crumbs.push({ label: t.indexType.work, id: wid, onClick: () => onNavigate?.(wid) });
    }
    crumbs.push({ label: t.indexType[detail.type] });

    /* 阅读 tab 放宽版心，容下左侧的卷/章导航（见 ReaderLayout） */
    const isReaderTab = activeTab === 'collated' || activeTab === 'fulltext';

    return (
        <div className={className}>
            <PageFrame wide={isReaderTab} style={{ minHeight: height, ...style }}>
                <TopStrip
                    breadcrumb={
                        <>
                            <GlyphBadge char="籍" />
                            <Breadcrumb items={crumbs} />
                        </>
                    }
                    actions={
                        <>
                            <LocaleToggle />
                            {showFeedbackTab && (
                                <button
                                    type="button"
                                    onClick={() => onTabChange('feedback')}
                                    className="bim-d-ui"
                                    style={{
                                        background: 'none', border: 'none', padding: 0,
                                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                                        color: 'var(--bim-meta-fg, #7b6a54)',
                                    }}
                                >
                                    {t.detailTab.feedback}
                                </button>
                            )}
                            {sourceLink && <RepoSourceLink {...sourceLink} />}
                        </>
                    }
                />

                <DetailHeader
                    {...headerProps}
                    /*
                     * 阅读页的 header 右上角换成回概览的入口。
                     *
                     * 常态那里是 subtype（「篇章」之类）——一个静态标签，
                     * 在正读全文的场面里既不提供信息也不可点。读者此时唯一
                     * 想回的地方是这部书的概览，于是把这块位置让给它，
                     * 同时替下面撤掉的 tab 承担返回职责。
                     */
                    aside={isReaderTab ? (
                        <button
                            type="button"
                            onClick={() => onTabChange('basic')}
                            className="bim-d-ui"
                            style={{
                                background: 'none', border: 'none', padding: '2px 0',
                                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                                color: 'var(--bim-accent, #9c3a2c)',
                                borderBottom: '1px solid var(--bim-rule, #d6c9ae)',
                            }}
                        >
                            {convert('作品信息')} →
                        </button>
                    ) : headerProps.aside}
                />

                {/*
                  * 次级导航：>1 项才出现。
                  * 阅读页不出现——概览/整理本这对 tab 与正文里的横幅、以及
                  * 上面的「作品信息 →」重复，三个入口指同两个地方。
                  */}
                {!isReaderTab && navItems.length > 1 && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 4,
                        margin: '14px 0 0', paddingBottom: 2,
                    }}>
                        {navItems.map(item => (
                            <FilterChip
                                key={item.key}
                                label={item.label}
                                active={item.key === activeTab || (isBasic && item.key === 'basic')}
                                onClick={() => onTabChange(item.key)}
                            />
                        ))}
                    </div>
                )}

                <div style={{ marginTop: !isReaderTab && navItems.length > 1 ? 8 : 0 }}>
                    {renderContent()}
                </div>

                <DetailFooter
                    left={
                        <>
                            {footerExtra}
                            {footerExtra ? ' · ' : ''}
                            <IdWithCopy id={detail.id} label={t.label.id} copied={t.action.copied} />
                        </>
                    }
                    right={
                        <>
                            {showFeedbackTab && (
                                <button
                                    type="button"
                                    onClick={() => onTabChange('feedback')}
                                    style={{
                                        background: 'none', border: 'none', padding: 0,
                                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5,
                                        color: 'var(--bim-meta-fg, #7b6a54)',
                                    }}
                                >
                                    {t.detailTab.submitVersion}
                                </button>
                            )}
                            {sourceLink && (
                                <a href={sourceLink.href} target="_blank" rel="noopener noreferrer"
                                    style={{ color: 'var(--bim-meta-fg, #7b6a54)' }}>
                                    {t.detailTab.dataLicense}
                                </a>
                            )}
                        </>
                    }
                />
            </PageFrame>
        </div>
    );
};

/** 页脚里的 ID + 复制按钮 */
function IdWithCopy({ id, label, copied: copiedLabel }: {
    id: string;
    label: string;
    copied: string;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>{label} {id}</span>
            <button
                type="button"
                onClick={() => {
                    navigator.clipboard?.writeText(id).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    }).catch(() => { /* 剪贴板不可用时静默 */ });
                }}
                title={copied ? copiedLabel : undefined}
                style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 11.5,
                    color: 'var(--bim-hint-fg, #b3a385)',
                }}
            >
                {copied ? '✓' : '⧉'}
            </button>
        </span>
    );
}

export { DETAIL_CSS };


/** Work.subtype 英文枚举 → 中文；未知值原样返回（宁可露出也不吞掉） */
function workSubtypeLabel(t: ReturnType<typeof useT>, subtype?: string): string {
    if (!subtype) return '';
    return (t.workSubtype as Record<string, string>)[subtype] ?? subtype;
}

/**
 * 正文里的全文入口横幅：作品页用于整理本，版本页用于 Book 全文。
 *
 * 整理本是本站自己做的成果、点进去就能读全文，是作品页唯一的**终点内容**；
 * 其余区块都是指向外部影像站/馆藏的链接。此前它只在顶部次级导航里有个 tab，
 * 正文一字不提，读者一路往下读根本不知道有。
 *
 * 2026-09：从「区块标题 + 一墙卷号 chip」改成整条横幅。旧版的问题是
 * 一屏几十个卷号 chip 反倒把「这里能读全文」这件事稀释掉了，读者要先
 * 认出那是卷号、再挑一卷点进去；而绝大多数人只想从头读。横幅只留
 * 一个动作（开始阅读 = 第一卷），卷号选择交给 collated tab 内部的导航。
 *
 * 整条横幅可点，hover 时底色加深；右侧的朱红按钮只作视觉落点，不单独绑
 * 事件——否则同一区域两个 click 目标，键盘 Tab 会停两次。
 */
function FullTextBanner({ title, measure, onOpen }: {
    /** 作品名，嵌进「進入《…》全文閲讀」；缺省时退化为不带书名的说法 */
    title?: string;
    /** 副行首项，如「7 卷」「120 回」；作品页数卷、版本页数回 */
    measure?: string;
    onOpen: () => void;
}) {
    const { convert } = useConvert();
    const [hover, setHover] = useState(false);

    const heading = title
        ? convert(`進入《${title}》全文閲讀`)
        : convert('進入全文閲讀');

    /* 副行：篇幅 + 全文自身的卖点 */
    const meta = [
        measure,
        convert('全文檢索'),
        convert('原書對照'),
    ].filter(Boolean).join(' · ');

    return (
        /* 上下都比常规 Section（48）收紧：横幅是一整块实色，四周留白按
           区块间距给会显得它孤零零浮在页面中间 */
        <Section style={{ marginTop: -12, marginBottom: 28 }}>
            <div
                role="button"
                tabIndex={0}
                onClick={onOpen}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen();
                    }
                }}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 24, flexWrap: 'wrap',
                    padding: '14px 26px',
                    cursor: 'pointer',
                    /*
                     * 底色是「暖沙」，新增 --bim-band-bg / --bim-band-bg-hover 两个变量。
                     *
                     * 试过两条不新增变量的路子，都不行：
                     *  - 掺 --bim-accent：朱砂偏红，淡化出来是**粉**的，一大片跟宣纸皮不搭；
                     *  - 借 --bim-selection-bg：默认值 #ecdcbc 确实是暖沙，但 kyg 那边把它
                     *    覆盖成了 color-mix(泥金 30%, transparent)——**半透明**。再套一层
                     *    color-mix 等于按 30%×52% 稀释并与透明合成，颜色直接失真。
                     * 所以这里给一个自带 fallback 的独立变量：默认值是设计稿的暖沙，
                     * 消费者想换肤就覆盖这两个（kyg 覆盖成泥金掺纸，见 globals.css）。
                     */
                    background: hover
                        ? 'var(--bim-band-bg-hover, #e6d5b4)'
                        : 'var(--bim-band-bg, #f0e4cb)',
                    borderLeft: '3px solid var(--bim-accent, #9c3a2c)',
                    transition: 'background .18s ease',
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div style={{
                        fontFamily: 'var(--bim-font-body, system-ui, sans-serif)',
                        fontSize: 21, fontWeight: 600, letterSpacing: '.02em',
                        /* 不设的话继承默认 ~1.5，21px 字上下各多出 5px 空白，
                           副行的 marginTop 调再小也看不出来 */
                        lineHeight: 1.3,
                        color: 'var(--bim-ink, #2a231c)',
                    }}>
                        {heading}
                    </div>
                    <div className="bim-d-ui" style={{
                        marginTop: 4, fontSize: 12.5, letterSpacing: '.06em',
                        color: 'var(--bim-meta-fg, #7b6a54)',
                    }}>
                        {meta}
                    </div>
                </div>
                <span
                    className="bim-d-ui"
                    aria-hidden
                    style={{
                        flex: 'none',
                        padding: '11px 22px',
                        fontSize: 14, letterSpacing: '.08em',
                        background: hover
                            ? 'var(--bim-accent-deep, #6f2a20)'
                            : 'var(--bim-accent, #9c3a2c)',
                        color: 'var(--bim-page-bg, #fbf9f3)',
                        transition: 'background .18s ease',
                    }}
                >
                    {convert('開始閲讀')} →
                </span>
            </div>
        </Section>
    );
}
