/**
 * IndexBrowser 单测
 *
 * 关键回归点：
 * 1. handleInputChange 中 onQueryChange 与 doSearch 必须共享同一个 debounce timer。
 *    否则用户每按一字符 onQueryChange 立即被调 → 上层 router.push → IME 中断
 * 2. 清空时 onQueryChange 立即上抛
 * 3. stats 加载优先 getCounts 单次小请求，BundleStorage 下避免 7 次并发 index.json
 * 4. initialQuery 进来时自动触发一次搜索
 * 5. searchAll 抛错时显示 errorMessage（不让用户看到空结果以为搜不到）
 *
 * 用 real timers（fake timers + userEvent + IndexBrowser 内 useEffect 容易死锁）。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IndexBrowser } from '../../src/components/IndexBrowser';
import type { IndexStorage } from '../../src/storage/types';

beforeEach(() => {
    // 清掉 localStorage 上次留的最近浏览，避免污染 stats 路径
    try { window.localStorage.clear(); } catch { /* ignore */ }
});

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

describe('IndexBrowser stats 加载', () => {
    it('优先调 getCounts（一次性小请求）而不是 4×loadEntries', async () => {
        const getCounts = vi.fn().mockResolvedValue({
            works: 100, books: 50, collections: 5, entities: 20,
            resourceCounts: { hasText: 80, hasImage: 60 },
            subtypeStats: { '正史': 24 },
        });
        const loadEntries = vi.fn();
        render(
            <IndexBrowser transport={makeTransport({ getCounts, loadEntries })} />,
        );
        // 等 stats 渲染（数字出现说明 getCounts 已 resolve）
        await waitFor(() => expect(getCounts).toHaveBeenCalled(), { timeout: 1000 });
        // fallback 路径 loadEntries 不应被触发
        expect(loadEntries).not.toHaveBeenCalled();
    });

    it('getCounts 失败时 fallback 到 4×loadEntries + getResourceCounts', async () => {
        const getCounts = vi.fn().mockRejectedValue(new Error('not impl'));
        const loadEntries = vi.fn().mockResolvedValue({ entries: [], total: 7, page: 1, pageSize: 1 });
        const getResourceCounts = vi.fn().mockResolvedValue({ hasText: 3, hasImage: 4 });
        render(
            <IndexBrowser
                transport={makeTransport({ getCounts, loadEntries, getResourceCounts } as any)}
            />,
        );
        await waitFor(() => expect(loadEntries).toHaveBeenCalledTimes(4), { timeout: 1000 });
        // 4 次：work / book / collection / entity
        const calledTypes = loadEntries.mock.calls.map(c => c[0]).sort();
        expect(calledTypes).toEqual(['book', 'collection', 'entity', 'work']);
    });

    it('没 getCounts 方法时直接走 fallback', async () => {
        const t = makeTransport();
        delete (t as any).getCounts;
        const loadEntries = vi.fn().mockResolvedValue({ entries: [], total: 1, page: 1, pageSize: 1 });
        (t as any).loadEntries = loadEntries;
        render(<IndexBrowser transport={t} />);
        await waitFor(() => expect(loadEntries).toHaveBeenCalledTimes(4), { timeout: 1000 });
    });
});

describe('IndexBrowser initialQuery + 搜索结果展示', () => {
    it('initialQuery 非空时进来直接触发一次搜索', async () => {
        const searchAll = vi.fn().mockResolvedValue({
            works: [{ id: 'w1', type: 'work', title: '史記', author: '司馬遷' }],
            books: [], collections: [], entities: [],
            totalWorks: 1, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        });
        render(
            <IndexBrowser transport={makeTransport({ searchAll })} initialQuery="史記" />,
        );
        await waitFor(() => expect(searchAll).toHaveBeenCalledWith('史記', 5), { timeout: 1000 });
        // 结果出现在页面
        expect(await screen.findByText('史記')).toBeTruthy();
    });

    it('initialQuery 为空时不触发搜索（显示最近/初始视图）', async () => {
        const searchAll = vi.fn();
        render(<IndexBrowser transport={makeTransport({ searchAll })} initialQuery="" />);
        // 给 useEffect 跑完的时间
        await new Promise(r => setTimeout(r, 50));
        expect(searchAll).not.toHaveBeenCalled();
    });

    it('initialQuery 仅空白也不触发搜索', async () => {
        const searchAll = vi.fn();
        render(<IndexBrowser transport={makeTransport({ searchAll })} initialQuery="   " />);
        await new Promise(r => setTimeout(r, 50));
        expect(searchAll).not.toHaveBeenCalled();
    });
});

describe('IndexBrowser 错误显示', () => {
    it('searchAll throw 时不留空结果，显示 errorMessage', async () => {
        const searchAll = vi.fn().mockRejectedValue(new Error('网络错误'));
        const onQueryChange = vi.fn();
        render(
            <IndexBrowser
                transport={makeTransport({ searchAll })}
                onQueryChange={onQueryChange}
            />,
        );
        const input = screen.getByPlaceholderText(/搜索/);
        fireEvent.change(input, { target: { value: 'q1' } });
        // 等 doSearch 执行 + 抛错
        await waitFor(() => expect(searchAll).toHaveBeenCalled(), { timeout: 1000 });
        // 错误消息呈现（找含「网络错误」的元素）
        await waitFor(() => expect(screen.queryByText(/网络错误/)).toBeTruthy(), { timeout: 1000 });
    });

    it('Enter 提交立即触发搜索（绕过 debounce）', async () => {
        const searchAll = vi.fn().mockResolvedValue({
            works: [], books: [], collections: [], entities: [],
            totalWorks: 0, totalBooks: 0, totalCollections: 0, totalEntities: 0,
        });
        render(<IndexBrowser transport={makeTransport({ searchAll })} />);
        const input = screen.getByPlaceholderText(/搜索/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'enter-key' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        // Enter 后立即触发（不等 200ms debounce）
        await waitFor(() => expect(searchAll).toHaveBeenCalledWith('enter-key', 5), { timeout: 100 });
    });
});

describe('IndexBrowser searchAll 不存在时回退到 search', () => {
    it('transport 没 searchAll 时调 4 次 search 拼装结果', async () => {
        const search = vi.fn().mockResolvedValue({ entries: [], total: 0, page: 1, pageSize: 5 });
        const t = makeTransport({ search });
        delete (t as any).searchAll;
        render(<IndexBrowser transport={t} initialQuery="x" />);
        await waitFor(() => expect(search).toHaveBeenCalledTimes(4), { timeout: 1000 });
        const calledTypes = search.mock.calls.map(c => c[1]).sort();
        expect(calledTypes).toEqual(['book', 'collection', 'entity', 'work']);
    });
});
