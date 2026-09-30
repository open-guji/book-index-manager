/**
 * 统一阅读器（overview#307 C 块）：整理本与全文合一。
 *
 * 取数走 core/text-api：新结构（items/<id>/manifest.json）原样走新接口，旧结构由旧取数方法合成等价数据。
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
import type { TextChapterContent, TextChapter, TextIndex, TextManifest, TextVersion } from '../core/text-model';
import { matchChapterAcrossVersions, pickTextVersion, textVersionLabel } from '../core/text-model';
import { useBidUrl } from '../core/bid-url';
import { bim } from '../styles/tokens';
import { useConvert } from '../i18n';
import { LoadingDots } from './common/LoadingDots';
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
    className?: string;
    style?: React.CSSProperties;
}

const MUTED: React.CSSProperties = { padding: 24, color: bim('desc-fg'), fontSize: 14 };

/** 整理本目录在 JuanReading 里要的形状（类型、质量、考证对象），由 TextIndex 换出来 */
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
    title, subtitle, resolveImages, renderImageOverlay, imagePanel, allowVertical, onReportError, revisedAt, className, style,
}) => {
    const { convert } = useConvert();
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
    const [contentLoading, setContentLoading] = useState(false);
    const contentSeq = useRef(0);
    useEffect(() => {
        if (!versionKey || !chapterMeta) return;
        const seq = ++contentSeq.current;
        setContentLoading(true);
        setContent(null);
        api.getChapter(id, versionKey, chapterMeta.file, { json: !!chapterMeta.has_json })
            .then(c => { if (seq === contentSeq.current) setContent(c); })
            .catch(() => { if (seq === contentSeq.current) setContent(null); })
            .finally(() => { if (seq === contentSeq.current) setContentLoading(false); });
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
    const { entryTitle, authors } = useEntryInfo(id, transport, title === undefined);

    // 「正文／条目」看法：换章回到正文
    const [juanView, setJuanView] = useState<JuanView>('text');
    useEffect(() => { setJuanView('text'); }, [effectiveChapter, versionKey]);

    // ── 渲染 ──
    if (manifestState === 'loading') return <div className={className} style={{ ...style, ...MUTED }}>加载中…</div>;
    if (manifestState === 'missing' || !manifest || !version) {
        return <div className={className} style={{ ...style, ...MUTED }}>没有可阅读的文本</div>;
    }
    if (indexState === 'failed') return <div className={className} style={{ ...style, ...MUTED }}>无法加载目录</div>;
    if (!index) return <div className={className} style={{ ...style, ...MUTED }}>加载目录…</div>;

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

    const titleText = title ?? (index.title ? convert(index.title) : entryTitle ? convert(entryTitle) : undefined);
    const titleNode = titleText ? (
        <a
            href={buildUrl(id)}
            title="查看条目"
            onClick={onNavigate ? e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(id); } : undefined}
        >{titleText}</a>
    ) : undefined;
    const byline = authors.length > 0
        ? convert(authors.slice(0, 2).map(a => `${a.dynasty ? `〔${a.dynasty}〕` : ''}${a.name}${a.role ? ` ${a.role}` : ' 撰'}`).join('、'))
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
    const subtitleNode = subtitle ?? (version.source_name ? convert(version.source_name) : convert(textVersionLabel(version)));

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
            onReportError={onReportError ? ctx => onReportError({
                ...ctx,
                bookTitle: typeof titleText === 'string' ? titleText : undefined,
                entryId: id,
            }) : undefined}
            workLinkToggle={structured && !isKaozhen && !!onNavigate && !!juan?.sections.some(x => x.work_id)}
            toc={toc}
            tocCaption={`目录 · ${index.chapters.length} ${convert(unit)}`}
            tocHeader={isCollated && index.chapters.length > 1 ? (
                <input
                    type="search"
                    className="bim-rd-toc-search"
                    placeholder={isKaozhen ? '搜索全部章节…' : `搜索全部${unit}…`}
                    aria-label={isKaozhen ? '搜索全部章节' : `搜索全部${unit}`}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            ) : undefined}
            activeKey={effectiveChapter ?? null}
            onSelect={handleSelectChapter}
            images={images.images}
            imagesLoading={images.loading}
            renderImageOverlay={renderImageOverlay}
            imagePanel={imagePanel}
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

            {!contentLoading && structured && juan && (
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

            {!contentLoading && !structured && body != null && chapterMeta && (
                <>
                    <header>
                        <h1 className="bim-rd-h1">{chapterMeta.title ? convert(chapterMeta.title) : position}</h1>
                        {(version.source_name || version.license) && (
                            <p className="bim-rd-meta">
                                {version.source_name && (
                                    <>来源 {version.source_url
                                        ? <a className="bim-rd-link" href={version.source_url} target="_blank" rel="noreferrer">{convert(version.source_name)}</a>
                                        : convert(version.source_name)}</>
                                )}
                                {version.source_name && version.license && <span className="bim-rd-dot" />}
                                {version.license}
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

            {!contentLoading && !structured && body == null && chapterMeta && <div className="bim-rd-state">无法加载章节内容</div>}

            {index.references && index.references.length > 0 && (
                <section className="bim-rd-refs">
                    <h2>{convert('參考文獻')}</h2>
                    <ol>
                        {index.references.map((ref, i) => (
                            <li key={i}>
                                {ref.url
                                    ? <a className="bim-rd-link" href={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}</a>
                                    : <span>{ref.title}</span>}
                                {ref.author && <span>，{ref.author}</span>}
                                {ref.note && <span>。{ref.note}</span>}
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
