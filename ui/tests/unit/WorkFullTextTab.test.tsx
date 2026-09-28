/**
 * W6c（2026-09-27）：Work 全文接进现有「全文」tab，并修「加载全文目录…」卡死。
 *
 * 旧版 BookFullText 用 index === null 同时表示「还在取」和「取不到」，于是
 * 目录 404／断网／transport 不支持，以及拿 Work id 去取 Book 全文目录（宋史 Work
 * 全文即此）都永远停在「加载全文目录…」。
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import { BookFullText, workFullTextOptionLabel } from '../../src/components/BookFullText';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import { BundleStorage } from '../../src/storage/bundle-storage';
import type { WorkFullTextEntry, WorkFullTextIndex } from '../../src/types';

/* 老子两份：version_label／source_name 相同，primary 是王弼本（排在前） */
const LAOZI: WorkFullTextEntry[] = [
    {
        key: 'wikisource-02', owner_type: 'Work', path: 'Work/t/6/o/d59ezkx8dt6o/full_text/wikisource-02',
        version_label: '老子', source_name: '維基文庫',
        source_url: 'https://zh.wikisource.org/wiki/%E9%81%93%E5%BE%B7%E7%B6%93%20%28%E7%8E%8B%E5%BC%BC%E6%9C%AC%29',
        total_chapters: 81, primary: true,
    },
    {
        key: 'wikisource-01', owner_type: 'Work', path: 'Work/t/6/o/d59ezkx8dt6o/full_text/wikisource-01',
        version_label: '老子', source_name: '維基文庫',
        source_url: 'https://zh.wikisource.org/wiki/%E8%80%81%E5%AD%90%20%28%E5%8C%AF%E6%A0%A1%E7%89%88%29',
        total_chapters: 2, primary: false,
    },
];

function workIndex(key: string, extra: Partial<WorkFullTextIndex> = {}): WorkFullTextIndex {
    return {
        work_id: 'w1',
        version_label: key,
        source: { name: '維基文庫', url: 'https://example.org' },
        total_chapters: 1,
        chapters: [{ n: 1, title: `${key}·一章`, file: '001.md' }],
        ...extra,
    } as WorkFullTextIndex;
}

describe('BookFullText 目录取不到时不再转圈', () => {
    it('getBookFullTextIndex 返回 null（404 被吞成 null）→ 1 秒内出失败提示', async () => {
        const transport = { getBookFullTextIndex: async () => null } as never;
        render(<BookFullText bookId="b1" transport={transport} />);
        await waitFor(() => expect(screen.getByText('无法加载全文目录')).toBeTruthy(), { timeout: 1000 });
        expect(screen.queryByText('加载全文目录…')).toBeNull();
    });

    it('getBookFullTextIndex 抛错（网络错误）→ 1 秒内出失败提示', async () => {
        const transport = { getBookFullTextIndex: async () => { throw new TypeError('Failed to fetch'); } } as never;
        render(<BookFullText bookId="b1" transport={transport} />);
        await waitFor(() => expect(screen.getByText('无法加载全文目录')).toBeTruthy(), { timeout: 1000 });
    });

    it('transport 不支持取目录 → 直接出失败提示', async () => {
        render(<BookFullText bookId="b1" transport={{} as never} />);
        await waitFor(() => expect(screen.getByText('无法加载全文目录')).toBeTruthy(), { timeout: 1000 });
    });

    describe('真 BundleStorage：目录请求 404／断网', () => {
        const original = globalThis.fetch;
        afterEach(() => { globalThis.fetch = original; });

        it.each([
            ['HTTP 404', async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => null }) as Response],
            ['网络错误', async () => { throw new TypeError('Failed to fetch'); }],
        ])('%s → 1 秒内出失败提示', async (_label, impl) => {
            globalThis.fetch = vi.fn(impl) as never;
            const storage = new BundleStorage({ basePath: '/data', version: 'v1' } as never);
            render(<BookFullText bookId="b1" transport={storage} />);
            await waitFor(() => expect(screen.getByText('无法加载全文目录')).toBeTruthy(), { timeout: 1000 });

            globalThis.fetch = vi.fn(impl) as never;
            render(<BookFullText bookId="w1" workKey="wikisource-01" transport={storage} />);
            await waitFor(() => expect(screen.getAllByText('无法加载全文目录').length).toBe(2), { timeout: 1000 });
        });
    });
});

