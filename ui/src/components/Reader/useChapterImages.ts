import { useEffect, useRef, useState } from 'react';
import type { ReaderImageResolver, ReaderPageImage, ReaderResolveContext } from './types';

/**
 * 按当前卷/章向宿主要书影；只认最后一次请求的结果。
 * 结果记着它属于哪一章（scope＋版本＋章）：换章后新章的书影到手前，返回 null 并报 loading，
 * 不再把上一章的书影挂在新章上（读者看到的是标题已换、书影还是旧的）。同一章里宿主重取（resolve 身份变了）不闪。
 */
export function useChapterImages(resolve: ReaderImageResolver | undefined, key: string | null, ctx: ReaderResolveContext, scope = ''): {
    images: ReaderPageImage[] | null;
    loading: boolean;
} {
    const tag = `${scope}\n${ctx.versionKey ?? ''}\n${key ?? ''}`;
    const [rec, setRec] = useState<{ tag: string; images: ReaderPageImage[] | null }>({ tag: '', images: null });
    const seq = useRef(0);
    useEffect(() => {
        const my = ++seq.current;
        const settle = (images: ReaderPageImage[] | null) => { if (my === seq.current) setRec({ tag, images }); };
        if (!resolve || !key) { settle(null); return; }
        let r: ReturnType<ReaderImageResolver>;
        try { r = resolve(key, ctx); } catch { settle(null); return; }
        if (!r || typeof (r as Promise<unknown>).then !== 'function') { settle((r as ReaderPageImage[] | null | undefined) ?? null); return; }
        (r as Promise<ReaderPageImage[] | null | undefined>).then(v => settle(v ?? null), () => settle(null));
    }, [resolve, key, ctx, tag]);
    const current = rec.tag === tag;
    return { images: current ? rec.images : null, loading: !!resolve && !!key && !current };
}
