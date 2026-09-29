/**
 * overview#283：Entity 新 schema 字段（dates；wikidata_id／viaf_id 类型声明）。
 * birth_year／death_year 优先；缺时回退 dates；basis 不进前台；缺失不崩。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';

function mount(data: Record<string, unknown>) {
    const d = { id: 'e1', type: 'entity', subtype: 'people', primary_name: '某人', title: '某人', ...data } as unknown as IndexDetailData;
    const transport = {
        getItem: vi.fn(async () => null), getEntry: vi.fn(async () => null),
        getCollatedEditionIndex: vi.fn(async () => null), getLineageGraph: vi.fn(async () => null),
        getWorkFullTextList: vi.fn(async () => []), getBookFullTextIndex: vi.fn(async () => null),
    };
    return render(<BookDetailLayout id="e1" transport={transport as never} initialDetail={d}
        activeTab="basic" onTabChange={() => {}} />);
}
const card = (c: HTMLElement) => c.querySelector('.bim-d-card')?.textContent ?? '';

describe('Entity.dates', () => {
    it('birth_year／death_year 缺时回退 dates.birth／death；basis 不出现', async () => {
        const { container } = mount({ dates: { birth: 557, death: 627, floruit: null, basis: 'INTERNAL-BASIS' } });
        await waitFor(() => expect(card(container)).toContain('557—627'));
        expect(container.textContent).not.toContain('INTERNAL-BASIS');
    });

    it('只有一端：另一端用 ?；公元前用「前」', async () => {
        const a = mount({ dates: { birth: null, death: 627 } });
        await waitFor(() => expect(card(a.container)).toContain('?—627'));
        const b = mount({ dates: { birth: -551, death: -479 } });
        await waitFor(() => expect(card(b.container)).toContain('前551—前479'));
    });

    it('birth_year／death_year 优先于 dates', async () => {
        const { container } = mount({ birth_year: 1130, death_year: 1200, dates: { birth: 1, death: 2 } });
        await waitFor(() => expect(card(container)).toContain('1130—1200'));
        expect(card(container)).not.toContain('1—2');
    });

    it('生卒皆缺时用 floruit；floruit 为 null、dates 缺失都不崩不显示', async () => {
        const a = mount({ dates: { birth: null, death: null, floruit: [1100, 1150] } });
        await waitFor(() => expect(card(a.container)).toContain('活躍於 1100—1150'));
        const b = mount({ dates: { birth: null, death: null, floruit: null } });
        await waitFor(() => expect(b.container.querySelector('.bim-d-card')).toBeTruthy());
        expect(card(b.container)).not.toContain('活躍');
        const c = mount({});
        await waitFor(() => expect(c.container.querySelector('.bim-d-card')).toBeTruthy());
        expect(card(c.container)).not.toContain('—');
    });
});
