/**
 * kyg 9-30 反馈（overview#322）：网站顶栏已有繁简切换，条目页页内顶部不再放繁简与 GitHub 图标。
 * hideHeaderControls 默认 false，行为不变；为 true 时两者都不出，页脚右侧的数据来源链接照旧。
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { BookDetailLayoutProps } from '../../src/components/BookDetailLayout';
import { LocaleProvider } from '../../src/i18n/provider';
import type { IndexDetailData } from '../../src/types';
import shiji from './fixtures/shiji-work.json';

const SHIJI = shiji as unknown as IndexDetailData;
const SRC = 'https://github.com/open-guji/book-index/blob/main/Work/x.json';

const transport = {
    getItem: async () => SHIJI as unknown as Record<string, unknown>,
    getEntry: async () => null,
    getCollatedEditionIndex: async () => null,
    getLineageGraph: async () => null,
    getWorkFullTextList: async () => [],
    getBookFullTextIndex: async () => null,
};

function renderDetail(over: Partial<BookDetailLayoutProps> = {}) {
    return render(
        <LocaleProvider>
            <BookDetailLayout
                id="d59f20aowb9c"
                transport={transport as never}
                activeTab="basic"
                onTabChange={() => {}}
                initialDetail={SHIJI}
                getSourceLink={() => ({ href: SRC, label: '數據與許可' })}
                {...over}
            />
        </LocaleProvider>,
    );
}

const githubIcons = (c: HTMLElement) => c.querySelectorAll(`a[href="${SRC}"][aria-label]`);

describe('BookDetailLayout hideHeaderControls', () => {
    it('默认：页内顶部有繁简切换和 GitHub 图标', () => {
        const { container } = renderDetail();
        expect(screen.getByTitle(/切換為繁體|切换为简体/)).toBeTruthy();
        expect(githubIcons(container).length).toBe(1);
    });

    it('hideHeaderControls：两者都不出，页脚的数据来源链接还在', () => {
        const { container } = renderDetail({ hideHeaderControls: true });
        expect(screen.queryByTitle(/切換為繁體|切换为简体/)).toBeNull();
        expect(githubIcons(container).length).toBe(0);
        expect(container.querySelectorAll(`a[href="${SRC}"]`).length).toBe(1);
    });
});
