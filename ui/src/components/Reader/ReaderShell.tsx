/**
 * 阅读器外壳：整理本与全文共用。
 *
 *   ┌ 工具条（吸顶）：书名 · 副题 ……… 版本▾ │ 目录  书影 │ 繁简 │ A− A+ │ 自然段 专名线 ┐
 *   ├ 目录（侧栏/抽屉）┬ 书影 ┬ 正文 ─────────────────────────────────────────┤
 *
 * - 书影在正文左边（阅读习惯，2026-09-28 定）；没有影像时默认收起，工具条上仍可点开看占位；
 * - 目录：宽屏（≥1100px）是可收起的侧栏，默认展开；更窄时是抽屉，默认收起，选卷后自动合上；
 * - 窄屏（≤719px）书影区不显示，只留正文；
 * - 工具条只用文字与图标，不画按钮外框；
 * - 第一个可聚焦元素是「跳到正文」，目录内部用游走 tabindex（只有当前卷进 Tab 序列）；
 * - 同一 owner 有多份全文时，工具条最前面是「版本」下拉框（overview#235）：默认选 primary，
 *   正文末尾的出处与授权跟着所选版本变；切换后回到新版本的第一卷。组件不改 URL，由宿主处理；
 * - 窄屏与触屏上工具条按钮的点击区用伪元素扩到 44×44，外观不变（INT Q4）；
 * - 工具条最左可放「‹ 阅读」回阅读首页（`backHref`，overview#308）；
 * - <860px（右栏藏起来以后）屏幕底部固定一条底栏：卷目／书影／字号／报告错字，书影与字号点开是底部抽屉
 *   （overview#308）。底栏挂载后按视口宽度出，服务端不渲染（它是 fixed 定位，不影响版面）。
 *
 * 正文内容（卷名、元数据行、宋体正文）由调用方作为 children 传入，
 * 偏好（字号、自然段、专名线）由调用方用 `useReaderPrefs` 持有后传进来——调用方渲染正文要用。
 */
import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { LocaleContext } from '../../i18n/context';
import { useI18n } from '../../i18n/use-i18n';
import { READER_BOTTOM_BAR_QUERY, READER_CSS, READER_WIDE_QUERY } from './reader-css';
import { ReaderToc } from './ReaderToc';
import { ImagePanel } from './ImagePanel';
import { FONT_SIZE_STEPS, DEFAULT_FONT_SIZE, READER_FONT_FAMILIES, readerFontStack, stepFontSize } from './prefs';
import type { ReaderPrefs, ReaderFontFamily, ProperNameMode, QuoteStyle, BookTitleStyle, ReaderScriptMode } from './prefs';
import { pickReaderVersion, readerVersionOptionLabel } from './versions';
import type { ReaderImageOverlay, ReaderPageImage, ReaderReportContext, ReaderTocItem, ReaderVersion } from './types';

export type PanelState = 'auto' | 'open' | 'closed';

export interface ReaderShellProps {
    /** 工具条左侧：书名 */
    title?: React.ReactNode;
    /** 工具条左侧：书名后的小字（作者、「整理本」等） */
    subtitle?: React.ReactNode;
    /** 工具条左侧：书名后的作者行（「〔南宋〕陈振孙 撰」）；数据里没有就不传 */
    byline?: React.ReactNode;
    /** 工具条左侧：当前卷（「卷1　易类」），前面自动加分隔点 */
    current?: React.ReactNode;
    /** 显示「标出作品链接」勾选（当前卷里有可链到作品的条目时才有意义） */
    workLinkToggle?: boolean;
    /** 正文右侧的栏（≥860px 才显示；窄了就藏起来）：宿主给内容，壳负责定位与吸顶 */
    rail?: React.ReactNode;
    /**
     * 右栏底部「报告错字」。给了才显示；点击时回传当前卷、位置锚点与选中文字，
     * 宿主据此打开现有的反馈入口（壳不发请求）。宿主要补书名、条目 id 自己加。
     */
    onReportError?: (ctx: ReaderReportContext) => void;
    /** 正文末尾页脚里的「最近校订」日期（如 `2026-09-12`）；数据里没有就不传，不显示 */
    revisedAt?: string;
    /** 工具条最左「‹ 阅读」的地址（回阅读首页）；不给不出 */
    backHref?: string;
    /** 返回链接的文字，默认「阅读」 */
    backLabel?: string;
    /** <860px 时的手机底栏（卷目／书影／字号／报告错字），默认开 */
    bottomBar?: boolean;

    toc: ReaderTocItem[];
    activeKey: string | null;
    onSelect: (key: string) => void;
    /** 目录顶上的附加内容（整理本的跨卷搜索框） */
    tocHeader?: React.ReactNode;
    /** 目录标题，如「目录 · 22 卷」 */
    tocCaption?: React.ReactNode;

    /** 当前卷的书影；null / 空数组 = 没有影像 */
    images?: ReaderPageImage[] | null;
    imagesLoading?: boolean;
    renderImageOverlay?: ReaderImageOverlay;
    /** 书影区初始状态：auto = 有影像才展开 */
    imagePanel?: PanelState;

