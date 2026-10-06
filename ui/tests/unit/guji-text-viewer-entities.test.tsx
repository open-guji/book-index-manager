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

describe('GujiTextViewer 标点的前后位置（pos）', () => {
    const text = '孔子彖象傳元史本傳';
    const data: any = {
        page_id: 'vol:4',
        columns: [{ col: 1, chars: chars(4, 1, text) }],
        pages: [{ page: 4, columns: [{ col: 1, chars: chars(4, 1, text) }] }],
    };
    // 单字书名《彖》《象》；《元史》整词书名，《 挂在首字 元 之前
    const puncts: any[] = [
        { anchor: '4:1:3', mark: '《', pos: 'before', kind: 'point' },
        { anchor: '4:1:3', mark: '》', pos: 'after', kind: 'point' },
        { anchor: '4:1:3', mark: '、', pos: 'after', kind: 'point' },
        { anchor: '4:1:4', mark: '《', pos: 'before', kind: 'point' },
        { anchor: '4:1:4', mark: '》', pos: 'after', kind: 'point' },
        { anchor: '4:1:6', mark: '《', pos: 'before', kind: 'point' },
        { anchor: '4:1:7', mark: '》', pos: 'after', kind: 'point' },
    ];
    const render1 = (extra: Partial<React.ComponentProps<typeof GujiTextViewer>> = {}) =>
        render(
            <LocaleProvider>
                <GujiTextViewer pageData={data} pages={data.pages} selectedCharIds={new Set()} punctuations={puncts} showPunctuation {...extra} />
            </LocaleProvider>,
        );

    it('pos=before 的《 在字之前，不是挂到前一个字后面', () => {
        const { container } = render1();
        expect(container.querySelector('p')!.textContent).toBe('孔子《彖》、《象》傳《元史》本傳');
    });

    it('专名首字前的《 在专名线外面，线只画书名本身', () => {
        const ents = adaptEntityJson({
            entities: [{ id: 'e1', type: 'work', text: '元史', anchor: { start: '4:1:6', end: '4:1:7' }, span: { start_offset: 5, end_offset: 7 }, target: { status: 'new_candidate' } }],
        });
        const { container } = render1({ entities: ents });
        expect(container.querySelector('p')!.textContent).toBe('孔子《彖》、《象》傳《元史》本傳');
        expect(container.querySelector('.bim-et-work')!.textContent).toBe('元史');
    });
});

describe('GujiTextViewer 无字页', () => {
    it('columns 为空的页（只有书影）不进正文：没有页分隔、没有空段落', () => {
        const pages: any[] = [
            { page: 1, columns: [] },
            { page: 3, columns: [{ col: 1, chars: chars(3, 1, '漢書') }] },
            { page: 4, columns: [] },
            { page: 5, columns: [{ col: 1, chars: chars(5, 1, '藝文') }] },
        ];
        const { container } = render(
            <LocaleProvider>
                <GujiTextViewer pageData={{ page_id: 'vol:3', columns: [] } as any} pages={pages} selectedCharIds={new Set()} />
            </LocaleProvider>,
        );
        expect(Array.from(container.querySelectorAll('[data-page-section]')).map(e => e.getAttribute('data-page-section'))).toEqual(['3', '5']);
        expect(container.querySelectorAll('p').length).toBe(2);
    });
});
