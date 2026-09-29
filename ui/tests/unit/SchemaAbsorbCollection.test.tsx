/**
 * overview#283：Collection 新 schema 字段（count / _member_type）。
 * null／缺失不显示不崩；count.source 不进前台。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';

function mount(data: Record<string, unknown>) {
    const d = { id: 'c1', type: 'collection', title: '某叢書', ...data } as unknown as IndexDetailData;
    const transport = {
        getItem: vi.fn(async () => null), getEntry: vi.fn(async () => null),
        getCollatedEditionIndex: vi.fn(async () => null), getLineageGraph: vi.fn(async () => null),
        getWorkFullTextList: vi.fn(async () => []), getBookFullTextIndex: vi.fn(async () => null),
    };
    return render(<BookDetailLayout id="c1" transport={transport as never} initialDetail={d}
        activeTab="basic" onTabChange={() => {}} />);
}
const card = (c: HTMLElement) => c.querySelector('.bim-d-card')?.textContent ?? '';

describe('Collection 新字段', () => {
    it('count：卷／冊进数字格，種、函拼成「應收」，null 项跳过，source 不出现', async () => {
        const { container } = mount({ count: { juan: null, ce: 500, zhong: 463, han: null, source: 'INTERNAL-SRC' } });
        await waitFor(() => expect(card(container)).toContain('應收'));
        expect(card(container)).toContain('463 種');
        expect(card(container)).toContain('500冊');   // 数字格：数字 + 单位
        expect(card(container)).not.toContain('函');
        expect(container.textContent).not.toContain('INTERNAL-SRC');
    });

    it('count 全 null 或缺失：不出「應收」', async () => {
        const a = mount({ count: { juan: null, ce: null, zhong: null, han: null, source: 'x' } });
        await waitFor(() => expect(a.container.querySelector('.bim-d-card')).toBeTruthy());
        expect(card(a.container)).not.toContain('應收');
        const b = mount({});
        await waitFor(() => expect(b.container.querySelector('.bim-d-card')).toBeTruthy());
        expect(card(b.container)).not.toContain('應收');
    });

    it('_member_type 决定成员行措辞；缺则回退「成員」', async () => {
        const mk = (t?: string) => mount({ _member_count: 40, ...(t ? { _member_type: t } : {}),
            contained_works: [{ id: 'w', title: 'x' }] });
        const a = mk('Book');
        await waitFor(() => expect(card(a.container)).toContain('所收版本'));
        const b = mk('Work');
        await waitFor(() => expect(card(b.container)).toContain('所收作品'));
        const c = mk('mixed');
        await waitFor(() => expect(card(c.container)).toContain('成員'));
        const d = mk();
        await waitFor(() => expect(card(d.container)).toContain('成員'));
    });
});
