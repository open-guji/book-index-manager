/**
 * 阅读器叶子文本 → 章 md 码点起点的对齐游标（F6 步 6，GUJI-316／GUJI-163）。
 *
 * 全文搜索 F1 的偏移基准＝book-text `default/<章>.md` 经 Python 通用换行（`\r\n`、`\r` → `\n`）后的 Unicode 码点下标。
 * 阅读器渲染前会去掉标记符（`**`、`#`、`<!-- -->`、`<>`）、把多行并段时插入全角空格 `　`、整行粗体提升成标题等，
 * 所以叶子文本与 md 不逐字符同构；这里按文档顺序把每个叶子对到 md 里，给出它的首个码点下标。
 * 对不上就返回 undefined（调用方退回按文本查找），宁缺不错。
 */

export interface MdCursor {
    /** 叶子 `s` 对到 md 里的首码点下标；对不上返回 undefined，游标不动 */
    align(s: string): number | undefined;
}

/** 整章不给锚点的原因；null＝可以对齐 */
export function mdCursorBlocker(raw: string, converted: string, quoteOriginal: boolean): string | null {
    if (!quoteOriginal) return 'quoteStyle';
    if (normalizeNewlines(raw).includes('\r')) return 'lone-cr';
    if (Array.from(raw).length !== Array.from(converted).length) return 'convert-length';
    if (converted.includes(':::')) return 'tables';
    return null;
}

/** 通用换行：`\r\n` → `\n`；孤立 `\r` 原样留下（调用方据此拒绝） */
export function normalizeNewlines(s: string): string {
    return s.replace(/\r\n/g, '\n');
}

const GAP_MAX = 2;       // 叶子之间允许夹的任意字符数（如被 sr-only 单独渲染的 《 》）
const WINDOW = 400;      // 长叶子允许跳过的最大码点数（被提升到页头的整行等）
const WINDOW_MIN_LEN = 6; // 叶子至少这么长才允许跨窗口找起点

const isSkippable = (c: string): boolean => c === '*' || c === '#' || c === '<' || c === '>' || /\s/.test(c);

/** md 里 `<!-- … -->` 注释从 i 起的结束下标（含），不是注释返回 -1 */
function commentEnd(md: string[], i: number): number {
    if (md[i] !== '<' || md[i + 1] !== '!' || md[i + 2] !== '-' || md[i + 3] !== '-') return -1;
    for (let k = i + 4; k + 2 < md.length; k++) {
        if (md[k] === '-' && md[k + 1] === '-' && md[k + 2] === '>') return k + 2;
    }
    return -1;
}

/** 尝试从 md[i] 起匹配整个叶子；成功返回匹配结束后的 md 下标，否则 -1 */
function matchAt(md: string[], i: number, sc: string[]): number {
    let k = i;
    for (let j = 0; j < sc.length; ) {
        if (k >= md.length) return -1;
        if (sc[j] === md[k]) { j++; k++; continue; }
        const ce = commentEnd(md, k);
        if (ce >= 0) { k = ce + 1; continue; }
        if (isSkippable(md[k])) { k++; continue; }
        if (sc[j] === '　') { j++; continue; } // 并段时插入的全角空格，md 里没有
        return -1;
    }
    return k;
}

export function createMdCursor(rawMd: string): MdCursor {
    const md = Array.from(normalizeNewlines(rawMd));
    let pos = 0;
    return {
        align(s: string): number | undefined {
            if (!s) return undefined;
            const sc = Array.from(s);
            if (sc.every(c => c === '　' || /\s/.test(c))) return undefined;
            const long = sc.length >= WINDOW_MIN_LEN;
            let gap = 0;
            for (let i = pos; i < md.length && i - pos <= (long ? WINDOW : GAP_MAX + 64); i++) {
                const ce = commentEnd(md, i);
                if (ce >= 0) { i = ce; continue; }
                const skippable = isSkippable(md[i]);
                if (!skippable) {
                    const end = matchAt(md, i, sc);
                    if (end >= 0) { pos = end; return i; }
                    gap++;
                    if (!long && gap > GAP_MAX) return undefined;
                }
            }
            return undefined;
        },
    };
}
