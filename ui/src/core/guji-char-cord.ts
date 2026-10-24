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
 * 无字页（书脊签、封面签条、空白页等：char 里没有格、cord 里有 canvas）也收进页列表，`columns` 里没有字
 * （只可能有 `kind: blank` 的空列）：书影翻页要翻到它们，正文侧不出这些页（阅读器按「有没有字」区分）。
 *
 * char 的版式字段（spec/02 §4.2–4.4：页 `label`；列 `raised`／`lead_blank`／`kind`；格 `lane`／`lacuna`／`guess`／`zi`，
 * 以及 v0.2 的 `guess_c`——阙文格的推测字，§4.6）原样带到输出上，缺省不带键——旧数据的输出与改前逐字段一致（overview#517）。
 * char v0.1、v0.2 两个 `$schema` 都认（本适配器不看 `$schema`）。
 *
 * char v0.3（spec/02 §4.7）：格上的 `fig` 带到字上（`GujiPageChar.fig`，只认 `c` 为 `□` 且不与 lacuna／guess／guess_c／zi 同在的格），
 * `kind: figure` 的图列带成无字的列（`kind: 'figure'`、`span`、`fig`；cord `marks.figure` 对得上就带 `figBox`）。
 * 图本身（说明、文件）在 fig.json，用 {@link adaptFig} 读，由阅读器按图 id 查。没有图的章输出与改前逐字段一致。
 *
 * norm（`NNN.norm.json`，规范层）：人审过的「异体→通行字」，按同一个格位 key 挂到字上（`GujiPageChar.norm`），
 * 是可选的第三个参数；不传、传空表、或某位没有条目时输出与改前逐字段一致（overview#525）。
 */
import type { GujiColumnKind, GujiFigure, GujiPageChar, GujiPageInfo } from './guji-pages';

const ANCHOR = /^(\d+):(-?\d+):(-?\d+)([a-z]?)$/;

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 图 id（spec/09 §3.2） */
const FIG_ID = /^[a-z0-9][a-z0-9-]*$/;

const LANES = new Set(['main', 'solo', 'jz_r', 'jz_l']);
const KINDS = new Set(['body', 'banxin', 'blank']);

/** 格的可选字段（spec/02 §4.4）：只收合法值，缺省不带键——旧数据的输出与改前逐字段一致 */
function cellExtras(cell: Record<string, any>): Pick<GujiPageChar, 'lane' | 'lacuna' | 'guess_c' | 'guess' | 'zi' | 'fig'> {
    const out: Pick<GujiPageChar, 'lane' | 'lacuna' | 'guess_c' | 'guess' | 'zi' | 'fig'> = {};
    if (typeof cell.lane === 'string' && LANES.has(cell.lane) && cell.lane !== 'main') out.lane = cell.lane as GujiPageChar['lane'];
    if (cell.lacuna === true) out.lacuna = true;
    // 推测字只认阙文格上的（spec/02 §4.6：与 lacuna 同在、与 guess 互斥）；别处出现的按格式不对丢掉
    if (cell.lacuna === true && cell.guess !== true && typeof cell.guess_c === 'string' && cell.guess_c.trim()) out.guess_c = cell.guess_c.trim();
    if (cell.guess === true) out.guess = true;
    if (typeof cell.zi === 'string' && cell.zi) out.zi = cell.zi;
    // 图片格（spec/02 §4.7）：`c` 必须是 □，与 lacuna／guess／guess_c／zi 互斥；格式不对的当普通格
    if (typeof cell.fig === 'string' && FIG_ID.test(cell.fig) && cell.c === '□' && !cell.lacuna && !cell.guess && cell.guess_c === undefined && cell.zi === undefined) {
        out.fig = cell.fig;
    }
    return out;
}

/** 列的可选字段（spec/02 §4.3）：`raised`、`lead_blank` 只收正整数（0 即缺省），`kind` 只收三个枚举（body 即缺省） */
function columnExtras(col: Record<string, any>): { kind?: GujiColumnKind; raised?: number; lead_blank?: number } {
    const out: { kind?: GujiColumnKind; raised?: number; lead_blank?: number } = {};
    if (typeof col.kind === 'string' && KINDS.has(col.kind) && col.kind !== 'body') out.kind = col.kind as GujiColumnKind;
    const r = num(col.raised);
    if (r !== undefined && Number.isInteger(r) && r > 0) out.raised = r;
    const b = num(col.lead_blank);
    if (b !== undefined && Number.isInteger(b) && b > 0) out.lead_blank = b;
    return out;
}

