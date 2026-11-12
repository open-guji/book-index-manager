/**
 * 同卷／綴合（敦煌写卷正背、残片拼合）：对称关系只存一侧，build_derived 契约 5 起
 * 在两侧的 `_related` 里都带原关系词。书页与版本表行标签要读两侧，
 * 书页上单列「同卷 · 綴合」一行，不放在「翻刻 · 衍生」下。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import { symmetricRelatedItems } from '../../src/core/lineage-graph';
import { relationGroups } from '../../src/core/detail-model';
import type { IndexDetailData } from '../../src/types';

describe('symmetricRelatedItems', () => {
    it('related_books 与 _related 并集，按 (id, 关系词) 去重，本侧存储优先', () => {
        const items = symmetricRelatedItems({
            related_books: [{ book_id: 'a', relation: '同卷', evidence: '同一寫卷' }],
            _related: [
                { id: 'a', t: 'book', relation: '同卷', direction: 'out' },
                { id: 'b', t: 'book', relation: '綴合', direction: 'in' },
                { id: 'c', t: 'book', relation: 'related', direction: 'in' },
                { id: 'k', t: 'collection', relation: '同卷', direction: 'in' },
            ],
        });
        expect(items.map(r => [r.book_id, r.relation, r.evidence])).toEqual([
            ['a', '同卷', '同一寫卷'], ['b', '綴合', undefined],
        ]);
    });
    it('relationGroups 认对方存储的同卷', () => {
        expect(relationGroups({ id: 'x', _related: [{ id: 'p', t: 'book', relation: '同卷', direction: 'in' }] }))
            .toEqual([{ relation: '同卷', ids: ['p'] }]);
    });
});

describe('BookPage 同卷 · 綴合', () => {
    it('只在对方存储时也显示，且单列一行', async () => {
        const book = {
            id: 'b7p', type: 'book', title: '食療本草', edition: '敦煌寫本斯00076號',
            _related: [{ id: 'b7q', t: 'book', title: '觀岳壽寺松因課留題等七言詩二首', relation: '同卷', direction: 'in' }],
        } as unknown as IndexDetailData;
        const other = { id: 'b7q', type: 'book', title: '觀岳壽寺松因課留題等七言詩二首', edition: '敦煌寫本斯00076號背4' };
        const transport = {
            getItem: vi.fn(async (id: string) => (id === 'b7p' ? book : id === 'b7q' ? other : null) as never),
            getEntry: vi.fn(async () => null),
            getLineageGraph: vi.fn(async () => null),
            getTextManifest: vi.fn(async () => null),
            getTextIndex: vi.fn(async () => null),
        };
        render(<BookDetailLayout id="b7p" transport={transport as never} activeTab="basic" onTabChange={() => {}} />);
        const row = await screen.findByTestId('lineage-scroll');
        expect(row.textContent).toContain('同卷');
        await waitFor(() => expect(within(row).getByText(/斯00076號背4|七言詩/)).toBeTruthy());
        expect(screen.queryByText('翻刻 · 衍生')).toBeNull();
    });
});
