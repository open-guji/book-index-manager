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
    WorkDetailData,
    BookDetailData,
    CollectionDetailData,
    EntityDetailData,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { CollectionCatalog } from './CollectionCatalog';
import { TextReader } from './TextReader';
import type { BookChapterList } from './detail/BookPage';
import { pickTextVersion } from '../core/text-model';
import { VersionLineageView } from './VersionLineageView';
import { buildLineageGraph } from '../core/lineage-graph';
import type { LineageGraph } from '../core/lineage-graph';
import { FeedbackTab } from './FeedbackTab';
import { LocaleToggle } from './LocaleToggle';
import { RepoSourceLink } from '../components/common/RepoSourceLink';
import { useT, useI18n } from '../i18n';
import { extractStatus } from '../id';
import {
    PageFrame, TopStrip, Breadcrumb, DetailHeader, DetailFooter,
    GlyphBadge, FilterChip, DETAIL_CSS,
    Section,
    type RenderLink, type CrumbItem,
} from './detail/primitives';
import { ReadButton, type RailLink } from './detail/layout';
import { WorkPage } from './detail/WorkPage';
import { BookPage } from './detail/BookPage';
import { CollectionPage } from './detail/CollectionPage';
import { EntityPage } from './detail/EntityPage';
import { measureText, displayAuthorRole } from '../core/detail-model';
import { bim } from '../styles/tokens';

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

/** 「阅读全文」链接的上下文 */
export interface ReadLinkContext {
    detail: IndexDetailData;
    /**
     * 本条目有可读文本（条目数据里 `text_count` > 0；阅读页只认新结构，见规格 §十）：
     * 'text'；没有或数据没带 text_count 为 null。
     */
    kind: 'text' | null;
    /**
     * 直接打开某一回／章：章 key（三位编号，如「001」；带扩展名的「001.md」也认）。
     * 版本页回目网格的每一回都用它取链接（B1）；不认这个字段的宿主返回同一个地址也无妨。
     */
    juan?: string;
}

export interface SourceLinkContext {
    activeTab: string;
    activeJuan: string | null;
    entry: IndexEntry;
    detail: IndexDetailData;
}

/** 条目数据里有可读文本：打包注入的 text_count > 0（没有这个字段的宿主不出阅读入口） */
function hasText(detail: IndexDetailData): boolean {
    const n = (detail as { text_count?: unknown }).text_count;
    return typeof n === 'number' && n > 0;
}

