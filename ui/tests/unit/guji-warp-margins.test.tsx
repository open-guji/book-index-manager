/**
 * 书影保留空白（整幅原图页）：裁不裁空白都是同一套「原图像素 − 取景框原点」的变换，字框与画布尺寸始终对得上。
 * 回归：新图源（殿本 qiefen2，1260×1920，本身已无空白）勾「保留空白」时，画布高被 maxWarpedH 的 2440 下限撑成 1260×2440，
 * 整图纵向拉伸，字框仍按原图像素画，坐标对不上。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GujiWarpCanvas, type PageWarpData } from '../../src/components/Reader/GujiWarpCanvas';

const page = (W: number, H: number, box: [number, number, number, number]): PageWarpData => ({
    page_id: 'p:1', title: '第1葉', image_size: [W, H], total_warped_w: W,
    columns: [{ col: 1, warped_w: W, warped_h: H, offset_x: 0, strips: [], chars: [{ id: '1:1:1', char: '字', slot: 1, pos: 1, bbox_col: box }] }],
});

function draw(pageData: PageWarpData, preserveMargins: boolean) {
    const { container } = render(<GujiWarpCanvas imageUrl="" pageData={pageData} selectedCharIds={new Set()} preserveMargins={preserveMargins} />);
    const canvas = container.querySelector('canvas')!;
    const rect = container.querySelector('rect:not([data-fig-block])')!;
    return {
        size: canvas.getAttribute('data-logical-size'),
        viewBox: container.querySelector('svg')!.getAttribute('viewBox'),
        x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')),
    };
}

describe('GujiWarpCanvas · 整图页保留空白', () => {
    // 字框贴边（已无空白的新图源）：裁不到东西
    const tight = page(1260, 1920, [20, 20, 1240, 1900]);

    it('保留空白：画布就是原图尺寸（不被 2440 下限撑高），字框原样', () => {
        const r = draw(tight, true);
        expect(r.size).toBe('1260x1920');
        expect(r.viewBox).toBe('0 0 1260 1920');
        expect([r.x, r.y]).toEqual([20, 20]);
    });

    it('去空白：没有可裁的空白时与保留空白一致', () => {
        expect(draw(tight, false)).toEqual(draw(tight, true));
    });

    it('原图本身比 2440 矮时，裁与不裁的画布高都不超过原图高', () => {
        const loose = page(1000, 1400, [300, 400, 700, 1000]);
        expect(draw(loose, true).size).toBe('1000x1400');
        // 去空白：外接矩形 (300..700 × 400..1000) 四周留 3%×1000=30 → 取景框原点 (270,370)，字框随之平移
        const t = draw(loose, false);
        expect(t.size).toBe('460x660');
        expect([t.x, t.y]).toEqual([30, 30]);
    });
});
