/**
 * overview#283：Book 新 schema 字段（physical_description / edition_type / provenance / base_edition）。
 * 有值要显示；空值（空串、空数组、字段缺失）不显示也不崩；source 等内部字段不进前台。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';
import { deriveEditionType } from '../../src/core/detail-model';

function mount(data: Record<string, unknown>) {
    const d = { id: 'bk1', type: 'book', title: '某書', ...data } as unknown as IndexDetailData;
    const transport = {
        getItem: vi.fn(async () => null), getEntry: vi.fn(async () => null),
        getLineageGraph: vi.fn(async () => null),
    };
    return render(<BookDetailLayout id="bk1" transport={transport as never} initialDetail={d}
        activeTab="basic" onTabChange={() => {}} />);
}
const factText = (c: HTMLElement) => c.querySelector('.bim-d-card')?.textContent ?? '';

describe('Book 新字段', () => {
    it('edition_type 优先于现推，且不标「據版本題名推斷」', async () => {
        expect(deriveEditionType({ edition_type: '抄本', edition: '某某刻本' })).toBe('抄本');
        const { container } = mount({ edition: '某某刻本', edition_type: '套印本' });
        await waitFor(() => expect(factText(container)).toContain('套印本'));
        expect(factText(container)).toContain('版本類型套印本');
        expect(container.querySelector('[title="據版本題名推斷"]')).toBeNull();
    });

    it('physical_description：非空子段各一行，空串不显示，source 不出现', async () => {
        const { container } = mount({ physical_description: {
            leaf_style: '半葉十行行二十字', binding: '線裝', dimensions: '', condition: '', source: 'INTERNAL-SRC' } });
        await waitFor(() => expect(factText(container)).toContain('半葉十行行二十字'));
        const t = factText(container);
        expect(t).toContain('行款'); expect(t).toContain('裝幀');
        expect(t).not.toContain('尺寸'); expect(t).not.toContain('品相');
        expect(container.textContent).not.toContain('INTERNAL-SRC');
    });

    it('provenance：存藏＋索書號＋藏印；优先于 current_location；source 不出现', async () => {
        const { container } = mount({
            current_location: { name: '舊藏地' },
            provenance: [{ institution: '國立故宮博物院', call_number: '故善012603', seals: ['某氏藏印'], notes: '', source: 'INTERNAL-SRC' }],
        });
        await waitFor(() => expect(factText(container)).toContain('故善012603'));
        const t = factText(container);
        expect(t).toContain('國立故宮博物院'); expect(t).toContain('某氏藏印'); expect(t).not.toContain('舊藏地');
        expect(container.textContent).not.toContain('INTERNAL-SRC');
    });

    it('provenance：无索書號／藏印则不出这两行；空数组回退 current_location', async () => {
        const { container } = mount({ provenance: [{ institution: '某館', call_number: '', seals: [] }] });
        await waitFor(() => expect(factText(container)).toContain('某館'));
        expect(factText(container)).not.toContain('索書號'); expect(factText(container)).not.toContain('藏印');
        const r = mount({ provenance: [], current_location: { name: '回退地' } });
        await waitFor(() => expect(factText(r.container)).toContain('回退地'));
    });

    it('base_edition：配補／參校各一行，无名条目跳过', async () => {
        const { container } = mount({ base_edition: [
            { role: '底本', name: '宋刻本' }, { role: '配補', name: '明抄本' }, { role: '參校', name: '' },
        ] });
        await waitFor(() => expect(factText(container)).toContain('明抄本'));
        const t = factText(container);
        expect(t).toContain('底本'); expect(t).toContain('宋刻本'); expect(t).not.toContain('參校');
    });

    it('全部缺失或为空：不崩', async () => {
        const { container } = mount({ physical_description: { leaf_style: '', binding: '', dimensions: '', condition: '' },
            provenance: [], base_edition: [] });
        await waitFor(() => expect(container.querySelector('.bim-d-card')).toBeTruthy());
        expect(factText(container)).not.toContain('行款');
    });
});
