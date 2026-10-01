/**
 * U1（2026-09-27）：BookDetailLayout 吃服务端数据（initialDetail）。
 *
 * 网站条目页 SSR（W2）在服务端已取好条目 JSON，传进来后首屏直接渲染、
 * 不再为本条目发 getItem/getEntry；不传则与原来一样先转圈再取数。
 * 另见 BookDetailSSR.test.tsx（node 环境 renderToString，证明渲染期不碰 window）。
 */
import React, { act } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { BookDetailLayoutProps } from '../../src/components/BookDetailLayout';
import { BundleStorage } from '../../src/storage/bundle-storage';
import type { IndexDetailData } from '../../src/types';
import shiji from './fixtures/shiji-work.json';

const SHIJI = shiji as unknown as IndexDetailData;
const SHIJI_ID = 'd59f20aowb9c';

const BOOK: IndexDetailData = {
    id: 'b1', type: 'book', title: '測試書', edition: '明刻本',
    authors: [{ name: '某甲', role: 'author', dynasty: '明' }],
} as unknown as IndexDetailData;

/**
 * 所有取数方法都是 spy 的 transport；getItem 返回给定数据。
 * 注意 WorkPage 挂载后会为版本表逐条 getItem(bookId)（史記 12 本），那是次级数据，
 * 所以「主条目不取数」断言的是没有 getItem(本条目 id)。
 */
function spyTransport(data: IndexDetailData | null) {
    return {
        getItem: vi.fn(async (_id: string) => data as unknown as Record<string, unknown> | null),
        getEntry: vi.fn(async (_id: string) => null),
        getLineageGraph: vi.fn(async () => null),
        getTextManifest: vi.fn(async () => null),
        getTextIndex: vi.fn(async () => null),
    };
}

