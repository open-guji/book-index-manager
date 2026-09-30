/**
 * 阅读文本的统一数据模型（overview#307，规格 overview 项目进展/古籍索引网站/设计/阅读文本.md）。
 *
 * 一个条目（Work 或 Book）下有 0～N 份「文本」，每份是一个「版本」，用 key 区分；整理本与全文不再是两种东西：
 * 每份文本都是按章分的一组 md，整理本的章另有同名 json（结构化条目）作附加层。
 *
 *   items/<id>/manifest.json        { id, versions: [{ key, kind, label, source…, license… }] }   versions[0] 是 default
 *   items/<id>/<key>/index.json     { chapters: [{ n, file: '001', title, has_json }], …版本特有元数据 }
 *   items/<id>/<key>/NNN.txt|.json  章正文（打包时 md 改 txt）／章 json
 *
 * 旧结构（collated_edition/、full_text/…）的数据由 text-api.ts 合成等价的 manifest 与 index，阅读器只认这一套模型。
 * 本文件全是纯函数，不取数、不碰 DOM。
 */
import type { BookFullTextIndex, CollatedEditionIndex, JuanGroup, WorkFullTextEntry, WorkFullTextIndex } from '../types';

export type TextKind = 'collated' | 'transcription';

export interface TextVersion {
    /** 版本 key：主版本固定 `default`；其余 `[a-z0-9-]`、字母开头 */
    key: string;
    kind: TextKind;
    /** 下拉显示名——只写来源（整理本／維基文庫／維基文庫 2） */
    label: string;
    /** 来源短名：collated／wikisource／kanripo／shidian… */
    source?: string;
    source_name?: string;
    source_url?: string | null;
    /** 授权，按份记；阅读器随版本显示 */
    license?: string | null;
    quality?: string | null;
    chapters_total?: number | null;
    visibility?: string;
}

export interface TextManifest {
    id: string;
    visibility?: string;
    versions: TextVersion[];
}

export interface TextChapter {
    n: number;
    /** 章文件名主干，三位编号（`001`）；同时是章的 key、URL 里的章号 */
    file: string;
    title: string;
    /** 该章有同名 json（结构化条目） */
    has_json?: boolean;
    page_title?: string;
    /** 旧结构适配层内部用：旧的卷／章文件名，取数时换回去；新结构数据里没有 */
    legacy_file?: string;
}

/** 版本目录 `<key>/index.json`：章目录＋该版本特有的元数据（整理本的分组、参考文献、质量；全文的表格写法等） */
export interface TextIndex {
    chapters: TextChapter[];
    /** 书名（整理本） */
    title?: string;
    type?: 'catalog' | 'kaozhen';
    /** 分组导航；files 里是章的 file（`001`），不是旧的 `juan/001.json` */
    juan_groups?: JuanGroup[];
    juan_metadata?: CollatedEditionIndex['juan_metadata'];
    references?: CollatedEditionIndex['references'];
    target_source?: string;
    target_source_id?: string;
    text_source?: string;
    text_quality?: CollatedEditionIndex['text_quality'];
    /** 全文：表格写法、guji-markdown 版本 */
    table_notation?: string;
    guji_markdown?: string;
    /** 全文：来源页 */
    source?: { name: string; url: string; license?: string; note?: string };
    version_label?: string;
    /** 整理本才有：关联的作品 id（书名链接用） */
    work_id?: string;
}

/** 一章的内容：md 正文（可能没有）与章 json（整理本，可能没有） */
export interface TextChapterContent {
    md: string | null;
    json: import('../types').CollatedJuan | null;
}

// ── key 与章号 ──

/** 合法的版本 key：主版本固定 default；其余 [a-z0-9-]、字母开头、非保留字 */
export const RESERVED_TEXT_KEYS = ['default', 'manifest', 'fragments', 'sources'] as const;
const KEY_RE = /^[a-z][a-z0-9-]*$/;

export function isTextKey(key: unknown): key is string {
    if (typeof key !== 'string') return false;
    if (key === 'default') return true;
    return KEY_RE.test(key) && !(RESERVED_TEXT_KEYS as readonly string[]).includes(key);
}

/** URL 片段是章号还是版本 key：纯数字是章号，字母开头是 key（规格 §六） */
export function isChapterSegment(seg: string): boolean {
    return /^\d+$/.test(seg);
}

/** 文件名／路径 → 章 key：去目录与扩展名（`juan/001.json`→`001`、`第001.md`→`第001`） */
export function chapterKeyOf(file: string): string {
    return file.replace(/^.*[\\/]/, '').replace(/\.(json|md|txt)$/, '');
}

/**
 * 路径安全的单段（取数前校验，条目 id、版本 key、章 key 拼进 URL 前都要过）：
 * 不含 `..`、路径分隔符、URL 分隔符（`?` `#` `%`）、空白与控制字符。汉字等正常文件名字符放行（旧章名如「第001」）。
 */
