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
 * 体裁判别（`detectGenre`）纯靠空行分块后的平均块长——目录体每块是一整页
 * （十余行），语录体每块是一条（一两行），中间地带判不清一律回退「条目分行」
 * （即 `buildParagraphBlocks` 与「分行」模式产出一致的逐行分块，不合并）。
 *
 * 夹注安全：本文件只做字符串拼接，`<…>`／`⟨…⟩` 的扫描与渲染交给调用方
 * （`detail/primitives.tsx` 的 `renderInterlinear`）在拼好的整段字符串上
 * 统一处理——不对拼好的 React 节点二次拼接，跨条边界不会把夾注切两半
 * （夹注起止须同行，`\n`／`　` 都不会跨行，安全）。
 */

import { useCallback, useState } from 'react';

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
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
        .split(/\n{2,}/)
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
 * 判体裁：空行分块后的平均块长。
 *   块长 <= 4  → record（语录/经传体，条目短、空行密）
 *   块长 >= 8  → catalog（目录体，空行稀，块即一页/一略）
 *   4~8 之间／无法分块 → unknown（回退「条目分行」，不出错排）
 */
export function detectGenre(text: string): ReadingGenre {
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
        const m = line.match(HEADING_RE);
        if (m) {
            flush();
            curHeading = { kind: 'heading', level: m[1].length, text: m[2].trim() };
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
        const m = line.match(HEADING_RE);
        if (m) {
            blocks.push({ kind: 'heading', level: m[1].length, text: m[2].trim() });
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

export type ReadingMode = 'line' | 'paragraph';

const READING_MODE_KEY = 'bim-reading-mode';

export function loadReadingMode(): ReadingMode {
    try {
        const raw = localStorage.getItem(READING_MODE_KEY);
        return raw === 'paragraph' ? 'paragraph' : 'line';
    } catch {
        return 'line';
    }
}

export function saveReadingMode(mode: ReadingMode): void {
    try {
        localStorage.setItem(READING_MODE_KEY, mode);
    } catch {
        /* ignore */
    }
}

/** 分行/自然段开关，跨组件共用同一个 localStorage 键，默认「条目分行」（现状）。 */
export function useReadingMode(): [ReadingMode, (mode: ReadingMode) => void] {
    const [mode, setModeState] = useState<ReadingMode>(loadReadingMode);
    const setMode = useCallback((m: ReadingMode) => {
        setModeState(m);
        saveReadingMode(m);
    }, []);
    return [mode, setMode];
}
