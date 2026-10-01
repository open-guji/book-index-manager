/**
 * Q5 手机与无障碍巡检「内测前必须修」三项回归（FX4，2026-09-28）。
 *
 * A1 搜索结果卡片是真 <a href>：Tab 可达、Enter 可开、修饰键点击交给浏览器、
 *    卡片内不嵌套其他交互元素。
 * A2 反馈浮钮：层级低于抽屉 / 弹层，挂载期间暴露 --bim-feedback-fab-offset，
 *    有 hidden 开关。
 * B7 整理本「▶ 展开」是 <button aria-expanded>，键盘可操作。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IndexBrowser } from '../../src/components/IndexBrowser';
import { FeedbackButton, FEEDBACK_FAB_OFFSET_VAR } from '../../src/components/FeedbackButton';
import { TextReader } from '../../src/components/TextReader';
import { fakeTextTransport } from './helpers/text-transport';
import { BidUrlProvider } from '../../src/core/bid-url';
import type { IndexStorage } from '../../src/storage/types';
import type { IndexEntry, CollatedJuan } from '../../src/types';

beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* ignore */ }
});

const works = [
    { id: 'w1', type: 'work', title: '史記', author: '司馬遷' },
    { id: 'w2', type: 'work', title: '史記索隱', author: '司馬貞' },
    { id: 'w3', type: 'work', title: '史記正義', author: '張守節' },
] as IndexEntry[];

function makeTransport(overrides: Partial<IndexStorage> = {}): IndexStorage {
    return {
        loadEntries: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
        search: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
        searchAll: async () => ({
            works, books: [], collections: [], entities: [],
            totalWorks: works.length, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        }),
        getItem: async () => null,
        saveItem: async () => { throw new Error('not impl'); },
        deleteItem: async () => { throw new Error('not impl'); },
        generateId: async () => { throw new Error('not impl'); },
        getCounts: async () => ({ works: 3, books: 0, collections: 0, entities: 0,
            resourceCounts: { hasText: 0, hasImage: 0 }, subtypeStats: {} }),
        ...overrides,
    };
}

async function renderResults(variant: 'card' | 'compact', onEntryClick?: (e: IndexEntry) => void) {
    render(
        <BidUrlProvider buildUrl={id => `/book-index?id=${id}`}>
            <IndexBrowser
                transport={makeTransport()}
                initialQuery="史記"
                resultVariant={variant}
                onEntryClick={onEntryClick}
            />
        </BidUrlProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(works.length));
    return screen.getAllByRole('link');
}

describe('A1 搜索结果卡片是真链接', () => {
    for (const variant of ['card', 'compact'] as const) {
        describe(variant, () => {
            it('每个结果项都有指向条目的 href', async () => {
                const links = await renderResults(variant, vi.fn());
                expect(links.map(a => a.getAttribute('href'))).toEqual(
                    works.map(w => `/book-index?id=${w.id}`));
            });

            it('卡片内不嵌套其他交互元素', async () => {
                const links = await renderResults(variant, vi.fn());
                for (const a of links) {
                    expect(a.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
                }
            });

            it('Tab 能逐个到达每张卡片', async () => {
                const user = userEvent.setup();
                const links = await renderResults(variant, vi.fn());
                screen.getByPlaceholderText(/搜索/).focus();
                const reached: Element[] = [];
                for (let i = 0; i < 10 && reached.length < links.length; i++) {
                    await user.tab();
                    if (links.includes(document.activeElement as HTMLElement)) reached.push(document.activeElement!);
                }
                expect(reached).toEqual(links);
            });

            it('Enter 打开条目，走客户端路由（阻止整页跳转）', async () => {
                const user = userEvent.setup();
                const onEntryClick = vi.fn();
                const links = await renderResults(variant, onEntryClick);
                links[1].focus();
                // 捕获阶段装在 document 上，React 的委托监听在 root 上先跑完
                let defaultPrevented: boolean | undefined;
                const spy = (e: Event) => { defaultPrevented = e.defaultPrevented; };
                document.addEventListener('click', spy);
                await user.keyboard('{Enter}');
                document.removeEventListener('click', spy);
                expect(onEntryClick).toHaveBeenCalledTimes(1);
                expect(onEntryClick.mock.calls[0][0].id).toBe('w2');
                expect(defaultPrevented).toBe(true);
            });

            it('Ctrl / Cmd / Shift 点击交给浏览器，不走客户端路由', async () => {
                const onEntryClick = vi.fn();
                const links = await renderResults(variant, onEntryClick);
                for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
                    const notPrevented = fireEvent.click(links[0], mod);
                    expect(notPrevented).toBe(true);
                }
                expect(onEntryClick).not.toHaveBeenCalled();
            });

            it('中键点击不拦截', async () => {
                const onEntryClick = vi.fn();
                const links = await renderResults(variant, onEntryClick);
                expect(fireEvent.click(links[0], { button: 1 })).toBe(true);
                expect(onEntryClick).not.toHaveBeenCalled();
            });

            it('宿主没给 onEntryClick 时不拦截，交给 href 整页跳转', async () => {
                const links = await renderResults(variant);
                expect(fireEvent.click(links[0])).toBe(true);
            });
        });
    }

    it('最近浏览：删除按钮与链接并列，不嵌套在链接里', async () => {
        window.localStorage.setItem('bim-recent-ids', JSON.stringify(['w1']));
        render(
            <IndexBrowser
                transport={makeTransport({ getItem: async (id: string) => works.find(w => w.id === id) as never })}
                onEntryClick={vi.fn()}
            />,
        );
        const link = await screen.findByRole('link', { name: /史記/ });
        expect(link).toHaveAttribute('href', '/book-index?id=w1');
        const remove = screen.getByRole('button', { name: '移除' });
        expect(link.contains(remove)).toBe(false);
        fireEvent.click(remove);
        await waitFor(() => expect(screen.queryByRole('link', { name: /史記/ })).toBeNull());
    });
});

