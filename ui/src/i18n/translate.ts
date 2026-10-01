/**
 * 统一的界面文字入口（overview#337）。
 *
 * - 组件里：const { t, convert } = useI18n(); t('reader.toc')、t('detail.moreN', { n: 3 })
 * - 组件外（服务端 <title>、meta 等）：getT(locale)('home.title')
 *
 * 界面固定文字一律走 t(key)；书名、作者、提要等数据文字走 convert（见 use-convert.ts）。
 */
import type { Locale, LocaleMessages } from './types';
import { zhHant } from './locales/zh-Hant';
import { zhHans } from './locales/zh-Hans';
import { namespaceMessages } from './messages';
import { formatTemplate } from './helpers';

/** LocaleMessages 里所有字符串叶子的点路径，如 'reader.toc' */
type Leaves<T, P extends string = ''> = {
    [K in keyof T & string]: T[K] extends string
        ? `${P}${K}`
        : T[K] extends Record<string, unknown> ? Leaves<T[K], `${P}${K}.`> : never;
}[keyof T & string];

export type MessageKey = Leaves<LocaleMessages>;

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

const CACHE = new Map<Locale, LocaleMessages>();

/** 某语言的整本字典（早期整块字典 + 各区域字典），模块级缓存 */
export function getMessages(locale: Locale): LocaleMessages {
    let m = CACHE.get(locale);
    if (!m) {
        const core = locale === 'zh-Hans' ? zhHans : zhHant;
        m = { ...core, ...namespaceMessages(locale) } as LocaleMessages;
        CACHE.set(locale, m);
    }
    return m;
}

function lookup(messages: unknown, key: string): string | undefined {
    let cur: unknown = messages;
    for (const part of key.split('.')) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return typeof cur === 'string' ? cur : undefined;
}

/** 由字典造 t()：当前语言找不到的键回落到繁体，再找不到原样返回键名（便于发现漏登记） */
export function makeT(messages: LocaleMessages): TFunction {
    return (key, vars) => {
        const s = lookup(messages, key) ?? lookup(getMessages('zh-Hant'), key) ?? key;
        return vars ? formatTemplate(s, vars) : s;
    };
}

const T_CACHE = new Map<Locale, TFunction>();

/** 组件外取 t()：服务端渲染 <title>、meta 描述等用 */
export function getT(locale: Locale): TFunction {
    let t = T_CACHE.get(locale);
    if (!t) {
        t = makeT(getMessages(locale));
        T_CACHE.set(locale, t);
    }
    return t;
}