function pagesOf(raw: unknown): Record<string, any>[] {
    const pages = raw && typeof raw === 'object' ? (raw as { pages?: unknown }).pages : undefined;
    return Array.isArray(pages) ? pages.filter((p): p is Record<string, any> => !!p && typeof p === 'object') : [];
}

/** norm 条目里「通行字」只许恰好一个码点（转换保持码点数不变，下标映射靠它）；Ext-B 字是两个 UTF-16 单元，按码点数 */
function oneCodePoint(t: unknown): t is string {
    return typeof t === 'string' && Array.from(t).length === 1;
}

export interface NormAdapted {
    /** 格位 key → 通行字（已丢掉非法项） */
    map: Map<string, string>;
    /** 读侧宽容：非法项丢弃并计数，按原因分 */
    dropped: { badAnchor: number; badChar: number; badWhy: number; notObject: number };
}

/**
 * `NNN.norm.json`（`{schema, table, items:[…]}`）→ 格位 key → 通行字。
 * 条目 `{a: 格位 key, t: 通行字, by?, why?}`；`why` 缺省或「异体」才收（校勘改字不进规范层）；`t` 必须恰好一个字；
 * 空表、`items` 缺失、整份不是对象都得到空 map，不抛错。字段名按 char／cord 的 `a`、规范层的 `t` 假定，核对见 overview#525。
 */
export function adaptNormDetailed(raw: unknown): NormAdapted {
    const map = new Map<string, string>();
    const dropped = { badAnchor: 0, badChar: 0, badWhy: 0, notObject: 0 };
    const items = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
    for (const it of Array.isArray(items) ? items : []) {
        if (!it || typeof it !== 'object') { dropped.notObject++; continue; }
        const { a, t, why } = it as Record<string, unknown>;
        if (typeof a !== 'string' || !ANCHOR.test(a)) { dropped.badAnchor++; continue; }
        if (!oneCodePoint(t)) { dropped.badChar++; continue; }
        if (why !== undefined && why !== '异体') { dropped.badWhy++; continue; }
        map.set(a, t);
    }
    return { map, dropped };
}

/** 同 {@link adaptNormDetailed}，只要 map */
export function adaptNorm(raw: unknown): Map<string, string> {
    return adaptNormDetailed(raw).map;
}