export function isSafeSegment(s: string): boolean {
    return s.length > 0 && !s.includes('..') && !/[\\/?#%\s\u0000-\u001f\u007f]/.test(s);
}

// ── 来源与优先级 ──

/** 主版本按来源优先：整理本 → 维基文库 → Kanripo → 识典；其他排后（规格 §二） */
export const SOURCE_PRIORITY = ['collated', 'wikisource', 'kanripo', 'shidian'] as const;

/** 版本 key 去掉序号后缀（`wikisource-2`→`wikisource`，旧的 `wikisource-01`→`wikisource`） */
export function sourceOfKey(key: string): string {
    return key.replace(/-0*\d+$/, '');
}

export function sourcePriority(source: string): number {
    const i = (SOURCE_PRIORITY as readonly string[]).indexOf(source);
    return i < 0 ? SOURCE_PRIORITY.length : i;
}

/** 来源中文名／英文名 → 来源短名 */
export function sourceFromName(name: string | undefined | null): string | undefined {
    if (!name) return undefined;
    const n = name.toLowerCase();
    if (/wikisource|維基|维基/.test(n)) return 'wikisource';
    if (/kanripo/.test(n)) return 'kanripo';
    if (/識典|识典|shidian/.test(n)) return 'shidian';
    return undefined;
}

/** 旧 key → 新 key：去 `-01`、`-02`→`-2`（规格 §六）。`book` 等没有来源信息的返回 undefined，由调用方按来源名定 */
export function versionKeyFromOld(oldKey: string): string | undefined {
    const m = /^([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)-0*(\d+)$/.exec(oldKey);
    if (m) {
        const n = Number(m[2]);
        return n <= 1 ? m[1] : `${m[1]}-${n}`;
    }
    if (oldKey === 'book' || !isTextKey(oldKey)) return undefined;
    return oldKey;
}

/** 版本按来源优先级稳定排序（同来源保持原有相对顺序） */
export function rankVersions<T extends { key: string; source?: string }>(versions: readonly T[]): T[] {
    return versions
        .map((v, i) => ({ v, i, p: sourcePriority(v.source ?? sourceOfKey(v.key)) }))
        .sort((a, b) => a.p - b.p || a.i - b.i)
        .map(x => x.v);
}

/** 读者看得懂的版本名：label 为空时按来源名，再按 key */
export function textVersionLabel(v: Pick<TextVersion, 'label' | 'source_name' | 'key'>): string {
    return v.label || v.source_name || v.key;
}

// ── 旧结构 → 新模型（适配层） ──

/** 合成 manifest 时记下每个版本在旧结构里的出处，取数时用 */
export type LegacyTextSource =
    | { kind: 'collated' }
    | { kind: 'work-full'; oldKey: string }
    | { kind: 'book-full' };

export interface LegacyTextInputs {
    id: string;
    collated?: CollatedEditionIndex | null;
    /** Work 全文候选清单（旧 `getWorkFullTextList`）；Book 层的项（owner_type 'Book'）忽略 */
    fullTexts?: readonly WorkFullTextEntry[];
    /** Book 全文目录（旧 `getBookFullTextIndex`） */
    bookFull?: BookFullTextIndex | null;
}

function uniqueKey(base: string, used: Set<string>): string {
    if (!used.has(base)) { used.add(base); return base; }
    for (let n = 2; ; n++) {
        const k = `${base}-${n}`;
        if (!used.has(k)) { used.add(k); return k; }
    }
}

/**
 * 旧结构的整理本＋Work 全文（或 Book 全文）合成等价的 manifest：
 * 按来源优先级排出 default（整理本 → 维基 → Kanripo → 识典），其余版本 key 取旧 key 去序号；
 * 同来源第二份起标签加序号（「維基文庫 2」）。没有任何文本返回 null。
 */
export function synthesizeManifest(input: LegacyTextInputs): { manifest: TextManifest; legacy: Record<string, LegacyTextSource> } | null {
    type Cand = { v: Omit<TextVersion, 'key'> & { key: string; source: string }; src: LegacyTextSource };
    const cands: Cand[] = [];
    const usedKeys = new Set<string>(['default']);

    if (input.collated && getLegacyJuanFiles(input.collated).length > 0) {
        cands.push({
            v: { key: 'collated', kind: 'collated', label: '整理本', source: 'collated', source_name: '開源古籍', chapters_total: getLegacyJuanFiles(input.collated).length },
            src: { kind: 'collated' },
        });
    }
    for (const e of input.fullTexts ?? []) {
        if (e.owner_type === 'Book') continue;
        const source = sourceFromName(e.source_name) ?? sourceOfKey(e.key);
        const key = versionKeyFromOld(e.key) ?? source;
        cands.push({
            v: {
                key, kind: 'transcription', label: e.source_name || e.version_label || key, source,
                source_name: e.source_name, source_url: e.source_url ?? null, license: e.license ?? null,
                quality: e.grade ?? null, chapters_total: e.total_chapters ?? null,
            },
            src: { kind: 'work-full', oldKey: e.key },
        });
    }
    if (input.bookFull && input.bookFull.chapters?.length > 0) {
        const name = input.bookFull.source?.name;
        const source = sourceFromName(name) ?? 'text';
        cands.push({
            v: {
                key: source, kind: 'transcription', label: name || input.bookFull.version_label || source, source,
                source_name: name, source_url: input.bookFull.source?.url ?? null, license: input.bookFull.source?.license ?? null,
                chapters_total: input.bookFull.total_chapters ?? input.bookFull.chapters.length,
            },
            src: { kind: 'book-full' },
        });
    }
    if (cands.length === 0) return null;

    const ranked = rankVersions(cands.map(c => ({ ...c, key: c.v.key, source: c.v.source })));
    const legacy: Record<string, LegacyTextSource> = {};
    const seenSource = new Map<string, number>();
    const versions: TextVersion[] = ranked.map((c, i) => {
        const nth = (seenSource.get(c.v.source) ?? 0) + 1;
        seenSource.set(c.v.source, nth);
        const key = i === 0 ? 'default' : uniqueKey(isTextKey(c.v.key) && c.v.key !== 'default' ? c.v.key : c.v.source, usedKeys);
        legacy[key] = c.src;
        return { ...c.v, key, label: nth > 1 ? `${c.v.label} ${nth}` : c.v.label };
    });
    return { manifest: { id: input.id, versions }, legacy };
}

/** 旧整理本目录的卷文件清单（catalog 用 juan_files，kaozhen 用 files[].filename） */
export function getLegacyJuanFiles(idx: CollatedEditionIndex): string[] {
    if (idx.juan_files && idx.juan_files.length > 0) return idx.juan_files;
    if (idx.files && idx.files.length > 0) return idx.files.map(f => f.filename);
    return [];
}

/**
 * 旧整理本目录 → TextIndex。章 key 取文件名主干（`juan/001.json`→`001`）；主干有重名时整批改用不带扩展名的完整路径，
 * 保证章 key 唯一。分组 files、juan_metadata 的键同步换成章 key。
 */
export function convertLegacyCollatedIndex(idx: CollatedEditionIndex): TextIndex {
    const files = getLegacyJuanFiles(idx);
    const stems = files.map(chapterKeyOf);
    const unique = new Set(stems).size === stems.length;
    const keyOf = (f: string) => (unique ? chapterKeyOf(f) : f.replace(/\.json$/, ''));
    const titleByFile = new Map((idx.files ?? []).map(f => [f.filename, f.title] as const));
    const chapters: TextChapter[] = files.map((f, i) => ({
        n: i + 1,
        file: keyOf(f),
        title: titleByFile.get(f) ?? '',
        has_json: true,
        legacy_file: f,
    }));
    const mapGroup = (g: JuanGroup): JuanGroup => ({ label: g.label, files: g.files.map(keyOf), children: g.children?.map(mapGroup) });
    const meta = idx.juan_metadata
        ? Object.fromEntries(Object.entries(idx.juan_metadata).map(([f, m]) => [keyOf(f), m]))
        : undefined;
    return {
        chapters,
        title: idx.title,
        type: idx.type,
        work_id: idx.work_id,
        juan_groups: idx.juan_groups?.map(mapGroup),
        juan_metadata: meta,
        references: idx.references,
        target_source: idx.target_source,
        target_source_id: idx.target_source_id,
        text_source: idx.text_source,
        text_quality: idx.text_quality,
    };
}

/** 旧全文目录（Book 或 Work 的一份）→ TextIndex；章 key 取文件名主干 */
export function convertLegacyFullTextIndex(idx: BookFullTextIndex | WorkFullTextIndex): TextIndex {
    return {
        chapters: idx.chapters.map(c => ({
            n: c.n,
            file: chapterKeyOf(c.file),
            title: c.title,
            has_json: false,
            page_title: c.page_title,
            legacy_file: c.file,
        })),
        table_notation: idx.table_notation,
        guji_markdown: idx.guji_markdown,
        source: idx.source,
        version_label: idx.version_label,
    };
}

// ── 切版本时落在哪一章 ──

/**
 * 切到另一份版本时尽量停在同一章：先按章 key（三位编号）对，再按章序号 n 对，都对不上回第一章。
 * prev 是切换前的章（key 与 n），返回新目录里的章 key；新目录没有章返回 null。
 */
export function matchChapterAcrossVersions(prev: { file: string; n?: number } | null | undefined, next: TextIndex | null | undefined): string | null {
    const chapters = next?.chapters ?? [];
    if (chapters.length === 0) return null;
    if (prev) {
        const byKey = chapters.find(c => c.file === prev.file);
        if (byKey) return byKey.file;
        if (prev.n !== undefined) {
            const byN = chapters.find(c => c.n === prev.n);
            if (byN) return byN.file;
        }
    }
    return chapters[0].file;
}

/** 当前版本：key 有效就用它，否则 default（versions[0]） */
export function pickTextVersion(manifest: TextManifest | null | undefined, key?: string | null): TextVersion | undefined {
    const vs = manifest?.versions;
    if (!vs || vs.length === 0) return undefined;
    return (key != null ? vs.find(v => v.key === key) : undefined) ?? vs.find(v => v.key === 'default') ?? vs[0];
}
