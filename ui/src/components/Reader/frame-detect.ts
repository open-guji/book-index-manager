/**
 * 版框检测：从书影图本身找出版框（四周的粗细框线）的外接范围，供「书影保留空白」关闭时裁到版框。
 *
 * 只靠逐字框裁，遇到空列多、字少的页（诏敕标题页、空白栏页）会把框线裁掉大半；图里的框线是最可靠的边界。
 * 算法（缩到 600 宽的灰度图上做，几毫秒）：
 *   1. 上下边：某一行里最长的连续暗像素 ≥ 宽的 35% 的行是横向框线，取最上、最下一条；
 *   2. 左右边：在上下边之间，列上暗像素占比 ≥ 25% 的列是竖线（或字密集的列，都在框内，不碍事），取最左、最右一列；
 *   3. 图缘 1% 以内的不算（扫描黑边）；找不到横线、或上下边间距不到页高的 25% 就判无框，返回 null；找不到竖线时左右留 null。
 * 返回值是占整图宽高的比例（0–1），与图的实际像素无关；换档（缩略图／原图）都通用。
 */

export interface FrameFraction {
    /** 左右边；检测不到竖线时为 null（调用方按字框自行决定） */
    x0: number | null;
    x1: number | null;
    y0: number;
    y1: number;
}

const DARK = 150;
const LINE_FRAC = 0.35;
const COL_DENSITY = 0.25;
const EDGE = 0.01;
const MIN_SPAN = 0.25;

/** 灰度（0–255，行优先，w×h）→ 版框比例；无框返回 null */
export function detectFrameFromGray(gray: ArrayLike<number>, w: number, h: number): FrameFraction | null {
    if (!(w > 8) || !(h > 8) || gray.length < w * h) return null;
    const ys: number[] = [];
    for (let y = 0; y < h; y++) {
        if (y <= EDGE * h || y >= (1 - EDGE) * h) continue;
        let best = 0, cur = 0;
        const row = y * w;
        for (let x = 0; x < w; x++) {
            if (gray[row + x] < DARK) { cur++; if (cur > best) best = cur; } else cur = 0;
        }
        if (best > LINE_FRAC * w) ys.push(y);
    }
    if (ys.length < 2) return null;
    const t = ys[0], b = ys[ys.length - 1] + 1;
    if (b - t < MIN_SPAN * h) return null;
    let x0: number | null = null, x1: number | null = null;
    for (let x = 0; x < w; x++) {
        if (x <= EDGE * w || x >= (1 - EDGE) * w) continue;
        let n = 0;
        for (let y = t; y < b; y++) if (gray[y * w + x] < DARK) n++;
        if (n / (b - t) >= COL_DENSITY) {
            if (x0 === null) x0 = x;
            x1 = x + 1;
        }
    }
    if (x0 !== null && x1 !== null && x1 - x0 < MIN_SPAN * w) { x0 = null; x1 = null; }
    return { x0: x0 === null ? null : x0 / w, x1: x1 === null ? null : x1 / w, y0: t / h, y1: b / h };
}

const CACHE = new WeakMap<HTMLImageElement, FrameFraction | null>();
const SAMPLE_W = 600;

/** 已加载的图 → 版框比例（缓存；画布被污染、无 canvas 环境等一律返回 null） */
export function detectImageFrame(img: HTMLImageElement): FrameFraction | null {
    if (CACHE.has(img)) return CACHE.get(img) ?? null;
    let out: FrameFraction | null = null;
    try {
        const nw = img.naturalWidth, nh = img.naturalHeight;
        if (nw > 0 && nh > 0 && typeof document !== 'undefined') {
            const w = Math.min(SAMPLE_W, nw), h = Math.max(1, Math.round((nh * w) / nw));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                ctx.drawImage(img, 0, 0, w, h);
                const d = ctx.getImageData(0, 0, w, h).data;
                const gray = new Uint8Array(w * h);
                for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
                out = detectFrameFromGray(gray, w, h);
            }
        }
    } catch { out = null; }
    CACHE.set(img, out);
    return out;
}