    prefs: ReaderPrefs;
    onPrefsChange: (patch: Partial<ReaderPrefs>) => void;
    /** 当前正文可以按自然段排（体裁判得清）时才显示「自然段」开关 */
    paragraphToggle?: boolean;
    /** 显示「专名线」开关（正文里有书名号时才有意义） */
    properNameToggle?: boolean;
    /** 竖排开关（预留，默认不显示） */
    allowVertical?: boolean;

    /** 正文底部「上一卷 / 下一卷」；默认按目录顺序自动给出 */
    pager?: boolean;
    /** 翻页卡片上的单位字：「上一卷」「下一冊」「下一章」；默认「卷」 */
    pagerUnit?: string;

    /**
     * 同一 owner 的各份全文（overview#235）。两份以上时工具条出「版本」下拉框，
     * 只有一份时不显示下拉框；有值时正文末尾显示所选版本的出处与授权。
     */
    versions?: ReaderVersion[];
    /** 当前版本 key；不给或无效时选 primary（再没有就第一份） */
    currentVersionKey?: string | null;
    /**
     * 下拉框切换时回调。组件不改 URL，由宿主换 toc / 正文。
     * 宿主换上新版本的目录（toc 换了一份）后，组件自动选中新目录的第一卷，不保留卷号。
     */
    onVersionChange?: (key: string) => void;
    /** 正文末尾的「出处 · 授权」一行；默认有 versions 时显示，宿主自己画出处时可关掉 */
    versionSource?: boolean;
    /**
     * 切版本后不自动回到新目录第一卷（默认会）。宿主自己决定切版本后停在哪一章
     * （如尽量停在同一章号，见 `matchChapterAcrossVersions`）时设为 true。
     */
    keepChapterOnVersionChange?: boolean;
    /** 自定义书影/对读面板（如 WebGL 透视矫正画布）；传入时优先渲染此项，不渲染默认 ImagePanel */
    customImagePanel?: React.ReactNode;
    /** 工具条上的额外控制项（旧入口，新代码放进右侧「阅读设置」的 settingsAnnotate / settingsLayout） */
    toolbarExtra?: React.ReactNode;
    /** 右侧「阅读设置」侧栏「标注」组里的额外控制项（如标点开关） */
    settingsAnnotate?: React.ReactNode;
    /** 右侧「阅读设置」侧栏「版面」组里的额外控制项（如书影留白） */
    settingsLayout?: React.ReactNode;
    /** 是否处于 interactive_warp 模式 */
    isWarpMode?: boolean;

    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

/** 目录里所有可选的叶子，按阅读顺序 */
export function flattenToc(items: ReaderTocItem[]): ReaderTocItem[] {
    const out: ReaderTocItem[] = [];
    const walk = (list: ReaderTocItem[]) => {
        for (const it of list) {
            if (it.children && it.children.length > 0) walk(it.children);
            else out.push(it);
        }
    };
    walk(items);
    return out;
}

type Sheet = 'img' | 'set' | null;

const IconToc = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h10M4 18h16" />
    </svg>
);
const IconPrev = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
    </svg>
);
const IconNext = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5l7 7-7 7" />
    </svg>
);
const IconSettings = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" />
    </svg>
);
const IconImage = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="1.5" />
        <path d="M9 3v18M13 7v10M16.5 7v10" />
    </svg>
);

/**
 * 抽屉（aria-modal）打开时把 Tab 圈在抽屉里：可 Tab 到的只有关闭键、搜索框与目录当前项
 * （目录内部靠方向键），在首尾之间循环。
 */
function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null) {
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter(el => el.tabIndex >= 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const cur = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (cur === first || !root.contains(cur))) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && (cur === last || !root.contains(cur))) {
        e.preventDefault();
        first.focus();
    }
}

function useMediaQuery(query: string, ssrDefault: boolean): boolean {
    const [match, setMatch] = useState(ssrDefault);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia(query);
        setMatch(mq.matches);
        const on = () => setMatch(mq.matches);
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, [query]);
    return match;
}

function LocaleSwitch({ onSwitch }: { onSwitch?: (next: 'zh-Hant' | 'zh-Hans') => void }) {
    const ctx = useContext(LocaleContext);
    const { t } = useI18n();
    if (!ctx) return null;
    const isHant = ctx.locale === 'zh-Hant';
    return (
        <button
            type="button"
            className="bim-rd-t"
            title={isHant ? t('common.toHans') : t('common.toHant')}
            aria-label={isHant ? t('common.toHans') : t('common.toHant')}
            onClick={() => {
                const next = isHant ? 'zh-Hans' : 'zh-Hant';
                ctx.setLocale(next);
                onSwitch?.(next);
            }}
        >
            <span className={isHant ? 'bim-rd-on' : 'bim-rd-off'}>{t('common.localeShortHant')}</span>
            <span className="bim-rd-off">｜</span>
            <span className={isHant ? 'bim-rd-off' : 'bim-rd-on'}>{t('common.localeShortHans')}</span>
        </button>
    );
}

