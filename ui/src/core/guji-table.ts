/**
 * `:::table` 表格块解析（guji-table-v1，文本总管 T19／T22 定，用户 2026-09-27 批）。
 *
 * 写法（详见 overview `项目进展/古籍文本/整体设计/2026-09-表格记法方案.md` §二）：
 *
 * ```
 * :::table
 * ! 表头1 | 表头2 | 表头3
 * 甲 | 乙{2}
 * 丙^2 | 丁 | _
 * ^ | 戊 | 己
 * :::
 * ```
 *
 * - `!` 开头的行是表头行，`|` 分隔格子；
 * - 空格子写 `_`；
 * - 跨 n 列：`内容{n}`；跨 r 行：`内容^r`，两者可合写 `内容{n}^r`（`_` 也可带，如 `_^3`）；
 * - 被上方跨行格占住的位置写一个光秃秃的 `^`（续格），**每占一列写一个**，
 *   故每行的格数（含续格、按 colspan 计）应等于总列数；
 * - 格内夹注 `<…>`／`⟨…⟩` 原样留在 `text` 里，由渲染层交给 `renderInterlinear`。
 *
 * 只有全文 `index.json` 顶层带 `"table_notation": "guji-table-v1"` 的书才启用（见
 * `hasGujiTableNotation`）；未带标记的书一概不解析，原样渲染，零回归。
 *
 * 本模块只做纯解析，不依赖 React；解析宽容：写法有瑕疵时照样出表，另把问题记入
 * `warnings`（供校验脚本与单测用），不抛错。
 */

/** index.json 顶层 `table_notation` 的取值 */
export const GUJI_TABLE_NOTATION = 'guji-table-v1';

export interface GujiTableCell {
    /** 格内原文（已去首尾空白；空格子为 ''）；夹注记号原样保留 */
    text: string;
    /** 源里写的是 `_`（空格子） */
    empty: boolean;
    colspan: number;
    rowspan: number;
}

export interface GujiTableRow {
    /** `!` 开头的表头行 */
    header: boolean;
    /** 实际输出的格子（不含续格 `^`） */
    cells: GujiTableCell[];
}

export interface GujiTable {
    rows: GujiTableRow[];
    /** 总列数：取各行（按 colspan、续格计）占位宽度的最大值 */
    columns: number;
    /** 写法瑕疵（行号为块内第几行，1 起，含 `:::table` 那行） */
    warnings: string[];
}

export type FullTextSegment =
    | { type: 'text'; text: string }
    | { type: 'table'; table: GujiTable; source: string };

/** 全文目录（Book／Work 皆可）是否声明了 guji-table-v1 写法 */
export function hasGujiTableNotation(index: { table_notation?: string } | null | undefined): boolean {
    return !!index && index.table_notation === GUJI_TABLE_NOTATION;
}

import { matchZi } from './guji-inline';

const OPEN_RE = /^:::table(?:\{[^}]*\})?[ \t]*$/;
const CLOSE_RE = /^:::[ \t]*$/;

/**
 * 按 `|` 切格，但不切夹注 `<…>`／`⟨…⟩` 与组字 `:zi[…]` 里面的 `|`。
 * `<` 的生效条件与 `scanJiazhu` 相同（其后不是 ASCII 字母、`/`、`!`、`?`、`>`、空白），
 * 且须在本行内闭合，否则按字面。
 * `:zi[…]` 的方括号按 `guji-inline` 的 `matchZi` 配对（计数嵌套、`\` 转义跳过）；
 * 配不上或内容为空时按字面，其中的 `|` 照切。
 */
export function splitTableRow(line: string): string[] {
    const out: string[] = [];
    let buf = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === ':' && line.startsWith(':zi[', i)) {
            const j = matchZi(line, i + 3);
            if (j > i + 4) {
                buf += line.slice(i, j + 1);
                i = j;
                continue;
            }
        }
        let close: string | null = null;
        if (ch === '⟨') close = '⟩';
        else if (ch === '<') {
            const nxt = line[i + 1];
            if (nxt !== undefined && !/[A-Za-z/!?>\s]/.test(nxt)) close = '>';
        }
        if (close) {
            const j = line.indexOf(close, i + 1);
            if (j > 0) {
                buf += line.slice(i, j + 1);
                i = j;
                continue;
            }
        }
        if (ch === '|') {
            out.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    out.push(buf);
    return out.map(s => s.trim());
}

const CELL_RE = /^([\s\S]*?)(?:\{(\d+)\})?(?:\^(\d+))?$/;

type Token = { cont: true } | { cont: false; cell: GujiTableCell };

