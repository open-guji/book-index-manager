/**
 * 换章／换册时，书影、对读正文、专名线的数据都带着「属于哪一章」：新章的数据到手前不显示旧章的（标题已换、正文书影还是旧的会错位），
 * 并报加载中；旧章的请求晚到不覆盖新章。
 */
import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChapterWarpData } from '../../src/components/Reader/useChapterWarpData';
import { useChapterImages } from '../../src/components/Reader/useChapterImages';
import { useChapterEntities } from '../../src/components/Reader/useChapterEntities';

const ctxOf = (versionKey: string) => ({ versionKey, chapter: null });
function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

describe('换章时不显示旧章数据', () => {
    it('对读数据：换章后立即为 null＋loading，旧章晚到不覆盖，新章到手后显示', async () => {
        const d: Record<string, ReturnType<typeof deferred<any>>> = { a: deferred(), b: deferred(), c: deferred() };
        const resolve = (k: string) => d[k].promise;
        const ctx = ctxOf('v');
        const { result, rerender } = renderHook(({ k }) => useChapterWarpData(resolve, undefined, k, ctx, 'book'), { initialProps: { k: 'a' } });
        expect(result.current).toEqual({ warpData: null, loading: true });
        await act(async () => { d.a.resolve({ tag: 'A' }); });
        await waitFor(() => expect(result.current.warpData).toEqual({ tag: 'A' }));
        expect(result.current.loading).toBe(false);

        rerender({ k: 'b' });
        expect(result.current).toEqual({ warpData: null, loading: true }); // 当帧就藏起旧章

        rerender({ k: 'c' }); // 再切一次：b 的请求变成过期请求
        await act(async () => { d.b.resolve({ tag: 'B' }); });
        expect(result.current.warpData).toBeNull();
        expect(result.current.loading).toBe(true);
        await act(async () => { d.c.resolve({ tag: 'C' }); });
        await waitFor(() => expect(result.current.warpData).toEqual({ tag: 'C' }));
    });

    it('同一章宿主重取（resolve 身份变了）：旧数据保留，不闪加载态', async () => {
        const ctx = ctxOf('v');
        const { result, rerender } = renderHook(({ r }) => useChapterWarpData(r, undefined, 'a', ctx, 'book'), {
            initialProps: { r: (async () => ({ tag: 1 })) as any },
        });
        await waitFor(() => expect(result.current.warpData).toEqual({ tag: 1 }));
        const slow = deferred<any>();
        rerender({ r: (() => slow.promise) as any });
        expect(result.current.warpData).toEqual({ tag: 1 });
        expect(result.current.loading).toBe(false);
    });

    it('换书（scope 变）同样不沿用旧数据', async () => {
        const ctx = ctxOf('v');
        const slow = deferred<any>();
        const { result, rerender } = renderHook(({ s }) => useChapterWarpData(s === 'x' ? async () => ({ tag: 'X' }) as any : () => slow.promise, undefined, '001', ctx, s), { initialProps: { s: 'x' } });
        await waitFor(() => expect(result.current.warpData).toEqual({ tag: 'X' }));
        rerender({ s: 'y' });
        expect(result.current).toEqual({ warpData: null, loading: true });
    });

    it('书影：换章后 null＋loading；专名：换章后为空', async () => {
        const img = deferred<any>();
        const ent = deferred<any>();
        const ctx1 = ctxOf('v');
        const images = renderHook(({ k }) => useChapterImages(k === 'a' ? async () => [{ url: 'a.jpg' }] as any : () => img.promise, k, ctx1, 'book'), { initialProps: { k: 'a' } });
        await waitFor(() => expect(images.result.current.images).toEqual([{ url: 'a.jpg' }]));
        images.rerender({ k: 'b' });
        expect(images.result.current).toEqual({ images: null, loading: true });

        const spans = renderHook(({ k }) => useChapterEntities(k === 'a' ? async () => ({ entities: [] }) as any : () => ent.promise, k, ctx1, 'book'), { initialProps: { k: 'a' } });
        await waitFor(() => expect(spans.result.current).toEqual([]));
        spans.rerender({ k: 'b' });
        expect(spans.result.current).toEqual([]);
    });
});
