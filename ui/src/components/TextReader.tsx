/**
 * 统一阅读器（overview#307 C 块）：整理本与全文合一。
 *
 * 取数走 core/text-api，只认新结构（items/<id>/manifest.json，用户 09-30 定）；没有 manifest 显示「暂无文本」。
 * 一个条目下有 manifest 列出的若干份版本（整理本、維基文庫、Kanripo…），工具条一个「版本」下拉框按 manifest 顺序
 * 列全部（default 在最前）；只有一份时不出下拉，只在书名后标来源名。每份版本的出处与授权在正文末尾随版本显示。
 *
 * - 章带 json（整理本）用结构化渲染（条目、注、作品链接，沿用 JuanReading），否则按 md 渲染；
 * - 切版本尽量停在同一章号（`matchChapterAcrossVersions`），对不上回第一章；
 * - 对外暴露「当前版本 key / 章 key」（`versionKey`／`chapter` 受控，也可不传自己管）与切换回调
 *   `onLocationChange`——组件不改 URL，宿主（网站）据此改地址；
 * - 版式交给 Reader/ReaderShell（目录、书影、工具条、翻页），外观走 --bim-* 令牌。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthorInfo, CollatedEditionIndex } from '../types';
import type { IndexStorage } from '../storage/types';
import { hasGujiTableNotation } from '../core/guji-table';
import { hasGujiMarkdownV02 } from '../core/guji-inline';
import { createTextApi } from '../core/text-api';
import type { TextChapterContent, TextChapter, TextIndex, TextManifest, TextUpstream, TextVersion } from '../core/text-model';
import { matchChapterAcrossVersions, pickTextVersion, textVersionLabel } from '../core/text-model';
import { useBidUrl } from '../core/bid-url';
import { bim } from '../styles/tokens';
import { useI18n } from '../i18n/use-i18n';
import { LoadingDots } from './common/LoadingDots';
import { NoteText } from './common/NoteText';
import { ReaderShell } from './Reader/ReaderShell';
import type { PanelState } from './Reader/ReaderShell';
import { ReaderMdText, canParagraphize } from './Reader/ReaderText';
import { useReaderPrefs } from './Reader/prefs';
import { useChapterImages } from './Reader/useChapterImages';
import type { ReaderImageOverlay, ReaderImageResolver, ReaderReportContext, ReaderTocItem, ReaderVersion } from './Reader/types';
import type { JuanCacheEntry, JuanView, WorkLabelCache } from './CollatedEdition';
import {
    JuanRail, JuanReading, groupFileCount, groupMatchState, hasSectionText, useCrossJuanSearch,
} from './CollatedEdition';
import { GujiWarpCanvas, type PageWarpData } from './Reader/GujiWarpCanvas';
import { GujiTextViewer } from './Reader/GujiTextViewer';
import { useChapterWarpData, type ReaderWarpResolver } from './Reader/useChapterWarpData';
import { useChapterEntities, type ReaderEntityResolver } from './Reader/useChapterEntities';

/** 当前位置：哪份版本的哪一章。`isDefault` 时网址里不写版本 key（规格 §六） */
export interface TextLocation {
    key: string;
    /** 章 key（三位编号，如 `003`）；目录还没取到时为 null */
    chapter: string | null;
    isDefault: boolean;
}

/** 位置为什么变：auto＝组件自己纠正（没给章号、章号/版本无效）；chapter＝读者选了章；version＝读者切了版本 */
export type TextLocationCause = 'auto' | 'chapter' | 'version';

export interface TextReaderProps {
    /** 条目 id（Work 或 Book） */
    id: string;
    transport: IndexStorage;
    /** 当前版本 key（受控）；不传组件自己管，传了但无效时回落 default 并以 `auto` 通知 */
    versionKey?: string | null;
    /** 当前章 key（受控）；不传组件自己管，没给或无效时选第一章并以 `auto` 通知 */
    chapter?: string | null;
    /** 版本或章变了：宿主据此改地址（新 URL 见规格 §六） */
    onLocationChange?: (loc: TextLocation, cause: TextLocationCause) => void;
    /** 点关联条目、工具条书名时回调（不传则书名链接按 href 走） */
    onNavigate?: (id: string) => void;
    /** 工具条上的书名；缺省取条目的标题 */
    title?: React.ReactNode;
    /** 书名后的小字；缺省当前版本的来源名 */
    subtitle?: React.ReactNode;
    resolveImages?: ReaderImageResolver;
    renderImageOverlay?: ReaderImageOverlay;
    imagePanel?: PanelState;
    allowVertical?: boolean;
    /** 「报告错字」：回传书名、条目 id、当前章、位置锚点与选中文字，宿主据此打开现有反馈入口（不传则不显示） */
    onReportError?: (ctx: ReaderReportContext) => void;
    /** 页脚「最近校订」日期；数据里没有就不传 */
    revisedAt?: string;
    /** 工具条最左「‹ 阅读」回阅读首页的地址（overview#308）；不给不出 */
    backHref?: string;
    /** 返回链接的文字，默认「阅读」 */
    backLabel?: string;
    /** 矫正对读数据提供函数（返回当前卷的透视矫正数据） */
    resolveWarpData?: ReaderWarpResolver;
    /** 对读正文的实体标注（entity.json，须带逐字 anchor）；按章取，没有就不画 */
    resolveEntities?: ReaderEntityResolver;
    /** 点已收录实体（Ctrl／⌘／Shift 点击或键盘回车）进条目页；不传按 `/item/<id>` 整页跳 */
    onEntityNavigate?: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
    /** 直接传入的对读数据 */
    warpData?: PageWarpData | null;
    className?: string;
    style?: React.CSSProperties;
}

