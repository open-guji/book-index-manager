import { useContext, useCallback, useRef, useMemo } from 'react';
import { LocaleContext } from './context';
import type { Locale } from './types';

interface ConvertResult {
    /** 转换单个字符串（繁→简或原样返回） */
    convert: (text: string | undefined | null) => string;
    /** 当前 locale */
    locale: Locale;
    /** 是否处于简体模式 */
    isSimplified: boolean;
}

const MAX_CACHE_SIZE = 2000;

/**
 * 古籍内容繁简转换 hook
 * 繁体模式下原样返回，简体模式下通过 opencc-js 转换
 * 内置 LRU 缓存
 */
export function useConvert(): ConvertResult {
    const ctx = useContext(LocaleContext);
    const locale = ctx?.locale ?? 'zh-Hant';
    const converter = ctx?.converter ?? null;

    const cacheRef = useRef(new Map<string, string>());
    const cacheLocaleRef = useRef(locale);

    // locale 变化时清缓存
    if (cacheLocaleRef.current !== locale) {
        cacheRef.current.clear();
        cacheLocaleRef.current = locale;
    }

    const convert = useCallback((text: string | undefined | null): string => {
        if (!text) return '';
        if (!converter) return text;

        const cached = cacheRef.current.get(text);
        if (cached !== undefined) return cached;

        const result = converter(text);

        if (cacheRef.current.size >= MAX_CACHE_SIZE) {
            const firstKey = cacheRef.current.keys().next().value;
            if (firstKey !== undefined) cacheRef.current.delete(firstKey);
        }
        cacheRef.current.set(text, result);
        return result;
    }, [converter]);

    return useMemo(() => ({
        convert,
        locale,
        isSimplified: locale === 'zh-Hans',
    }), [convert, locale]);
}
