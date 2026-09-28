/**
 * 「条目分行 ↔ 自然段」纯前端聚合。
 *
 * 不改存储：读到的还是「一条一行」的编辑惯例（guji-markdown 兼容 `.md`）。
 * 两种体裁各一条聚合规则（照 T7 展示格式方案 §二·1、样张脚本
 * `项目进展/古籍文本/整体设计/展示样张/scripts/build.mjs` 的产出对齐）：
 *
 *   - 目录体（条目间只有 `\n`、无空行，如《漢書藝文志》）：
 *     以空行（含 `<!-- pN -->` 页码注释所在的空行）为界分块，
 *     块内逐行以全角空格 `　` 相接成一段；`<!-- pN -->` 本身不进入正文。
 *   - 语录／经传体（条目间天然以空行分段，如《論語》《公羊傳》维基全文）：
 *     以标题行（`#`/`##`/`###`）为界分节，节内不论条目原来是否空行相隔，
 *     一律以 `　` 相接拼成一段；条目内部原有的单个 `\n`（如「一之一\n子曰…」
 *     的编号行与正文行）保留字面，交给外层 `white-space: normal` 折叠。
 *
 * 体裁判别（`detectGenre`）先排除散文（一行就是一个自然段，见 `looksLikeProse`；
 * 宋史本纪、直齋解题都是），再看空行分块后的平均块长——目录体每块是一整页
 * （十余行），语录体每块是一条（一两行），中间地带判不清一律回退「条目分行」
 * （即 `buildParagraphBlocks` 与「分行」模式产出一致的逐行分块，不合并）。
 * 整行粗体（整理本的条目名）与 `#` 标题同样分节；一章里夹着的散文小节照分行排。
 *
 * 夹注安全：本文件只做字符串拼接，`<…>`／`⟨…⟩` 的扫描与渲染交给调用方
 * （`detail/primitives.tsx` 的 `renderInterlinear`）在拼好的整段字符串上
 * 统一处理——不对拼好的 React 节点二次拼接，跨条边界不会把夾注切两半
 * （夹注起止须同行，`\n`／`　` 都不会跨行，安全）。
 */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
/** 整行粗体（整理本 md 的条目标题「**《史記》一百三十卷**」）也按小标题算，免得跨条目合并 */
const BOLD_LINE_RE = /^\*\*([^*\n]+)\*\*\s*$/;

function matchHeading(line: string): { level: number; text: string } | null {
    const m = line.match(HEADING_RE);
    if (m) return { level: m[1].length, text: m[2].trim() };
    const b = line.trim().match(BOLD_LINE_RE);
    if (b) return { level: 3, text: b[1].trim() };
    return null;
}
const PAGE_COMMENT_RE = /^<!--.*-->$/;

export type ReadingGenre = 'catalog' | 'record' | 'unknown';

export interface ParagraphBlock {
    kind: 'heading' | 'body';
    /** 仅 heading 有效：1～6 */
    level?: number;
    text: string;
}

function splitBlankChunks(text: string): string[] {
    return text
        .split(/\n\s*\n/) // 只含空白的行也算空行
        .map(s => s.trim())
        .filter(Boolean);
}

function nonCommentLines(chunk: string): string[] {
    return chunk
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !PAGE_COMMENT_RE.test(l));
}

/**
 * 散文判定：正文里一半以上的字落在长于 PROSE_LINE_CHARS 字的行上（夹注不计）。
 *
 * 散文（宋史本纪、直齋解题）也是「空行分段、每块一两行」或「一行一段、不空行」，
 * 块长与语录体、目录体无异，但一行就是一个完整的自然段，再并起来整章成了一段。
 * 语录/经传一条、目录一行多在几十字以内，散文一段动辄百字以上。
 * 按字数而非行数算：直齋这类「短书名行 + 长解题行」交替的，行数上长行只占一半不到。
 */
const PROSE_LINE_CHARS = 60;

function looksLikeProse(text: string): boolean {
    let total = 0;
    let long = 0;
    for (const raw of text.split('\n')) {
        const l = raw.trim();
        if (!l || PAGE_COMMENT_RE.test(l) || matchHeading(l)) continue;
        const n = l.replace(/<[^<>\n]*>|\u27e8[^\u27e9\n]*\u27e9/g, '').replace(/\s/g, '').length;
        total += n;
        if (n > PROSE_LINE_CHARS) long += n;
    }
    return total > 0 && long * 2 >= total;
}

