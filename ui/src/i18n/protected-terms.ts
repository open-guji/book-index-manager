/**
 * 繁→简转换的「保护表」：表里的词整词原样保留，不交给 OpenCC。
 *
 * 为什么要有：OpenCC 的 t2cn 按字/词典转换，人名、专名里的生僻字会被误转，
 * 例如「曹霑」（曹雪芹本名）→「曹沾」，简体模式下就成了另一个人。
 *
 * 怎么加：往 PROTECTED_TERMS 里追加一行字符串即可（写繁体原文，即数据里的写法）。
 * 不需要改别处；长词优先匹配，所以「曹霑」和「曹霑之」这样的包含关系不用排顺序。
 * 每个新词都请在 tests/unit/protected-terms.test.ts 的用例表里补一条。
 */
export const PROTECTED_TERMS: readonly string[] = [
    '曹霑',
];

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 给底层转换函数套一层保护：保护词原样输出，其余片段照常转换。
 * terms 为空时直接返回原函数。
 */
export function withProtectedTerms(
    convert: (text: string) => string,
    terms: readonly string[] = PROTECTED_TERMS,
): (text: string) => string {
    const list = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!list.length) return convert;
    const re = new RegExp(`(${list.map(escapeRegExp).join('|')})`, 'g');
    const set = new Set(list);
    return (text: string) => {
        if (!text) return convert(text);
        const parts = text.split(re);
        if (parts.length === 1) return convert(text);
        // split 带捕获组：奇数下标就是保护词
        return parts.map((p, i) => (i % 2 === 1 && set.has(p) ? p : (p ? convert(p) : p))).join('');
    };
}