/** 设置面板里的单选按钮组（只绑定偏好，不做行为）：一行标签＋若干 aria-pressed 按钮 */
function SegRow<V extends string>({ label, value, options, onPick, title }: {
    label: string;
    value: V | null;
    options: ReadonlyArray<{ key: V; label: string; title?: string }>;
    onPick: (v: V) => void;
    title?: string;
}) {
    return (
        <div className="bim-rd-sp-row" role="group" aria-label={label} title={title}>
            <span className="bim-rd-sp-l">{label}</span>
            <span className="bim-rd-sp-fs">
                {options.map(o => (
                    <button key={o.key} type="button" className="bim-rd-t" aria-pressed={value === o.key} title={o.title}
                        onClick={() => onPick(o.key)}>{o.label}</button>
                ))}
            </span>
        </div>
    );
}

/**
 * 字形三态：原字／通行繁体／简体。选繁体／简体时照旧同步站点 locale；选原字只设偏好、不动站点 locale。
 * scriptMode 为 null（没选过）或已选繁／简时，显示成跟随站点当前的繁／简。
 */
function ScriptRow({ prefs, onPrefsChange }: { prefs: ReaderPrefs; onPrefsChange: (patch: Partial<ReaderPrefs>) => void }) {
    const ctx = useContext(LocaleContext);
    const { t } = useI18n();
    const siteScript: ReaderScriptMode = ctx?.locale === 'zh-Hans' ? 'hans' : 'hant';
    const shown: ReaderScriptMode = prefs.scriptMode === 'orig' ? 'orig' : siteScript;
    return (
        <SegRow<ReaderScriptMode>
            label={t('reader.script')}
            value={shown}
            options={[
                { key: 'orig', label: t('reader.scriptOrig') },
                { key: 'hant', label: t('reader.scriptHant') },
                { key: 'hans', label: t('reader.scriptHans') },
            ]}
            onPick={v => {
                onPrefsChange({ scriptMode: v });
                if (v === 'hant') ctx?.setLocale('zh-Hant');
                else if (v === 'hans') ctx?.setLocale('zh-Hans');
            }}
        />
    );
}

/** 视口顶端所在条目的锚点 id：正文里 `id="rd-e-N"` 的元素中，最后一个顶边已滚过工具条下沿的 */
function currentAnchor(root: HTMLElement | null, barBottom: number): string | undefined {
    if (!root) return undefined;
    let found: string | undefined;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[id^="rd-e-"]'))) {
        if (el.getBoundingClientRect().top <= barBottom + 8) found = el.id;
        else break;
    }
    return found;
}

/** 读者在正文里选中的文字：只认正文列里的选区，右栏、出处页脚、翻卷器里的不算 */
function selectedInText(root: HTMLElement | null): string | undefined {
    if (typeof window === 'undefined' || !root) return undefined;
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return undefined;
    const col = root.querySelector<HTMLElement>('.bim-rd-col');
    const inBody = (node: Node | null) => {
        const el = node?.nodeType === 1 ? node as Element : node?.parentElement;
        return !!node && !!col?.contains(node) && !el?.closest('.bim-rd-src, .bim-rd-pager');
    };
    if (!inBody(sel.anchorNode) || !inBody(sel.focusNode)) return undefined;
    const t = sel.toString().replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, 500) : undefined;
}