/** `:::table … :::` 块不参与判别（表格行由渲染层另排） */
function stripTables(text: string): string {
    return text.replace(/^[ \t]*:::table[^\n]*\n[\s\S]*?^[ \t]*:::[ \t]*$/gm, '');
}

/**
 * 判体裁：先排除散文（见 looksLikeProse），再看空行分块后的平均块长。
 *   块长 <= 4  → record（语录/经传体，条目短、空行密）
 *   块长 >= 8  → catalog（目录体，空行稀，块即一页/一略）
 *   4~8 之间／无法分块 → unknown（回退「条目分行」，不出错排）
 */
export function detectGenre(text: string): ReadingGenre {
    text = stripTables(text);
    if (looksLikeProse(text)) return 'unknown';
    const chunks = splitBlankChunks(text);
    if (chunks.length === 0) return 'unknown';
    if (chunks.length === 1) return 'catalog'; // 全篇无空行——目录体零成本情形
    const lens = chunks.map(c => nonCommentLines(c).length).filter(n => n > 0);
    if (lens.length === 0) return 'unknown';
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    if (avg <= 4) return 'record';
    if (avg >= 8) return 'catalog';
    return 'unknown';
}

/** 按标题行切成若干节（标题行本身单独一块，节内容含原始空行）。无标题时整篇是一节。 */
function splitHeadingSections(text: string): { heading: ParagraphBlock | null; body: string }[] {
    const lines = text.split('\n');
    const out: { heading: ParagraphBlock | null; body: string }[] = [];
    let curHeading: ParagraphBlock | null = null;
    let curLines: string[] = [];
    const flush = () => {
        out.push({ heading: curHeading, body: curLines.join('\n') });
        curLines = [];
    };
    for (const line of lines) {
        const h = matchHeading(line);
        if (h) {
            flush();
            curHeading = { kind: 'heading', level: h.level, text: h.text };
            continue;
        }
        curLines.push(line);
    }
    flush();
    return out;
}

/** 「条目分行」的逐行分块——与现状 `MdTextView` 的行为对齐，供 unknown 回退复用。 */
function lineBlocks(text: string): ParagraphBlock[] {
    const blocks: ParagraphBlock[] = [];
    for (const line of text.split('\n')) {
        const h = matchHeading(line);
        if (h) {
            blocks.push({ kind: 'heading', level: h.level, text: h.text });
            continue;
        }
        const t = line.trim();
        if (!t || PAGE_COMMENT_RE.test(t)) continue;
        blocks.push({ kind: 'body', text: line });
    }
    return blocks;
}

/**
 * 生成「自然段聚合」模式的展示块。genre 判不清时原样退化为逐行分块
 * （与「条目分行」一致），保证不出错排。
 */
export function buildParagraphBlocks(text: string): ParagraphBlock[] {
    if (!text) return [];
    const genre = detectGenre(text);
    if (genre === 'unknown') return lineBlocks(text);

    const blocks: ParagraphBlock[] = [];
    for (const { heading, body } of splitHeadingSections(text)) {
        if (heading) blocks.push(heading);
        const chunks = splitBlankChunks(body);
        if (chunks.length === 0) continue;
        // 一章里夹着散文小节（藝文志的「序」）：这一节照分行排，不并
        if (looksLikeProse(body)) {
            blocks.push(...lineBlocks(body));
            continue;
        }

        if (genre === 'record') {
            // 节内不分块，条目（含内部换行）原样以 　 相接
            const merged = chunks.join('　');
            if (merged) blocks.push({ kind: 'body', text: merged });
        } else {
            // catalog：块与块（页/略）之间各自成段，块内逐行以 　 相接
            for (const chunk of chunks) {
                const lines = nonCommentLines(chunk);
                if (lines.length) blocks.push({ kind: 'body', text: lines.join('　') });
            }
        }
    }
    return blocks;
}

/** 「条目分行」／「自然段」。状态存取见 components/Reader/prefs.ts（`useReaderPrefs`）。 */
export type ReadingMode = 'line' | 'paragraph';
