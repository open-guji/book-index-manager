/**
 * 书影画布上的插件修饰（阅读器插件 decorate）：色块、下划线、下标、字后插入字、焦点框；未修饰的字不受影响。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GujiWarpCanvas, type PageWarpData } from '../../src/components/Reader/GujiWarpCanvas';
import type { CellDecoration } from '../../src/components/Reader/plugins';

const pageData: PageWarpData = {
    page_id: 'p:3', title: '第3葉', image_size: [1000, 1400], total_warped_w: 1000,
    columns: [{ col: 1, warped_w: 1000, warped_h: 1400, offset_x: 0, strips: [], chars: [
        { id: '3:1:1', char: '欽', slot: 1, pos: 1, bbox_col: [900, 100, 960, 160] },
        { id: '3:1:2', char: '定', slot: 2, pos: 2, bbox_col: [900, 170, 960, 230] },
    ] }],
};

describe('GujiWarpCanvas · 插件修饰', () => {
    it('按字框画色块、下划线、下标、插入字、焦点框', () => {
        const decorations = new Map<string, CellDecoration>([
            ['3:1:1', { tone: 'warn', underline: 'wavy', sub: '訂', insertAfter: '之', focus: true }],
            ['3:1:2', { tone: 'cmp-x', bg: '#abc', fg: '#123', underline: 'dashed' }],
        ]);
        const { container } = render(<GujiWarpCanvas imageUrl="" pageData={pageData} selectedCharIds={new Set()} decorations={decorations} />);
        const gs = container.querySelectorAll('g[data-cd]');
        expect(gs.length).toBe(2);
        const g1 = gs[0];
        expect(g1.getAttribute('data-cd')).toBe('warn');
        expect(g1.hasAttribute('data-cd-focus')).toBe(true);
        expect(g1.querySelector('text[data-cd-sub]')?.textContent).toBe('訂');
        expect(g1.querySelector('text[data-cd-ins]')?.textContent).toBe('之');
        const g2 = gs[1];
        expect(g2.querySelector('rect')?.getAttribute('fill')).toBe('#abc');
        expect(g2.querySelector('line')?.getAttribute('stroke')).toBe('#123');
        expect(g2.querySelector('line')?.getAttribute('stroke-dasharray')).toBeTruthy();
    });

    it('没有修饰：不出现 g[data-cd]（与改前一致）', () => {
        const { container } = render(<GujiWarpCanvas imageUrl="" pageData={pageData} selectedCharIds={new Set()} />);
        expect(container.querySelector('g[data-cd]')).toBeNull();
    });
});