function parseToken(raw: string): Token {
    if (raw === '^') return { cont: true };
    const m = CELL_RE.exec(raw)!;
    const body = m[1].trim();
    const colspan = m[2] ? Math.max(1, parseInt(m[2], 10)) : 1;
    const rowspan = m[3] ? Math.max(1, parseInt(m[3], 10)) : 1;
    const empty = body === '_';
    return { cont: false, cell: { text: empty ? '' : body, empty, colspan, rowspan } };
}

/**
 * 解析一个表格块的内部各行（不含 `:::table` 与 `:::` 两行）。
 * `lineOffset` 只用于 warnings 里报行号。
 */
export function parseGujiTable(lines: string[], lineOffset = 1): GujiTable {
    const warnings: string[] = [];
    const rows: GujiTableRow[] = [];
    const widths: { width: number; line: number }[] = [];
    // rem[c]：第 c 列还要被上方跨行格占住几行（不含当前行之前已消耗的）
    let rem: number[] = [];

    lines.forEach((rawLine, idx) => {
        const lineNo = idx + lineOffset + 1;
        let line = rawLine.trim();
        if (!line) return;
        let header = false;
        if (line.startsWith('!')) {
            header = true;
            line = line.slice(1);
        }
        const tokens = splitTableRow(line).map(parseToken);

        const covered = rem.map(r => r > 0);
        const next = rem.map(r => (r > 0 ? r - 1 : 0));
        const cells: GujiTableCell[] = [];
        let col = 0;
        for (const tk of tokens) {
            if (tk.cont) {
                if (!covered[col]) warnings.push(`第 ${lineNo} 行第 ${col + 1} 列：续格 ^ 上方没有跨行格`);
                col += 1;
                continue;
            }
            const { cell } = tk;
            for (let c = col; c < col + cell.colspan; c++) {
                if (covered[c]) {
                    warnings.push(`第 ${lineNo} 行第 ${c + 1} 列：此处被上方跨行格占住，应写 ^`);
                    break;
                }
            }
            if (cell.rowspan > 1) {
                for (let c = col; c < col + cell.colspan; c++) next[c] = cell.rowspan - 1;
            }
            cells.push(cell);
            col += cell.colspan;
        }
        for (let c = col; c < covered.length; c++) {
            if (covered[c]) warnings.push(`第 ${lineNo} 行第 ${c + 1} 列：被上方跨行格占住，但本行缺续格 ^`);
        }
        for (let c = 0; c < next.length; c++) if (next[c] === undefined) next[c] = 0;
        rem = next;
        rows.push({ header, cells });
        widths.push({ width: col, line: lineNo });
    });

    const columns = widths.reduce((m, w) => Math.max(m, w.width), 0);
    for (const w of widths) {
        if (w.width !== columns) warnings.push(`第 ${w.line} 行：占 ${w.width} 列，与总列数 ${columns} 不符`);
    }
    if (rem.some(r => r > 0)) warnings.push('表尾：有跨行格超出了表的最后一行');
    if (rows.length === 0) warnings.push('空表');
    return { rows, columns, warnings };
}

/**
 * 把一章全文切成「普通文本」与「表格块」两类片段。
 *
 * - 块由单独成行的 `:::table` 开始、单独成行的 `:::` 结束；两行本身连同其行尾换行一并吃掉；
 * - 未闭合的 `:::table` 按字面（整段留在普通文本里）；
 * - 表格块前后紧贴的换行也吃掉（表格本身是块级元素，渲染层给上下留白），
 *   免得 `white-space: pre-wrap` 的正文在表格上下多出空行。
 */
export function splitFullTextTables(text: string): FullTextSegment[] {
    const lines = text.split('\n');
    const segs: FullTextSegment[] = [];
    let buf: string[] = [];
    const flushText = () => {
        if (buf.length === 0) return;
        const t = buf.join('\n');
        buf = [];
        segs.push({ type: 'text', text: t });
    };
    let i = 0;
    while (i < lines.length) {
        if (OPEN_RE.test(lines[i].trim())) {
            let j = i + 1;
            while (j < lines.length && !CLOSE_RE.test(lines[j].trim())) j++;
            if (j < lines.length) {
                flushText();
                const body = lines.slice(i + 1, j);
                segs.push({
                    type: 'table',
                    table: parseGujiTable(body, i + 1),
                    source: lines.slice(i, j + 1).join('\n'),
                });
                i = j + 1;
                continue;
            }
        }
        buf.push(lines[i]);
        i++;
    }
    flushText();
    // 去掉紧贴表格的换行
    return segs
        .map((s, k) => {
            if (s.type !== 'text') return s;
            let t = s.text;
            if (segs[k - 1]?.type === 'table') t = t.replace(/^\n+/, '');
            if (segs[k + 1]?.type === 'table') t = t.replace(/\n+$/, '');
            return { type: 'text' as const, text: t };
        })
        .filter(s => s.type !== 'text' || s.text !== '');
}
