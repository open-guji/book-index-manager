/**
 * guji-pages/0.1（open-guji-cv `export_guji_format.py` 的 `NNN.pages.json`）与 `NNN.punct.json` → 对读阅读器要的结构。
 *
 * 一章一个文件，`pages[]` 按页分块；每页的 `cells[]` 是 `{id, a, o, c, box}`：
 *   - `a`：字位锚点 `<页>:<列>:<格>[a|b]`（a＝夹注右半、b＝夹注左半），与 punct／entity 的 `anchor` 同一套；
 *   - `c`：这个格里的字；`box`：`[x, y, w, h]`，IIIF canvas 的整数像素、左上原点；
 *   - 页的 `canvas.seq` 是 IIIF 页序（IA leaf 号补零 4 位，合扫拆页带 a–d 后缀），`canvas.width/height` 是 canvas 尺寸。
 * 页的 `page.index` 是工作区页号，**不一定等于 leaf 号**（四庫卷三 105–108 页是同一叶拆成的四块），
 * 所以页与书影的对位一律走 `canvas.seq`。
 */

export interface GujiPageChar {
    id: string;
    char: string;
    slot: number;
    pos: number;
    sub: string | null;
    /** `[x0, y0, x1, y1]`，canvas 像素；没有字框为 null */
    bbox: [number, number, number, number] | null;
}

export interface GujiPageInfo {
    /** 页号（`page.index`），也是字 id 的第一段 */
    page: number;
    /** IIIF 页序，如 `0003`、`0105a` */
    seq: string;
    width: number;
    height: number;
    /** 按列分组、列内保持文件里的阅读顺序；`col` 小的在右（竖排从右往左） */
    columns: { col: number; chars: GujiPageChar[] }[];
}

const ANCHOR = /^(\d+):(-?\d+):(-?\d+)([a-z]?)$/;

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** `pages.json` 整份对象 → 页列表。没有字的页（书脊签、封面签条）不收；格式不对的格丢弃，不抛错 */
export function adaptGujiPages(raw: unknown): GujiPageInfo[] {
    const pages = raw && typeof raw === 'object' ? (raw as { pages?: unknown }).pages : undefined;
    if (!Array.isArray(pages)) return [];
    const out: GujiPageInfo[] = [];
    for (const p of pages) {
        if (!p || typeof p !== 'object') continue;
        const pg = p as Record<string, any>;
        const page = num(pg.page?.index);
        const cells: unknown[] = Array.isArray(pg.cells) ? pg.cells : [];
        if (page === undefined || cells.length === 0) continue;
        const byCol = new Map<number, GujiPageChar[]>();
        for (const c of cells) {
            if (!c || typeof c !== 'object') continue;
            const cell = c as Record<string, any>;
            const m = ANCHOR.exec(String(cell.a ?? ''));
            if (!m || typeof cell.c !== 'string') continue;
            const col = parseInt(m[2], 10);
            const slot = parseInt(m[3], 10);
            const b = Array.isArray(cell.box) && cell.box.length === 4 && cell.box.every((n: unknown) => num(n) !== undefined)
                ? (cell.box as number[]) : null;
            const ch: GujiPageChar = {
                id: String(cell.a),
                char: cell.c,
                slot,
                pos: slot,
                sub: m[4] || null,
                bbox: b ? [b[0], b[1], b[0] + b[2], b[1] + b[3]] : null,
            };
            let list = byCol.get(col);
            if (!list) byCol.set(col, (list = []));
            list.push(ch);
        }
        out.push({
            page,
            seq: String(pg.canvas?.seq ?? ''),
            width: num(pg.canvas?.width) ?? num(pg.image?.width) ?? 0,
            height: num(pg.canvas?.height) ?? num(pg.image?.height) ?? 0,
            columns: Array.from(byCol.entries()).sort((a, b) => a[0] - b[0]).map(([col, chars]) => ({ col, chars })),
        });
    }
    return out;
}

/** `punct.json`（`{punctuations: [...]}` 或直接数组）→ 标点条目；缺 `anchor`／`mark` 的丢弃 */
export function adaptPunctJson(raw: unknown): { id?: string; anchor: string; mark: string; kind?: 'point' | 'break' | 'range'; pos?: 'after' | 'before'; pre_char?: string }[] {
    const list: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { punctuations?: unknown }).punctuations)
            ? (raw as { punctuations: unknown[] }).punctuations
            : [];
    const out: ReturnType<typeof adaptPunctJson> = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, any>;
        if (typeof p.anchor !== 'string' || typeof p.mark !== 'string') continue;
        out.push({ id: typeof p.id === 'string' ? p.id : undefined, anchor: p.anchor, mark: p.mark, kind: p.kind, pos: p.pos, pre_char: p.pre_char });
    }
    return out;
}

/** 本章用到的 IIIF 册：从页的 canvas id（`…/iiif/<书>/canvas/<册2位>/<页序>`）取；各页不一致时取第一页的 */
export function iiifVolumeOf(raw: unknown): { bookId: string; vol: string } | null {
    const pages = raw && typeof raw === 'object' ? (raw as { pages?: unknown }).pages : undefined;
    if (!Array.isArray(pages)) return null;
    for (const p of pages) {
        const m = /\/iiif\/([^/]+)\/canvas\/([^/]+)\//.exec(String((p as any)?.canvas?.id ?? ''));
        if (m) return { bookId: m[1], vol: m[2] };
    }
    return null;
}
