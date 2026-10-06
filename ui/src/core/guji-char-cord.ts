/**
 * guji-char／guji-cord v0.1（`NNN.char.json` ＋ `NNN.cord.json`，规范见 guji-format `spec/01`、`02`）→ 对读阅读器要的页结构。
 *
 * - char 管字：`pages[].columns[].cells[] = {a, c, lacuna?, …}`，**数组顺序就是读序**（夹注 a 右列先读、b 左列后读），不按 key 排序；
 * - cord 管框：`pages[].cells[] = {a, box:[x,y,w,h]}`，IIIF canvas 像素、左上原点，按格位 key `a` 与 char 对上；
 *   `canvas` 带 IIIF 页序 `seq`（四位补零）与尺寸；
 * - 格位 key `页:列:格[子列]`，页＝本册扫描顺序号，与 cord 的 `page`、canvas 的 seq 同一个数。
 *
 * 输出结构与旧 `adaptGujiPages`（pages.json）一致，阅读器组件不用改。char 里有而 cord 没有的格 bbox 为 null；
 * 没有 cord（章条目无 `cord_file`）时各页尺寸为 0，只能读字、没有对读。
 *
 * 无字页（书脊签、封面签条、空白页等：char 里没有格、cord 里有 canvas）也收进页列表，`columns` 为空：
 * 书影翻页要翻到它们，正文侧不出这些页（阅读器按「有没有字」区分）。
 */
import type { GujiPageChar, GujiPageInfo } from './guji-pages';

const ANCHOR = /^(\d+):(-?\d+):(-?\d+)([a-z]?)$/;

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function pagesOf(raw: unknown): Record<string, any>[] {
    const pages = raw && typeof raw === 'object' ? (raw as { pages?: unknown }).pages : undefined;
    return Array.isArray(pages) ? pages.filter((p): p is Record<string, any> => !!p && typeof p === 'object') : [];
}

/** char（必有）＋ cord（可无）→ 页列表。char 没有字的页只在 cord 带 canvas 时收（columns 为空，只有书影）；格式不对的格丢弃，不抛错 */
export function adaptCharCord(charRaw: unknown, cordRaw?: unknown): GujiPageInfo[] {
    const cordPages = new Map<number, Record<string, any>>();
    const boxes = new Map<string, [number, number, number, number]>();
    for (const cp of pagesOf(cordRaw)) {
        const page = num(cp.page);
        if (page === undefined) continue;
        cordPages.set(page, cp);
        for (const c of Array.isArray(cp.cells) ? cp.cells : []) {
            const b = c?.box;
            if (typeof c?.a === 'string' && Array.isArray(b) && b.length === 4 && b.every((n: unknown) => num(n) !== undefined)) {
                boxes.set(c.a, [b[0], b[1], b[0] + b[2], b[1] + b[3]]);
            }
        }
    }
    const out: GujiPageInfo[] = [];
    for (const pg of pagesOf(charRaw)) {
        const page = num(pg.page);
        if (page === undefined) continue;
        const columns: GujiPageInfo['columns'] = [];
        for (const col of Array.isArray(pg.columns) ? pg.columns : []) {
            const colNo = num(col?.col);
            if (colNo === undefined) continue;
            const chars: GujiPageChar[] = [];
            for (const cell of Array.isArray(col.cells) ? col.cells : []) {
                const m = ANCHOR.exec(String(cell?.a ?? ''));
                if (!m || typeof cell.c !== 'string') continue;
                const slot = parseInt(m[3], 10);
                chars.push({ id: cell.a, char: cell.c, slot, pos: slot, sub: m[4] || null, bbox: boxes.get(cell.a) ?? null });
            }
            if (chars.length > 0) columns.push({ col: colNo, chars });
        }
        if (columns.length === 0) continue; // 无字页由下面按 cord 的 canvas 收
        // 列号小的在右；同列号重复（不应出现）保持文件顺序
        columns.sort((a, b) => a.col - b.col);
        const cp = cordPages.get(page);
        out.push({
            page,
            seq: String(cp?.canvas?.seq ?? ''),
            width: num(cp?.canvas?.width) ?? num(cp?.image?.width) ?? 0,
            height: num(cp?.canvas?.height) ?? num(cp?.image?.height) ?? 0,
            columns,
        });
    }
    // 无字页：char 里没有这一页（或没有格），cord 带了 canvas 的，书影翻页要能翻到
    const seen = new Set(out.map(p => p.page));
    for (const [page, cp] of cordPages) {
        const seq = cp?.canvas?.seq;
        if (seen.has(page) || (typeof seq !== 'string' && typeof seq !== 'number') || String(seq) === '') continue;
        out.push({
            page,
            seq: String(seq),
            width: num(cp.canvas?.width) ?? num(cp.image?.width) ?? 0,
            height: num(cp.canvas?.height) ?? num(cp.image?.height) ?? 0,
            columns: [],
        });
    }
    return out.sort((a, b) => a.page - b.page);
}
