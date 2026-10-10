/**
 * guji-markdown 0.2.0 行内新写法解析（GM2 道，2026-09-27）。
 *
 * 规范：open-guji/guji-markdown `spec/syntax.md` §1「分行」、§13 阙文、§14 缺字猜测、§16 组字。
 *
 * | 写法 | 指令 | 本模块产出 |
 * |---|---|---|
 * | `<a|b>`（夹注内 `|`） | `jz` | `jz` 节点；`|`（含表格格内的 `\|`）横排忽略，从注文里去掉 |
 * | `[[…]]` | `qw` | `qw` 节点，`label` 为阙文说明（可空） |
 * | `□{guess=X}` | `qz` | `qz` 节点，`guess` 为猜测字 |
 * | `:zi[…]` | `zi` | `zi` 节点，`label` 为 IDS 或部件方位描述 |
 *
 * 只有全文目录（`index.json`）顶层声明 `"guji_markdown": "0.2.0"`（或更高的 0.x／主版本）
 * 的书才启用（见 `hasGujiMarkdownV02`）；未声明的书一概不走本模块，渲染与改前逐字一致。
 *
 * 与改前 `scanJiazhu`（`components/detail/primitives.tsx`）的差别（只在启用时生效）：
 * - 夹注按规范 §1 **计数配对**（`<注<再注>>`），内层夹注不再截断外层；
 * - 夹注的闭合记号若落在 `[[…]]`／`:zi[…]`／`□{guess=…}` 之内，不算闭合；
 * - 起止记号仍须同行（§0.2），未闭合按字面（§0.3）。
 *
 * 本模块只做纯解析，不依赖 React。
 */

export type GujiInlineNode =
    | { type: 'text'; text: string }
    | { type: 'jz'; children: GujiInlineNode[] }
    | { type: 'qw'; label: string }
    | { type: 'qz'; guess: string }
    | { type: 'zi'; label: string };

/**
 * 夹注内容长度上限；超限视为未闭合，`<` 按字面（spec syntax.md §0.4）。
 * spec 缺省是 4096，阅读器按真实数据放宽到 65536：book-text 全库最长的夹注 24,415 字，
 * 超 4096 的有 66 个、超 8192 的有 5 个（2026-10-10 扫描，overview#516）。
 * spec 一致性语料的 over-limit 用例自己用 `options.maxSpanLength` 传上限，不受这个默认值影响。
 */
export const JZ_MAX_LENGTH = 65536;

export interface GujiInlineOptions {
    /** 夹注内容长度上限；缺省 `JZ_MAX_LENGTH`。只管 `<…>`，旧 `⟨…⟩` 不设限 */
    jzMaxLength?: number;
}

/** 全文目录顶层的规范版本字段名 */
export const GUJI_MARKDOWN_FIELD = 'guji_markdown';

/**
 * 全文目录是否声明了 guji-markdown ≥ 0.2.0。
 * 取值为 `主.次[.补丁]` 字符串；非法取值一律当作未声明（零回归）。
 */
export function hasGujiMarkdownV02(index: { guji_markdown?: string } | null | undefined): boolean {
    const v = index?.guji_markdown;
    if (typeof v !== 'string') return false;
    const m = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(v.trim());
    if (!m) return false;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    return major > 0 || minor >= 2;
}

const GUESS_RE = /^□\{guess=([^\s{}]+)\}/;

/** `<` 的夹注生效条件 2（spec §1）：其后不得是 ASCII 字母、`/`、`!`、`?`、`>`、空白 */
function jzOpens(s: string, i: number): boolean {
    const nxt = s[i + 1];
    return nxt !== undefined && !/[A-Za-z/!?>\s]/.test(nxt);
}

/**
 * `:zi[` 起，按方括号计数找配对的 `]`（`\` 转义跳过，不跨行）；返回 `]` 的下标或 -1。
 * `open` 是 `[` 的下标。表格切格（`guji-table.ts` 的 `splitTableRow`）共用这条配对规则。
 */
export function matchZi(s: string, open: number): number {
    let depth = 0;
    for (let j = open; j < s.length; j++) {
        const ch = s[j];
        if (ch === '\n') return -1;
        if (ch === '\\') { j++; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') {
            depth--;
            if (depth === 0) return j;
        }
    }
    return -1;
}

/** 去掉 label 里的反斜杠转义（`\]` → `]`） */
function unescape(s: string): string {
    return s.replace(/\\([\\[\]<>|{}])/g, '$1');
}

