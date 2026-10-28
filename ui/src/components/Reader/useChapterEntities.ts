import { useEffect, useRef, useState } from 'react';
import { adaptEntityJson, type EntitySpan } from '../../core/entity-annotations';
import type { ReaderResolveContext } from './types';

/** 按章取实体标注：返回 entity.json 原样（或已适配的 `EntitySpan[]`），无则 null */
export type ReaderEntityResolver = (chapterKey: string, ctx?: ReaderResolveContext) =>
    unknown | Promise<unknown>;

/**
 * 向宿主取当前章的实体标注并适配；只认最后一次请求的结果，失败当没有。
 * 结果记着它属于哪一章：换章后新章的标注到手前返回空，不把上一章的专名线画在新章上。
 */
export function useChapterEntities(
    resolve: ReaderEntityResolver | undefined,
    key: string | null,
    ctx: ReaderResolveContext,
    scope = '',
): EntitySpan[] {
    const tag = `${scope}\n${ctx.versionKey ?? ''}\n${key ?? ''}`;
    const [rec, setRec] = useState<{ tag: string; spans: EntitySpan[] }>({ tag: '', spans: [] });
    const seq = useRef(0);

    useEffect(() => {
        const my = ++seq.current;
        const settle = (spans: EntitySpan[]) => { if (my === seq.current) setRec({ tag, spans }); };
        if (!resolve || !key) { settle([]); return; }
        let r: unknown;
        try { r = resolve(key, ctx); } catch { settle([]); return; }
        Promise.resolve(r).then(v => settle(v ? adaptEntityJson(v) : []), () => settle([]));
    }, [resolve, key, ctx, tag]);

    return rec.tag === tag ? rec.spans : EMPTY;
}

const EMPTY: EntitySpan[] = [];
