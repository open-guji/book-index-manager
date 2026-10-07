/**
 * 阅读偏好：字号、条目分行／自然段、专名线、横竖排。
 *
 * 存 localStorage（键 `bim-reader-prefs`，读写都包 try/catch——隐私窗口、
 * 禁用存储时照常可用，只是不记住）。首帧一律用默认值，挂载后再读存储，
 * 保证 Next.js 服务端渲染的 HTML 与客户端首帧一致。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReadingMode } from '../../core/paragraphize';
import type { ReaderWritingMode } from './types';

export type ReaderFontFamily = 'song' | 'kai' | 'system';

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
    /** 专名线（书名加波浪线） */
    properNames: boolean;
    /** 横排／竖排（竖排预留） */
    writingMode: ReaderWritingMode;
    /** 正文字体：宋体（默认，沿用 --bim-font-reading）／楷体／系统默认（无衬线）；只用系统已装字体，不加载网络字体 */
    fontFamily: ReaderFontFamily;
    /** 条目标题旁标出「作品 →」链接（阅读页 v3「标出作品链接」，默认开） */
    workLinks: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
    fontSize: null,
    readingMode: 'line',
    properNames: false,
    writingMode: 'horizontal',
    workLinks: true,
    fontFamily: 'song',
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
        const p = raw ? JSON.parse(raw) as Partial<ReaderPrefs> : {};
        if (typeof p.fontSize === 'number' && (FONT_SIZE_STEPS as readonly number[]).includes(p.fontSize)) out.fontSize = p.fontSize;
        const mode = p.readingMode ?? localStorage.getItem(LEGACY_MODE_KEY);
        if (mode === 'paragraph') out.readingMode = 'paragraph';
        if (p.properNames === true) out.properNames = true;
        if (p.writingMode === 'vertical') out.writingMode = 'vertical';
        if (p.workLinks === false) out.workLinks = false;
        if (p.fontFamily === 'kai' || p.fontFamily === 'system') out.fontFamily = p.fontFamily;
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