const MUTED: React.CSSProperties = { padding: 24, color: bim('desc-fg'), fontSize: 14 };

/** 首屏骨架：书名（宿主给了就有）＋章题与几行正文的占位条＋「加载中」；占位条用细线色（随主题），不闪动（减少动画偏好下也一样） */
function ReaderSkeleton({ title, label, className, style }: { title?: React.ReactNode; label: string; className?: string; style?: React.CSSProperties }) {
    const bar = (w: string, h = 14, mt = 14): React.CSSProperties => ({ width: w, height: h, marginTop: mt, borderRadius: 3, background: bim('rule') });
    return (
        <div className={className} style={{ ...style, padding: '20px 24px', maxWidth: 760, margin: '0 auto' }} aria-busy="true">
            {title && <div style={{ fontSize: 15, color: bim('ink'), fontFamily: bim('font-ui') }}>{title}</div>}
            <div style={bar('42%', 24, 28)} />
            <div style={bar('30%', 12, 10)} />
            {['96%', '100%', '92%', '98%', '64%'].map((w, i) => <div key={i} style={bar(w, 16, i === 0 ? 30 : 14)} />)}
            <p role="status" style={{ marginTop: 24, color: bim('desc-fg'), fontSize: 14, fontFamily: bim('font-ui') }}>{label}</p>
        </div>
    );
}

/** 整理本目录在 JuanReading 里要的形状（类型、质量、考证对象），由 TextIndex 换出来 */
const HTTP_URL = /^https?:\/\//i;
/** 上游说明：只认 http(s) 链接（数据来自文本仓，仍不把任意 scheme 放进 href）；名字、授权、说明全空则不显示 */
function safeUpstream(u: TextUpstream | undefined): TextUpstream | null {
    if (!u || typeof u !== 'object') return null;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const url = str(u.url);
    const licenseUrl = str(u.license_url);
    const out: TextUpstream = {
        name: str(u.name),
        url: url && HTTP_URL.test(url) ? url : undefined,
        license: str(u.license),
        license_url: licenseUrl && HTTP_URL.test(licenseUrl) ? licenseUrl : undefined,
        note: str(u.note),
    };
    return out.name || out.license || out.note ? out : null;
}

function asCollatedIndex(id: string, idx: TextIndex): CollatedEditionIndex {
    return {
        work_id: idx.work_id ?? id,
        title: idx.title,
        type: idx.type,
        juan_files: idx.chapters.map(c => c.file),
        juan_metadata: idx.juan_metadata,
        juan_groups: idx.juan_groups,
        references: idx.references,
        target_source: idx.target_source,
        target_source_id: idx.target_source_id,
        text_source: idx.text_source,
        text_quality: idx.text_quality,
    };
}

function unitOf(version: TextVersion | undefined, idx: TextIndex | null): string {
    if (idx?.type === 'kaozhen') return '章';
    if (idx?.juan_metadata && Object.values(idx.juan_metadata).some(m => m.vol_label)) return '冊';
    return version?.kind === 'collated' ? '卷' : '章';
}

/** 章在目录里的名字：有章名就用章名（已带「卷一」「第三回」这类位置词的不重复加），整理本的章名前补位置（「卷3　正史類」） */
function chapterLabel(c: TextChapter, unit: string, convert: (s: string) => string, withPosition = false): string {
    const pos = convert(`${unit}${c.n}`);
    if (!c.title) return pos;
    const t = convert(c.title);
    return withPosition && !/^[卷冊册章篇回第]/.test(c.title) ? `${pos}　${t}` : t;
}

