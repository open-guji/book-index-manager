/**
 * 无逐字格位的文本章（整理本 `JuanReading`、Markdown 文本）里的字修饰。
 *
 * 这类章的正文是普通 DOM 文字，没有「一格一个元素」。这里把渲染出的文字（忽略空白）每个字当一格，
 * anchor 为 `t:<序>:1`（与 `locate({ text })` 返回的位置记号同一形态 `t:<起>:<长>`），
 * 修饰经浏览器的 CSS Custom Highlight API 画上去——不改 DOM、不影响复制与选区。
 *
 * 支持的字段：`tone`（accent/warn/muted/add/omit）、`bg`、`fg`、`underline`、`focus`；
 * 不支持 `sub`／`insertAfter`／`title`（需要往 DOM 里加元素，这里不加）。浏览器没有 `CSS.highlights` 时整体不画。
 */
import { bim } from '../../styles/tokens';
import type { CellDecoration, ReaderCellInfo } from './plugins';

export const TEXT_TOKEN = 't:';
const WS = /\s/;
const STYLE_ID = 'bim-text-highlights';

export interface TextIndex { text: string; at: { node: Text; off: number }[] }

/** 渲染出的文字（忽略空白）与每个字符在文本节点里的位置 */
export function textIndex(root: HTMLElement): TextIndex {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest('script,style,[aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let text = '';
    const at: { node: Text; off: number }[] = [];
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const v = n.data;
        for (let i = 0; i < v.length; i++) {
            if (WS.test(v[i])) continue;
            text += v[i];
            at.push({ node: n, off: i });
        }
    }
    return { text, at };
}

/** 文本章的「格」：渲染出的每个非空白字符（按 UTF-16 单元，与 `locate({text})` 的位置记号同一口径） */
export function textCellsOf(idx: TextIndex): ReaderCellInfo[] {
    const out: ReaderCellInfo[] = [];
    for (let i = 0; i < idx.text.length; i++) out.push({ anchor: `${TEXT_TOKEN}${i}:1`, char: idx.text[i], page: 0, col: 0 });
    return out;
}

interface Hl { add(r: Range): void }
interface HlRegistry { set(name: string, h: Hl): void; delete(name: string): void }

function registry(): { reg: HlRegistry; make: (ranges: Range[]) => Hl } | null {
    const reg = (globalThis as { CSS?: { highlights?: HlRegistry } }).CSS?.highlights;
    const Ctor = (globalThis as { Highlight?: new (...r: Range[]) => Hl }).Highlight;
    if (!reg || !Ctor) return null;
    return { reg, make: (ranges) => new Ctor(...ranges) };
}

const TONE: Record<string, { bg?: string; fg?: string }> = {
    accent: { bg: bim('accent-bg') },
    warn: { bg: bim('highlight-bg') },
    muted: { fg: bim('meta-fg') },
    add: { bg: bim('check-fine-bg'), fg: bim('check-fine-fg') },
    omit: { bg: bim('danger-soft-bg'), fg: bim('danger') },
};
const UL: Record<string, string> = { solid: 'underline', dotted: 'underline dotted', dashed: 'underline dashed', wavy: 'underline wavy' };

function cssOf(d: CellDecoration): string {
    const tone = d.tone ? TONE[d.tone] : undefined;
    const bg = d.bg ?? tone?.bg ?? (d.focus ? bim('accent-bg') : undefined);
    const fg = d.fg ?? tone?.fg;
    const ul = d.underline ? UL[d.underline] : d.focus ? 'underline' : undefined;
    return [bg && `background-color:${bg}`, fg && `color:${fg}`, ul && `text-decoration:${ul}`].filter(Boolean).join(';');
}

/** 把修饰画到文本章上；返回清理函数。`decorations` 的 key 是 `t:<序>:1`（无关的 key 忽略） */
export function applyTextHighlights(
    idx: TextIndex,
    decorations: ReadonlyMap<string, CellDecoration> | undefined,
    scope: string,
): () => void {
    const r = registry();
    if (!r || !decorations || decorations.size === 0) return () => {};
    // 同样式的字归一组，再把相邻的字并成一个 Range
    const groups = new Map<string, number[]>();
    decorations.forEach((d, anchor) => {
        const m = /^t:(\d+):1$/.exec(anchor);
        if (!m) return;
        const css = cssOf(d);
        if (!css) return;
        const list = groups.get(css);
        if (list) list.push(Number(m[1])); else groups.set(css, [Number(m[1])]);
    });
    if (groups.size === 0) return () => {};
    const names: string[] = [];
    const rules: string[] = [];
    let n = 0;
    groups.forEach((indices, css) => {
        indices.sort((a, b) => a - b);
        const ranges: Range[] = [];
        let start = -1, prev = -2;
        const flush = () => {
            if (start < 0) return;
            const a = idx.at[start], b = idx.at[prev];
            if (!a || !b) return;
            // 跨文本节点的区间拆成每个节点一段，避免把中间的 DOM（按钮、脚注号）也染上
            let from = start;
            for (let i = start + 1; i <= prev + 1; i++) {
                if (i > prev || idx.at[i].node !== idx.at[from].node) {
                    const s = idx.at[from], e = idx.at[i - 1];
                    const range = document.createRange();
                    range.setStart(s.node, s.off);
                    range.setEnd(e.node, e.off + 1);
                    ranges.push(range);
                    from = i;
                }
            }
        };
        for (const i of indices) {
            if (i === prev + 1) { prev = i; continue; }
            flush();
            start = prev = i;
        }
        flush();
        const name = `bim-cd-${scope}-${n++}`;
        names.push(name);
        r.reg.set(name, r.make(ranges));
        rules.push(`::highlight(${name}){${css}}`);
    });
    const style = document.createElement('style');
    style.setAttribute('data-bim-text-highlights', scope);
    style.id = `${STYLE_ID}-${scope}`;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    return () => {
        for (const name of names) r.reg.delete(name);
        style.remove();
    };
}
