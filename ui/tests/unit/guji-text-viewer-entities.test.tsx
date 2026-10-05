/**
 * 对读正文的实体标注（overview#389）：按逐字 anchor 对位，不依赖偏移；点专名里的字不跳走。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptEntityJson } from '../../src/core/entity-annotations';
import { LocaleProvider } from '../../src/i18n';

const chars = (page: number, col: number, text: string) =>
    Array.from(text).map((char, i) => ({ id: `${page}:${col}:${i + 1}`, char, slot: i + 1, pos: i + 1, bbox_col: [0, 0, 1, 1] as number[], sub: null }));

const pageData: any = {
    page_id: 'vol:3',
    columns: [{ col: 1, chars: chars(3, 1, '漢書藝文志王弼注') }],
    pages: [{ page: 3, columns: [{ col: 1, chars: chars(3, 1, '漢書藝文志王弼注') }] }],
};

const entities = adaptEntityJson({
    entities: [
        { id: 'e1', type: 'work', text: '漢書藝文志', anchor: { start: '3:1:1', end: '3:1:5' }, span: { start_offset: 0, end_offset: 5 }, target: { status: 'matched', entity_id: 'w1abc' } },
        { id: 'e2', type: 'people', text: '王弼', anchor: { start: '3:1:6', end: '3:1:7' }, span: { start_offset: 5, end_offset: 7 }, target: { status: 'new_candidate' } },
    ],
});

function setup(extra: Partial<React.ComponentProps<typeof GujiTextViewer>> = {}) {
    return render(
        <LocaleProvider>
            <GujiTextViewer pageData={pageData} pages={pageData.pages} selectedCharIds={new Set()} entities={entities} {...extra} />
        </LocaleProvider>,
    );
}

describe('GujiTextViewer 实体标注', () => {
    it('anchor 范围内的字包进实体：已收录是链接，未收录只画线', () => {
        const { container } = setup();
        const link = container.querySelector('a.bim-et-work') as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/item/w1abc');
        expect(Array.from(link.querySelectorAll('[data-char-id]')).map(e => e.textContent).join('')).toBe('漢書藝文志');
        const plain = container.querySelector('span.bim-et-person') as HTMLElement;
        expect(plain.tagName).toBe('SPAN');
        expect(plain.textContent).toBe('王弼');
        expect(container.querySelectorAll('[data-char-id]').length).toBe(8);
    });

    it('没传 entities：不画线', () => {
        const { container } = setup({ entities: undefined });
        expect(container.querySelector('.bim-et')).toBeNull();
    });

    it('点专名里的字：照常点字，不跳条目；Ctrl 点击才进条目页', () => {
        const onCharClick = vi.fn();
        const onEntityNavigate = vi.fn((_id: string, e: React.MouseEvent) => e.preventDefault());
        const { container } = setup({ onCharClick, onEntityNavigate });
        const ch = container.querySelector('[data-char-id="3:1:2"]') as HTMLElement;
        const ev = fireEvent.click(ch, { detail: 1 });
        expect(onCharClick).toHaveBeenCalledWith('3:1:2');
        expect(onEntityNavigate).not.toHaveBeenCalled();
        expect(ev).toBe(false); // 默认行为（跳转）被拦下
        fireEvent.click(ch, { detail: 1, ctrlKey: true });
        expect(onEntityNavigate).toHaveBeenCalledWith('w1abc', expect.anything());
    });
});
