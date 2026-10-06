import { useEffect, useRef, useState } from 'react';
import type { ReaderImageResolver, ReaderPageImage, ReaderResolveContext } from './types';

/** 按当前卷/章向宿主要书影；只认最后一次请求的结果 */
export function useChapterImages(resolve: ReaderImageResolver | undefined, key: string | null, ctx: ReaderResolveContext): {
    images: ReaderPageImage[] | null;
    loading: boolean;
} {
    const [images, setImages] = useState<ReaderPageImage[] | null>(null);
    const [loading, setLoading] = useState(false);
    const seq = useRef(0);
    useEffect(() => {
        const my = ++seq.current;
        if (!resolve || !key) { setImages(null); setLoading(false); return; }
        let r: ReturnType<ReaderImageResolver>;
        try { r = resolve(key, ctx); } catch { setImages(null); setLoading(false); return; }
        if (!r || typeof (r as Promise<unknown>).then !== 'function') { setImages((r as ReaderPageImage[] | null | undefined) ?? null); setLoading(false); return; }
        setLoading(true);
        (r as Promise<ReaderPageImage[] | null | undefined>).then(v => { if (my === seq.current) setImages(v ?? null); })
            .catch(() => { if (my === seq.current) setImages(null); })
            .finally(() => { if (my === seq.current) setLoading(false); });
    }, [resolve, key, ctx]);
    return { images, loading };
}
