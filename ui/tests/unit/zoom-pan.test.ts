import { describe, expect, it } from 'vitest';
import { ZOOM_IDENTITY, clampView, panBy, wheelFactor, zoomAt } from '../../src/components/Reader/zoom-pan';

describe('zoom-pan', () => {
    const W = 400, H = 600;

    it('以指针为锚缩放：锚点下的内容点不动', () => {
        const v = zoomAt(ZOOM_IDENTITY, 100, 200, 2, W, H);
        expect(v.s).toBe(2);
        expect(100 * v.s + v.x).toBeCloseTo(100);
        expect(200 * v.s + v.y).toBeCloseTo(200);
    });

    it('倍数夹在 1–6，缩回 1 倍时平移归零', () => {
        expect(zoomAt(ZOOM_IDENTITY, 0, 0, 100, W, H).s).toBe(6);
        const z = zoomAt(ZOOM_IDENTITY, 300, 300, 3, W, H);
        expect(zoomAt(z, 300, 300, 0.01, W, H)).toEqual({ s: 1, x: 0, y: 0 });
    });

    it('平移不让内容离开容器', () => {
        const z = { s: 2, x: 0, y: 0 };
        expect(panBy(z, 50, 50, W, H)).toEqual({ s: 2, x: 0, y: 0 });
        expect(panBy(z, -9999, -9999, W, H)).toEqual({ s: 2, x: -W, y: -H });
        expect(clampView({ s: 1, x: -30, y: 10 }, W, H)).toEqual({ s: 1, x: 0, y: 0 });
    });

    it('滚轮向上放大、向下缩小；捏合（ctrl）更灵敏；行模式换算成像素', () => {
        expect(wheelFactor(-100, 0, false)).toBeGreaterThan(1);
        expect(wheelFactor(100, 0, false)).toBeLessThan(1);
        expect(Math.abs(Math.log(wheelFactor(-5, 0, true)))).toBeGreaterThan(Math.abs(Math.log(wheelFactor(-5, 0, false))));
        expect(wheelFactor(-3, 1, false)).toBeCloseTo(wheelFactor(-48, 0, false));
    });
});
