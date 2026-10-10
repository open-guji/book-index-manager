/**
 * 阅读偏好：字号、条目分行／自然段、专名线、横竖排。
 *
 * 存 localStorage（键 `bim-reader-prefs`，读写都包 try/catch——隐私窗口、
 * 禁用存储时照常可用，只是不记住）。首帧一律用默认值，挂载后再读存储，
 * 保证 Next.js 服务端渲染的 HTML 与客户端首帧一致。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReadingMode } from '../../core/paragraphize';
import type { ProperNameMode } from '../../core/entity-annotations';
import type { ReaderWritingMode } from './types';
import type { QuoteStyle } from './marks';

export type { ProperNameMode, QuoteStyle };

export type ReaderFontFamily = 'song' | 'kai' | 'system';

/** 书名标法：波浪线／书名号 */
export type BookTitleStyle = 'wavy' | 'bracket';
/** 字形：原字（不转换，保留异体字）／通行繁体（异体归一）／简体；null = 跟站点繁简 */
export type ReaderScriptMode = 'orig' | 'hant' | 'hans';

/** 专名号是否画（lite、full 都画；lite 只画人名、地名、朝代，由 `filterEntitiesByMode` 筛实体）；null＝没选过，调用方自己按本章实体数决定 */
export function properNamesOn(mode: ProperNameMode | null | undefined): boolean {
    return mode === 'lite' || mode === 'full';
}

/** 画面上的页指示三角位置（视口高度比例）的允许范围 */
export const PAGE_INDICATOR_Y_RANGE = [0.1, 0.9] as const;

/** 字体选项与字体栈；`song` 不覆盖，沿用站点的 --bim-font-reading */
export const READER_FONT_FAMILIES: ReadonlyArray<{ key: ReaderFontFamily; stack: string | null }> = [
    { key: 'song', stack: null },
    { key: 'kai', stack: '"Kaiti SC", "Kaiti TC", STKaiti, "KaiTi", "AR PL UKai CN", "Noto Serif CJK SC", serif' },
    { key: 'system', stack: 'var(--bim-font-ui)' },
];

export function readerFontStack(key: ReaderFontFamily): string | null {
    return READER_FONT_FAMILIES.find(f => f.key === key)?.stack ?? null;
}

export interface ReaderPrefs {
    /** 正文字号（px）；null = 默认 18（宽窄屏一致，2026-09-28 定：宋体 18px、行高 2.05） */
    fontSize: number | null;
    /** 条目分行（现状）／自然段 */
    readingMode: ReadingMode;
    /**
     * 专名号档位。null = 用户没选过：有专名层数据的章默认 full、没有的默认 off
     * （由 TextReader 按本章实体数决定）；用户选过后存 off／lite／full，以后一律照用户的。
     * 旧存档的 `properNames: boolean|null` 读入时迁到这里（true→full，false→off），写回只写新键。
     */
    properNameMode: ProperNameMode | null;
    /** 横排／竖排（竖排预留） */
    writingMode: ReaderWritingMode;
    /** 正文字体：宋体（默认，沿用 --bim-font-reading）／楷体／系统默认（无衬线）；只用系统已装字体，不加载网络字体 */
    fontFamily: ReaderFontFamily;
    /** 条目标题旁标出「作品 →」链接（阅读页 v3「标出作品链接」，默认开） */
    workLinks: boolean;
    /** 对读正文是否显示分叶分割线；关＝连续阅读（L1 接线） */
    pageBreaks: boolean;
    /** 图文对照的页指示三角在视口高度的位置，0.1–0.9（L1 接线） */
    pageIndicatorY: number;
    /** 书名标法：波浪线／书名号（L1／L3 接线） */
    bookTitleStyle: BookTitleStyle;
    /** 书名是否标注（独立于专名号档） */
    showWorks: boolean;
    /** 引号样式（后续道接线） */
    quoteStyle: QuoteStyle;
    /** 字形；null = 跟站点繁简（L5 接线） */
    scriptMode: ReaderScriptMode | null;
    /** 书影保留空白（L2 接线） */
    preserveMargins: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
    fontSize: null,
    readingMode: 'line',
    properNameMode: null,
    writingMode: 'horizontal',
    workLinks: true,
    fontFamily: 'song',
    pageBreaks: true,
    pageIndicatorY: 0.33,
    bookTitleStyle: 'wavy',
    showWorks: true,
    quoteStyle: 'original',
    scriptMode: null,
    preserveMargins: true,
};

