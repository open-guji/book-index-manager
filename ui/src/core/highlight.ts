/**
 * 简介搜索命中片段的高亮标记（A4，2026-09-27）。
 *
 * 用两个控制字符（而非 `<mark>` 之类的 HTML 标签）做 Meili 的
 * highlightPreTag/highlightPostTag：简介原文若恰好含 `<`/`>`，用标签直接
 * dangerouslySetInnerHTML 会被浏览器当成 HTML 解析，需要额外消毒；
 * 用不会出现在正常文本里的控制字符切分后逐段渲染，React 对文本节点天然转义，
 * 不必信任简介内容本身是安全的。
 */
export const SNIPPET_MARK_START = '\u0001';
export const SNIPPET_MARK_END = '\u0002';

export interface HighlightSegment {
    text: string;
    marked: boolean;
}

/** 把带 sentinel 标记的片段切成 { text, marked } 数组，供渲染层逐段判断要不要包 <mark>。 */
export function splitHighlightSnippet(snippet: string): HighlightSegment[] {
    const segments: HighlightSegment[] = [];
    let marked = false;
    let rest = snippet;
    while (rest.length) {
        const markerChar = marked ? SNIPPET_MARK_END : SNIPPET_MARK_START;
        const idx = rest.indexOf(markerChar);
        if (idx === -1) {
            segments.push({ text: rest, marked });
            break;
        }
        if (idx > 0) segments.push({ text: rest.slice(0, idx), marked });
        rest = rest.slice(idx + 1);
        marked = !marked;
    }
    return segments;
}
