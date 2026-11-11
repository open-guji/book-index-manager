/**
 * 千本级作品（敦煌佛典一部经上千个 Book）：版本表按 Collection 分组折叠，
 * 只用 `_books` 卡片成行，展开才逐条取详情；同卷／綴合关系作小标签。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import { groupByCollection, GROUP_MIN, relationGroups } from '../../src/core/detail-model';
import type { DerivedBookCard, IndexDetailData } from '../../src/types';

function cards(n: number): DerivedBookCard[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `b${i}`, title: '妙法蓮華經', edition: `敦煌寫卷 S.${i}`, dating: '唐',
        coll: i % 2 ? 'cB' : 'cA', collt: i % 2 ? '法國國家圖書館敦煌文獻' : '英國國家圖書館敦煌文獻',
        ...(i % 5 === 0 ? { img: true as const } : {}),
    }));
}

describe('groupByCollection', () => {
    it('按 coll 分组、保持组内序，缺 coll 退按 holder，都缺归末', () => {
        const gs = groupByCollection([
            { id: '1', coll: 'cA', collt: 'A' }, { id: '2', holder: '國圖' }, { id: '3' }, { id: '4', coll: 'cA', collt: 'A', img: true },
        ]);
        expect(gs.map(g => [g.title, g.rows.map(r => r.id)])).toEqual([['A', ['1', '4']], ['國圖', ['2']], ['', ['3']]]);
        expect(gs[0].imageCount).toBe(1);
    });
    it('relationGroups 排除同版，按关系词归并', () => {
        expect(relationGroups({ id: 'x', related_books: [
            { book_id: 'a', relation: '同卷' }, { book_id: 'b', relation: '同卷' }, { book_id: 'c', relation: '綴合' }, { book_id: 'd', relation: '同版' }, { book_id: 'f', relation: '同源' }, 'e',
        ] })).toEqual([{ relation: '同卷', ids: ['a', 'b'] }, { relation: '綴合', ids: ['c'] }]);
    });
});

describe('WorkPage 千本分组', () => {
    const work = {
        id: 'w1', type: 'work', title: '妙法蓮華經', _books: cards(GROUP_MIN + 50),
    } as unknown as IndexDetailData;
    const getItem = vi.fn(async (id: string) => (id === work.id ? work : id === 'b0'
        ? { id: 'b0', related_books: [{ book_id: 'b2', relation: '同卷' }] } : { id })) as never;
    const transport = {
        getItem, getEntry: vi.fn(async () => null), getLineageGraph: vi.fn(async () => null),
        getTextManifest: vi.fn(async () => null), getTextIndex: vi.fn(async () => null),
    };

    it('默认全收起、不逐条取详情；展开一组后才取并显示同卷标签', async () => {
        render(<BookDetailLayout id="w1" transport={transport as never} initialDetail={work} activeTab="basic" onTabChange={() => {}} />);
        expect(screen.getByText('英國國家圖書館敦煌文獻')).toBeTruthy();
        expect(screen.getByText('法國國家圖書館敦煌文獻')).toBeTruthy();
        expect((getItem as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(c => String(c[0]).startsWith('b')).length).toBe(0);
        fireEvent.click(screen.getByText('英國國家圖書館敦煌文獻'));
        await waitFor(() => expect(screen.getByText(/同卷 1/)).toBeTruthy());
    });
});
