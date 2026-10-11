/**
 * 阅读页右栏「条目」清单（JuanRail）标题里的夹注标记（overview#546）：
 * `<…>` 按夹注渲染（小字淡色、括号不见；旧 `⟨…⟩` 已退役）；没有夹注的标题逐字不变。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { JuanRail } from '../../src/components/CollatedEdition';

const juan = (titles: string[]) => ({
    title: '五行類',
    sections: titles.map(title => ({ title, type: 'book' })),
}) as never;

const mount = (titles: string[]) =>
    render(
        <LocaleProvider locale="zh-Hant">
            <JuanRail juan={juan(titles)} view="text" onView={() => {}} textHasEntries />
        </LocaleProvider>,
    );

describe('JuanRail 条目清单：夹注标记', () => {
    it('<…> 出夹注节点，文字里没有字面括号', () => {
        const { container } = mount(['《易杜秘林<一作“林秘”>》', '《法易<一作“易法”>》']);
        const items = [...container.querySelectorAll('.bim-rd-rail-list li a')];
        expect(items).toHaveLength(2);
        for (const a of items) {
            expect(a.querySelectorAll('.bim-jiazhu')).toHaveLength(1);
            expect(a.textContent).not.toMatch(/[<>]/);
        }
        expect(items[0].textContent).toBe('《易杜秘林一作“林秘”》');
        expect(items[0].querySelector('.bim-jiazhu')!.textContent).toBe('一作“林秘”');
        expect(items[1].textContent).toBe('《法易一作“易法”》');
    });

    it('没有夹注的标题逐字不变，不出夹注节点', () => {
        const { container } = mount(['《易大象林》', '《周易卜卦》']);
        const items = [...container.querySelectorAll('.bim-rd-rail-list li a')];
        expect(items.map(a => a.textContent)).toEqual(['《易大象林》', '《周易卜卦》']);
        expect(container.querySelectorAll('.bim-jiazhu')).toHaveLength(0);
    });

    it('book_title 优先于 title，同样走夹注渲染', () => {
        const j = { title: '類', sections: [{ title: '易', book_title: '易杜秘林<一作“林秘”>', type: 'book' }] } as never;
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><JuanRail juan={j} view="text" onView={() => {}} textHasEntries /></LocaleProvider>,
        );
        const a = container.querySelector('.bim-rd-rail-list li a')!;
        expect(a.textContent).toBe('易杜秘林一作“林秘”');
        expect(a.querySelectorAll('.bim-jiazhu')).toHaveLength(1);
    });
});
