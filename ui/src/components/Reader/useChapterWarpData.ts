import { useEffect, useRef, useState } from 'react';
import type { PageWarpData } from './GujiWarpCanvas';
import type { ReaderResolveContext } from './types';

export type ReaderWarpResolver = (chapterKey: string, ctx?: ReaderResolveContext) =>
    PageWarpData | null | undefined | Promise<PageWarpData | null | undefined>;

/**
 * 按当前卷/章向宿主要求透视矫正对读数据；只认最后一次请求的结果。
 * 章元数据里的 has_warp／warp_data（章 json 内联或 URL）已于 2026-10-10 删除，数据与网站都不用；矫正数据只走宿主的 resolve 或 warpDataProp。
 * 结果记着它属于哪一章（scope＋版本＋章）：换章后新章的数据到手前，warpData 为 null、loading 为真，
 * 不再把上一章的正文和书影挂在新章上。同一章里宿主重取（resolve 身份变了）不闪。
 */
export function useChapterWarpData(
    resolve: ReaderWarpResolver | undefined,
    warpDataProp: PageWarpData | null | undefined,
    key: string | null,
    ctx: ReaderResolveContext,
    scope = '',
): {
    warpData: PageWarpData | null;
    loading: boolean;
} {
    const tag = `${scope}\n${ctx.versionKey ?? ''}\n${key ?? ''}`;
    const [rec, setRec] = useState<{ tag: string; data: PageWarpData | null }>({ tag: '', data: null });
    const seq = useRef(0);

    useEffect(() => {
        if (warpDataProp !== undefined) return;
        const my = ++seq.current;
        const settle = (data: PageWarpData | null) => { if (my === seq.current) setRec({ tag, data }); };
        if (!key) return settle(null);

        // 1. 若宿主给了自定义 resolve 函数，优先使用
        if (resolve) {
            let r: ReturnType<ReaderWarpResolver>;
            try { r = resolve(key, ctx); } catch { return settle(null); }
            if (!r || typeof (r as Promise<unknown>).then !== 'function') return settle((r as PageWarpData | null | undefined) ?? null);
            (r as Promise<PageWarpData | null | undefined>).then(v => settle(v ?? null), () => settle(null));
            return;
        }

        settle(null);
    }, [resolve, warpDataProp, key, ctx, tag]);

    if (warpDataProp !== undefined) return { warpData: warpDataProp, loading: false };
    const current = rec.tag === tag;
    return { warpData: current ? rec.data : null, loading: !!resolve && !!key && !current };
}
