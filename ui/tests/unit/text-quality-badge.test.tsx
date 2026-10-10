/**
 * 整理本质量徽标（book-text 新词表）：六档都显示；暂无正文／占位用灰色、不加粗；
 * 旧值 published 显示为「底本」；未知值不显示徽标。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { TextReader } from '../../src/components/TextReader';
import type { CollatedJuan } from '../../src/types';
import { fakeTextTransport } from './helpers/text-transport';

const JUAN: CollatedJuan = {
    title: '正史類',
    sections: [{ title: '《史記》一百三十卷', type: 'book', content: '漢太史令夏陽司馬遷子長撰。' }],
};

function mountWithGrade(grade: unknown, locale: 'zh-Hant' | 'zh-Hans' = 'zh-Hant') {
    const transport = fakeTextTransport('w1', {
        chapters: [{ n: 1, file: '001', title: '卷1', has_json: true }],
        index: { title: '直齋書錄解題', type: 'catalog', text_quality: { grade, source_note: '維基文庫' } },
        json: JUAN,
        kind: 'collated',
    });
    return render(
        <LocaleProvider locale={locale}>
            <TextReader id="w1" transport={transport} />
        </LocaleProvider>,
    );
}

/** 等整理本渲染出元数据行，再取徽标（无徽标时返回 null） */
async function badgeOf(container: HTMLElement): Promise<HTMLElement | null> {
    await waitFor(() => expect(container.querySelector('.bim-rd-meta')).not.toBeNull());
    return container.querySelector<HTMLElement>('.bim-rd-meta .bim-rd-grade');
}

describe('整理本质量徽标：新词表六档', () => {
    it.each([
        ['source', '底本'],
        ['ocr', 'OCR'],
        ['rough', '粗校'],
        ['fine', '精校'],
        ['none', '暫無正文'],
        ['placeholder', '占位'],
    ])('%s 显示为「%s」', async (grade, text) => {
        const { container } = mountWithGrade(grade);
        const badge = await badgeOf(container);
        expect(badge?.textContent).toBe(text);
    });

    it('简体界面：暂无正文', async () => {
        const { container } = mountWithGrade('none', 'zh-Hans');
        const badge = await badgeOf(container);
        expect(badge?.textContent).toBe('暂无正文');
    });

    it('暂无正文、占位：灰色、不加粗（inline 覆盖；其余档不带 inline 样式）', async () => {
        for (const grade of ['none', 'placeholder']) {
            const { container, unmount } = mountWithGrade(grade);
            const badge = await badgeOf(container);
            expect(badge?.getAttribute('style'), grade).toMatch(new RegExp(`quality-${grade}`));
            expect(badge?.getAttribute('style'), grade).toMatch(/font-weight:\s*400/);
            unmount();
        }
        const { container } = mountWithGrade('fine');
        const badge = await badgeOf(container);
        expect(badge?.hasAttribute('style')).toBe(false);
    });

    it('旧值 published 归一为 source，显示「底本」', async () => {
        const { container } = mountWithGrade('published');
        const badge = await badgeOf(container);
        expect(badge?.textContent).toBe('底本');
    });

    it('未知值不显示徽标（元数据行仍在）', async () => {
        const { container } = mountWithGrade('bogus');
        expect(await badgeOf(container)).toBeNull();
        expect(container.querySelector('.bim-rd-meta')?.textContent).toContain('部書');
    });

    it.each([[undefined], [''], [null]])('质量档缺值（%s）不显示徽标，也不落到「质量未评定」', async (grade) => {
        const { container } = mountWithGrade(grade);
        expect(await badgeOf(container)).toBeNull();
        expect(container.querySelector('.bim-rd-meta')?.textContent).not.toMatch(/質量未評定|质量未评定/);
        expect(container.querySelector('.bim-rd-meta [title]')).toBeNull();
    });

    it.each([
        ['source', 'zh-Hant', '照錄來源原文，本站未另行校對'],
        ['none', 'zh-Hant', '質量未評定'],
        ['placeholder', 'zh-Hant', '占位條目，正文尚未錄入'],
        ['source', 'zh-Hans', '照录来源原文，本站未另行校对'],
        ['none', 'zh-Hans', '质量未评定'],
        ['placeholder', 'zh-Hans', '占位条目，正文尚未录入'],
    ] as const)('%s（%s）的 tooltip 采纳文本总管复核：%s', async (grade, locale, tip) => {
        const { container } = mountWithGrade(grade, locale);
        const badge = await badgeOf(container);
        expect(badge?.closest('[title]')?.getAttribute('title')).toBe(tip);
    });
});
