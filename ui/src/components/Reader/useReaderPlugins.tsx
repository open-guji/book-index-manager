/**
 * 阅读器插件运行时：把 `ReaderPlugin[]` 换成 TextReader 要的几样东西
 * （设置块、工具条、浮层、字修饰、格子事件、选字浮条、`ReaderApi`）。接口说明见 `plugins.ts`。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GujiPageInfo } from '../../core/guji-pages';
import type { ReaderPrefs } from './prefs';
import type { ReaderShellPluginSetting } from './ReaderShell';
import { READER_WIDE_QUERY } from './reader-css';
import {
    mergeDecorations, safely,
    type CellDecoration, type CellHit, type ReaderApi, type ReaderCellInfo, type ReaderChapterCtx, type ReaderPlugin, type ReaderSelection, type SelectionAction,
} from './plugins';

const NO_CELLS: ReadonlyArray<ReaderCellInfo> = [];
const NO_STATE: ReadonlyMap<string, unknown> = new Map();
const SELECTION_TEXT_MAX = 500;
/** 无格位章里 `locate({text})` 返回的位置记号前缀 */
const TEXT_TOKEN = 't:';
/** 滚到文字位置时，目标上方留的空（让开吸顶的工具条） */
const SCROLL_MARGIN_TOP = 120;
const WS = /\s/;

/** 渲染出的文字（忽略空白）与每个字符在文本节点里的位置 */
function textIndex(root: HTMLElement): { text: string; at: { node: Text; off: number }[] } {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest('script,style,[aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let text = '';
    const at: { node: Text; off: number }[] = [];
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const v = n.data;
        for (let i = 0; i < v.length; i++) {
            if (WS.test(v[i])) continue;
            text += v[i];
            at.push({ node: n, off: i });
        }
    }
    return { text, at };
}

/** 在正文已渲染的文字里找第一处，返回位置记号；找不到或没有渲染为 null */
export function locateInText(root: HTMLElement | null, query: string, convert?: (s: string) => string): string | null {
    if (!root) return null;
    const text = textIndex(root).text;
    // 屏上是繁简转换后的字：先按原文找，找不到再按转换后的字找
    for (const cand of [query, convert?.(query)]) {
        const q = cand?.replace(/\s+/g, '');
        if (!q) continue;
        const i = text.indexOf(q);
        if (i >= 0) return `${TEXT_TOKEN}${i}:${q.length}`;
    }
    return null;
}

function rangeOfToken(root: HTMLElement | null, token: string): Range | null {
    const m = /^t:(\d+):(\d+)$/.exec(token);
    if (!root || !m) return null;
    const { at } = textIndex(root);
    const a = at[Number(m[1])];
    const b = at[Math.min(at.length - 1, Number(m[1]) + Number(m[2]) - 1)];
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a.node, a.off);
    r.setEnd(b.node, b.off + 1);
    return r;
}

/** 窄屏＝不满足阅读器「宽屏」断点（目录收进抽屉、设置走抽屉）。服务端与首帧按宽屏算 */
export function useReaderViewport(): 'wide' | 'narrow' {
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia(READER_WIDE_QUERY);
        const on = () => setNarrow(!mq.matches);
        on();
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, []);
    return narrow ? 'narrow' : 'wide';
}

export interface ReaderPluginRuntimeIn {
    plugins: ReadonlyArray<ReaderPlugin>;
    /** 本章上下文；目录／版本还没到手时为 null（插件不运行） */
    ctx: ReaderChapterCtx | null;
    prefs: ReaderPrefs;
    setPrefs: (patch: Partial<ReaderPrefs>) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
    convert: (s: string) => string;
    /** 本章对读页（含逐字格）；没有逐字数据为 undefined */
    pages: ReadonlyArray<GujiPageInfo> | undefined;
    /** 正文根元素：`rectOf` 在它里面按格位找字 */
    textRootRef: React.RefObject<HTMLElement | null>;
    /** 整个正文容器（无格位的文本章按它里面的文字定位） */
    shellTextRef: React.RefObject<HTMLElement | null>;
    selectedCharIds: ReadonlySet<string>;
    /** 滚到某格所在的段 */
    scrollToAnchor: (anchor: string) => void;
}

export interface ReaderPluginRuntime {
    settings: ReaderShellPluginSetting[];
    toolbar: { subtitle?: React.ReactNode; actions?: React.ReactNode };
    overlay: React.ReactNode;
    decorations: ReadonlyMap<string, CellDecoration> | undefined;
    onCellClick: (anchor: string) => void;
    onCellHover: (anchor: string | null) => void;
}

const EMPTY: ReaderPluginRuntime = {
    settings: [], toolbar: {}, overlay: null, decorations: undefined, onCellClick: () => {}, onCellHover: () => {},
};

