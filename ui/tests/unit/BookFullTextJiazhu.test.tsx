/**
 * Book 全文页夹注（2026-09-26）：此前 BookFullText 直出章节文本，未接 renderInterlinear，
 * 维基全文（如《春秋公羊傳》）的注以字面尖括号示人。两种记法各一条。
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BookFullText } from '../../src/components/BookFullText';
import type { BookFullTextIndex } from '../../src/types';

const index: BookFullTextIndex = {
    book_id: 'b1',
    version_label: '测试本',
    source: { name: '维基文库', url: 'https://example.org' },
    total_chapters: 1,
    chapters: [{ n: 1, title: '隱公元年', file: '第001.md' }],
} as BookFullTextIndex;

function mount(text: string) {
    const transport = { getBookFullTextChapter: async () => text } as never;
    return render(<BookFullText index={index} bookId="b1" transport={transport} />).container;
}

describe('BookFullText 夹注', () => {
    it.each([
        ['<…>', '元年春王正月。<元年者何？君之始年也。>'],
        ['⟨…⟩', '元年春王正月。⟨元年者何？君之始年也。⟩'],
    ])('%s 记法以小字渲染、不露记号', async (_label, body) => {
        const c = mount(`## 隱公元年\n\n${body}\n`);
        await waitFor(() => expect(c.querySelector('.bim-jiazhu')).toBeTruthy());
        expect(c.querySelector('article')!.textContent).not.toMatch(/[<>⟨⟩]/);
        expect(c.querySelector('.bim-jiazhu')!.textContent).toBe('元年者何？君之始年也。');
    });
});
