import { useContext } from 'react';
import { LocaleContext } from './context';
import { zhHant } from './locales/zh-Hant';
import type { LocaleMessages } from './types';

/**
 * 获取 UI 翻译消息
 * 未包裹 LocaleProvider 时默认返回繁体
 */
export function useT(): LocaleMessages {
    const ctx = useContext(LocaleContext);
    return ctx?.messages ?? zhHant;
}
