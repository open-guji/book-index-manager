/**
 * MarkdownText：裸网址不吞全角标点（overview#268 P3）
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownText, splitAutolinkTail } from '../../src/components/common/MarkdownText';

describe('splitAutolinkTail', () => {
    it('在第一个全角标点处截断', () => {
        expect(splitAutolinkTail('https://a.org/x）」')).toEqual(['https://a.org/x', '）」']);
        expect(splitAutolinkTail('https://a.org/x，见')).toEqual(['https://a.org/x', '，见']);
    });
    it('没有全角标点原样返回', () => {
        expect(splitAutolinkTail('https://a.org/x?y=1')).toEqual(['https://a.org/x?y=1', '']);
    });
});

describe('MarkdownText 裸网址', () => {
    for (const p of ['）', '」', '』', '。', '，']) {
        it(`网址后紧跟「${p}」时不进链接`, () => {
            const { container } = render(<MarkdownText text={`见 https://example.org/a/b${p}后文`} />);
            const a = container.querySelector('a')!;
            expect(a.getAttribute('href')).toBe('https://example.org/a/b');
            expect(a.textContent).toBe('https://example.org/a/b');
            expect(container.textContent).toContain(`https://example.org/a/b${p}后文`);
        });
    }
    it('普通网址和显式 markdown 链接不受影响', () => {
        const { container } = render(<MarkdownText text={'[书](https://example.org/x) 与 https://example.org/y?q=1'} />);
        const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));
        expect(hrefs).toEqual(['https://example.org/x', 'https://example.org/y?q=1']);
    });
});
