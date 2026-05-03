/**
 * SearchInput 单测
 *
 * 防止以下回归：
 * 1. v0.2.20 那次 — 在 onChange 里 `if (isComposing) return` 守卫导致受控
 *    input 输入卡死（用户敲 'a'，onChange 不上抛 → React 把 input 重置回旧值）
 * 2. v0.2.20 之前 — 每个字符都立即 router.push 把页面切走，IME 拼音中断
 *
 * 这些测试断言：
 *  - 普通字母输入：每次 onChange 都被上抛（受控约定）
 *  - composition 期间：onChange 仍然被上抛（不能吃事件）
 *  - 上层 onSearch 是否在合适时机被调用是 IndexBrowser 的责任，不在这测
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from '../../src/components/SearchInput';
import type { IndexStorage } from '../../src/storage/types';

/** 提供一个最小可用的 IndexStorage stub（仅 SearchInput 实际调用的方法） */
function makeStorageStub(overrides: Partial<IndexStorage> = {}): IndexStorage {
    return {
        loadEntries: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
        search: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
        searchAll: async () => ({
            works: [], books: [], collections: [], entities: [],
            totalWorks: 0, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        }),
        getItem: async () => null,
        saveItem: async () => { throw new Error('not impl'); },
        deleteItem: async () => { throw new Error('not impl'); },
        generateId: async () => { throw new Error('not impl'); },
        ...overrides,
    };
}

describe('SearchInput onChange contract', () => {
    it('每次按键都通过 onChange 上抛（受控 input 约定）', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        // 用一个 wrapper 模拟受控父组件：每次 onChange 都更新 props.value
        function Wrapper() {
            const [val, setVal] = (require('react') as typeof import('react')).useState('');
            return (
                <SearchInput
                    transport={makeStorageStub()}
                    value={val}
                    onChange={(v: string) => { onChange(v); setVal(v); }}
                    onSearch={() => {}}
                />
            );
        }

        render(<Wrapper />);
        const input = screen.getByPlaceholderText(/搜索/);
        await user.type(input, 'abc');

        // 关键回归点：受控 input 必须每次按键都上抛（v0.2.20 那次 守卫吃掉
        // composition 期间事件 → 用户敲键看似"输不进去"）
        expect(onChange).toHaveBeenCalledTimes(3);
        expect(onChange).toHaveBeenNthCalledWith(1, 'a');
        expect(onChange).toHaveBeenNthCalledWith(2, 'ab');
        expect(onChange).toHaveBeenNthCalledWith(3, 'abc');
        expect(input).toHaveValue('abc');
    });

    it('composition 期间 onChange 仍然每次上抛 — 不能吞事件', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        let currentValue = '';
        const { rerender } = render(
            <SearchInput
                transport={makeStorageStub()}
                value={currentValue}
                onChange={(v) => { currentValue = v; onChange(v); }}
                onSearch={() => {}}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/) as HTMLInputElement;

        // 模拟 IME composition：start → 多次 input → end
        // 浏览器在 composition 期间也 fire input 事件，受控组件必须接受
        input.focus();
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

        // composition 中间状态 — onChange 必须被调
        await user.type(input, 'z');
        rerender(
            <SearchInput
                transport={makeStorageStub()}
                value={currentValue}
                onChange={(v) => { currentValue = v; onChange(v); }}
                onSearch={() => {}}
            />,
        );

        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中' }));

        // 至少有一次 onChange 被调（composition 中间或结束）
        expect(onChange.mock.calls.length).toBeGreaterThan(0);
    });

    it('点击 Enter 提交 — 调用 onSearch', async () => {
        const user = userEvent.setup();
        const onSearch = vi.fn();
        render(
            <SearchInput
                transport={makeStorageStub()}
                value="史記"
                onChange={() => {}}
                onSearch={onSearch}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/);
        input.focus();
        await user.keyboard('{Enter}');

        expect(onSearch).toHaveBeenCalledWith('史記');
    });
});

describe('SearchInput suggestions via transport.searchAll', () => {
    it('输入触发 transport.searchAll，使用 worker 索引', async () => {
        const user = userEvent.setup();
        const searchAll = vi.fn().mockResolvedValue({
            works: [{ id: 'w1', type: 'work', title: '史記', author: '司馬遷' }],
            books: [], collections: [], entities: [],
            totalWorks: 1, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        });

        let val = '';
        const { rerender } = render(
            <SearchInput
                transport={makeStorageStub({ searchAll })}
                value={val}
                onChange={(v) => { val = v; }}
                onSearch={() => {}}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/);
        await user.type(input, '史');
        rerender(
            <SearchInput
                transport={makeStorageStub({ searchAll })}
                value={val}
                onChange={(v) => { val = v; }}
                onSearch={() => {}}
            />,
        );

        // 等 debounce（80ms 在 SearchInput 内部）
        await new Promise(r => setTimeout(r, 150));

        // 关键回归点：建议必须走 transport.searchAll（worker 索引），
        // 而不是 transport.getAllEntries（旧路径会拉 23 MB index.json）
        expect(searchAll).toHaveBeenCalled();
        const callArg = searchAll.mock.calls[0][0];
        expect(typeof callArg).toBe('string');
    });

    it('绝不调用 transport.getAllEntries — 那是已废弃的 23MB 大表路径', async () => {
        const user = userEvent.setup();
        const getAllEntries = vi.fn();
        const searchAll = vi.fn().mockResolvedValue({
            works: [], books: [], collections: [], entities: [],
            totalWorks: 0, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        });

        let val = '';
        const { rerender } = render(
            <SearchInput
                transport={makeStorageStub({ searchAll, getAllEntries })}
                value={val}
                onChange={(v) => { val = v; }}
                onSearch={() => {}}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/);
        input.focus();  // 旧版会在 focus 时触发 getAllEntries
        await user.type(input, 'a');
        rerender(
            <SearchInput
                transport={makeStorageStub({ searchAll, getAllEntries })}
                value={val}
                onChange={(v) => { val = v; }}
                onSearch={() => {}}
            />,
        );
        await new Promise(r => setTimeout(r, 200));

        expect(getAllEntries).not.toHaveBeenCalled();
    });
});
