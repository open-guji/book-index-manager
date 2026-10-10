/**
 * useChapterWarpData：矫正数据只走宿主 resolve／warpDataProp；
 * 章元数据里的 has_warp／warp_data（内联或 URL）已删，不再 fetch。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChapterWarpData } from '../../src/components/Reader/useChapterWarpData';

const ctx = { versionKey: 'default', chapter: { file: '001', warp_data: 'https://example.com/warp.json' } } as never;

afterEach(() => vi.restoreAllMocks());

describe('useChapterWarpData', () => {
    it('没有 resolve／prop：不取数，不会因章里的 warp_data 去 fetch', async () => {
        const f = vi.spyOn(globalThis, 'fetch');
        const { result } = renderHook(() => useChapterWarpData(undefined, undefined, 'k', ctx));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.warpData).toBeNull();
        expect(f).not.toHaveBeenCalled();
    });

    it('宿主 resolve 仍然生效', async () => {
        const data = { pages: [] } as never;
        const { result } = renderHook(() => useChapterWarpData(async () => data, undefined, 'k', ctx));
        await waitFor(() => expect(result.current.warpData).toBe(data));
    });
});