export interface BookDetailLayoutProps {
    /** 要展示的条目 ID */
    id: string;
    /** 数据传输层 */
    transport: IndexStorage;
    /**
     * 服务端已取好的条目数据（与 `transport.getItem(id)` 返回的形状相同）。
     * 传了就直接用它渲染首屏、不再为本条目发 getItem/getEntry 请求，
     * 服务端渲染（renderToString）也能出完整详情；不传则行为不变。
     * 若它带 `id` 且与 `id` prop 不同，视为过期数据、忽略，照常取数；
     * 挂载后 `id` 变了，则只有 `initialDetail.id === id` 才用，否则照常取数。
     * 整理本／全文／版本谱系等次级数据仍在挂载后照常加载。
     */
    initialDetail?: IndexDetailData;
    /** 与 initialDetail 配套的索引条目；不传则按 initialDetail 的 title/type 合成 */
    initialEntry?: IndexEntry;

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
    /**
     * 「阅读全文」主按钮指向的阅读页（2026-09 N3a）。
     * 返回字符串 → 提要卡里出现唯一的主按钮「阅读全文」，链到该地址；返回 null → 不出现。
     * 不传：整理本／全文存在时仍出现按钮，点击切到本组件内的 阅读 tab（TextReader，tab 键 `fulltext`；`collated` 同义，兼容旧地址）。
     */
    readLink?: (ctx: ReadLinkContext) => string | null | undefined;
    /** 三栏版左栏顶部（宿主的检索框等）；窄屏时显示在最上方 */
    railTop?: React.ReactNode;
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
    /**
     * 宿主外壳的顶栏已经放了繁简切换（kyg 9-30 反馈，overview#322）：页内顶部不再放繁简切换和 GitHub 图标。
     * 数据来源链接仍在页脚右侧（「数据与许可」）。默认 false，行为不变。
     */
    hideHeaderControls?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

interface NavItem {
    key: BookDetailTabKey;
    label: string;
}

/** transport 不提供 getEntry 时，按详情数据合成一条最小索引条目 */
function fallbackEntry(id: string, detailData: IndexDetailData): IndexEntry {
    return {
        id,
        title: (detailData as { title?: string; primary_name?: string }).title
            ?? (detailData as { primary_name?: string }).primary_name
            ?? id,
        type: (detailData.type as IndexEntry['type']) ?? 'book',
    } as IndexEntry;
}

/** initialDetail 是否可用于当前 id：没带 id 字段，或 id 一致 */
function seedMatches(id: string, detail: IndexDetailData | undefined): detail is IndexDetailData {
    if (!detail) return false;
    const seedId = (detail as { id?: unknown }).id;
    return seedId === undefined || seedId === id;
}

// ── 主组件 ──

export const BookDetailLayout: React.FC<BookDetailLayoutProps> = ({
    id,
    transport,
    initialDetail,
    initialEntry,
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
    readLink,
    railTop,
    extraTabs = [],
    showFeedbackTab = true,
    feedbackApiUrl,
    height,
    footerExtra,
    hideHeaderControls = false,
    className,
    style,
}) => {
    const t = useT();
    /** tr：字典键取词（界面文字）；t 是旧的整本字典对象 */
    const { t: tr, convert } = useI18n();

    /*
     * 首屏种子：有 initialDetail 就在初始 state 里直接放好 entry/detail，
     * 服务端渲染与浏览器首次渲染出同一份 HTML（hydrate 不失配）。
     * 浅拷贝后再 enrichDetail，不改调用方传进来的对象。
     */
    const [seed] = useState(() => {
        if (!seedMatches(id, initialDetail)) return null;
        const d = { ...initialDetail } as IndexDetailData;
        const e = initialEntry ?? fallbackEntry(id, d);
        if (enrichDetail) enrichDetail(e, d);
        return { id, entry: e, detail: d };
    });
    const [entry, setEntry] = useState<IndexEntry | null>(seed?.entry ?? null);
    const [detail, setDetail] = useState<IndexDetailData | null>(seed?.detail ?? null);
    const [isLoading, setIsLoading] = useState(!seed);
    const [notFound, setNotFound] = useState(false);

    const [catalogList, setCatalogList] = useState<ResourceCatalog[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    /* 版本页回目网格：默认版本的章目录（来自 manifest＋<key>/index.json）；只在条目带 text_count 时取 */
    const [bookChapters, setBookChapters] = useState<BookChapterList | null>(null);
    /** 本条目的章目录已经取过（取到或没取到）；取之前按 text_count 先占位 */
    const [bookChaptersTried, setBookChaptersTried] = useState<string | null>(null);
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

    const loadBookChapters = useCallback(async (bookId: string) => {
        if (!transport.getTextManifest || !transport.getTextIndex) { setBookChapters(null); setBookChaptersTried(bookId); return; }
        try {
            const version = pickTextVersion(await transport.getTextManifest(bookId));
            const idx = version ? await transport.getTextIndex(bookId, version.key) : null;
            setBookChapters(idx && idx.chapters.length > 0
                ? {
                    chapters: idx.chapters.map(c => ({ n: c.n, title: c.title, file: c.file })),
                    source: {
                        name: idx.source?.name ?? version?.source_name,
                        license: idx.source?.license ?? version?.license ?? undefined,
                    },
                }
                : null);
        } catch {
            setBookChapters(null);
        } finally {
            setBookChaptersTried(bookId);
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

    // 最新的 initialDetail/initialEntry：effect 里读，不进依赖（换对象不该触发重取）
    const initialRef = useRef({ initialDetail, initialEntry });
    initialRef.current = { initialDetail, initialEntry };

    useEffect(() => {
        let cancelled = false;

        /** 按条目类型加载次级数据（谱系／丛编目录／版本页回目） */
        const loadSecondary = (detailData: IndexDetailData) => {
            if (detailData.type === 'collection') {
                loadCatalogs(id);
            } else if (detailData.type === 'work') {
                if ((detailData as WorkDetailData).version_graph || transport.getLineageGraph) {
                    loadLineage(id, detailData);
                }
            } else if (detailData.type === 'book') {
                // 打包注入的 text_count > 0 才取章目录：没有可读文本的版本不白打 404
                if (hasText(detailData)) loadBookChapters(id);
            }
        };

        /*
         * 有与当前 id 匹配的服务端数据：主条目不再取数，只补次级数据。
         * 首次挂载用初始 state 里的种子（这里的 setEntry/setDetail 是同值、不重渲染）；
         * 之后 id 变了而父组件又给了新的 initialDetail（如服务端导航），只有它的
         * id 字段与新 id **严格相等**才用——不带 id 的可能是父组件留着的旧数据。
         */
        const latest = initialRef.current;
        let seeded: { entry: IndexEntry; detail: IndexDetailData } | null = null;
        if (seed && seed.id === id) {
            seeded = seed;
        } else if (latest.initialDetail && (latest.initialDetail as { id?: unknown }).id === id) {
            const d = { ...latest.initialDetail } as IndexDetailData;
            const e = latest.initialEntry ?? fallbackEntry(id, d);
            if (enrichDetail) enrichDetail(e, d);
            seeded = { entry: e, detail: d };
        }
        if (seeded) {
            setNotFound(false);
            setCatalogList(prev => (prev.length ? [] : prev));
            setBookChapters(null);
            setLineageGraph(null);
            lineageSourceRef.current = null;
            setEntry(seeded.entry);
            setDetail(seeded.detail);
            setIsLoading(false);
            loadSecondary(seeded.detail);
            return () => { cancelled = true; };
        }

        const load = async () => {
            setIsLoading(true);
            setNotFound(false);
            setEntry(null);
            setDetail(null);
            setCatalogList([]);
            setBookChapters(null);
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
                if (!entryData) entryData = fallbackEntry(id, detailData);

                if (enrichDetail) enrichDetail(entryData, detailData);
                setEntry(entryData);
                setDetail(detailData);

                loadSecondary(detailData);
            } catch {
                if (!cancelled) setNotFound(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [id, transport, seed, enrichDetail, loadCatalogs, loadLineage, loadBookChapters]);

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
        if (activeTab === 'collated' || activeTab === 'fulltext') {
            navItems.push({ key: activeTab, label: t.detailTab.fullText });
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
            const yr = (n?: number) => n == null ? '' : (n < 0 ? tr('detail.bce', { n: -n }) : String(n));
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
    }, [detail, convert, t, tr]);

    // ── 内容 ──

    // ── 「阅读全文」主按钮：条目带 text_count（打包注入）才出现，同步判定、不等目录取回（CLS） ──
    const readKind: ReadLinkContext['kind'] = detail && hasText(detail) ? 'text' : null;
    const openReader = () => {
        setActiveJuan(null);
        onTabChange('fulltext');
    };
    let readAction: React.ReactNode = null;
    if (detail && readLink) {
        const href = readLink({ detail, kind: readKind });
        if (href) readAction = <ReadButton href={href} />;
    } else if (readKind) {
        readAction = <ReadButton onClick={openReader} />;
    }

    /** 版本页回目网格：某一回的链接。宿主给了 readLink 走阅读页，否则切到本组件的阅读 tab */
    const chapterLink = (file: string) => {
        if (!detail) return null;
        const juan = file.replace(/\.[^.]+$/, '');
        if (readLink) {
            const href = readLink({ detail, kind: readKind, juan });
            return href ? { href } : null;
        }
        return {
            onClick: () => {
                setActiveJuan(juan);
                onTabChange('fulltext');
            },
        };
    };

    /*
     * 概览页不再有次级 tab 行，但丛编目录（可能不止一份）和宿主注入的 extraTabs
     * （网站的「数字化」等）仍须有入口：放到左栏「更多」，窄屏折成一行文字链接。
     * 谱系、反馈本阶段不放入口（N3a）。
     */
    const extraKeys = new Set(extraTabs.map(tab => tab.key));
    const railLinks: RailLink[] = navItems
        .filter(item => (item.key.startsWith('catalog:') && item.key !== 'catalog:loading') || extraKeys.has(item.key))
        .map(item => ({ key: item.key, label: item.label, onClick: () => onTabChange(item.key) }));

    const renderBasic = (): React.ReactNode => {
        if (!detail) return null;
        if (detail.type === 'work') {
            return (
                <WorkPage
                    data={detail as WorkDetailData}
                    transport={transport}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                    readAction={readAction}
                    railTop={railTop}
                    railLinks={railLinks}
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
                    readAction={readAction}
                    fullText={bookChapters}
                    fullTextPending={hasText(detail) && !!transport.getTextManifest && bookChaptersTried !== detail.id}
                    chapterLink={chapterLink}
                    railTop={railTop}
                    railLinks={railLinks}
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
                    readAction={readAction}
                    railTop={railTop}
                    railLinks={railLinks}
                    catalogAction={
                        catalogList.length > 0 ? (
                            <a
                                href={`#catalog`}
                                onClick={e => {
                                    e.preventDefault();
                                    onTabChange(`catalog:${catalogList[0].resource_id}`);
                                }}
                            >
                                {convert(t.detailTab.collectionCatalog)} →
                            </a>
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
                railTop={railTop}
                railLinks={railLinks}
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

        if (activeTab === 'collated' || activeTab === 'fulltext') {
            // 整理本与全文合一（overview#307）：同一个 TextReader；版本由组件自己管，章跟着 activeJuan
            return (
                <TextReader
                    id={id}
                    transport={transport}
                    chapter={activeJuan}
                    onLocationChange={loc => setActiveJuan(loc.chapter)}
                    onNavigate={onNavigate}
                />
            );
        }

        if (activeTab === 'lineage') {
            if (!lineageGraph) {
                return (
                    <div style={{ color: bim('label-fg'), padding: '24px 0' }}>
                        {lineageLoading ? tr('detail.loading') : tr('detail.noLineageGraph')}
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
                            background: bim('rule'),
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
                    color: bim('label-fg'), fontSize: 14,
                }}>
                    {tr('detail.notFound')}
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

    // 宿主常把条目状态原样塞进来（'draft' / 'official'）：翻成中文，别把英文状态字露在页脚
    const footerExtraNode = typeof footerExtra === 'string'
        ? ((t.status as Record<string, string>)[footerExtra.trim()] ?? footerExtra)
        : footerExtra;
    const footer = (
        <DetailFooter
            left={
                <>
                    {footerExtraNode}
                    {footerExtraNode ? ' · ' : ''}
                    <IdWithCopy id={detail.id} label={t.label.id} copied={t.action.copied} copyLabel={t.action.copy} />
                </>
            }
            right={
                <>
                    {/* 概览页不放反馈入口（2026-09 N3a：反馈 tab 暂不放） */}
                    {showFeedbackTab && !isBasic && (
                        <button
                            type="button"
                            onClick={() => onTabChange('feedback')}
                            style={{
                                background: 'none', border: 'none', padding: 0,
                                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                                color: bim('meta-fg'),
                            }}
                        >
                            {t.detailTab.submitVersion}
                        </button>
                    )}
                    {sourceLink && (
                        <a href={sourceLink.href} target="_blank" rel="noopener noreferrer"
                            className="bim-d-hit"
                            style={{ color: bim('meta-fg') }}>
                            {t.detailTab.dataLicense}
                        </a>
                    )}
                </>
            }
        />
    );

    /*
     * 概览（2026-09 N3a）：三栏版。没有大标题 header（标题在右栏提要卡里），
     * 没有次级 tab 行——谱系、考证、反馈三个 tab 本阶段不放入口，
     * 整理本／全文合成提要卡里唯一的主按钮「阅读全文」。
     */
    if (isBasic) {
        return (
            <div className={className}>
                <PageFrame grid style={{ minHeight: height, ...style }}>
                    <TopStrip
                        breadcrumb={<Breadcrumb items={crumbs} />}
                        actions={
                            <>
                                {/* 少边框：概览页的繁简切换去掉自带的描边 */}
                                {!hideHeaderControls && <LocaleToggle style={{ border: 'none', background: 'transparent' }} />}
                                {!hideHeaderControls && sourceLink && <RepoSourceLink {...sourceLink} />}
                            </>
                        }
                    />
                    {renderBasic()}
                    {footer}
                </PageFrame>
            </div>
        );
    }

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
                            {!hideHeaderControls && <LocaleToggle />}
                            {showFeedbackTab && (
                                <button
                                    type="button"
                                    onClick={() => onTabChange('feedback')}
                                    className="bim-d-ui"
                                    style={{
                                        background: 'none', border: 'none', padding: 0,
                                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                                        color: bim('meta-fg'),
                                    }}
                                >
                                    {t.detailTab.feedback}
                                </button>
                            )}
                            {!hideHeaderControls && sourceLink && <RepoSourceLink {...sourceLink} />}
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
                                color: bim('accent'),
                                borderBottom: `1px solid ${bim('rule')}`,
                            }}
                        >
                            {tr('detail.workInfo')} →
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

                {footer}
            </PageFrame>
        </div>
    );
};

/** 页脚里的 ID + 复制按钮 */
function IdWithCopy({ id, label, copied: copiedLabel, copyLabel }: {
    id: string;
    label: string;
    copied: string;
    copyLabel: string;
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
                title={copied ? copiedLabel : copyLabel}
                aria-label={copied ? copiedLabel : copyLabel}
                className="bim-d-hit"
                /* 点击目标：视觉仍是一个小字形，热区 ≥ 32px（触屏 44px，见 .bim-d-hit） */
                style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 14,
                    minWidth: 32, minHeight: 32,  /* 触屏由 .bim-d-hit 放到 44px */
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: bim('aux-fg'),
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
