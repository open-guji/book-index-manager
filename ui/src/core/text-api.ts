/**
 * 阅读文本取数：新旧两种数据结构走同一套接口（overview#307 C 块）。
 *
 *   getManifest(id)            → TextManifest（版本清单，versions[0] 是 default）
 *   getIndex(id, key)          → TextIndex（该版本的章目录＋元数据）
 *   getChapter(id, key, chapter) → { md, json }（md 正文；有章 json 的整理本一并取回）
 *
 * transport 实现了 `getTextManifest／getTextIndex／getChapter`（新结构，BundleStorage 自带）且该条目有 manifest，
 * 就原样走新接口；没有 manifest（旧结构）或 transport 不支持，就用旧的取数方法
 * （getCollatedEditionIndex／getCollatedJuan／getWorkFullText*／getBookFullText*）合成等价的 manifest 与 index，
 * 按规格的来源优先级排出 default（整理本 → 维基 → Kanripo → 识典）。旧方法原样保留，作为这一层的适配。
 *
 * 一个条目的模式（新／旧）与合成结果按 id 缓存在 createTextApi 返回的对象里，换条目才重新判断；
 * 失败不缓存（下次再试）。
 */
import type { IndexStorage } from '../storage/types';
import { extractType } from '../id';
import type { LegacyTextSource, TextChapterContent, TextIndex, TextManifest } from './text-model';
import { convertLegacyCollatedIndex, convertLegacyFullTextIndex, isSafeSegment, synthesizeManifest } from './text-model';

export interface TextApi {
    getManifest(id: string): Promise<TextManifest | null>;
    getIndex(id: string, key: string): Promise<TextIndex | null>;
    getChapter(id: string, key: string, chapter: string, opts?: { json?: boolean }): Promise<TextChapterContent | null>;
}

type ItemState =
    | { mode: 'native'; manifest: TextManifest }
    | { mode: 'legacy'; manifest: TextManifest; legacy: Record<string, LegacyTextSource>; indexes: Map<string, TextIndex> };

const settle = <T>(p: Promise<T> | undefined): Promise<T | null> => (p ? p.catch(() => null) : Promise.resolve(null));

export function createTextApi(transport: IndexStorage): TextApi {
    const states = new Map<string, Promise<ItemState | null>>();

    async function load(id: string): Promise<ItemState | null> {
        if (transport.getTextManifest && transport.getTextIndex && transport.getChapter) {
            const m = await settle(transport.getTextManifest(id));
            if (m && Array.isArray(m.versions) && m.versions.length > 0) return { mode: 'native', manifest: m };
        }
        let type: string | null = null;
        try { type = extractType(id); } catch { type = null; }
        const isBook = type === 'book';
        const [collated, fullTexts] = isBook
            ? [null, []]
            : await Promise.all([
                settle(transport.getCollatedEditionIndex?.(id)),
                settle(transport.getWorkFullTextList?.(id)).then(r => r ?? []),
            ]);
        const bookFull = !collated && fullTexts.length === 0 && type !== 'work'
            ? await settle(transport.getBookFullTextIndex?.(id))
            : null;
        const synth = synthesizeManifest({ id, collated, fullTexts, bookFull });
        if (!synth) return null;
        return { mode: 'legacy', manifest: synth.manifest, legacy: synth.legacy, indexes: new Map() };
    }

    function state(id: string): Promise<ItemState | null> {
        let p = states.get(id);
        if (!p) {
            p = load(id).then(s => { if (!s) states.delete(id); return s; }, e => { states.delete(id); throw e; });
            states.set(id, p);
        }
        return p;
    }

    async function legacyIndex(id: string, s: Extract<ItemState, { mode: 'legacy' }>, key: string): Promise<TextIndex | null> {
        const cached = s.indexes.get(key);
        if (cached) return cached;
        const src = s.legacy[key];
        if (!src) return null;
        let idx: TextIndex | null = null;
        if (src.kind === 'collated') {
            const ci = await settle(transport.getCollatedEditionIndex?.(id));
            idx = ci ? convertLegacyCollatedIndex(ci) : null;
        } else if (src.kind === 'work-full') {
            const fi = await settle(transport.getWorkFullTextIndex?.(id, src.oldKey));
            idx = fi ? convertLegacyFullTextIndex(fi) : null;
        } else {
            const fi = await settle(transport.getBookFullTextIndex?.(id));
            idx = fi ? convertLegacyFullTextIndex(fi) : null;
        }
        if (idx) s.indexes.set(key, idx);
        return idx;
    }

    return {
        async getManifest(id) {
            const s = await state(id);
            return s?.manifest ?? null;
        },

        async getIndex(id, key) {
            if (!isSafeSegment(key)) return null;
            const s = await state(id);
            if (!s) return null;
            if (s.mode === 'native') return settle(transport.getTextIndex!(id, key));
            return legacyIndex(id, s, key);
        },

        async getChapter(id, key, chapter, opts) {
            if (!isSafeSegment(key)) return null;
            const s = await state(id);
            if (!s) return null;
            if (s.mode === 'native') {
                // 新结构章 key 直接拼进 URL，必须是安全单段；旧结构的章 key 只用来在目录里查旧文件名，不拼 URL
                if (!isSafeSegment(chapter)) return null;
                return settle(transport.getChapter!(id, key, chapter, opts));
            }
            const src = s.legacy[key];
            if (!src) return null;
            const idx = await legacyIndex(id, s, key);
            const file = idx?.chapters.find(c => c.file === chapter)?.legacy_file;
            if (!file) return null;
            if (src.kind === 'collated') {
                const [json, md] = await Promise.all([
                    settle(transport.getCollatedJuan?.(id, file)),
                    settle(transport.getCollatedJuanText?.(id, file)),
                ]);
                return json || md ? { md, json } : null;
            }
            const md = src.kind === 'work-full'
                ? await settle(transport.getWorkFullTextChapter?.(id, src.oldKey, file))
                : await settle(transport.getBookFullTextChapter?.(id, file));
            return md != null ? { md, json: null } : null;
        },
    };
}