describe('BookFullText 吃 Work 全文数据', () => {
    it('按 workKey 取目录与章节，`:::table` 照 table_notation 渲染成表格', async () => {
        const getWorkFullTextIndex = vi.fn(async (_w: string, k: string) =>
            workIndex(k, { table_notation: 'guji-table-v1' }));
        const getWorkFullTextChapter = vi.fn(async () =>
            '## 卷210\n\n宰輔表\n\n:::table\n| 年 | 宰相 |\n| 建隆元年 | 范質 |\n:::\n');
        const getBookFullTextIndex = vi.fn(async () => null);
        const transport = { getWorkFullTextIndex, getWorkFullTextChapter, getBookFullTextIndex } as never;
        const { container } = render(<BookFullText bookId="w1" workKey="wikisource-01" transport={transport} />);
        await waitFor(() => expect(container.querySelector('article table')).toBeTruthy());
        expect(getWorkFullTextIndex).toHaveBeenCalledWith('w1', 'wikisource-01');
        expect(getWorkFullTextChapter).toHaveBeenCalledWith('w1', 'wikisource-01', '001.md');
        expect(getBookFullTextIndex).not.toHaveBeenCalled();
        expect(container.querySelector('article')!.textContent).toContain('范質');
    });

    it('多份时顶部给原生下拉，选中当前 key，切换回调给 key', async () => {
        const onVersionChange = vi.fn();
        const transport = {
            getWorkFullTextIndex: async (_w: string, k: string) => workIndex(k),
            getWorkFullTextChapter: async () => '正文',
        } as never;
        const { container } = render(
            <BookFullText bookId="w1" workKey="wikisource-02" versions={LAOZI}
                onVersionChange={onVersionChange} transport={transport} />,
        );
        // 目录到了再取：加载态也有同一个下拉，但目录到后会重渲染成新节点
        await waitFor(() => expect(container.querySelector('article')).toBeTruthy());
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('wikisource-02');
        expect([...select.options].map(o => o.textContent)).toEqual([
            '維基文庫 · 道德經 (王弼本)',
            '維基文庫 · 老子 (匯校版)',
        ]);
        fireEvent.change(select, { target: { value: 'wikisource-01' } });
        expect(onVersionChange).toHaveBeenCalledWith('wikisource-01');
    });

    it('只有一份时不出下拉', async () => {
        const transport = {
            getWorkFullTextIndex: async (_w: string, k: string) => workIndex(k),
            getWorkFullTextChapter: async () => '正文',
        } as never;
        const { container } = render(
            <BookFullText bookId="w1" workKey="wikisource-02" versions={[LAOZI[0]]}
                onVersionChange={() => {}} transport={transport} />,
        );
        await waitFor(() => expect(container.querySelector('article')).toBeTruthy());
        expect(container.querySelector('select')).toBeNull();
    });

    it('选项名：source_url 缺失或坏时退回 version_label／key', () => {
        expect(workFullTextOptionLabel({ ...LAOZI[0], source_url: undefined })).toBe('維基文庫 · 老子');
        expect(workFullTextOptionLabel({ key: 'shidian-01', owner_type: 'Work', path: '', primary: true })).toBe('shidian-01');
    });
});

describe('BookDetailLayout：Work 的全文 tab', () => {
    function workTransport(list: WorkFullTextEntry[] | (() => Promise<never>)) {
        return {
            getItem: async (id: string) => ({ id, type: 'work', title: '老子' }),
            getWorkFullTextList: typeof list === 'function' ? list : async () => list,
            getWorkFullTextIndex: vi.fn(async (_w: string, k: string) => workIndex(k)),
            getWorkFullTextChapter: vi.fn(async (_w: string, k: string) => `## 一章\n\n${k} 的正文`),
            getBookFullTextIndex: vi.fn(async () => null),
        };
    }

    it('默认显示 primary 那一份，可切换到另一份', async () => {
        const transport = workTransport(LAOZI);
        function Harness() {
            const [juan, setJuan] = React.useState<string | null>(null);
            return (
                <BookDetailLayout id="d59ezkx8dt6o" transport={transport as never}
                    activeTab="fulltext" onTabChange={() => {}}
                    activeJuan={juan} onJuanChange={setJuan} showFeedbackTab={false} />
            );
        }
        const { container } = render(<Harness />);
        await waitFor(() => expect(container.querySelector('article')?.textContent).toContain('wikisource-02 的正文'));
        expect(transport.getWorkFullTextIndex).toHaveBeenCalledWith('d59ezkx8dt6o', 'wikisource-02');
        expect(transport.getBookFullTextIndex).not.toHaveBeenCalled();

        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('wikisource-02');
        fireEvent.change(select, { target: { value: 'wikisource-01' } });
        await waitFor(() => expect(container.querySelector('article')?.textContent).toContain('wikisource-01 的正文'));
        expect((container.querySelector('select') as HTMLSelectElement).value).toBe('wikisource-01');
    });

    it('概览页提要卡出「阅读全文」主按钮，点进去走 fulltext tab', async () => {
        const transport = workTransport(LAOZI);
        const onTabChange = vi.fn();
        render(
            <BookDetailLayout id="d59ezkx8dt6o" transport={transport as never}
                activeTab="basic" onTabChange={onTabChange} showFeedbackTab={false} />,
        );
        const banner = await screen.findByText(/閱讀全文/);
        fireEvent.click(banner);
        expect(onTabChange).toHaveBeenCalledWith('fulltext');
    });

    it('没有 Work 全文：概览页无「阅读全文」；强进 fulltext 提示暂无，不转圈', async () => {
        const transport = workTransport([]);
        const { unmount } = render(
            <BookDetailLayout id="w-none" transport={transport as never}
                activeTab="basic" onTabChange={() => {}} showFeedbackTab={false} />,
        );
        await screen.findByText('老子');
        expect(screen.queryByText(/閱讀全文/)).toBeNull();
        unmount();

        render(
            <BookDetailLayout id="w-none" transport={transport as never}
                activeTab="fulltext" onTabChange={() => {}} showFeedbackTab={false} />,
        );
        await waitFor(() => expect(screen.getByText('暂无全文')).toBeTruthy(), { timeout: 1000 });
        expect(transport.getBookFullTextIndex).not.toHaveBeenCalled();
    });

    it('清单请求失败（网络错误）当作没有全文', async () => {
        const transport = workTransport(async () => { throw new TypeError('Failed to fetch'); });
        render(
            <BookDetailLayout id="w-err" transport={transport as never}
                activeTab="fulltext" onTabChange={() => {}} showFeedbackTab={false} />,
        );
        await waitFor(() => expect(screen.getByText('暂无全文')).toBeTruthy(), { timeout: 1000 });
    });
});
