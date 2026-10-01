import { useContext } from 'react';
import { LocaleContext } from './context';
import { getMessages } from './translate';
import type { LocaleMessages } from './types';

/**
 * 获取 UI 翻译消息（整本字典）。新代码请用 useI18n().t(key)
 * 未包裹 LocaleProvider 时默认返回繁体
 */
export function useT(): LocaleMessages {
    const ctx = useContext(LocaleContext);
    return ctx?.messages ?? getMessages('zh-Hant');
}