export function useReaderPlugins(inp: ReaderPluginRuntimeIn): ReaderPluginRuntime {
    const { plugins, ctx, prefs, setPrefs, t, convert, pages, textRootRef, shellTextRef, selectedCharIds, scrollToAnchor } = inp;

    // ── onChapter：换章（含首章）取一次，结果按插件 id 存；晚到的上一章结果丢掉 ──
    const ctxKey = ctx ? `${ctx.entryId}\n${ctx.versionKey}\n${ctx.chapterKey}` : null;
    const hooksKey = plugins.filter(p => p.onChapter).map(p => p.id).join('\n');
    const latest = useRef({ plugins, ctx });
    latest.current = { plugins, ctx };
    const [chapterState, setChapterState] = useState<{ key: string | null; map: ReadonlyMap<string, unknown> }>({ key: null, map: NO_STATE });
    useEffect(() => {
        const c = latest.current.ctx;
        if (!ctxKey || !c) { setChapterState({ key: null, map: NO_STATE }); return; }
        let cancelled = false;
        setChapterState({ key: ctxKey, map: NO_STATE });
        for (const p of latest.current.plugins) {
            if (!p.onChapter) continue;
            const settle = (v: unknown) => {
                if (cancelled) return;
                setChapterState(prev => (prev.key === ctxKey ? { key: ctxKey, map: new Map(prev.map).set(p.id, v) } : prev));
            };
            const r = safely(p, 'onChapter', () => p.onChapter!(c), undefined);
            Promise.resolve(r).then(settle, e => {
                // eslint-disable-next-line no-console
                console.error(`[reader-plugin:${p.id}] onChapter 出错`, e);
            });
        }
        return () => { cancelled = true; };
    }, [ctxKey, hooksKey]);
    const stateMap = chapterState.key === ctxKey ? chapterState.map : NO_STATE;

    // ── 刷新：插件自己的状态变了，重算修饰 ──
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick(n => n + 1), []);

    // ── 本章的格（阅读顺序） ──
    const cells = useMemo<ReadonlyArray<ReaderCellInfo>>(() => {
        if (!pages || pages.length === 0 || plugins.length === 0) return NO_CELLS;
        const out: ReaderCellInfo[] = [];
        for (const p of pages) for (const col of p.columns) for (const ch of col.chars) {
            if (ch.fig) continue;
            out.push({ anchor: ch.id, char: ch.char, page: p.page, col: col.col });
        }
        return out;
    }, [pages, plugins.length]);

    const cellIndex = useMemo(() => {
        const m = new Map<string, ReaderCellInfo>();
        for (const c of cells) m.set(c.anchor, c);
        return m;
    }, [cells]);

    // ── api ──
    const rectOf = useCallback((anchor: string): DOMRect | null => {
        if (anchor.startsWith(TEXT_TOKEN)) return rangeOfToken(shellTextRef.current, anchor)?.getBoundingClientRect?.() ?? null;
        const root = textRootRef.current;
        if (!root) return null;
        const el = root.querySelector<HTMLElement>(`[data-char-id="${anchor.replace(/["\\]/g, '\\$&')}"]`);
        return el ? el.getBoundingClientRect() : null;
    }, [textRootRef, shellTextRef]);

    const locate = useCallback((q: { cp: number } | { text: string }): string | null => {
        if ('cp' in q) return cells[q.cp]?.anchor ?? null;
        if (!q.text) return null;
        if (cells.length === 0) return locateInText(shellTextRef.current, q.text, convert);
        let all = '';
        const starts: number[] = [];
        for (const c of cells) { starts.push(all.length); all += c.char; }
        const at = all.indexOf(q.text);
        if (at < 0) return null;
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; }
        return cells[lo]?.anchor ?? null;
    }, [cells, shellTextRef, convert]);

    const scrollTo = useCallback((anchor: string) => {
        if (!anchor.startsWith(TEXT_TOKEN)) { scrollToAnchor(anchor); return; }
        const r = rangeOfToken(shellTextRef.current, anchor)?.getBoundingClientRect?.();
        if (r) window.scrollTo({ top: window.scrollY + r.top - SCROLL_MARGIN_TOP, behavior: 'instant' as ScrollBehavior });
    }, [scrollToAnchor, shellTextRef]);

    const api = useMemo<ReaderApi | null>(() => {
        if (!ctx) return null;
        return {
            ctx,
            state: <T,>(id: string) => stateMap.get(id) as T | undefined,
            cells,
            scrollTo,
            rectOf,
            locate,
            refresh,
            prefs,
            setPref: setPrefs,
            t,
            convert,
        };
        // tick 不在 api 的字段里，但 refresh 后要让依赖 api 的修饰、设置块重算
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, stateMap, cells, scrollTo, rectOf, locate, refresh, prefs, setPrefs, t, convert, tick]);

    // ── 修饰 ──
    const decorations = useMemo(() => {
        if (!api) return undefined;
        const lists: ReadonlyMap<string, CellDecoration>[] = [];
        for (const p of plugins) {
            if (!p.decorate) continue;
            const m = safely(p, 'decorate', () => p.decorate!(api), undefined);
            if (m && m.size > 0) lists.push(m);
        }
        return lists.length === 0 ? undefined : lists.length === 1 ? lists[0] : mergeDecorations(lists);
    }, [plugins, api]);

    // ── 格子事件 ──
    const hitOf = useCallback((anchor: string): CellHit => ({ anchor, char: cellIndex.get(anchor)?.char ?? '', rect: rectOf(anchor) }), [cellIndex, rectOf]);
    const onCellClick = useCallback((anchor: string) => {
        if (!api) return;
        const hit = hitOf(anchor);
        for (const p of plugins) if (p.onCell?.click) safely(p, 'onCell.click', () => p.onCell!.click!(hit, api), undefined);
    }, [api, plugins, hitOf]);
    const onCellHover = useCallback((anchor: string | null) => {
        if (!api) return;
        const hit = anchor ? hitOf(anchor) : null;
        for (const p of plugins) if (p.onCell?.hover) safely(p, 'onCell.hover', () => p.onCell!.hover!(hit, api), undefined);
    }, [api, plugins, hitOf]);

    // ── 选字浮条 ──
    const selectionActions = useMemo<SelectionAction[]>(() => {
        if (!api || selectedCharIds.size === 0 || !plugins.some(p => p.selectionActions)) return [];
        const anchors: string[] = [];
        let text = '';
        for (const c of cells) if (selectedCharIds.has(c.anchor)) { anchors.push(c.anchor); if (text.length < SELECTION_TEXT_MAX) text += c.char; }
        if (anchors.length === 0) return [];
        const sel: ReaderSelection = { anchors, text: text.slice(0, SELECTION_TEXT_MAX), rect: rectOf(anchors[anchors.length - 1]) };
        return plugins.flatMap(p => (p.selectionActions ? safely(p, 'selectionActions', () => p.selectionActions!(sel, api), []) : []));
    }, [api, plugins, selectedCharIds, cells, rectOf]);

    // ── 设置块、工具条、浮层 ──
    const settings = useMemo<ReaderShellPluginSetting[]>(() => {
        if (!api) return [];
        return plugins
            .filter(p => p.settings)
            .map((p, i) => ({ p, i, order: p.settings!.order ?? 100 }))
            .sort((a, b) => a.order - b.order || a.i - b.i)
            .map(({ p }) => ({
                key: p.id,
                group: p.settings!.group,
                title: p.settings!.title,
                node: safely(p, 'settings.render', () => p.settings!.render(api), null),
            }));
    }, [plugins, api]);

    const toolbar = useMemo(() => {
        if (!api) return {};
        const pick = (slot: 'subtitle' | 'actions') => {
            const items = plugins
                .filter(p => p.toolbar?.slot === slot)
                .map((p, i) => ({ p, i, order: p.toolbar!.order ?? 100 }))
                .sort((a, b) => a.order - b.order || a.i - b.i)
                .map(({ p }) => <React.Fragment key={p.id}>{safely(p, 'toolbar.render', () => p.toolbar!.render(api), null)}</React.Fragment>);
            return items.length > 0 ? <>{items}</> : undefined;
        };
        return { subtitle: pick('subtitle'), actions: pick('actions') };
    }, [plugins, api]);

    const overlay = useMemo<React.ReactNode>(() => {
        if (!api) return null;
        const nodes = plugins
            .filter(p => p.overlay)
            .map(p => <React.Fragment key={p.id}>{safely(p, 'overlay', () => p.overlay!(api), null)}</React.Fragment>);
        if (nodes.length === 0 && selectionActions.length === 0) return null;
        return (
            <>
                {nodes}
                {selectionActions.length > 0 && (
                    <div className="bim-rd-selbar" role="toolbar" aria-label={t('reader.selectionActions')} data-testid="reader-selbar">
                        {selectionActions.map(a => (
                            <button key={a.key} type="button" title={a.title} onClick={a.onClick}>{a.label}</button>
                        ))}
                    </div>
                )}
            </>
        );
    }, [plugins, api, selectionActions, t]);

    if (plugins.length === 0) return EMPTY;
    return { settings, toolbar, overlay, decorations, onCellClick, onCellHover };
}