/** 目录树：有 juan_groups 按分组，否则平铺 */
function buildToc(idx: TextIndex, matchStates: Record<string, import('./CollatedEdition').JuanMatchState>, unit: string, convert: (s: string) => string, withPosition: boolean): ReaderTocItem[] {
    const byKey = new Map(idx.chapters.map(c => [c.file, c] as const));
    const hintOf = (ms: import('./CollatedEdition').JuanMatchState): React.ReactNode =>
        ms === 'loading' ? '…' : typeof ms === 'number' && ms > 0 ? ms : undefined;
    const leaf = (f: string, label?: string): ReaderTocItem => {
        const c = byKey.get(f);
        return {
            key: f,
            label: label ?? (c ? chapterLabel(c, unit, convert, withPosition) : f),
            hint: hintOf(matchStates[f]),
            disabled: matchStates[f] === 0,
        };
    };
    const groups = idx.juan_groups?.filter(g => g.files.some(f => byKey.has(f)) || g.children?.length);
    if (groups && groups.length > 0) {
        const walk = (g: import('../types').JuanGroup, path: string): ReaderTocItem => {
            if (g.files.length === 1 && !g.children?.length) return leaf(g.files[0], convert(g.label));
            const gs = groupMatchState(g, matchStates);
            return {
                key: `group:${path}`,
                label: convert(g.label),
                hint: gs === 'loading' ? '…' : typeof gs === 'number' && gs > 0 ? `${gs}` : groupFileCount(g),
                defaultExpanded: typeof gs === 'number' && gs > 0,
                children: [
                    ...g.files.filter(f => byKey.has(f)).map(f => leaf(f)),
                    ...(g.children ?? []).map((c, i) => walk(c, `${path}.${i}`)),
                ],
            };
        };
        return groups.map((g, i) => walk(g, `${i}`));
    }
    return idx.chapters.map(c => leaf(c.file));
}

