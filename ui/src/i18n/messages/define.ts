/**
 * 按区域分的界面文字字典。
 *
 * 每个区域一个文件，繁体、简体并排写在一起：
 *
 *     export const reader = defineMessages({
 *         toc: '目錄',
 *         chapterOf: '第 {n} 章',
 *     }, {
 *         toc: '目录',
 *         chapterOf: '第 {n} 章',
 *     });
 *
 * - 第一栏是繁体（数据原文的写法，也是没包 LocaleProvider 时的默认），类型从它推出；
 * - 第二栏是简体，键必须和繁体一一对应（少键、多键 tsc 报错）；
 * - 第三栏留给英文，可只写一部分，缺的键回落到繁体。
 * - 插值写 {name}，t('reader.chapterOf', { n: 3 })。
 */

/** 把字面量类型放宽成 string，用来约束简体／英文栏与繁体同形 */
export type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

export interface MessageSet<T> {
    'zh-Hant': T;
    'zh-Hans': Shape<T>;
    en?: DeepPartial<T>;
}

export function defineMessages<T extends Record<string, unknown>>(
    hant: T,
    hans: NoInfer<Shape<T>>,
    en?: NoInfer<DeepPartial<T>>,
): MessageSet<Shape<T>> {
    return { 'zh-Hant': hant as Shape<T>, 'zh-Hans': hans, ...(en ? { en } : {}) } as MessageSet<Shape<T>>;
}
