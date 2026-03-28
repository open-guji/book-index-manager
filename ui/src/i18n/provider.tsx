import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LocaleContext, type LocaleContextValue } from './context';
import type { Locale } from './types';
import { zhHant } from './locales/zh-Hant';
import { zhHans } from './locales/zh-Hans';
import type { LocaleMessages } from './types';

const MESSAGES: Record<Locale, LocaleMessages> = {
    'zh-Hant': zhHant,
    'zh-Hans': zhHans,
};

export interface LocaleProviderProps {
    /** 受控模式：由外部控制 locale */
    locale?: Locale;
    /** locale 变化回调 */
    onLocaleChange?: (locale: Locale) => void;
    children: React.ReactNode;
}

export const LocaleProvider: React.FC<LocaleProviderProps> = ({
    locale: controlledLocale,
    onLocaleChange,
    children,
}) => {
    const [internalLocale, setInternalLocale] = useState<Locale>(controlledLocale ?? 'zh-Hant');
    const locale = controlledLocale ?? internalLocale;

    // 延迟加载 opencc-js converter
    const [converter, setConverter] = useState<((text: string) => string) | null>(null);

    useEffect(() => {
        if (locale === 'zh-Hans') {
            import('opencc-js/t2cn').then((mod) => {
                const conv = mod.Converter({ from: 'tw', to: 'cn' });
                setConverter(() => conv);
            }).catch(() => {
                // opencc-js 不可用时，原样返回
                setConverter(() => (text: string) => text);
            });
        } else {
            setConverter(null);
        }
    }, [locale]);

    const setLocale = useCallback((newLocale: Locale) => {
        setInternalLocale(newLocale);
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
