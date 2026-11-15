/**
 * 单篇诗文（2026-11-15 方案 A）三处页面：
 * - 诗页「收入叢編」旁栏写卷次与次序（源档 related_works 的 volume_index／order）；
 * - 总集页「篇目」按页取 contents/<id>/<n>.json，卷次只在换卷时写；
 * - 人物页把 st 为诗词曲赋文的作品单列「單篇詩文」，不混进著作表。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { BookDetailLayoutProps } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';

function props(data: IndexDetailData, transportExtra: Record<string, unknown> = {}): BookDetailLayoutProps {
    return {
        id: data.id,
        transport: {
            getItem: vi.fn(async (id: string) => (id === data.id ? data : null) as never),
            getEntry: vi.fn(async () => null),
            getLineageGraph: vi.fn(async () => null),
            getTextManifest: vi.fn(async () => null),
            getTextIndex: vi.fn(async () => null),
            ...transportExtra,
        } as never,
        initialDetail: data,
        activeTab: 'basic',
        onTabChange: () => {},
    };
}

const POEM = {
    id: 'p1', type: 'work', subtype: 'poem', title: '晚春臥病寄張八',
    authors: [{ name: '孟浩然', role: '撰', dynasty: '唐' }],
    related_works: [{ id: 'qts', relation: 'collected_in', volume_index: 159, order: 3 }],
    _related: [{ id: 'qts', title: '全唐詩', relation: 'collected_in', direction: 'out' }],
} as unknown as IndexDetailData;

const ANTHOLOGY = {
    id: 'qts', type: 'work', title: '全唐詩',
    _contents: { total: 3, pages: 1 },
} as unknown as IndexDetailData;

const PAGE1 = [
    { id: 'p0', title: '從張丞相遊南紀城獵戲贈裴迪張參軍', au: ['孟浩然'], st: 'poem', vol: 159, ord: 1 },
    { id: 'p1', title: '晚春臥病寄張八', au: ['孟浩然'], st: 'poem', vol: 159, ord: 3 },
    { id: 'p9', title: '登萬歲樓', au: ['孟浩然'], st: 'poem', vol: 160, ord: 136 },
];

const POET = {
    id: 'e1', type: 'entity', subtype: 'person', primary_name: '孟浩然', title: '孟浩然', dynasty: '唐',
    _works: [
        { work_id: 'w1', title: '孟浩然集', role: '撰', nb: 41 },
        { work_id: 'p0', title: '從張丞相遊南紀城獵戲贈裴迪張參軍', st: 'poem', role: '撰', txt: true },
        { work_id: 'p1', title: '晚春臥病寄張八', st: 'poem', role: '撰', txt: true },
        { work_id: 'c1', title: '某詞', st: 'ci', role: '撰' },
    ],
} as unknown as IndexDetailData;

describe('单篇诗文页面', () => {
    it('诗页：收入旁栏写「卷159 · 第3首」', async () => {
        const { container } = render(<BookDetailLayout {...props(POEM)} />);
        await waitFor(() => expect(container.querySelector('#collected')).toBeTruthy());
        const side = container.querySelector('#collected') as HTMLElement;
        expect(within(side).getByText('全唐詩')).toBeTruthy();
        expect(within(side).getByText('卷159 · 第3首')).toBeTruthy();
    });

    it('总集页：篇目按页取，卷次换卷才写', async () => {
        const getWorkContents = vi.fn(async () => PAGE1);
        const { container } = render(<BookDetailLayout {...props(ANTHOLOGY, { getWorkContents })} />);
        await waitFor(() => expect(container.querySelector('#contents table')).toBeTruthy());
        expect(getWorkContents).toHaveBeenCalledWith('qts', 1);
        const sec = container.querySelector('#contents') as HTMLElement;
        expect(within(sec).getByText('共 3 篇')).toBeTruthy();
        const vols = [...sec.querySelectorAll('tbody tr')].map(tr => tr.querySelector('td')!.textContent);
        expect(vols).toEqual(['159', '', '160']);
        expect(within(sec).getByText('登萬歲樓')).toBeTruthy();
    });

    it('人物页：诗词另列「單篇詩文」，著作表只剩集子', async () => {
        const { container } = render(<BookDetailLayout {...props(POET)} />);
        await waitFor(() => expect(container.querySelector('#pieces')).toBeTruthy());
        const works = container.querySelector('#works') as HTMLElement;
        expect(within(works).getByText('孟浩然集')).toBeTruthy();
        expect(within(works).queryByText('晚春臥病寄張八')).toBeNull();
        const pieces = container.querySelector('#pieces') as HTMLElement;
        expect(within(pieces).getByText('晚春臥病寄張八')).toBeTruthy();
        expect(within(pieces).getByText('3 篇')).toBeTruthy();
        // 体裁两种 → 页签：全部 3、詩 2、詞 1
        expect(within(pieces).getByText('詩 2')).toBeTruthy();
        expect(within(pieces).getByText('詞 1')).toBeTruthy();
        expect(screen.getAllByText('單篇詩文').length).toBeGreaterThan(0);
    });
});
