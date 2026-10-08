/**
 * schema-v2 条目经 BookDetailLayout 渲染（overview#458）：丛编子目总数、人物作品表、作品版本表。
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import { LocaleProvider } from '../../src/i18n/provider';
import juzhen from './fixtures/contract-sample/entry/8rlcsybg2hhf.json';
import ouyangxiu from './fixtures/contract-sample/entry/hixhd2h9bdye.json';
import kaozheng from './fixtures/contract-sample/entry/d59dgrvmvrwg.json';
import hubs from './fixtures/contract-sample/_hubs.json';

function mount(entry: any) {
    const transport = {
        getItem: async (id: string) => (id === entry.id ? entry : null),
        getEntry: async () => null,
        getLineageGraph: async () => null,
        getHubs: async () => hubs,
    };
    return render(
        <LocaleProvider converter={(s: string) => s}>
            <BookDetailLayout id={entry.id} transport={transport as never} activeTab="basic" onTabChange={() => {}} />
        </LocaleProvider>,
    );
}

describe('schema-v2 条目渲染', () => {
    it('丛编：只带前 20 项，页面按 _member_count 显示总数 288', async () => {
        const { container } = mount(juzhen);
        await waitFor(() => expect(screen.getAllByText(/武英殿聚珍版叢書/).length).toBeGreaterThan(0));
        expect(container.textContent).toContain('288');
        // 子目表有 _members 前 20 项（Book 成员未解析时以 id 占位）
        const firstId = (juzhen as any)._members[0].id as string;
        await waitFor(() => expect(container.textContent).toContain(firstId));
    });

    it('人物：_works 的作品出现在作品表里', async () => {
        const { container } = mount(ouyangxiu);
        const first = (ouyangxiu as any)._works[0].title as string;
        await waitFor(() => expect(container.textContent).toContain(first));
    });

    it('作品：_books 的版本出现在版本表里', async () => {
        const { container } = mount(kaozheng);
                // 版本表的行来自 _books（Book 未解析时以 id 占位）
        for (const b of (kaozheng as any)._books) {
            await waitFor(() => expect(container.textContent).toContain(b.id));
        }
    });
});
