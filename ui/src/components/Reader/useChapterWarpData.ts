import { useEffect, useRef, useState } from 'react';
import type { PageWarpData } from './GujiWarpCanvas';
import type { ReaderResolveContext } from './types';

export type ReaderWarpResolver = (chapterKey: string, ctx?: ReaderResolveContext) =>
    PageWarpData | null | undefined | Promise<PageWarpData | null | undefined>;

/** 按当前卷/章向宿主要求透视矫正对读数据；只认最后一次请求的结果 */
export function useChapterWarpData(
    resolve: ReaderWarpResolver | undefined,
    warpDataProp: PageWarpData | null | undefined,
    key: string | null,
    chapterMeta: { has_warp?: boolean; warp_data?: string | PageWarpData } | null | undefined,
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

        // 2. 若 chapterMeta 声明了 warp_data
        if (chapterMeta?.warp_data) {
            if (typeof chapterMeta.warp_data === 'object') {
                setWarpData(chapterMeta.warp_data as PageWarpData);
                return;
            }
            if (typeof chapterMeta.warp_data === 'string') {
                setLoading(true);
                fetch(chapterMeta.warp_data)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => { if (my === seq.current) setWarpData(data); })
                    .catch(() => { if (my === seq.current) setWarpData(null); })
                    .finally(() => { if (my === seq.current) setLoading(false); });
                return;
            }
        }

        setWarpData(null);
        setLoading(false);
    }, [resolve, warpDataProp, key, chapterMeta, ctx]);

    return { warpData, loading };
}
