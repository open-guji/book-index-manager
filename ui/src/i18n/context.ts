import { createContext } from 'react';
import type { Locale, LocaleMessages } from './types';

export interface LocaleContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    messages: LocaleMessages;
    /** opencc-js 转换函数（繁→简），繁体模式时为 null */
    converter: ((text: string) => string) | null;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);
