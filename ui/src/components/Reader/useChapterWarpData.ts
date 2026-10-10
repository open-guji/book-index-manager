import { useEffect, useRef, useState } from 'react';
import type { PageWarpData } from './GujiWarpCanvas';
import type { ReaderResolveContext } from './types';

export type ReaderWarpResolver = (chapterKey: string, ctx?: ReaderResolveContext) =>
    PageWarpData | null | undefined | Promise<PageWarpData | null | undefined>;

/**
 * 按当前卷/章向宿主要求透视矫正对读数据；只认最后一次请求的结果。
 * 章元数据里的 has_warp／warp_data（章 json 内联或 URL）已于 2026-10-10 删除，数据与网站都不用；矫正数据只走宿主的 resolve 或 warpDataProp。
 */
export function useChapterWarpData(
    resolve: ReaderWarpResolver | undefined,
    warpDataProp: PageWarpData | null | undefined,
    key: string | null,
    ctx: ReaderResolveContext,
): {
    warpData: PageWarpData | null;
    loading: boolean;
} {
    const [warpData, setWarpData] = useState<PageWarpData | null>(warpDataProp ?? null);
    const [loading, setLoading] = useState(false);
    const seq = useRef(0);

    useEffect(() => {
        if (warpDataProp !== undefined) {
            setWarpData(warpDataProp);
            return;
        }
        const my = ++seq.current;
        if (!key) {
            setWarpData(null);
            setLoading(false);
            return;
        }

        // 1. 若宿主给了自定义 resolve 函数，优先使用
        if (resolve) {
            let r: ReturnType<ReaderWarpResolver>;
            try { r = resolve(key, ctx); } catch { setWarpData(null); setLoading(false); return; }
            if (!r || typeof (r as Promise<unknown>).then !== 'function') {
                setWarpData((r as PageWarpData | null | undefined) ?? null);
                setLoading(false);
                return;
            }
            setLoading(true);
            (r as Promise<PageWarpData | null | undefined>)
                .then(v => { if (my === seq.current) setWarpData(v ?? null); })
                .catch(() => { if (my === seq.current) setWarpData(null); })
                .finally(() => { if (my === seq.current) setLoading(false); });
            return;
        }

        setWarpData(null);
        setLoading(false);
    }, [resolve, warpDataProp, key, ctx]);

    return { warpData, loading };
}
