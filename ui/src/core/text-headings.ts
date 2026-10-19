/**
 * 分卷与各级标题（guji-format spec/04 v0.2 §4.2；spec/07 §3.3 的 `chapters[].headings`）。
 *
 * 标题符是 punct.json 里 `kind: heading` 的条目：锚在标题首字前，`mark` 的 `#` 个数是级别，
 * 标题到下一个分段符（锚标题末字之后）为止。目录有两个来源：
 * - 版本 index.json 章条目的 `headings`（book-text 脚本从各册 punct 抽出的缓存），全书目录一次画出；
 * - 没有缓存时，当前打开的这一册从已取到的 char＋punct 现算（`headingsFromPunct`）。
 */

/** 目录里的一个标题 */
export interface TextHeading {
    /** 级别：1＝最高（一般是卷） */
    level: number;
    /** 目录名：标题符的 `label`，缺省是标题原文（注入点号与成对标号后的文字） */
    label: string;
    /** 标题首字的格位 key（`页:列:格[子列]`） */
    anchor: string;
}

/** 现算标题要用的标点条目（`adaptPunctJson` 的结果即可） */
export interface HeadingPunct {
    anchor: string;
    mark: string;
    kind?: string;
    pos?: string;
    label?: string;
    toc?: boolean;
}

/** 现算标题要用的页（`adaptCharCord` 的页即可）：按读序给出每列的字 */
export interface HeadingPage {
    columns: { col: number; chars: { id: string; char: string }[] }[];
}

const HEADING_MARK = /^#{1,6}$/;
const isPoint = (p: HeadingPunct) => p.kind == null || p.kind === 'point';

/**
 * 从一册的字与标点现算目录：只收 `toc` 不为 false 的标题，按读序。
 * 标题原文＝从首字到下一个分段符（或下一个标题符）之间的字，带上其间的点号与成对标号。
 */
export function headingsFromPunct(pages: readonly HeadingPage[] | null | undefined, puncts: readonly HeadingPunct[] | null | undefined): TextHeading[] {
    if (!pages || !puncts || puncts.length === 0) return [];
    const byAnchor = new Map<string, HeadingPunct[]>();
    let any = false;
    for (const p of puncts) {
        if (p.kind === 'heading') any = true;
        const list = byAnchor.get(p.anchor);
        if (list) list.push(p); else byAnchor.set(p.anchor, [p]);
    }
    if (!any) return [];

    const out: TextHeading[] = [];
    let cur: { h: TextHeading; text: string; fixed: boolean } | null = null;
    const close = () => {
        if (cur) {
            if (!cur.fixed) cur.h.label = cur.text.trim();
            if (cur.h.label) out.push(cur.h);
        }
        cur = null;
    };
    for (const page of pages) {
        const cols = [...page.columns].sort((a, b) => a.col - b.col);
        for (const col of cols) {
            for (const ch of col.chars) {
                const here = byAnchor.get(ch.id) ?? [];
                const head = here.find(p => p.kind === 'heading' && p.pos === 'before' && HEADING_MARK.test(p.mark));
                if (head) close();
                if (head && head.toc !== false) {
                    const label = head.label?.trim();
                    cur = { h: { level: head.mark.length, label: label ?? '', anchor: ch.id }, text: '', fixed: !!label };
                }
                if (cur && !cur.fixed) {
                    for (const p of here) if (isPoint(p) && p.pos === 'before') cur.text += p.mark;
                    cur.text += ch.char;
                    for (const p of here) if (isPoint(p) && p.pos !== 'before') cur.text += p.mark;
                }
                if (here.some(p => p.kind === 'break' && p.pos !== 'before')) close();
            }
        }
    }
    close();
    return out;
}

/** index.json 章条目里的 `headings`：只留形状对的项（level 1–6、label 非空、anchor 是字符串） */
export function sanitizeHeadings(raw: unknown): TextHeading[] {
    if (!Array.isArray(raw)) return [];
    const out: TextHeading[] = [];
    for (const h of raw) {
        if (!h || typeof h !== 'object') continue;
        const { level, label, anchor } = h as Record<string, unknown>;
        if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) continue;
        if (typeof label !== 'string' || !label.trim() || typeof anchor !== 'string' || !anchor) continue;
        out.push({ level, label: label.trim(), anchor });
    }
    return out;
}

/** 目录项 key：`<章 file>#<标题首字格位>` */
export function headingKey(chapterFile: string, anchor: string): string {
    return `${chapterFile}#${anchor}`;
}

/** 拆目录项 key；不是标题项返回 null */
export function parseHeadingKey(key: string): { chapter: string; anchor: string } | null {
    const i = key.indexOf('#');
    if (i <= 0 || i === key.length - 1) return null;
    return { chapter: key.slice(0, i), anchor: key.slice(i + 1) };
}

/** 平铺的标题按级别套成树：级别更深的挂在前一个更浅的标题下面；跳级的照样挂在最近的更浅标题下 */
export interface HeadingNode extends TextHeading {
    children: HeadingNode[];
}
export function nestHeadings(list: readonly TextHeading[]): HeadingNode[] {
    const roots: HeadingNode[] = [];
    const stack: HeadingNode[] = [];
    for (const h of list) {
        const node: HeadingNode = { ...h, children: [] };
        while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
        if (stack.length === 0) roots.push(node); else stack[stack.length - 1].children.push(node);
        stack.push(node);
    }
    return roots;
}
