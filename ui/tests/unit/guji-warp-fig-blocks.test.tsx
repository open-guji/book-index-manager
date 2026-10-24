/**
 * 书影栏的插图块虚线框（GUJI-741）：figBlocks 画成虚线 rect，点一下通知宿主；选中的加重。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { GujiWarpCanvas, type PageWarpData } from '../../src/components/Reader/GujiWarpCanvas';

const pageData: PageWarpData = {
    page_id: 'p:149', title: '第149葉', image_size: [1000, 1400], total_warped_w: 1000,
    columns: [{ col: 1, warped_w: 1000, warped_h: 1400, offset_x: 0, strips: [], chars: [{ id: '149:1:1', char: '前', slot: 1, pos: 1, bbox_col: [900, 100, 960, 160] }] }],
    figBlocks: [{ id: 'p149-fig1', box: [100, 300, 700, 900] }],
};

describe('GujiWarpCanvas · 插图块', () => {
    it('画虚线框（坐标取 cord 框），点击通知图 id', () => {
        const onFigBlockClick = vi.fn();
        const { container } = render(<GujiWarpCanvas imageUrl="" pageData={pageData} selectedCharIds={new Set()} onFigBlockClick={onFigBlockClick} />);
        const r = container.querySelector('rect[data-fig-block="p149-fig1"]')!;
        // 去空白裁切：字框与插图块框的外接矩形（100..960 × 100..900）四周留 3% → 左上角 (70,70)
        expect(r.getAttribute('x')).toBe('30');
        expect(r.getAttribute('y')).toBe('230');
        expect(r.getAttribute('width')).toBe('600');
        expect(r.getAttribute('height')).toBe('600');
        expect(r.getAttribute('stroke-dasharray')).toBeTruthy();
        fireEvent.click(r);
        expect(onFigBlockClick).toHaveBeenCalledWith('p149-fig1');
    });

    it('选中的插图块实线加重', () => {
        const { container } = render(<GujiWarpCanvas imageUrl="" pageData={pageData} selectedCharIds={new Set()} selectedFigBlock="p149-fig1" />);
        const r = container.querySelector('rect[data-fig-block="p149-fig1"]')!;
        expect(r.getAttribute('data-selected')).toBe('true');
        expect(r.getAttribute('stroke-dasharray')).toBeNull();
    });

    it('没有 figBlocks：没有这类 rect（与改前一致）', () => {
        const { figBlocks: _f, ...plain } = pageData;
        const { container } = render(<GujiWarpCanvas imageUrl="" pageData={plain} selectedCharIds={new Set()} />);
        expect(container.querySelector('rect[data-fig-block]')).toBeNull();
    });
});
