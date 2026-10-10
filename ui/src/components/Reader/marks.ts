/** 阅读器里标点符号的写法：引号样式、是否隐去书名号（纯函数，不接渲染） */
export type QuoteStyle = 'modern' | 'classic' | 'original';

export interface MarkOpts {
    quoteStyle: QuoteStyle;
    hideBookBrackets?: boolean;
}

const TO_MODERN: Record<string, string> = { '「': '“', '」': '”', '『': '‘', '』': '’' };
const TO_CLASSIC: Record<string, string> = { '“': '「', '”': '」', '‘': '『', '’': '』' };
const BOOK_BRACKETS = new Set(['《', '》', '〈', '〉']);

/** 逐字符转换标点：`original` 不动引号；`modern` 用 “” ‘’；`classic` 用 「」『』；其它字符原样。 */
export function transformMark(mark: string, opts: MarkOpts): string {
    const map = opts.quoteStyle === 'modern' ? TO_MODERN : opts.quoteStyle === 'classic' ? TO_CLASSIC : null;
    let out = '';
    for (const ch of mark) {
        if (opts.hideBookBrackets && BOOK_BRACKETS.has(ch)) continue;
        out += map?.[ch] ?? ch;
    }
    return out;
}
