/**
 * 条目页长列表的「展開其餘」（overview#325）：桌面按已渲染条数截，手机端再收到前 NARROW_CAP 条，
 * 两套文案都渲染、由样式切换；只在手机端才有得展开时，按钮带 bim-d-more-ncap（桌面藏）。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CapMore, NARROW_CAP } from '../../src/components/detail/layout';

describe('CapMore', () => {
    it('桌面也截了：两套文案各算各的', () => {
        const { container } = render(<CapMore total={35} shown={12} unit="種版本" onClick={vi.fn()} />);
        const btn = container.querySelector('button')!;
        expect(btn.className).not.toMatch(/bim-d-more-ncap/);
        expect(btn.querySelector('.bim-d-more-w')!.textContent).toBe('展開其餘 23 種版本');
        expect(btn.querySelector('.bim-d-more-n')!.textContent).toBe(`展開其餘 ${35 - NARROW_CAP} 種版本`);
    });
    it('桌面全显示、只有手机端收起：按钮带 ncap，只有手机文案', () => {
        const { container } = render(<CapMore total={10} shown={10} unit="種著作" onClick={vi.fn()} />);
        const btn = container.querySelector('button')!;
        expect(btn.className).toMatch(/bim-d-more-ncap/);
        expect(btn.querySelector('.bim-d-more-w')).toBeNull();
        expect(btn.textContent).toBe(`展開其餘 ${10 - NARROW_CAP} 種著作`);
    });
    it('只比 NARROW_CAP 多一条：手机端也不收，不出按钮', () => {
        const { container } = render(<CapMore total={NARROW_CAP + 1} shown={NARROW_CAP + 1} unit="種" onClick={vi.fn()} />);
        expect(container.querySelector('button')).toBeNull();
    });
    it('不超过 NARROW_CAP 条：不出按钮', () => {
        const { container } = render(<CapMore total={NARROW_CAP} shown={NARROW_CAP} unit="種" onClick={vi.fn()} />);
        expect(container.querySelector('button')).toBeNull();
    });
});