/** char（必有）＋ cord（可无）＋ norm（可无）→ 页列表。char 没有字的页只在 cord 带 canvas 时收（columns 为空，只有书影）；格式不对的格丢弃，不抛错 */
export function adaptCharCord(charRaw: unknown, cordRaw?: unknown, normRaw?: unknown): GujiPageInfo[] {
    const norms = normRaw === undefined || normRaw === null ? null : adaptNorm(normRaw);
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
    // cord 的插图块框：页 → 图 id → [x0,y0,x1,y1]
    const marksOf = new Map<number, Map<string, [number, number, number, number]>>();
    for (const [pn, cp] of cordPages) {
        for (const m of Array.isArray(cp.marks) ? cp.marks : []) {
            const b = m?.box;
            if (m?.kind !== 'figure' || typeof m.fig !== 'string' || !Array.isArray(b) || b.length !== 4 || !b.every((n: unknown) => num(n) !== undefined)) continue;
            let per = marksOf.get(pn);
            if (!per) marksOf.set(pn, (per = new Map()));
            per.set(m.fig, [b[0], b[1], b[0] + b[2], b[1] + b[3]]);
        }
    }
    const out: GujiPageInfo[] = [];
    const labels = new Map<number, string>();
    const blankOnly = new Map<number, GujiPageInfo['columns']>();
    for (const pg of pagesOf(charRaw)) {
        const pn = num(pg.page);
        if (pn !== undefined && typeof pg.label === 'string' && pg.label) labels.set(pn, pg.label);
    }
    for (const pg of pagesOf(charRaw)) {
        const page = num(pg.page);
        if (page === undefined) continue;
        const columns: GujiPageInfo['columns'] = [];
        const figMarks = marksOf.get(page);
        for (const col of Array.isArray(pg.columns) ? pg.columns : []) {
            const colNo = num(col?.col);
            if (colNo === undefined) continue;
            if (col.kind === 'figure') {
                // 图列（插图块）：没有字；缺图 id 或 id 写法不对的丢掉
                if (typeof col.fig !== 'string' || !FIG_ID.test(col.fig)) continue;
                const span = num(col.span);
                const fb = figMarks?.get(col.fig);
                columns.push({
                    col: colNo, chars: [], kind: 'figure', fig: col.fig,
                    ...(span !== undefined && Number.isInteger(span) && span > 1 ? { span } : {}),
                    ...(fb ? { figBox: fb } : {}),
                });
                continue;
            }
            const chars: GujiPageChar[] = [];
            for (const cell of Array.isArray(col.cells) ? col.cells : []) {
                const m = ANCHOR.exec(String(cell?.a ?? ''));
                if (!m || typeof cell.c !== 'string') continue;
                const slot = parseInt(m[3], 10);
                const nc = norms?.get(cell.a);
                chars.push({
                    id: cell.a, char: cell.c, slot, pos: slot, sub: m[4] || null, bbox: boxes.get(cell.a) ?? null, ...cellExtras(cell),
                    // 与原字相同的条目没有信息量，不带键
                    ...(nc !== undefined && nc !== cell.c ? { norm: nc } : {}),
                });
            }
            const extras = columnExtras(col);
            // 空列（kind: blank）也留着：阅读器要显示空位，不丢列
            if (chars.length > 0 || extras.kind === 'blank') columns.push({ col: colNo, chars, ...extras });
        }
        if (!columns.some(c => c.chars.length > 0 || c.kind === 'figure')) {
            // 无字页由下面按 cord 的 canvas 收；它的 blank 空列带过去，不丢列
            if (columns.length > 0) blankOnly.set(page, columns);
            continue;
        }
        // 列号小的在右；同列号重复（不应出现）保持文件顺序
        columns.sort((a, b) => a.col - b.col);
        const cp = cordPages.get(page);
        out.push({
            page,
            seq: String(cp?.canvas?.seq ?? ''),
            width: num(cp?.canvas?.width) ?? num(cp?.image?.width) ?? 0,
            height: num(cp?.canvas?.height) ?? num(cp?.image?.height) ?? 0,
            ...(typeof pg.label === 'string' && pg.label ? { label: pg.label } : {}),
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
            ...(labels.has(page) ? { label: labels.get(page) } : {}),
            columns: blankOnly.get(page) ?? [],
        });
    }
    return out.sort((a, b) => a.page - b.page);
}

const FIG_MIMES = new Set(['image/png', 'image/webp', 'image/svg+xml']);

/**
 * `NNN.fig.json`（guji-fig v0.1，spec/09）→ 图 id → 图。格式不对的项丢弃，整份不是对象得到空表，不抛错。
 * `file` 只认 `fig/` 下的相对路径（不许 `..`、不许协议或开头的 `/`）；`alt` 缺失时退回「图形符号」。
 */
export function adaptFig(raw: unknown): Map<string, GujiFigure> {
    const map = new Map<string, GujiFigure>();
    const list = raw && typeof raw === 'object' ? (raw as { figures?: unknown }).figures : undefined;
    for (const it of Array.isArray(list) ? list : []) {
        if (!it || typeof it !== 'object') continue;
        const f = it as Record<string, unknown>;
        if (typeof f.id !== 'string' || !FIG_ID.test(f.id)) continue;
        const kind = f.kind === 'block' ? 'block' : f.kind === 'inline' ? 'inline' : null;
        if (!kind) continue;
        if (typeof f.file !== 'string' || !/^fig\/[\w./-]+$/.test(f.file) || f.file.split('/').includes('..')) continue;
        if (typeof f.mime !== 'string' || !FIG_MIMES.has(f.mime)) continue;
        map.set(f.id, {
            id: f.id, kind,
            alt: typeof f.alt === 'string' && f.alt.trim() ? f.alt.trim() : '图形符号',
            file: f.file, mime: f.mime,
            width: num(f.width) ?? 0, height: num(f.height) ?? 0,
        });
    }
    return map;
}