export function ReaderShell({
    title, subtitle,
    toc, activeKey, onSelect, tocHeader, tocCaption,
    images, imagesLoading, renderImageOverlay, imagePanel = 'auto',
    prefs, onPrefsChange, paragraphToggle, properNameToggle = true, allowVertical,
    byline, current, workLinkToggle, rail, onReportError, revisedAt,
    backHref, backLabel: backLabelProp, bottomBar = true,
    pager = true,
    pagerUnit: pagerUnitProp,
    versions, currentVersionKey, onVersionChange, versionSource = true, keepChapterOnVersionChange = false,
    customImagePanel, toolbarExtra, settingsAnnotate, settingsLayout, isWarpMode,
    children, className, style,
}: ReaderShellProps) {
    const { t, convert } = useI18n();
    const backLabel = backLabelProp ?? t('reader.back');
    // 单位（卷／章／冊）由宿主给，跟着繁简走
    const pagerUnit = convert(pagerUnitProp ?? t('reader.unitJuan'));
    const uid = useId().replace(/:/g, '');
    const tocId = `bim-rd-toc-${uid}`;
    const textId = `bim-rd-text-${uid}`;
    const barRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const tocRef = useRef<HTMLDivElement>(null);
    const tocBtnRef = useRef<HTMLButtonElement>(null);

    const isWide = useMediaQuery(READER_WIDE_QUERY, true);
    // 底栏：服务端与首帧按「宽屏」算（不出），挂载后窄了才出
    const narrowForBar = useMediaQuery(READER_BOTTOM_BAR_QUERY, false);
    const showBottomBar = bottomBar && narrowForBar;
    const [sheet, setSheet] = useState<Sheet>(null);
    // 阅读设置侧栏（≥860px 右侧；窄屏改走底栏的底部抽屉 sheet='set'）
    const [setOpen, setSetOpen] = useState(false);
    const setBtnRef = useRef<HTMLButtonElement>(null);
    const setId = `bim-rd-set-${uid}`;
    const sheetRef = useRef<HTMLDivElement>(null);
    const sheetOpener = useRef<HTMLButtonElement | null>(null);
    const openSheet = (which: Exclude<Sheet, null>, opener: HTMLButtonElement) => {
        sheetOpener.current = opener;
        setSheet(cur => (cur === which ? null : which));
    };
    const closeSheet = useCallback(() => {
        setSheet(null);
        sheetOpener.current?.focus();
    }, []);
    useEffect(() => { if (!showBottomBar) setSheet(null); }, [showBottomBar]);
    // 抽屉打开后把焦点移进去
    useEffect(() => {
        if (sheet) sheetRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    }, [sheet]);
    const [tocState, setTocState] = useState<PanelState>('auto');
    const tocOpen = tocState === 'auto' ? isWide : tocState === 'open';
    const drawer = !isWide;

    const hasImages = !!customImagePanel || (!!images && images.length > 0);
    const [imgState, setImgState] = useState<PanelState>(imagePanel);
    useEffect(() => { setImgState(imagePanel); }, [imagePanel]);
    const imgOpen = imgState === 'auto' ? (hasImages || !!imagesLoading) : imgState === 'open';

    const closeDrawer = useCallback((refocus: boolean) => {
        setTocState('auto');
        if (refocus) tocBtnRef.current?.focus();
    }, []);

    const toggleToc = () => setTocState(tocOpen ? 'closed' : 'open');

    // 抽屉打开后把焦点移进去（先搜索框，否则当前卷）
    useEffect(() => {
        if (!drawer || tocState !== 'open') return;
        const root = tocRef.current;
        const target = root?.querySelector<HTMLElement>('input, [data-rd-toc-key][tabindex="0"]');
        target?.focus();
    }, [drawer, tocState]);

    const handleSelect = useCallback((key: string) => {
        onSelect(key);
        if (drawer) closeDrawer(false);
        // 正文顶端若已滚出工具条下方，回到正文开头
        const text = textRef.current;
        const bar = barRef.current;
        if (text && bar && typeof window !== 'undefined') {
            const dy = text.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
            if (dy < 0) window.scrollBy({ top: dy });
        }
    }, [onSelect, drawer, closeDrawer]);

    const flat = useMemo(() => flattenToc(toc), [toc]);

    // ── 版本（overview#235）──
    const [internalVersion, setInternalVersion] = useState<string | null>(null);
    const version = pickReaderVersion(versions, currentVersionKey !== undefined ? currentVersionKey : internalVersion);
    const versionKey = version?.key ?? null;
    /*
     * 切版本后回到新目录的第一卷。宿主换目录可能是异步的，toc 也未必 memo，
     * 所以按卷 key 序列（而不是数组引用）判断新目录到没到：
     * - key 序列变了 → 新目录到了，选第一卷，完事；
     * - key 序列没变 → 可能两份目录本就一样，也可能新目录还在路上：先选第一卷，
     *   但继续等——之后 key 序列若再变（新目录到了），再选一次新目录的第一卷。
     */
    const tocSig = useMemo(() => flat.map(it => it.key).join('\n'), [flat]);
    const pendingVersion = useRef<{ key: string; sig: string; done: boolean } | null>(null);
    const changeVersion = (key: string) => {
        if (key === versionKey) return;
        if (!keepChapterOnVersionChange) pendingVersion.current = { key, sig: tocSig, done: false };
        if (currentVersionKey === undefined) setInternalVersion(key);
        onVersionChange?.(key);
    };
    useEffect(() => {
        const p = pendingVersion.current;
        if (!p || p.key !== versionKey) return;
        const first = flat.find(it => !it.disabled);
        if (!first) return; // 新目录还没到（空目录占位）
        const arrived = tocSig !== p.sig;
        if (!arrived && p.done) return;
        if (arrived) pendingVersion.current = null;
        else p.done = true;
        if (first.key !== activeKey) handleSelect(first.key);
    }, [versionKey, tocSig, flat, activeKey, handleSelect]);

    const activeItem = flat.find(it => it.key === activeKey);
    const reportError = () => {
        onReportError?.({
            chapterKey: activeKey,
            chapterLabel: typeof activeItem?.label === 'string' ? activeItem.label : undefined,
            anchor: currentAnchor(textRef.current, barRef.current?.getBoundingClientRect().bottom ?? 0),
            selectedText: selectedInText(textRef.current),
        });
    };

    const pos = flat.findIndex(it => it.key === activeKey);
    const prev = pos > 0 ? flat.slice(0, pos).reverse().find(it => !it.disabled) : undefined;
    const next = pos >= 0 ? flat.slice(pos + 1).find(it => !it.disabled) : undefined;

    const fs = prefs.fontSize ?? DEFAULT_FONT_SIZE;
    const fontStack = readerFontStack(prefs.fontFamily);
    const rootStyle = {
        ...style,
        ...(prefs.fontSize ? { ['--bimrd-fs' as string]: `${prefs.fontSize}px` } : null),
        ...(fontStack ? { ['--bimrd-ff' as string]: fontStack } : null),
    } as React.CSSProperties;
    const fontLabel: Record<ReaderFontFamily, string> = {
        song: t('reader.fontSong'), kai: t('reader.fontKai'), system: t('reader.fontSystem'),
    };
    const hasAnnotate = properNameToggle || !!settingsAnnotate;
    const settingsPanel = (
        <div className="bim-rd-sp">
            <section className="bim-rd-sp-g" aria-labelledby={`${setId}-g1`}>
                <h3 id={`${setId}-g1`} className="bim-rd-sp-h">{t('reader.groupText')}</h3>
                <div className="bim-rd-sp-row">
                    <span className="bim-rd-sp-l">{t('reader.font')}</span>
                    <select
                        className="bim-rd-sp-sel"
                        aria-label={t('reader.font')}
                        value={prefs.fontFamily}
                        onChange={e => onPrefsChange({ fontFamily: e.target.value as ReaderFontFamily })}
                    >
                        {READER_FONT_FAMILIES.map(f => <option key={f.key} value={f.key}>{fontLabel[f.key]}</option>)}
                    </select>
                </div>
                <div className="bim-rd-sp-row">
                    <span className="bim-rd-sp-l">{t('reader.fontSize')}</span>
                    <span className="bim-rd-sp-fs">
                        <button type="button" className="bim-rd-t" aria-label={t('reader.fontSmaller')} disabled={fs <= FONT_SIZE_STEPS[0]}
                            onClick={() => onPrefsChange({ fontSize: stepFontSize(prefs.fontSize, -1) })}>A−</button>
                        <output aria-live="polite">{fs}px</output>
                        <button type="button" className="bim-rd-t" aria-label={t('reader.fontLarger')} disabled={fs >= FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1]}
                            onClick={() => onPrefsChange({ fontSize: stepFontSize(prefs.fontSize, 1) })}>A+</button>
                    </span>
                </div>
                <ScriptRow prefs={prefs} onPrefsChange={onPrefsChange} />
                <SegRow<QuoteStyle>
                    label={t('reader.quoteStyle')}
                    value={prefs.quoteStyle}
                    options={[
                        { key: 'modern', label: t('reader.quoteModern') },
                        { key: 'classic', label: t('reader.quoteClassic') },
                        { key: 'original', label: t('reader.quoteOriginal') },
                    ]}
                    onPick={v => onPrefsChange({ quoteStyle: v })}
                />
            </section>
            {hasAnnotate && (
                <section className="bim-rd-sp-g" aria-labelledby={`${setId}-g2`}>
                    <h3 id={`${setId}-g2`} className="bim-rd-sp-h">{t('reader.groupMark')}</h3>
                    {properNameToggle && (
                        <>
                            <SegRow<ProperNameMode>
                                label={t('reader.properName')}
                                value={prefs.properNameMode}
                                title={t('reader.properNameTitle')}
                                options={[
                                    { key: 'off', label: t('reader.properNameOff') },
                                    { key: 'lite', label: t('reader.properNameLite'), title: t('reader.properNameLiteTitle') },
                                    { key: 'full', label: t('reader.properNameFull') },
                                ]}
                                onPick={v => onPrefsChange({ properNameMode: v })}
                            />
                            <label className="bim-rd-t bim-rd-chk bim-rd-sp-tg">
                                <input type="checkbox" checked={prefs.showWorks} onChange={e => onPrefsChange({ showWorks: e.target.checked })} />
                                <span>{t('reader.showWorks')}</span>
                            </label>
                            <SegRow<BookTitleStyle>
                                label={t('reader.bookTitleStyle')}
                                value={prefs.bookTitleStyle}
                                options={[
                                    { key: 'wavy', label: t('reader.bookTitleWavy') },
                                    { key: 'bracket', label: t('reader.bookTitleBracket') },
                                ]}
                                onPick={v => onPrefsChange({ bookTitleStyle: v })}
                            />
                        </>
                    )}
                    {settingsAnnotate}
                </section>
            )}
            <section className="bim-rd-sp-g" aria-labelledby={`${setId}-g3`}>
                <h3 id={`${setId}-g3`} className="bim-rd-sp-h">{t('reader.groupLayout')}</h3>
                {paragraphToggle && (
                    <button type="button" className="bim-rd-t bim-rd-sp-tg" aria-pressed={prefs.readingMode === 'paragraph'}
                        title={t('reader.paragraphTitle')}
                        onClick={() => onPrefsChange({ readingMode: prefs.readingMode === 'paragraph' ? 'line' : 'paragraph' })}>{t('reader.paragraph')}</button>
                )}
                {workLinkToggle && (
                    <label className="bim-rd-t bim-rd-chk bim-rd-sp-tg">
                        <input type="checkbox" checked={prefs.workLinks} onChange={e => onPrefsChange({ workLinks: e.target.checked })} />
                        <span>{t('reader.workLinks')}</span>
                    </label>
                )}
                {allowVertical && (
                    <button type="button" className="bim-rd-t bim-rd-sp-tg" aria-pressed={prefs.writingMode === 'vertical'}
                        onClick={() => onPrefsChange({ writingMode: prefs.writingMode === 'vertical' ? 'horizontal' : 'vertical' })}>{t('reader.vertical')}</button>
                )}
                <label className="bim-rd-t bim-rd-chk bim-rd-sp-tg">
                    <input type="checkbox" checked={prefs.pageBreaks} onChange={e => onPrefsChange({ pageBreaks: e.target.checked })} />
                    <span>{t('reader.pageBreaks')}</span>
                </label>
                <label className="bim-rd-t bim-rd-chk bim-rd-sp-tg">
                    <input type="checkbox" checked={prefs.preserveMargins} onChange={e => onPrefsChange({ preserveMargins: e.target.checked })} />
                    <span>{t('reader.preserveMargins')}</span>
                </label>
                {settingsLayout}
            </section>
        </div>
    );

    return (
        <div
            className={['bim-rd', prefs.writingMode === 'vertical' && allowVertical ? 'bim-rd-vertical' : '', className].filter(Boolean).join(' ')}
            data-toc={tocState}
            data-img={imgOpen ? 'open' : 'closed'}
            data-bb={showBottomBar ? '' : undefined}
            data-set={!showBottomBar && setOpen ? 'open' : undefined}
            data-warp={isWarpMode ? 'true' : undefined}
            style={rootStyle}
        >
            <style>{READER_CSS}</style>
            <a className="bim-rd-skip" href={`#${textId}`} onClick={e => {
                e.preventDefault();
                textRef.current?.focus();
                textRef.current?.scrollIntoView?.({ block: 'start' });
            }}>{t('reader.skipToText')}</a>

            <div className="bim-rd-bar" ref={barRef}>
                {backHref && (
                    <a className="bim-rd-back" href={backHref} aria-label={t('reader.backAria', { label: backLabel })}>
                        <span aria-hidden="true">‹</span><span className="bim-rd-tlabel" aria-hidden="true">{backLabel}</span>
                    </a>
                )}
                {(title || subtitle || byline || current) && (
                    <p className="bim-rd-ttl" style={{ margin: 0 }}>
                        {title && <b>{title}</b>}
                        {byline && <span className="bim-rd-by">{byline}</span>}
                        {current && <><span className="bim-rd-dot" aria-hidden="true" /><span className="bim-rd-cur">{current}</span></>}
                        {subtitle && <span className="bim-rd-ttl-src">{subtitle}</span>}
                    </p>
                )}
                <div className="bim-rd-tools" role="group" aria-label={t('reader.settings')}>
                    {versions && versions.length > 1 && (
                        <>
                            <label className="bim-rd-ver" title={version ? convert(readerVersionOptionLabel(version)) : undefined}>
                                <span className="bim-rd-tlabel">{t('reader.version')}</span>
                                {/* 窄屏工具条放不下版本全名：只露「版本▾」，原生下拉透明地盖在上面 */}
                                <span className="bim-rd-ver-short" aria-hidden="true">{t('reader.versionShort')}</span>
                                <select
                                    aria-label={t('reader.version')}
                                    value={versionKey ?? ''}
                                    onChange={e => changeVersion(e.target.value)}
                                >
                                    {versions.map(v => (
                                        <option key={v.key} value={v.key}>{convert(readerVersionOptionLabel(v))}</option>
                                    ))}
                                </select>
                            </label>
                            <span className="bim-rd-sep" aria-hidden="true" />
                        </>
                    )}
                    {pager && (prev || next) && (
                        /* 上一章／下一章（overview#308）：窄屏上工具条放不下，翻卷交给正文底部的翻页卡片 */
                        <span className="bim-rd-nav bim-rd-hide-narrow" role="group" aria-label={t('reader.pagerGroup', { unit: pagerUnit })}>
                            <button
                                type="button"
                                className="bim-rd-t"
                                aria-label={t('reader.prevUnit', { unit: pagerUnit })}
                                title={prev
                                    ? (typeof prev.label === 'string' && prev.label ? t('reader.prevUnitTitle', { unit: pagerUnit, label: prev.label }) : t('reader.prevUnit', { unit: pagerUnit }))
                                    : t('reader.firstUnit', { unit: pagerUnit })}
                                disabled={!prev}
                                onClick={() => prev && handleSelect(prev.key)}
                            ><IconPrev /></button>
                            <button
                                type="button"
                                className="bim-rd-t"
                                aria-label={t('reader.nextUnit', { unit: pagerUnit })}
                                title={next
                                    ? (typeof next.label === 'string' && next.label ? t('reader.nextUnitTitle', { unit: pagerUnit, label: next.label }) : t('reader.nextUnit', { unit: pagerUnit }))
                                    : t('reader.lastUnit', { unit: pagerUnit })}
                                disabled={!next}
                                onClick={() => next && handleSelect(next.key)}
                            ><IconNext /></button>
                        </span>
                    )}
                    {pager && (prev || next) && <span className="bim-rd-sep bim-rd-hide-narrow" aria-hidden="true" />}
                    <button
                        ref={tocBtnRef}
                        type="button"
                        className="bim-rd-t bim-rd-bb-dup"
                        aria-expanded={tocOpen}
                        aria-controls={tocId}
                        onClick={toggleToc}
                    >
                        <IconToc /><span className="bim-rd-tlabel">{t('reader.toc')}</span>
                    </button>
                    <button
                        type="button"
                        className="bim-rd-t bim-rd-hide-narrow"
                        aria-pressed={imgOpen}
                        onClick={() => setImgState(imgOpen ? 'closed' : 'open')}
                    >
                        <IconImage />{t('reader.images')}
                    </button>
                    <span className="bim-rd-sep" aria-hidden="true" />
                    <LocaleSwitch onSwitch={next => onPrefsChange({ scriptMode: next === 'zh-Hans' ? 'hans' : 'hant' })} />
                    <span className="bim-rd-sep" aria-hidden="true" />
                    <button
                        type="button"
                        className="bim-rd-t bim-rd-fs bim-rd-bb-dup"
                        aria-label={t('reader.fontSmaller')}
                        disabled={fs <= FONT_SIZE_STEPS[0]}
                        onClick={() => onPrefsChange({ fontSize: stepFontSize(prefs.fontSize, -1) })}
                    >A−</button>
                    <button
                        type="button"
                        className="bim-rd-t bim-rd-fs bim-rd-bb-dup"
                        aria-label={t('reader.fontLarger')}
                        disabled={fs >= FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1]}
                        onClick={() => onPrefsChange({ fontSize: stepFontSize(prefs.fontSize, 1) })}
                    >A+</button>
                    <span className="bim-rd-sep" aria-hidden="true" />
                    <button
                        ref={setBtnRef}
                        type="button"
                        className="bim-rd-t bim-rd-bb-dup"
                        aria-expanded={setOpen}
                        aria-controls={setId}
                        onClick={() => setSetOpen(o => !o)}
                    ><IconSettings /><span className="bim-rd-tlabel">{t('reader.settings')}</span></button>
                    {toolbarExtra}
                </div>
            </div>

            <div className="bim-rd-body">
                <div
                    className="bim-rd-toc"
                    id={tocId}
                    ref={tocRef}
                    role={drawer && tocOpen ? 'dialog' : undefined}
                    aria-modal={drawer && tocOpen ? true : undefined}
                    aria-label={drawer && tocOpen ? t('reader.toc') : undefined}
                    onKeyDown={e => {
                        if (!drawer || !tocOpen) return;
                        if (e.key === 'Escape') { e.stopPropagation(); closeDrawer(true); return; }
                        if (e.key === 'Tab') trapFocus(e, tocRef.current);
                    }}
                >
                    <div className="bim-rd-toc-top">
                        <div className="bim-rd-toc-head">
                            <span>{tocCaption ?? t('reader.toc')}</span>
                            {drawer && (
                                <button type="button" className="bim-rd-t" aria-label={t('reader.closeToc')} onClick={() => closeDrawer(true)}>✕</button>
                            )}
                        </div>
                        {tocHeader}
                    </div>
                    <ReaderToc items={toc} activeKey={activeKey} onSelect={handleSelect} />
                </div>
                <div className="bim-rd-scrim" aria-hidden="true" onClick={() => closeDrawer(true)} />

                <aside className="bim-rd-img" aria-label={t('reader.images')}>
                    {imgOpen && (
                        customImagePanel ? customImagePanel : (
                            <ImagePanel pages={images ?? null} loading={imagesLoading} renderOverlay={renderImageOverlay} preserveMargins={prefs.preserveMargins} />
                        )
                    )}
                </aside>

                {!showBottomBar && setOpen && (
                    <aside
                        className="bim-rd-set"
                        id={setId}
                        aria-label={t('reader.settings')}
                        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setSetOpen(false); setBtnRef.current?.focus(); } }}
                    >
                        <div className="bim-rd-sp-top">
                            <span>{t('reader.settings')}</span>
                            <button type="button" className="bim-rd-t" aria-label={t('reader.closeSettings')} onClick={() => { setSetOpen(false); setBtnRef.current?.focus(); }}>✕</button>
                        </div>
                        {settingsPanel}
                    </aside>
                )}
                <div className="bim-rd-text" id={textId} ref={textRef} tabIndex={-1} data-rail={(rail || onReportError) && !isWarpMode ? 'true' : undefined}>
                    <div className="bim-rd-col">
                        {children}
                        {versionSource && version && (version.sourceName || version.license) && (
                            <p className="bim-rd-src" data-version={version.key}>
                                {version.sourceName && (
                                    <>
                                        {t('reader.sourceLabel')}{' '}
                                        {version.sourceUrl
                                            ? <a className="bim-rd-link" href={version.sourceUrl} target="_blank" rel="noreferrer">{convert(version.sourceName)}</a>
                                            : convert(version.sourceName)}
                                    </>
                                )}
                                {version.sourceName && version.license && <span className="bim-rd-dot" />}
                                {version.license && <>{t('reader.licenseOf', { license: version.license })}</>}
                            </p>
                        )}
                        {/* 校订日期独立于版本元数据：整理本不传 version、全文关掉 versionSource，也要能显示 */}
                        {revisedAt && <p className="bim-rd-src bim-rd-rev">{t('reader.revisedAt', { date: revisedAt })}</p>}
                        {/* 右栏在 <860px 时藏起来，「报告错字」跟着没了（overview#308）：窄屏在正文末尾补一个入口，宽屏由 CSS 隐去 */}
                        {onReportError && (
                            <p className="bim-rd-src bim-rd-report-foot">
                                <button type="button" className="bim-rd-rail-report" onMouseDown={e => e.preventDefault()} onClick={reportError}>{t('reader.reportError')}</button>
                            </p>
                        )}
                        {pager && (prev || next) && (
                            <nav className="bim-rd-pager" aria-label={t('reader.pagerNav')}>
                                {prev ? (
                                    <button type="button" className="bim-rd-pg" onClick={() => handleSelect(prev.key)}>
                                        <span className="bim-rd-pgcap"><span aria-hidden="true">← </span>{t('reader.prevUnit', { unit: pagerUnit })}</span>
                                        <span className="bim-rd-pglabel">{prev.label}</span>
                                    </button>
                                ) : (
                                    <span className="bim-rd-pg bim-rd-pg-end" aria-hidden="true">← {t('reader.firstUnit', { unit: pagerUnit })}</span>
                                )}
                                {next ? (
                                    <button type="button" className="bim-rd-pg bim-rd-pg-next" onClick={() => handleSelect(next.key)}>
                                        <span className="bim-rd-pgcap">{t('reader.nextUnit', { unit: pagerUnit })}<span aria-hidden="true"> →</span></span>
                                        <span className="bim-rd-pglabel">{next.label}</span>
                                    </button>
                                ) : (
                                    <span className="bim-rd-pg bim-rd-pg-next bim-rd-pg-end" aria-hidden="true">{t('reader.lastUnit', { unit: pagerUnit })} →</span>
                                )}
                            </nav>
                        )}
                    </div>
                    {(rail || onReportError) && !isWarpMode && (
                        <aside className="bim-rd-rail" aria-label={t('reader.rail')}>
                            {rail}
                            {onReportError && (
                                <div className="bim-rd-rail-acts">
                                    {/* 按下时不抢走正文里的选区 */}
                                    <button type="button" className="bim-rd-rail-report" onMouseDown={e => e.preventDefault()} onClick={reportError}>{t('reader.reportError')}</button>
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </div>

            {showBottomBar && (
                <nav className="bim-rd-bb" aria-label={t('reader.bottomBar')}>
                    <button
                        type="button"
                        aria-expanded={tocOpen}
                        aria-controls={tocId}
                        onClick={() => { setSheet(null); toggleToc(); }}
                    ><IconToc /><span>{t('reader.tocShort')}</span></button>
                    <button
                        type="button"
                        aria-expanded={sheet === 'img'}
                        aria-haspopup="dialog"
                        onClick={e => openSheet('img', e.currentTarget)}
                    ><IconImage /><span>{t('reader.images')}</span></button>
                    <button
                        type="button"
                        aria-expanded={sheet === 'set'}
                        aria-haspopup="dialog"
                        onClick={e => openSheet('set', e.currentTarget)}
                    ><IconSettings /><span>{t('reader.settingsShort')}</span></button>
                    {onReportError && (
                        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setSheet(null); reportError(); }}>
                            <span className="bim-rd-bb-ic" aria-hidden="true">!</span><span>{t('reader.reportError')}</span>
                        </button>
                    )}
                </nav>
            )}
            {showBottomBar && sheet && (
                <>
                    <div className="bim-rd-sheet-scrim" aria-hidden="true" onClick={closeSheet} />
                    <div
                        className="bim-rd-sheet"
                        ref={sheetRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={sheet === 'img' ? t('reader.images') : t('reader.settings')}
                        onKeyDown={e => {
                            if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); return; }
                            if (e.key === 'Tab') trapFocus(e, sheetRef.current);
                        }}
                    >
                        <div className="bim-rd-sheet-head">
                            <span>{sheet === 'img' ? t('reader.images') : t('reader.settings')}</span>
                            <button type="button" className="bim-rd-t" aria-label={t('reader.close')} onClick={closeSheet}>✕</button>
                        </div>
                        {sheet === 'img' ? (
                            <div className="bim-rd-sheet-img">
                                <ImagePanel pages={images ?? null} loading={imagesLoading} renderOverlay={renderImageOverlay} preserveMargins={prefs.preserveMargins} />
                            </div>
                        ) : settingsPanel}
                    </div>
                </>
            )}
        </div>
    );
}
