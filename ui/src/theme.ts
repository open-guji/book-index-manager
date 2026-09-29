/**
 * 主题 API（宿主用）：朱砂（默认）与靛蓝，开关是 `<html data-theme="zhusha|indigo">`。
 *
 * - 值不认识（含空、被改坏）一律按朱砂，样式表里也只有 indigo 有覆盖块，所以非法值视觉上就是朱砂。
 * - 选择存 localStorage（THEME_STORAGE_KEY）；读写全包 try/catch——存储不可用（隐私窗口、被禁用）
 *   时不抛错，页面照常显示默认朱砂，只是不记住。
 * - 首屏不闪：宿主在 <head> 放 THEME_INIT_SCRIPT（自包含内联脚本），首帧前设好属性。
 */
export type ThemeName = 'zhusha' | 'indigo';

export const THEMES: { name: ThemeName; label: string }[] = [
    { name: 'zhusha', label: '朱砂' },
    { name: 'indigo', label: '靛藍' },
];

export const DEFAULT_THEME: ThemeName = 'zhusha';
export const THEME_STORAGE_KEY = 'bim-theme';

export function isThemeName(v: unknown): v is ThemeName {
    return v === 'zhusha' || v === 'indigo';
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

/** 内联在 <head> 的首屏脚本：只在存的是 indigo 时改属性，其余保持宿主 SSR 出的默认；不抛错 */
export const THEME_INIT_SCRIPT =
    `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==='indigo')document.documentElement.setAttribute('data-theme','indigo')}catch(e){}`;
