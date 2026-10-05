import { useEffect, useRef, useState } from 'react';
import { adaptEntityJson, type EntitySpan } from '../../core/entity-annotations';

/** 按章取实体标注：返回 entity.json 原样（或已适配的 `EntitySpan[]`），无则 null */
export type ReaderEntityResolver = (chapterKey: string) =>
    unknown | Promise<unknown>;

/** 向宿主取当前章的实体标注并适配；只认最后一次请求的结果，失败当没有 */
export function useChapterEntities(
    resolve: ReaderEntityResolver | undefined,
    key: string | null,
): EntitySpan[] {
    const [spans, setSpans] = useState<EntitySpan[]>([]);
    const seq = useRef(0);

    useEffect(() => {
        const my = ++seq.current;
        if (!resolve || !key) { setSpans([]); return; }
        let r: unknown;
        try { r = resolve(key); } catch { setSpans([]); return; }
        Promise.resolve(r)
            .then(v => { if (my === seq.current) setSpans(v ? adaptEntityJson(v) : []); })
            .catch(() => { if (my === seq.current) setSpans([]); });
    }, [resolve, key]);

    return spans;
}
