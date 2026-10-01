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
 * 阅读器只认这一套结构（用户 09-30 定，规格 §十）：不从旧目录（collated_edition/、full_text/…）合成 manifest。
 * 本文件全是纯函数，不取数、不碰 DOM。
 */
import type { CollatedEditionIndex, JuanGroup } from '../types';

export type TextKind = 'collated' | 'transcription';

export interface TextVersion {
    /** 版本 key：主版本固定 `default`；其余 `[a-z0-9-]`、字母开头 */
    key: string;
    kind: TextKind;
    /** 下拉显示名——只写来源（整理本／維基文庫／維基文庫 2） */
    label: string;
    /** 版本名（底本）：「四部叢刊本」「文淵閣四庫全書本」；可选，没有就不写（book-text 901182c50b） */
    edition_label?: string;
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
}

/** 文本的上游来源与授权说明（index.json 的 source.upstream） */
export interface TextUpstream {
    name?: string;
    url?: string;
    license?: string;
    license_url?: string;
    note?: string;
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
    source?: {
        name: string; url: string; license?: string; note?: string;
        /** 底本版本，如 Kanripo 的 WYG／SBCK、CBETA 的 T */
        base_edition?: string;
        /** 上游来源及其授权说明（如 Kanripo 此仓转自 CBETA，CBETA 限非营利使用）：版权栏要显示 */
        upstream?: TextUpstream;
    };
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

/**
 * 路径安全的单段（取数前校验，条目 id、版本 key、章 key 拼进 URL 前都要过）：
 * 不含 `..`、路径分隔符、URL 分隔符（`?` `#` `%`）、空白与控制字符。汉字等正常文件名字符放行（旧章名如「第001」）。
 */
export function isSafeSegment(s: string): boolean {
    return s.length > 0 && !s.includes('..') && !/[\\/?#%\s\u0000-\u001f\u007f]/.test(s);
}

/** 版本类别词：页面上不出现（用户 10-01 定：统一叫「文本」，版本下拉只写来源名） */
const CATEGORY_WORD = /^(整理本|整理|转录全文|轉錄全文|转录|轉錄|全文|文本)$/;

/**
 * 读者看得懂的版本名。有 edition_label 时写「版本名 · 来源名」（如「四部叢刊本 · Kanripo」，overview#307）；
 * 没有时只写来源：label 为空或是类别词（如数据里整理本的 label「整理本」）时改用来源名，再按 key。
 * 整理本的来源名是「開源古籍」，所以下拉里写「開源古籍」而不是「整理本」。
 */
export function textVersionLabel(v: Pick<TextVersion, 'label' | 'source_name' | 'key' | 'edition_label'>): string {
    const source = textSourceLabel(v);
    const edition = v.edition_label?.trim();
    return edition && edition !== source ? `${edition} · ${source}` : source;
}

function textSourceLabel(v: Pick<TextVersion, 'label' | 'source_name' | 'key'>): string {
    for (const cand of [v.label, v.source_name]) {
        const s = cand?.trim();
        if (s && !CATEGORY_WORD.test(s)) return s;
    }
    return v.label || v.source_name || v.key;
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
