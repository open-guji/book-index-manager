/** 书影缩放平移的纯计算（坐标系：容器左上角为原点，内容以左上角为变换原点：屏幕点 = 内容点 × s + (x, y)） */

export interface ZoomView { s: number; x: number; y: number }

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
export const ZOOM_IDENTITY: ZoomView = { s: 1, x: 0, y: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 限制倍数在 1–6，平移不让内容边缘离开容器（放大后内容始终铺满容器） */
export function clampView(v: ZoomView, w: number, h: number): ZoomView {
    const s = clamp(v.s, ZOOM_MIN, ZOOM_MAX);
    return { s, x: clamp(v.x, w * (1 - s), 0), y: clamp(v.y, h * (1 - s), 0) };
}

/** 以容器内一点 (px, py) 为锚缩放 factor 倍：锚点下的内容点缩放前后不动 */
export function zoomAt(v: ZoomView, px: number, py: number, factor: number, w: number, h: number): ZoomView {
    const s = clamp(v.s * factor, ZOOM_MIN, ZOOM_MAX);
    const k = s / v.s;
    return clampView({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, w, h);
}

export function panBy(v: ZoomView, dx: number, dy: number, w: number, h: number): ZoomView {
    return clampView({ s: v.s, x: v.x + dx, y: v.y + dy }, w, h);
}

/** 滚轮增量 → 缩放倍率。触控板捏合在浏览器里是 ctrlKey＋小的 deltaY，灵敏度要高一些 */
export function wheelFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
    const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
    return Math.exp(-px * (ctrlKey ? 0.01 : 0.0015));
}
