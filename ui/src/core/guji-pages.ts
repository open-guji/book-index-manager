/**
 * 阅读器对读用的页结构（`GujiPageInfo`／`GujiPageChar`，由 `adaptCharCord` 从 char＋cord 产出），
 * 以及 `NNN.punct.json` 标点的适配、cord 的 IIIF 册号。
 *
 * 旧 `NNN.pages.json`（guji-pages/0.1）的适配器 `adaptGujiPages` 已于 2026-10-10 删除：
 * 数据与网站都只走 char／cord（guji-format v0.1，spec/01、02），pages.json 现存 0。
 *
 * 页的 `page.index` 是工作区页号，**不一定等于 leaf 号**（四庫卷三 105–108 页是同一叶拆成的四块），
 * 所以页与书影的对位一律走 `canvas.seq`（IA leaf 号补零 4 位，合扫拆页带 a–d 后缀）。
 */

export interface GujiPageChar {
    id: string;
    char: string;
    slot: number;
    pos: number;
    sub: string | null;
    /** `[x0, y0, x1, y1]`，canvas 像素；没有字框为 null */
    bbox: [number, number, number, number] | null;
    /** 以下四项来自 char 的格字段（guji-format spec/02 §4.4），缺省＝不带，行为与旧数据一致 */
    /** 分道：`solo` 单行小注（推不出必须写）；`jz_r`／`jz_l` 双行夹注，`main` 正文 */
    lane?: 'main' | 'solo' | 'jz_r' | 'jz_l';
    /** 阙文：`char` 是 `□` 占位 */
    lacuna?: true;
    /** 残字：`char` 是推测的字 */
    guess?: true;
    /** 组字：Unicode 未收的字的原形（IDS 串或描述），`char` 是近似字 */
    zi?: string;
}

/** 列类别（spec/02 §4.3）：`blank` 空列（无字）、`banxin` 版心列；缺省正文列 */
export type GujiColumnKind = 'body' | 'banxin' | 'blank';

export interface GujiPageInfo {
    /** 页号（`page.index`），也是字 id 的第一段 */
    page: number;
    /** IIIF 页序，如 `0003`、`0105a` */
    seq: string;
    width: number;
    height: number;
    /** 版心叶次（刻本上的叶码，原样照录，如「一」「十二」）；有则页码处优先显示它 */
    label?: string;
    /**
     * 按列分组、列内保持文件里的阅读顺序；`col` 小的在右（竖排从右往左）。
     * `raised`（抬头格数）、`lead_blank`（行首空格数）、`kind` 是列的版式字段，缺省＝0／0／正文列；
     * `kind: 'blank'` 的空列 `chars` 为空，也保留在这里。
     */
    columns: { col: number; chars: GujiPageChar[]; kind?: GujiColumnKind; raised?: number; lead_blank?: number }[];
}

/** 单个字符：恰好一个码点（代理对算一个字） */
const isSingleChar = (v: unknown): v is string => typeof v === 'string' && Array.from(v).length === 1;

/**
 * `punct.json`（`{punctuations: [...]}` 或直接数组）→ 标点条目；缺 `anchor`／`mark` 的丢弃。
 * `pre_char` 缺省（或 null）即不带；给了但不是单个字符的，整条标点丢弃（不抛错）。
 */
export function adaptPunctJson(raw: unknown): { id?: string; anchor: string; mark: string; kind?: 'point' | 'break'; pos?: 'after' | 'before'; pre_char?: string }[] {
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
        if (p.pre_char != null && !isSingleChar(p.pre_char)) continue;
        out.push({ id: typeof p.id === 'string' ? p.id : undefined, anchor: p.anchor, mark: p.mark, kind: p.kind, pos: p.pos, pre_char: p.pre_char ?? undefined });
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
