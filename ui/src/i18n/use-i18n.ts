import { useContext, useMemo } from 'react';
import { LocaleContext } from './context';
import { useConvert } from './use-convert';
import { getMessages, getT, makeT } from './translate';
import type { TFunction } from './translate';
import type { Locale, LocaleMessages } from './types';

export interface I18n {
    /** 界面固定文字：t('reader.toc')、t('detail.moreN', { n: 3 }) */
    t: TFunction;
    /** 数据文字（书名、作者、提要……）：简体模式繁→简，繁体模式原样 */
    convert: (text: string | undefined | null) => string;
    locale: Locale;
    isSimplified: boolean;
    /** 整本字典，给需要整组取值的地方（如枚举→标签表） */
    messages: LocaleMessages;
}

/**
 * 统一 i18n 入口。没包 LocaleProvider 时按繁体（与 useT / useConvert 的旧默认一致）。
 */
export function useI18n(): I18n {
    const ctx = useContext(LocaleContext);
    const { convert, locale, isSimplified } = useConvert();
    const messages = ctx?.messages ?? getMessages('zh-Hant');
    const t = useMemo(() => (ctx ? makeT(messages) : getT('zh-Hant')), [ctx, messages]);
    return useMemo(() => ({ t, convert, locale, isSimplified, messages }), [t, convert, locale, isSimplified, messages]);
}