describe('A2 反馈浮钮', () => {
    it('默认层级低于抽屉 / 弹层（本包对话框为 1000）', () => {
        render(<FeedbackButton onSubmit={async () => {}} />);
        const fab = screen.getByRole('button', { name: '反馈' });
        // jsdom 不认 var()，直接看 React 写进去的 style 声明
        expect(fab.getAttribute('style')).toMatch(/z-index:\s*var\(--bim-feedback-fab-z, 40\)/);
    });

    it('zIndex prop 可覆盖', () => {
        render(<FeedbackButton onSubmit={async () => {}} zIndex={5} />);
        expect(screen.getByRole('button', { name: '反馈' }).style.zIndex).toBe('5');
    });

    it('挂载期间在 <html> 上暴露留白变量，卸载后移除', () => {
        const root = document.documentElement;
        const { unmount } = render(<FeedbackButton onSubmit={async () => {}} position={{ bottom: 20, right: 20 }} />);
        // 20 + 48 + 16
        expect(root.style.getPropertyValue(FEEDBACK_FAB_OFFSET_VAR)).toContain('84px');
        unmount();
        expect(root.style.getPropertyValue(FEEDBACK_FAB_OFFSET_VAR)).toBe('');
    });

    it('hidden 隐藏浮钮并撤掉留白变量；取消后恢复', () => {
        const root = document.documentElement;
        const { rerender } = render(<FeedbackButton onSubmit={async () => {}} hidden />);
        expect(screen.queryByRole('button', { name: '反馈' })).toBeNull();
        expect(root.style.getPropertyValue(FEEDBACK_FAB_OFFSET_VAR)).toBe('');
        rerender(<FeedbackButton onSubmit={async () => {}} hidden={false} />);
        expect(screen.getByRole('button', { name: '反馈' })).toBeInTheDocument();
        expect(root.style.getPropertyValue(FEEDBACK_FAB_OFFSET_VAR)).not.toBe('');
    });
});

describe('B7 整理本「▶ 展开」是可键盘操作的 button', () => {
    const juan: CollatedJuan = {
        title: '卷一',
        sections: [
            { title: '易類', type: 'category', content: '易之為書，推天道以明人事者也。' },
            {
                title: '周易', type: 'book', book_title: '周易', work_id: 'w9',
                content: '《周易》十二篇。' + '施、孟、梁丘三家。'.repeat(10),
                summary: '提要正文',
            },
        ],
    };
    const transport = fakeTextTransport('w0', {
        kind: 'collated',
        json: juan,
        chapters: [{ n: 1, file: '001', title: '卷一', has_json: true }, { n: 2, file: '002', title: '卷二', has_json: true }],
        index: { type: 'catalog', juan_groups: [{ label: '經部', files: ['001', '002'] }] },
    });

    async function renderCollated() {
        render(
            <TextReader
                id="w0"
                transport={transport}
                onNavigate={vi.fn()}
                chapter="001"
            />,
        );
        // N5a 起阅读页默认是「正文」看法；「▶ 展开」卡片在「條目」看法里
        fireEvent.click(await screen.findByRole('button', { name: '條目' }));
        await screen.findByRole('link', { name: /作品/ });
    }

    const toggleLabels = () => screen.getAllByRole('button')
        .filter(b => b.hasAttribute('aria-expanded'))
        .map(b => b.textContent ?? '');

    it('卷分组、类目、书目三处开关都是带 aria-expanded 的 button', async () => {
        await renderCollated();
        const labels = toggleLabels();
        expect(labels.some(l => l.includes('經部'))).toBe(true);
        expect(labels.some(l => l.includes('易類'))).toBe(true);
        expect(labels.some(l => l.includes('周易'))).toBe(true);
    });

    it('考证整理本的条目开关也是 button', async () => {
        render(
            <TextReader
                id="k0"
                transport={fakeTextTransport('k0', {
                    kind: 'collated',
                    json: { title: '考證', sections: [{ title: '考證一', type: 'kaozhen', content: '考證正文' }] },
                    chapters: [{ n: 1, file: '001', title: '考證', has_json: true }],
                    index: { type: 'kaozhen' },
                })}
                onNavigate={vi.fn()}
                chapter="001"
            />,
        );
        await screen.findByText(/考證一/);
        expect(toggleLabels().some(l => l.includes('考證一'))).toBe(true);
    });

    it('键盘 Enter / 空格切换展开，aria-expanded 同步', async () => {
        const user = userEvent.setup();
        await renderCollated();
        const cat = screen.getAllByRole('button').find(b => b.hasAttribute('aria-expanded') && b.textContent?.includes('易類'))!;
        expect(cat).toHaveAttribute('aria-expanded', 'false');
        cat.focus();
        await user.keyboard('{Enter}');
        expect(cat).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(/推天道以明人事/)).toBeInTheDocument();
        await user.keyboard(' ');
        expect(cat).toHaveAttribute('aria-expanded', 'false');
    });

    it('书目行：开关 button 与「→作品」链接并列，不互相嵌套', async () => {
        const user = userEvent.setup();
        await renderCollated();
        const book = screen.getAllByRole('button').find(b => b.hasAttribute('aria-expanded') && b.textContent?.includes('周易'))!;
        expect(book.querySelector('a, button')).toBeNull();
        const link = screen.getByRole('link', { name: /作品/ });
        expect(book.contains(link)).toBe(false);
        const before = book.getAttribute('aria-expanded');
        book.focus();
        await user.keyboard('{Enter}');
        expect(book.getAttribute('aria-expanded')).not.toBe(before);
    });
});
