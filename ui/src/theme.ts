/**
 * 外观 API（宿主用）——配色（主题）与版式两个维度，v4（overview#291）：
 *   - 配色：朱砂（默认）／靛青／墨，开关是 `<html data-theme="zhusha|indigo|ink">`；
 *   - 版式：疏朗（默认）／界栏，开关是 `<html data-layout="airy|boxed">`。
 * 6 种组合。默认＝朱砂＋疏朗＝不设属性时的样子。
 *
 * - 值不认识（含空、被改坏）一律按朱砂，样式表里也只有 indigo 有覆盖块，所以非法值视觉上就是朱砂。
 * - 选择存 localStorage（THEME_STORAGE_KEY）；读写全包 try/catch——存储不可用（隐私窗口、被禁用）
 *   时不抛错，页面照常显示默认朱砂，只是不记住。
 * - 首屏不闪：宿主在 <head> 放 THEME_INIT_SCRIPT（自包含内联脚本），首帧前设好属性。
 */
export type ThemeName = 'zhusha' | 'indigo' | 'ink';

export const THEMES: { name: ThemeName; label: string }[] = [
    { name: 'zhusha', label: '朱砂' },
    { name: 'indigo', label: '靛青' },
    { name: 'ink', label: '墨' },
];

export const DEFAULT_THEME: ThemeName = 'zhusha';
export const THEME_STORAGE_KEY = 'bim-theme';

export function isThemeName(v: unknown): v is ThemeName {
    return v === 'zhusha' || v === 'indigo' || v === 'ink';
}

/** 任意值 → 合法主题名，非法回退默认 */
export function normalizeTheme(v: unknown): ThemeName {
    return isThemeName(v) ? v : DEFAULT_THEME;
}

export function readStoredTheme(): ThemeName {
    try {
        return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
        return DEFAULT_THEME;
    }
}

export function storeTheme(theme: ThemeName): void {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        /* 存不了就只在本页生效 */
    }
}

/** 写到 <html data-theme>；非法值按默认 */
export function applyTheme(theme: unknown): ThemeName {
    const t = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', t);
    return t;
}

/** 当前 <html> 上生效的主题（客户端）；属性缺失或非法 = 默认 */
export function currentTheme(): ThemeName {
    return normalizeTheme(document.documentElement.getAttribute('data-theme'));
}

// ── 版式 ──

export type LayoutName = 'airy' | 'boxed';

export const LAYOUTS: { name: LayoutName; label: string; hint: string }[] = [
    { name: 'airy', label: '疏朗', hint: '留白分区' },
    { name: 'boxed', label: '界欄', hint: '框線分區' },
];

export const DEFAULT_LAYOUT: LayoutName = 'airy';
export const LAYOUT_STORAGE_KEY = 'bim-layout';

export function isLayoutName(v: unknown): v is LayoutName {
    return v === 'airy' || v === 'boxed';
}

/** 任意值 → 合法版式名，非法回退默认 */
export function normalizeLayout(v: unknown): LayoutName {
    return isLayoutName(v) ? v : DEFAULT_LAYOUT;
}

export function readStoredLayout(): LayoutName {
    try {
        return normalizeLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY));
    } catch {
        return DEFAULT_LAYOUT;
    }
}

export function storeLayout(layout: LayoutName): void {
    try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
    } catch {
        /* 存不了就只在本页生效 */
    }
}

/** 写到 <html data-layout>；非法值按默认 */
export function applyLayout(layout: unknown): LayoutName {
    const l = normalizeLayout(layout);
    document.documentElement.setAttribute('data-layout', l);
    return l;
}

/** 当前 <html> 上生效的版式（客户端）；属性缺失或非法 = 默认 */
export function currentLayout(): LayoutName {
    return normalizeLayout(document.documentElement.getAttribute('data-layout'));
}

/**
 * 内联在 <head> 的首屏脚本：存的是 indigo／ink 才改 data-theme、存的是 boxed 才改 data-layout，
 * 其余保持宿主 SSR 出的默认；不抛错。老用户存的 `zhusha`／`indigo` 仍然有效，无需迁移。
 */
export const THEME_INIT_SCRIPT =
    `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='indigo'||t==='ink')document.documentElement.setAttribute('data-theme',t);`
    + `if(localStorage.getItem(${JSON.stringify(LAYOUT_STORAGE_KEY)})==='boxed')document.documentElement.setAttribute('data-layout','boxed')}catch(e){}`;