/** 可选字号档位；默认 18 在中间偏下 */
export const FONT_SIZE_STEPS = [15, 16, 17, 18, 20, 22, 24] as const;
export const DEFAULT_FONT_SIZE = 18;

const STORAGE_KEY = 'bim-reader-prefs';
/** W7 草稿用过的键；读到就迁过来，只读不写 */
const LEGACY_MODE_KEY = 'bim-reading-mode';

export function loadReaderPrefs(): ReaderPrefs {
    const out: ReaderPrefs = { ...DEFAULT_READER_PREFS };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const p = (raw ? JSON.parse(raw) : {}) as Partial<ReaderPrefs> & { properNames?: unknown };
        if (typeof p.fontSize === 'number' && (FONT_SIZE_STEPS as readonly number[]).includes(p.fontSize)) out.fontSize = p.fontSize;
        const mode = p.readingMode ?? localStorage.getItem(LEGACY_MODE_KEY);
        if (mode === 'paragraph') out.readingMode = 'paragraph';
        // 旧键 properNames（boolean）迁到 properNameMode；新键优先，非法值回默认（null＝没选过）
        if (p.properNameMode === 'off' || p.properNameMode === 'lite' || p.properNameMode === 'full') out.properNameMode = p.properNameMode;
        else if (p.properNames === true) out.properNameMode = 'full';
        else if (p.properNames === false) out.properNameMode = 'off';
        if (p.writingMode === 'vertical') out.writingMode = 'vertical';
        if (p.workLinks === false) out.workLinks = false;
        if (p.fontFamily === 'kai' || p.fontFamily === 'system') out.fontFamily = p.fontFamily;
        if (p.pageBreaks === false) out.pageBreaks = false;
        if (typeof p.pageIndicatorY === 'number' && Number.isFinite(p.pageIndicatorY)
            && p.pageIndicatorY >= PAGE_INDICATOR_Y_RANGE[0] && p.pageIndicatorY <= PAGE_INDICATOR_Y_RANGE[1]) out.pageIndicatorY = p.pageIndicatorY;
        if (p.bookTitleStyle === 'bracket') out.bookTitleStyle = 'bracket';
        if (p.showWorks === false) out.showWorks = false;
        if (p.quoteStyle === 'modern' || p.quoteStyle === 'classic') out.quoteStyle = p.quoteStyle;
        if (p.scriptMode === 'orig' || p.scriptMode === 'hant' || p.scriptMode === 'hans') out.scriptMode = p.scriptMode;
        if (p.preserveMargins === false) out.preserveMargins = false;
    } catch { /* 存储不可用：用默认值 */ }
    return out;
}

export function saveReaderPrefs(p: ReaderPrefs): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch { /* ignore */ }
}

/** 按档位放大／缩小；到头就停 */
export function stepFontSize(current: number | null, dir: 1 | -1): number {
    const cur = current ?? DEFAULT_FONT_SIZE;
    const steps = FONT_SIZE_STEPS as readonly number[];
    let i = steps.indexOf(cur);
    if (i < 0) i = steps.indexOf(DEFAULT_FONT_SIZE);
    return steps[Math.max(0, Math.min(steps.length - 1, i + dir))];
}

export function useReaderPrefs(): [ReaderPrefs, (patch: Partial<ReaderPrefs>) => void] {
    const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
    useEffect(() => { setPrefs(loadReaderPrefs()); }, []);
    const update = useCallback((patch: Partial<ReaderPrefs>) => {
        setPrefs(prev => {
            const next = { ...prev, ...patch };
            saveReaderPrefs(next);
            return next;
        });
    }, []);
    return [prefs, update];
}