export const TextReader: React.FC<TextReaderProps> = ({
    id, transport, versionKey: versionKeyProp, chapter: chapterProp, onLocationChange, onNavigate,
    title, subtitle, resolveImages, renderImageOverlay, imagePanel, allowVertical, onReportError, revisedAt, backHref, backLabel,
    resolveWarpData, warpData: warpDataProp, resolveEntities, onEntityNavigate,
    className, style,
}) => {
    const { t, convert } = useI18n();
    const api = useMemo(() => createTextApi(transport), [transport]);
    const [prefs, setPrefs] = useReaderPrefs();
    const buildUrl = useBidUrl();

    const onLocationRef = useRef(onLocationChange);
    onLocationRef.current = onLocationChange;

    // ── manifest ──
    const [manifest, setManifest] = useState<TextManifest | null>(null);
    const [manifestState, setManifestState] = useState<'loading' | 'ready' | 'missing'>('loading');
    useEffect(() => {
        let cancelled = false;
        setManifest(null);
        setManifestState('loading');
        api.getManifest(id)
            .then(m => { if (cancelled) return; if (m) { setManifest(m); setManifestState('ready'); } else setManifestState('missing'); })
            .catch(() => { if (!cancelled) setManifestState('missing'); });
        return () => { cancelled = true; };
    }, [api, id]);

    // ── 当前版本与章（受控或自管） ──
    const versionControlled = versionKeyProp !== undefined;
    const chapterControlled = chapterProp !== undefined;
    const [ownVersion, setOwnVersion] = useState<string | null>(null);
    const [ownChapter, setOwnChapter] = useState<string | null>(null);
    useEffect(() => { setOwnVersion(null); setOwnChapter(null); }, [id]);

    const version = pickTextVersion(manifest, versionControlled ? versionKeyProp : ownVersion);
    const defaultKey = manifest?.versions.find(v => v.key === 'default')?.key ?? manifest?.versions[0]?.key ?? 'default';
    const versionKey = version?.key ?? null;
    const activeChapter = chapterControlled ? chapterProp : ownChapter;

    const notify = useCallback((key: string, chapter: string | null, cause: TextLocationCause) => {
        onLocationRef.current?.({ key, chapter, isDefault: key === defaultKey }, cause);
    }, [defaultKey]);

    // 宿主给的版本 key 不在 manifest 里：回落 default 并通知，让宿主纠正地址
    useEffect(() => {
        if (!manifest || !versionControlled || versionKeyProp == null) return;
        if (!manifest.versions.some(v => v.key === versionKeyProp)) notify(defaultKey, null, 'auto');
    }, [manifest, versionControlled, versionKeyProp, defaultKey, notify]);

    // ── 目录（带缓存，切版本前要先看新目录的章） ──
    const indexCache = useRef(new Map<string, TextIndex | null>());
    useEffect(() => { indexCache.current.clear(); }, [api, id]);
    const loadIndex = useCallback(async (key: string): Promise<TextIndex | null> => {
        const ck = `${id}\n${key}`;
        if (indexCache.current.has(ck)) return indexCache.current.get(ck) ?? null;
        const idx = await api.getIndex(id, key).catch(() => null);
        if (idx) indexCache.current.set(ck, idx);
        return idx;
    }, [api, id]);

    const [index, setIndex] = useState<TextIndex | null>(null);
    const [indexState, setIndexState] = useState<'loading' | 'ready' | 'failed'>('loading');
    useEffect(() => {
        if (!versionKey) return;
        let cancelled = false;
        setIndex(null);
        setIndexState('loading');
        loadIndex(versionKey).then(idx => {
            if (cancelled) return;
            if (idx && idx.chapters.length > 0) { setIndex(idx); setIndexState('ready'); } else setIndexState('failed');
        });
        return () => { cancelled = true; };
    }, [versionKey, loadIndex]);

    // 没给章或章无效：选第一章并通知
    useEffect(() => {
        if (!index || !versionKey) return;
        const hit = activeChapter != null && index.chapters.some(c => c.file === activeChapter);
        if (hit) return;
        const first = index.chapters[0].file;
        if (!chapterControlled) setOwnChapter(first);
        notify(versionKey, first, 'auto');
    }, [index, versionKey, activeChapter, chapterControlled, notify]);

    /* 受控的 chapter 缺失或无效时，渲染用第一章（同时以 auto 通知宿主纠正），不能空白等宿主回写 */
    const effectiveChapter = index
        ? (activeChapter != null && index.chapters.some(c => c.file === activeChapter) ? activeChapter : index.chapters[0].file)
        : activeChapter;
    const chapterMeta = useMemo(
        () => (index && effectiveChapter ? index.chapters.find(c => c.file === effectiveChapter) ?? null : null),
        [index, effectiveChapter],
    );

    // ── 切换 ──
    const versionSeq = useRef(0);
    const handleVersionChange = useCallback(async (newKey: string) => {
        if (!manifest || newKey === versionKey || !manifest.versions.some(v => v.key === newKey)) return;
        const seq = ++versionSeq.current;
        const target = await loadIndex(newKey);
        if (seq !== versionSeq.current) return;
        const prev = chapterMeta ?? (effectiveChapter ? { file: effectiveChapter } : null);
        const chapter = matchChapterAcrossVersions(prev, target);
        if (!versionControlled) setOwnVersion(newKey);
        if (!chapterControlled) setOwnChapter(chapter);
        notify(newKey, chapter, 'version');
    }, [manifest, versionKey, loadIndex, chapterMeta, effectiveChapter, versionControlled, chapterControlled, notify]);

    const handleSelectChapter = useCallback((ck: string) => {
        if (!versionKey) return;
        if (!chapterControlled) setOwnChapter(ck);
        notify(versionKey, ck, 'chapter');
    }, [versionKey, chapterControlled, notify]);

    // ── 章内容 ──
    const [content, setContent] = useState<TextChapterContent | null>(null);
    /*
     * 「加载中」由「已取到的是不是当前这一章」推出来，不另设标志：原来的标志在 effect 里才置真，
     * 目录到手后的第一帧里它还是假、正文又是空，会先闪一下「无法加载章节内容」（慢网下肉眼可见，overview#359 P2-8）。
     */
    const chapterKey = versionKey && chapterMeta ? `${id}\n${versionKey}\n${chapterMeta.file}` : null;
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    const contentLoading = chapterKey !== null && loadedKey !== chapterKey;
    const contentSeq = useRef(0);
    useEffect(() => {
        if (!versionKey || !chapterMeta) return;
        const seq = ++contentSeq.current;
        const key = `${id}\n${versionKey}\n${chapterMeta.file}`;
        setContent(null);
        api.getChapter(id, versionKey, chapterMeta.file, { json: !!chapterMeta.has_json })
            .then(c => { if (seq === contentSeq.current) setContent(c); })
            .catch(() => { if (seq === contentSeq.current) setContent(null); })
            .finally(() => { if (seq === contentSeq.current) setLoadedKey(key); });
    }, [api, id, versionKey, chapterMeta]);

    // ── 跨章搜索（整理本） ──
    const isCollated = version?.kind === 'collated';
    const [searchQuery, setSearchQuery] = useState('');
    useEffect(() => { setSearchQuery(''); }, [id, versionKey]);
    const loadEntry = useMemo(
        () => (versionKey && isCollated
            ? async (f: string): Promise<JuanCacheEntry> => {
                const c = await api.getChapter(id, versionKey, f, { json: true });
                return { juan: c?.json ?? null, rawText: c?.md ?? null };
            }
            : null),
        [api, id, versionKey, isCollated],
    );
    const isKaozhen = index?.type === 'kaozhen';
    const chapterKeys = useMemo(() => index?.chapters.map(c => c.file) ?? [], [index]);
    const { matchStates } = useCrossJuanSearch({
        resetKey: `${id}\n${versionKey ?? ''}`,
        load: loadEntry,
        files: chapterKeys,
        activeFile: effectiveChapter ?? null,
        activeJuan: content?.json ?? null,
        activeRawText: content?.md ?? null,
        query: searchQuery,
        isKaozhen,
    });
    const workLabelCacheRef = useRef<WorkLabelCache>(new Map());
    useEffect(() => { workLabelCacheRef.current.clear(); }, [id]);

    const images = useChapterImages(resolveImages, effectiveChapter ?? null);
    const { warpData, loading: warpLoading } = useChapterWarpData(resolveWarpData, warpDataProp, effectiveChapter ?? null, chapterMeta as any);
    const entitySpans = useChapterEntities(resolveEntities, effectiveChapter ?? null);
    const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
    const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
    const [showPunctuation, setShowPunctuation] = useState<boolean>(true);
    const [preserveMargins, setPreserveMargins] = useState<boolean>(true);
    const [activePage, setActivePage] = useState<number>(() => {
        if (warpData?.page_id) {
            const p = parseInt(warpData.page_id.split(':')[1] || '10', 10);
            return isNaN(p) ? 10 : p;
        }
        return 10;
    });

    useEffect(() => {
        if (warpData?.page_id) {
            const p = parseInt(warpData.page_id.split(':')[1] || '10', 10);
            if (!isNaN(p)) setActivePage(p);
        }
    }, [warpData]);

    useEffect(() => {
        setSelectedCharIds(new Set());
        setHoveredCharId(null);
    }, [effectiveChapter, versionKey]);

    // 划词或点击字发生跨页或翻页时的处理：总是以选区的第一个字所在的页码作为当前书影显示页
    const handleSelectionUpdate = useCallback((ids: string[]) => {
        setSelectedCharIds(new Set(ids));
        if (ids.length > 0) {
            // 解析第一个字符所在的页码 (id 格式为 <page>:<col>:<slot>[sub])
            const firstId = ids[0];
            const pagePart = parseInt(firstId.split(':')[0], 10);
            if (!isNaN(pagePart)) {
                setActivePage(pagePart);
            }
        }
    }, []);

    // 当前活动页对应的书影图片 URL
    const activeImageUrl = useMemo(() => {
        const list = images.images;
        if (list && list.length > 0) {
            const found = list.find(img => img.pageNo === activePage) ?? list[activePage - 1];
            if (found) return found.hiresUrl ?? found.url;
        }
        return (warpData as any)?.imageUrl ?? '';
    }, [images.images, activePage, warpData]);

    // 计算当前页是否具备原生 warpData，若为当前页则渲染带网格透视的 pageData，否则构造当前页的降级 pageData
    const activePageData = useMemo<PageWarpData | null>(() => {
        if (!warpData) return null;
        const warpPageNum = parseInt(warpData.page_id.split(':')[1] || '10', 10);
        if (activePage === warpPageNum) {
            return warpData;
        }
        // 查找 pages 中是否有对应页的数据
        const pInfo = (warpData as any).pages?.find((p: any) => p.page === activePage);
        return {
            page_id: `vol02:${activePage}`,
            title: `欽定四庫全書總目 · 卷首二（第${activePage}葉）`,
            image_size: [2386, 3082],
            total_warped_w: 191 * 9,
            columns: pInfo ? pInfo.columns.map((col: any) => ({
                col: col.col,
                warped_w: 191,
                warped_h: 2473,
                offset_x: (9 - col.col) * 191,
                strips: [],
                chars: col.chars.map((ch: any) => ({
                    ...ch,
                    bbox_col: [20, (ch.slot ?? ch.pos ?? 0) * 110, 170, (ch.slot ?? ch.pos ?? 0) * 110 + 100],
                }))
            })) : [],
        };
    }, [warpData, activePage]);

    const { entryTitle, authors } = useEntryInfo(id, transport, title === undefined);

    // 「正文／条目」看法：换章回到正文
    const [juanView, setJuanView] = useState<JuanView>('text');
    useEffect(() => { setJuanView('text'); }, [effectiveChapter, versionKey]);

    // ── 渲染 ──
    // 文本清单、目录未到（服务端渲染出的首屏也是这一态）：先出书名与正文骨架，不是一行小字（overview#359 P2-8）
    if (manifestState === 'loading') return <ReaderSkeleton className={className} style={style} title={title ?? entryTitle} label={t('reader.loading')} />;
    if (manifestState === 'missing' || !manifest || !version) {
        return <div className={className} style={{ ...style, ...MUTED }}>{t('reader.noText')}</div>;
    }
    if (indexState === 'failed') return <div className={className} style={{ ...style, ...MUTED }}>{t('reader.tocFailed')}</div>;
    if (!index) return <ReaderSkeleton className={className} style={style} title={title ?? entryTitle} label={t('reader.tocLoading')} />;

    const unit = unitOf(version, index);
    const toc = buildToc(index, matchStates, unit, convert, isCollated);
    const readerVersions: ReaderVersion[] = manifest.versions.map(v => ({
        key: v.key,
        label: textVersionLabel(v),
        optionLabel: convert(textVersionLabel(v)),
        sourceName: v.source_name ? convert(v.source_name) : undefined,
        license: v.license ?? undefined,
        sourceUrl: v.source_url ?? undefined,
        primary: v.key === defaultKey,
    }));

    const upstream = safeUpstream(index.source?.upstream);
    // 宿主给的书名是字符串（网站传条目标题，繁体原文）也要跟着繁简走；传的是节点就原样用
    const titleText = (typeof title === 'string' ? convert(title) : title) ?? (index.title ? convert(index.title) : entryTitle ? convert(entryTitle) : undefined);
    const titleNode = titleText ? (
        <a
            href={buildUrl(id)}
            title={t('reader.viewEntry')}
            onClick={onNavigate ? e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(id); } : undefined}
        >{titleText}</a>
    ) : undefined;
    const byline = authors.length > 0
        ? convert(authors.slice(0, 2).map(a => `${a.dynasty ? `〔${a.dynasty}〕` : ''}${a.name}${` ${a.role || t('reader.defaultRole')}`}`).join('、'))
        : undefined;
    const position = chapterMeta ? chapterLabel(chapterMeta, unit, convert, isCollated) : undefined;

    const structured = isCollated && !!content?.json;
    const juan = content?.json ?? null;
    const md = content?.md ?? null;
    const sectionText = structured && !isKaozhen && hasSectionText(juan!.sections);
    const textHasEntries = sectionText && !(md && prefs.readingMode === 'paragraph' && canParagraphize(md));
    const rail = structured && sectionText
        ? <JuanRail juan={juan!} view={juanView} onView={setJuanView} textHasEntries={textHasEntries} />
        : undefined;
    const tables = hasGujiTableNotation(index) || hasGujiMarkdownV02(index);
    const body = md ? md.replace(/^##\s+[^\n]+\n+/, '') : null;
    const subtitleNode = (typeof subtitle === 'string' ? convert(subtitle) : subtitle) ?? (version.source_name ? convert(version.source_name) : convert(textVersionLabel(version)));

    return (
        <ReaderShell
            className={className}
            style={style}
            title={titleNode}
            subtitle={subtitleNode}
            byline={byline}
            current={position}
            pagerUnit={unit}
            rail={rail}
            revisedAt={revisedAt}
            backHref={backHref}
            backLabel={backLabel}
            onReportError={onReportError ? ctx => onReportError({
                ...ctx,
                bookTitle: typeof titleText === 'string' ? titleText : undefined,
                entryId: id,
            }) : undefined}
            workLinkToggle={structured && !isKaozhen && !!onNavigate && !!juan?.sections.some(x => x.work_id)}
            toc={toc}
            tocCaption={t('reader.tocCaption', { n: index.chapters.length, unit: convert(unit) })}
            tocHeader={isCollated && index.chapters.length > 1 ? (
                <input
                    type="search"
                    className="bim-rd-toc-search"
                    placeholder={isKaozhen ? t('reader.searchChaptersPlaceholder') : t('reader.searchUnitPlaceholder', { unit: convert(unit) })}
                    aria-label={isKaozhen ? t('reader.searchChapters') : t('reader.searchUnit', { unit: convert(unit) })}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            ) : undefined}
            activeKey={effectiveChapter ?? null}
            onSelect={handleSelectChapter}
            images={images.images}
            imagesLoading={images.loading || warpLoading}
            renderImageOverlay={renderImageOverlay}
            imagePanel={warpData ? 'open' : imagePanel}
            isWarpMode={!!warpData}
            customImagePanel={warpData && activePageData ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px', fontSize: 12, color: bim('meta-fg') }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600 }}>底本书影</span>
                            <span data-warp-page={activePage} style={{ fontSize: 11, padding: '1px 6px', background: bim('rule'), borderRadius: 10 }}>第 {activePage} 葉</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {selectedCharIds.size > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedCharIds(new Set())}
                                    className="bim-rd-t"
                                    style={{ fontSize: 11, padding: '2px 6px', border: `1px solid ${bim('rule')}`, borderRadius: 4, cursor: 'pointer' }}
                                >
                                    清除选中 ({selectedCharIds.size})
                                </button>
                            )}
                        </div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <GujiWarpCanvas
                            imageUrl={activeImageUrl}
                            pageData={activePageData}
                            selectedCharIds={selectedCharIds}
                            hoveredCharId={hoveredCharId}
                            preserveMargins={preserveMargins}
                            onCharClick={(id) => {
                                setSelectedCharIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(id)) next.delete(id);
                                    else { next.clear(); next.add(id); }
                                    return next;
                                });
                                const el = document.querySelector(`[data-char-id="${id}"]`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }}
                            onCharHover={setHoveredCharId}
                        />
                    </div>
                    {/* 留白模式切换置于图片正下方 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0 2px' }}>
                        <div style={{ display: 'inline-flex', border: `1px solid ${bim('rule')}`, borderRadius: 4, overflow: 'hidden' }}>
                            <button
                                type="button"
                                onClick={() => setPreserveMargins(false)}
                                className={`bim-rd-t ${!preserveMargins ? 'bim-rd-on' : ''}`}
                                style={{ fontSize: 11, padding: '2px 10px', lineHeight: '18px', border: 'none', borderRadius: 0, cursor: 'pointer', background: !preserveMargins ? bim('accent-bg') : 'transparent', color: !preserveMargins ? bim('accent') : 'inherit' }}
                                title="去空白：紧凑裁切版心"
                            >
                                去空白
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreserveMargins(true)}
                                className={`bim-rd-t ${preserveMargins ? 'bim-rd-on' : ''}`}
                                style={{ fontSize: 11, padding: '2px 10px', lineHeight: '18px', border: 'none', borderRadius: 0, cursor: 'pointer', background: preserveMargins ? bim('accent-bg') : 'transparent', color: preserveMargins ? bim('accent') : 'inherit' }}
                                title="保留空白：完整呈现古籍天头地脚与白边"
                            >
                                保留空白
                            </button>
                        </div>
                    </div>
                </div>
            ) : undefined}
            toolbarExtra={warpData ? (
                <>
                    <span className="bim-rd-badge-warp">图文对读</span>
                    <button
                        type="button"
                        className={`bim-rd-t ${showPunctuation ? 'bim-rd-on' : ''}`}
                        title="切换外挂现代断句标点"
                        onClick={() => setShowPunctuation(p => !p)}
                    >
                        {showPunctuation ? '标点' : '无标点'}
                    </button>
                </>
            ) : undefined}
            prefs={prefs}
            onPrefsChange={setPrefs}
            versions={readerVersions.length > 1 ? readerVersions : undefined}
            currentVersionKey={readerVersions.length > 1 ? version.key : undefined}
            onVersionChange={handleVersionChange}
            keepChapterOnVersionChange
            versionSource
            paragraphToggle={canParagraphize(md)}
            allowVertical={allowVertical}
        >
            {contentLoading && <LoadingDots />}

            {!contentLoading && warpData && (
                <article className="bim-rd-prose" style={{ marginTop: 0 }}>
                    <header style={{ marginBottom: 16 }}>
                        <h1 className="bim-rd-h1">{chapterMeta?.title ? convert(chapterMeta.title) : position}</h1>
                        {(version.source_name || version.license) && (
                            <p className="bim-rd-meta">
                                {version.source_name && convert(version.source_name)}
                                {version.license && <><span className="bim-rd-dot" />{version.license}</>}
                            </p>
                        )}
                    </header>
                    <GujiTextViewer
                        pageData={warpData}
                        pages={(warpData as any).pages}
                        punctuations={(warpData as any).punctuations || []}
                        selectedCharIds={selectedCharIds}
                        hoveredCharId={hoveredCharId}
                        onSelectionChange={handleSelectionUpdate}
                        onCharClick={(id) => {
                            setSelectedCharIds(prev => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else { next.clear(); next.add(id); }
                                return next;
                            });
                            const pagePart = parseInt(id.split(':')[0], 10);
                            if (!isNaN(pagePart)) setActivePage(pagePart);
                        }}
                        onCharHover={setHoveredCharId}
                        mode="horizontal"
                        showPunctuation={showPunctuation}
                        entities={prefs.properNames ? entitySpans : undefined}
                        entityTransport={transport}
                        onEntityNavigate={onEntityNavigate}
                        onVisiblePageChange={(p) => setActivePage(p)}
                    />
                </article>
            )}

            {!contentLoading && !warpData && structured && juan && (
                <JuanReading
                    key={`${versionKey}/${effectiveChapter}`}
                    juan={juan}
                    rawText={md}
                    positionLabel={unitPosition(chapterMeta, index, unit, convert)}
                    groupLabel={groupLabelOfIndex(index, effectiveChapter ?? null)}
                    index={asCollatedIndex(id, index)}
                    searchQuery={searchQuery}
                    onNavigate={onNavigate}
                    transport={transport}
                    workLabelCache={workLabelCacheRef}
                    prefs={prefs}
                    view={juanView}
                    onViewChange={setJuanView}
                />
            )}

            {!contentLoading && !warpData && !structured && body != null && chapterMeta && (
                <>
                    <header>
                        <h1 className="bim-rd-h1">{chapterMeta.title ? convert(chapterMeta.title) : position}</h1>
                        {(version.source_name || version.license) && (
                            <p className="bim-rd-meta">
                                {version.source_name && (
                                    <>{t('reader.textSource')} {version.source_url
                                        ? <a className="bim-rd-link" href={version.source_url} target="_blank" rel="noreferrer">{convert(version.source_name)}</a>
                                        : convert(version.source_name)}</>
                                )}
                                {version.source_name && version.license && <span className="bim-rd-dot" />}
                                {version.license}
                            </p>
                        )}
                        {upstream && (
                            <p className="bim-rd-meta" data-bim-upstream="">
                                {t('reader.upstream')} {upstream.url
                                    ? <a className="bim-rd-link" href={upstream.url} target="_blank" rel="noreferrer">{convert(upstream.name ?? upstream.url)}</a>
                                    : convert(upstream.name ?? '')}
                                {upstream.license && <><span className="bim-rd-dot" />{upstream.license_url
                                    ? <a className="bim-rd-link" href={upstream.license_url} target="_blank" rel="noreferrer">{upstream.license}</a>
                                    : upstream.license}</>}
                                {upstream.note && <><span className="bim-rd-dot" /><NoteText text={upstream.note} convert={convert} /></>}
                            </p>
                        )}
                    </header>
                    <article className="bim-rd-prose">
                        <ReaderMdText
                            text={body}
                            mode={prefs.readingMode}
                            tables={tables}
                            gujiMarkdown={hasGujiMarkdownV02(index)}
                            properNames={prefs.properNames}
                        />
                    </article>
                </>
            )}

            {!contentLoading && !warpData && !structured && body == null && chapterMeta && <div className="bim-rd-state">{t('reader.chapterFailed')}</div>}

            {index.references && index.references.length > 0 && (
                <section className="bim-rd-refs">
                    <h2>{t('reader.references')}</h2>
                    <ol>
                        {index.references.map((ref, i) => (
                            <li key={i}>
                                {ref.url
                                    ? <a className="bim-rd-link" href={ref.url} target="_blank" rel="noopener noreferrer">{convert(ref.title)}</a>
                                    : <span>{convert(ref.title)}</span>}
                                {ref.author && <span>，{convert(ref.author)}</span>}
                                {ref.note && <span>。{convert(ref.note)}</span>}
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </ReaderShell>
    );
};

/** 卷头小标题的位置词：有册号以册号为正名（「49冊」），否则「卷3」 */
function unitPosition(c: TextChapter | null, idx: TextIndex, unit: string, convert: (s: string) => string): string | undefined {
    if (!c) return undefined;
    const vol = idx.juan_metadata?.[c.file]?.vol_label;
    return convert(vol ? `${vol}冊` : `${unit}${c.n}`);
}

/** 章所在的分组名（最深一层含该章的 juan_groups 标签）；没有分组返回空 */
function groupLabelOfIndex(index: TextIndex, chapter: string | null): string | undefined {
    if (!chapter) return undefined;
    const find = (groups: import('../types').JuanGroup[] | undefined): string | undefined => {
        for (const g of groups ?? []) {
            const deeper = find(g.children);
            if (deeper) return deeper;
            if (g.files?.includes(chapter)) return g.label;
        }
        return undefined;
    };
    return find(index.juan_groups);
}

/** 条目的书名与作者（取不到就空，阅读照常） */
function useEntryInfo(id: string, transport: IndexStorage, wantTitle: boolean): { entryTitle: string | undefined; authors: AuthorInfo[] } {
    const [info, setInfo] = useState<{ entryTitle: string | undefined; authors: AuthorInfo[] }>({ entryTitle: undefined, authors: [] });
    useEffect(() => {
        setInfo({ entryTitle: undefined, authors: [] });
        if (typeof transport.getItem !== 'function') return;
        let cancelled = false;
        Promise.resolve(transport.getItem(id))
            .then(item => {
                if (cancelled || !item) return;
                const authors = ((item.authors as AuthorInfo[] | undefined) ?? []).filter(a => a && a.name);
                setInfo({ entryTitle: wantTitle && typeof item.title === 'string' ? item.title : undefined, authors });
            })
            .catch(() => { /* 没有书名、作者行也能读 */ });
        return () => { cancelled = true; };
    }, [id, transport, wantTitle]);
    return info;
}
