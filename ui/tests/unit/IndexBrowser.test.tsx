/**
 * IndexBrowser 单测
 *
 * 关键回归点：
 * 1. handleInputChange 中 onQueryChange 与 doSearch 必须共享同一个 debounce timer。
 *    否则用户每按一字符 onQueryChange 立即被调 → 上层 router.push → IME 中断
 * 2. 清空时 onQueryChange 立即上抛
 *
 * 用 real timers（fake timers + userEvent + IndexBrowser 内 useEffect 容易死锁）。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IndexBrowser } from '../../src/components/IndexBrowser';
import type { IndexStorage } from '../../src/storage/types';

function makeTransport(overrides: Partial<IndexStorage> = {}): IndexStorage {
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
        getCounts: async () => ({ works: 0, books: 0, collections: 0, entities: 0,
            resourceCounts: { hasText: 0, hasImage: 0 }, subtypeStats: {} }),
        ...overrides,
    };
}

const DEBOUNCE_MS = 200;

describe('IndexBrowser onQueryChange debounce — IME 体感回归', () => {
    it('快速连续输入只在 ~200ms 后调 onQueryChange 一次（非每字符立即调）', async () => {
        const onQueryChange = vi.fn();
        render(
            <IndexBrowser
                transport={makeTransport()}
                onQueryChange={onQueryChange}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/);

        // 用 fireEvent 同步触发 4 次输入，模拟快速打字（远快于 debounce）
        fireEvent.change(input, { target: { value: 's' } });
        fireEvent.change(input, { target: { value: 'sh' } });
        fireEvent.change(input, { target: { value: 'shi' } });
        fireEvent.change(input, { target: { value: 'shij' } });

        // 输完后立即检查：onQueryChange 不应该被调
        // （v0.2.20 之前的 bug 就是每字符立即调）
        expect(onQueryChange).not.toHaveBeenCalled();

        // 等 debounce 触发
        await waitFor(() => expect(onQueryChange).toHaveBeenCalled(), { timeout: 1000 });

        // 只调一次（不是 4 次），且参数是最终值
        expect(onQueryChange).toHaveBeenCalledTimes(1);
        expect(onQueryChange).toHaveBeenCalledWith('shij');
    });

    it('清空输入立即触发 onQueryChange("")', async () => {
        const onQueryChange = vi.fn();
        render(
            <IndexBrowser
                transport={makeTransport()}
                onQueryChange={onQueryChange}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/);
        // 先输点东西并等 debounce
        fireEvent.change(input, { target: { value: 'abc' } });
        await waitFor(() => expect(onQueryChange).toHaveBeenCalledWith('abc'), { timeout: 1000 });

        onQueryChange.mockClear();
        // 清空：should fire 立即（不等 debounce）
        fireEvent.change(input, { target: { value: '' } });

        // 同步检查：清空必须立即上抛
        expect(onQueryChange).toHaveBeenCalledWith('');
    });

    it('search 与 onQueryChange 同步 debounce — 200ms 之前都不触发', async () => {
        const searchAll = vi.fn().mockResolvedValue({
            works: [], books: [], collections: [], entities: [],
            totalWorks: 0, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        });
        const onQueryChange = vi.fn();

        render(
            <IndexBrowser
                transport={makeTransport({ searchAll })}
                onQueryChange={onQueryChange}
            />,
        );

        const input = screen.getByPlaceholderText(/搜索/);
        fireEvent.change(input, { target: { value: 'abc' } });

        // 立即检查 — 两者都没被调
        expect(searchAll).not.toHaveBeenCalled();
        expect(onQueryChange).not.toHaveBeenCalled();

        // 等 onQueryChange 被调（说明 debounce 已触发）
        await waitFor(() => expect(onQueryChange).toHaveBeenCalledWith('abc'), { timeout: 1000 });
    });
});
