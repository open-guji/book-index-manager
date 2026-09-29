import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LocaleContext, type LocaleContextValue } from './context';
import type { Locale } from './types';
import { zhHant } from './locales/zh-Hant';
import { zhHans } from './locales/zh-Hans';
import type { LocaleMessages } from './types';
import { getSimplifiedConverter } from './simplified-converter';

const MESSAGES: Record<Locale, LocaleMessages> = {
    'zh-Hant': zhHant,
    'zh-Hans': zhHans,
};

const LOCALE_STORAGE_KEY = 'bim-locale';

function loadLocale(): Locale | undefined {
    try {
        const v = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (v === 'zh-Hant' || v === 'zh-Hans') return v;
    } catch { /* SSR / 无权限 */ }
    return undefined;
}

function saveLocale(locale: Locale) {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* ignore */ }
}

export interface LocaleProviderProps {
    /** 受控模式：由外部控制 locale */
    locale?: Locale;
    /** locale 变化回调 */
    onLocaleChange?: (locale: Locale) => void;
    /**
     * 可选：注入自己的同步繁→简转换函数（替换内置的 opencc-js t2cn + 保护表）。
     * 不传就用内置的。
     */
    converter?: (text: string) => string;
    children: React.ReactNode;
}

const DEFAULT_LOCALE: Locale = 'zh-Hans';

export const LocaleProvider: React.FC<LocaleProviderProps> = ({
    locale: controlledLocale,
    onLocaleChange,
    converter: converterProp,
    children,
}) => {
    // SSR 安全：初始渲染始终用默认值，mount 后再从 localStorage 读取
    const [internalLocale, setInternalLocale] = useState<Locale>(controlledLocale ?? DEFAULT_LOCALE);
    const locale = controlledLocale ?? internalLocale;

    // mount 后从 localStorage 恢复用户偏好
    useEffect(() => {
        if (controlledLocale) return;
        const stored = loadLocale();
        if (stored && stored !== internalLocale) {
            setInternalLocale(stored);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /*
     * 繁→简转换函数：**同步**给出，不再在 effect 里动态 import。
     * 原先服务端渲染和客户端首帧的 converter 都是 null，数据文字（出处名等）首屏是繁体，
     * 模块到了才转成简体，而界面文案（messages）首屏就是简体——同页繁简混杂（overview#268）。
     * 现在服务端和客户端首帧用同一个同步 converter，HTML 一致、水合不报不一致。
     */
    const converter = useMemo(
        () => (locale === 'zh-Hans' ? (converterProp ?? getSimplifiedConverter()) : null),
        [locale, converterProp],
    );

    const setLocale = useCallback((newLocale: Locale) => {
        setInternalLocale(newLocale);
        saveLocale(newLocale);
        onLocaleChange?.(newLocale);
    }, [onLocaleChange]);

    const value = useMemo<LocaleContextValue>(() => ({
        locale,
        setLocale,
        messages: MESSAGES[locale],
        converter,
    }), [locale, setLocale, converter]);

    return (
        <LocaleContext.Provider value={value}>
            {children}
        </LocaleContext.Provider>
    );
};