/**
 * 试着在 `i` 处识别一个原子记号（阙文／组字／缺字猜测）。
 * 成功返回节点与记号之后的位置，否则 null。
 */
function atomAt(s: string, i: number): { node: GujiInlineNode; end: number } | null {
    const ch = s[i];
    if (ch === '[' && s[i + 1] === '[') {
        // §13：`[[` 与 `]]` 同行，内容可空
        const j = s.indexOf(']]', i + 2);
        if (j >= 0 && s.slice(i + 2, j).indexOf('\n') < 0) {
            return { node: { type: 'qw', label: s.slice(i + 2, j) }, end: j + 2 };
        }
        return null;
    }
    if (ch === ':' && s.startsWith(':zi[', i)) {
        const j = matchZi(s, i + 3);
        if (j > i + 4) {
            return { node: { type: 'zi', label: unescape(s.slice(i + 4, j)) }, end: j + 1 };
        }
        return null;
    }
    if (ch === '□' && s[i + 1] === '{') {
        const m = GUESS_RE.exec(s.slice(i, i + 64));
        if (m) return { node: { type: 'qz', guess: m[1] }, end: i + m[0].length };
    }
    return null;
}

interface ParseResult { nodes: GujiInlineNode[]; end: number }

/**
 * 从 `i` 起解析，直到遇到 `close`（返回其下标为 end）或文本结束。
 * 有 `close` 时：遇换行或到结尾仍未闭合 → 返回 null（调用方把起始记号当字面）。
 */
function parseSeq(s: string, i: number, close: string | null, inJz: boolean, jzMax: number): ParseResult | null {
    const nodes: GujiInlineNode[] = [];
    let buf = '';
    // §1「分行」：夹注内**第一个** `|`（含表格格内转义写的 `\|`）是分行点，横排忽略；其后的 `|` 是字面字符
    let pipeSeen = false;
    const flush = () => {
        if (!buf) return;
        let t = buf;
        if (inJz) {
            t = buf.replace(/\\?\|/g, m => {
                if (!pipeSeen) { pipeSeen = true; return ''; }
                return '|';
            });
        }
        if (t) nodes.push({ type: 'text', text: t });
        buf = '';
    };
    while (i < s.length) {
        const ch = s[i];
        // §10 转义：`\<` `\>` 输出尖括号本身，不参与配对
        if (ch === '\\' && (s[i + 1] === '<' || s[i + 1] === '>')) {
            buf += s[i + 1];
            i += 2;
            continue;
        }
        if (close !== null) {
            if (ch === close) {
                flush();
                return { nodes, end: i };
            }
            if (ch === '\n') return null;
        }
        const atom = atomAt(s, i);
        if (atom) {
            flush();
            nodes.push(atom.node);
            i = atom.end;
            continue;
        }
        let jzClose: string | null = null;
        if (ch === '⟨') jzClose = '⟩';
        else if (ch === '<' && jzOpens(s, i)) jzClose = '>';
        if (jzClose) {
            const inner = parseSeq(s, i + 1, jzClose, true, jzMax);
            // §0.4：`<…>` 内容超长视为未闭合，`<` 按字面（⟨…⟩ 是旧写法，不设限）
            if (inner && !(ch === '<' && inner.end - (i + 1) > jzMax)) {
                flush();
                nodes.push({ type: 'jz', children: inner.nodes });
                i = inner.end + 1;
                continue;
            }
        }
        buf += ch;
        i++;
    }
    if (close !== null) return null;
    flush();
    return { nodes, end: i };
}

/** 把一段文本解析成行内节点序列（启用 guji-markdown 0.2 的书才调用） */
export function parseGujiInline(text: string, opts?: GujiInlineOptions): GujiInlineNode[] {
    return parseSeq(text, 0, null, false, opts?.jzMaxLength ?? JZ_MAX_LENGTH)!.nodes;
}

/** 文本里是否可能含本模块认得的记号（快速路径：一个都没有就原样输出） */
export function mayHaveGujiInline(text: string): boolean {
    return /[<⟨□]|\[\[|:zi\[/.test(text);
}

/**
 * 纯文本输出（spec ast.md §3）：夹注 `（…）`、阙文与缺字猜测 `□`、组字原样。
 * 供检索与单测用。
 */
export function gujiInlineToPlain(nodes: GujiInlineNode[]): string {
    return nodes.map(n => {
        switch (n.type) {
            case 'text': return n.text;
            case 'jz': return `（${gujiInlineToPlain(n.children)}）`;
            case 'qw': return '□';
            case 'qz': return '□';
            case 'zi': return n.label;
        }
    }).join('');
}
