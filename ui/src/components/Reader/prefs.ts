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

export interface ReaderPrefs {
    /** 正文字号（px）；null = 默认 18（宽窄屏一致，2026-09-28 定：宋体 18px、行高 2.05） */
    fontSize: number | null;
    /** 条目分行（现状）／自然段 */
    readingMode: ReadingMode;
    /** 专名线（书名加波浪线） */
    properNames: boolean;
    /** 横排／竖排（竖排预留） */
    writingMode: ReaderWritingMode;
    /** 条目标题旁标出「作品 →」链接（阅读页 v3「标出作品链接」，默认开） */
    workLinks: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
    fontSize: null,
    readingMode: 'line',
    properNames: false,
    writingMode: 'horizontal',
    workLinks: true,
};

/** 旧版可选字号档位（A−／A+ 多档）。仍保留：老用户存下的值落在这里面，读到时映射到三档 */
export const FONT_SIZE_STEPS = [15, 16, 17, 18, 20, 22, 24] as const;
export const DEFAULT_FONT_SIZE = 18;

/**
 * 字号三档（v3 设计稿「小／中／大」）。设计稿是 16／17.5／19.5；「中」取 18＝2026-09-28 用户定的默认字号
 * （测试钉着 18px），小、大各差 2px。三档的值都在 FONT_SIZE_STEPS 里。
 */
export const FONT_SIZE_TIERS = [
    { key: 's', label: '小', px: 16 },
    { key: 'm', label: '中', px: DEFAULT_FONT_SIZE },
    { key: 'l', label: '大', px: 20 },
] as const;

/** 任意字号 → 最近一档（等距取「中」，不让老用户的选择失效） */
export function nearestFontTier(px: number | null): (typeof FONT_SIZE_TIERS)[number] {
    const cur = px ?? DEFAULT_FONT_SIZE;
    let best: (typeof FONT_SIZE_TIERS)[number] = FONT_SIZE_TIERS[1];
    let bd = Math.abs(cur - best.px);
    for (const t of FONT_SIZE_TIERS) {
        const d = Math.abs(cur - t.px);
        if (d < bd) { best = t; bd = d; }
    }
    return best;
}

const STORAGE_KEY = 'bim-reader-prefs';
/** W7 草稿用过的键；读到就迁过来，只读不写 */
const LEGACY_MODE_KEY = 'bim-reading-mode';

export function loadReaderPrefs(): ReaderPrefs {
    const out: ReaderPrefs = { ...DEFAULT_READER_PREFS };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const p = raw ? JSON.parse(raw) as Partial<ReaderPrefs> : {};
        if (typeof p.fontSize === 'number' && (FONT_SIZE_STEPS as readonly number[]).includes(p.fontSize)) {
            // 老档位（15/17/22/24…）映射到最近一档；「中」存成 null（＝默认）
            const tier = nearestFontTier(p.fontSize);
            out.fontSize = tier.key === 'm' ? null : tier.px;
        }
        const mode = p.readingMode ?? localStorage.getItem(LEGACY_MODE_KEY);
        if (mode === 'paragraph') out.readingMode = 'paragraph';
        if (p.properNames === true) out.properNames = true;
        if (p.writingMode === 'vertical') out.writingMode = 'vertical';
        if (p.workLinks === false) out.workLinks = false;
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