function props(over: Partial<BookDetailLayoutProps>): BookDetailLayoutProps {
    return {
        id: SHIJI_ID,
        transport: spyTransport(SHIJI) as never,
        activeTab: 'basic',
        onTabChange: () => {},
        ...over,
    };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('BookDetailLayout initialDetail', () => {
    it('传 initialDetail：首次渲染即出书名与作者，不调 getItem/getEntry', async () => {
        const transport = spyTransport(SHIJI);
        render(<BookDetailLayout {...props({ transport: transport as never, initialDetail: SHIJI })} />);
        // 同步断言：没有经过加载骨架
        expect(screen.getAllByText('史記').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/司馬遷/).length).toBeGreaterThan(0);
        // 次级数据（谱系／版本回目）照常在挂载后加载
        await waitFor(() => expect(transport.getLineageGraph).toHaveBeenCalledTimes(1));
        expect(transport.getItem).not.toHaveBeenCalledWith(SHIJI_ID);
        expect(transport.getEntry).not.toHaveBeenCalled();
    });

    it('传 initialDetail（真 BundleStorage、无次级数据的 Book）：fetch 调用 0 次', async () => {
        const fetchSpy = vi.fn(async () => { throw new Error('should not fetch'); });
        globalThis.fetch = fetchSpy as never;
        const storage = new BundleStorage({ basePath: '/data', version: 'v1' } as never);
        render(<BookDetailLayout {...props({ id: 'b1', transport: storage, initialDetail: BOOK })} />);
        expect(screen.getByText('測試書')).toBeTruthy();
        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        expect(fetchSpy).toHaveBeenCalledTimes(0);
        expect(screen.getByText('測試書')).toBeTruthy();
    });

    it('不传 initialDetail：与原来相同，先出骨架、调 getItem 一次后渲染', async () => {
        const transport = spyTransport(SHIJI);
        render(<BookDetailLayout {...props({ transport: transport as never })} />);
        expect(screen.queryByText('史記')).toBeNull();
        await waitFor(() => expect(screen.getAllByText('史記').length).toBeGreaterThan(0));
        expect(transport.getItem.mock.calls.filter(c => c[0] === SHIJI_ID)).toHaveLength(1);
        expect(transport.getEntry).toHaveBeenCalledTimes(1);
    });

    it('不传 initialDetail（真 BundleStorage）：照常发 fetch', async () => {
        const fetchSpy = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => null }) as Response);
        globalThis.fetch = fetchSpy as never;
        const storage = new BundleStorage({ basePath: '/data', version: 'v1' } as never);
        render(<BookDetailLayout {...props({ id: 'b1', transport: storage })} />);
        await waitFor(() => expect(screen.getByText(/找不到該條目/)).toBeTruthy());
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('initialDetail.id 与 id 不符：视为过期数据，照常取数', async () => {
        const transport = spyTransport(BOOK);
        render(<BookDetailLayout {...props({ id: 'b1', transport: transport as never, initialDetail: SHIJI })} />);
        await waitFor(() => expect(screen.getByText('測試書')).toBeTruthy());
        expect(transport.getItem).toHaveBeenCalledWith('b1');
        expect(screen.queryByText('史記')).toBeNull();
    });

    it('enrichDetail 作用于种子的浅拷贝，不改调用方对象', () => {
        const input = { ...BOOK };
        const enrich = vi.fn((_e, d: IndexDetailData) => { (d as { marked?: boolean }).marked = true; });
        render(<BookDetailLayout {...props({ id: 'b1', initialDetail: input, enrichDetail: enrich })} />);
        expect(enrich).toHaveBeenCalledTimes(1);
        expect((input as { marked?: boolean }).marked).toBeUndefined();
    });

    it('id 换成另一条且父组件给了新的 initialDetail：直接用，不取数', async () => {
        const transport = spyTransport(null);
        const { rerender } = render(
            <BookDetailLayout {...props({ transport: transport as never, initialDetail: SHIJI })} />,
        );
        rerender(<BookDetailLayout {...props({ id: 'b1', transport: transport as never, initialDetail: BOOK })} />);
        await waitFor(() => expect(screen.getByText('測試書')).toBeTruthy());
        expect(transport.getItem).not.toHaveBeenCalledWith(SHIJI_ID);
        expect(transport.getItem).not.toHaveBeenCalledWith('b1');
    });

    it('挂载后 id 变了、initialDetail 不带 id：视为旧数据，照常取数', async () => {
        const transport = spyTransport(BOOK);
        const { id: _omit, ...noId } = SHIJI as unknown as Record<string, unknown>;
        const seedNoId = noId as unknown as IndexDetailData;
        const { rerender } = render(
            <BookDetailLayout {...props({ transport: transport as never, initialDetail: seedNoId })} />,
        );
        // 首次挂载宽松：不带 id 也直接用
        expect(screen.getAllByText('史記').length).toBeGreaterThan(0);
        expect(transport.getItem).not.toHaveBeenCalledWith(SHIJI_ID);

        rerender(<BookDetailLayout {...props({ id: 'b1', transport: transport as never, initialDetail: seedNoId })} />);
        await waitFor(() => expect(screen.getByText('測試書')).toBeTruthy());
        expect(transport.getItem).toHaveBeenCalledWith('b1');
        expect(screen.queryByText('史記')).toBeNull();
    });

    it('renderToString 后 hydrateRoot：无 hydration 警告、无可恢复错误', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const transport = spyTransport(SHIJI);
        const el = <BookDetailLayout {...props({ transport: transport as never, initialDetail: SHIJI })} />;

        const html = renderToString(el);
        expect(html).toContain('史記');
        expect(html).toContain('司馬遷');
        expect(html).not.toContain('找不到該條目');

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable = vi.fn();
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => {
            root = hydrateRoot(container, el, { onRecoverableError: recoverable });
        });
        await waitFor(() => expect(transport.getLineageGraph).toHaveBeenCalled());

        expect(recoverable).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        expect(transport.getItem).not.toHaveBeenCalledWith(SHIJI_ID);
        expect(container.textContent).toContain('史記');

        act(() => root?.unmount());
        container.remove();
    });
});
