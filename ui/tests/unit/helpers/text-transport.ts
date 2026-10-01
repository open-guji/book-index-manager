/**
 * 测试用的新结构取数口（manifest＋<key>/index.json＋章）：给 TextReader 用。
 * 旧的 getCollated* / getBookFullText* 已删（overview#307 §十），原先走旧组件的用例改走 TextReader。
 */
import type { IndexStorage } from '../../../src/storage/types';
import type { CollatedJuan } from '../../../src/types';

type Chapter = { n?: number; file: string; title: string; has_json?: boolean };

export interface FakeTextOptions {
    /** 版本 key，默认 default */
    key?: string;
    kind?: 'collated' | 'transcription';
    /** manifest 里这份版本的其余字段（label、source_name、license…） */
    version?: Record<string, unknown>;
    /** index.json 的其余字段（title、type、juan_groups、text_quality、source、table_notation、guji_markdown…） */
    index?: Record<string, unknown>;
    /** 章目录；缺省按 files 生成 */
    chapters?: Chapter[];
    /** 章 json（整理本）：按章 key 或统一一份 */
    json?: CollatedJuan | Record<string, CollatedJuan>;
    /** 章 md：字符串或按章 key 返回 */
    md?: string | null | ((chapter: string) => string | null);
    /** 条目数据（getItem） */
    item?: Record<string, unknown> | null;
    /** 覆盖/追加任意取数方法（如 vi.fn） */
    extra?: Partial<IndexStorage>;
}

export function fakeTextTransport(id: string, o: FakeTextOptions = {}): IndexStorage {
    const key = o.key ?? 'default';
    const chapters: Chapter[] = o.chapters ?? [{ n: 1, file: '001', title: '卷一', has_json: !!o.json }];
    const manifest = {
        id,
        versions: [{ key, kind: o.kind ?? (o.json ? 'collated' : 'transcription'), label: o.kind === 'collated' || o.json ? '整理本' : '全文', ...o.version }],
    };
    const index = { chapters, ...o.index };
    const jsonOf = (ch: string): CollatedJuan | null => {
        if (!o.json) return null;
        if ('sections' in (o.json as object) || 'title' in (o.json as object)) return o.json as CollatedJuan;
        return (o.json as Record<string, CollatedJuan>)[ch] ?? null;
    };
    const mdOf = (ch: string): string | null => (typeof o.md === 'function' ? o.md(ch) : (o.md ?? null));
    return {
        getItem: async () => (o.item === undefined ? { id, title: '测试书' } : o.item),
        getTextManifest: async () => manifest as never,
        getTextIndex: async (_id: string, k: string) => (k === key ? index : null) as never,
        getChapter: async (_id: string, k: string, ch: string) => {
            if (k !== key) return null;
            const md = mdOf(ch);
            const json = jsonOf(ch);
            return md != null || json ? { md, json } : null;
        },
        ...o.extra,
    } as unknown as IndexStorage;
}
