/** 阅读文本统一数据模型（overview#307）：key、来源优先级、旧结构合成、切版本停在同章 */
import { describe, expect, it } from 'vitest';
import {
    chapterKeyOf, convertLegacyCollatedIndex, convertLegacyFullTextIndex, isChapterSegment, isSafeSegment, isTextKey,
    matchChapterAcrossVersions, pickTextVersion, rankVersions, sourceFromName, sourceOfKey, synthesizeManifest, versionKeyFromOld,
} from '../../src/core/text-model';
import type { BookFullTextIndex, CollatedEditionIndex, WorkFullTextEntry, WorkFullTextIndex } from '../../src/types';

describe('版本 key 与章号', () => {
    it('isTextKey：default 与 [a-z0-9-] 字母开头的非保留字', () => {
        for (const k of ['default', 'collated', 'wikisource', 'wikisource-2', 'open-guji', 'shidian']) expect(isTextKey(k), k).toBe(true);
        for (const k of ['manifest', 'fragments', 'sources', '001', '3d', 'Wiki', 'a_b', '', 'a/b', '..', undefined, 5]) expect(isTextKey(k), String(k)).toBe(false);
    });

    it('URL 片段：纯数字是章号，字母开头是版本 key', () => {
        expect(isChapterSegment('003')).toBe(true);
        expect(isChapterSegment('wikisource-2')).toBe(false);
        expect(isChapterSegment('3a')).toBe(false);
    });

    it('章 key：去目录与扩展名', () => {
        expect(chapterKeyOf('juan/001.json')).toBe('001');
        expect(chapterKeyOf('第001.md')).toBe('第001');
        expect(chapterKeyOf('001')).toBe('001');
        expect(chapterKeyOf('卷01.txt')).toBe('卷01');
    });

    it('路径安全的单段', () => {
        expect(isSafeSegment('001')).toBe(true);
        for (const s of ['', '..', 'a/b', 'a\\b', '../x']) expect(isSafeSegment(s), s).toBe(false);
    });
});

describe('来源与旧 key', () => {
    it('旧 key → 新 key：去 -01、-02→-2；book 等没有来源信息的不猜', () => {
        expect(versionKeyFromOld('wikisource-01')).toBe('wikisource');
        expect(versionKeyFromOld('wikisource-02')).toBe('wikisource-2');
        expect(versionKeyFromOld('kanripo-01')).toBe('kanripo');
        expect(versionKeyFromOld('shidian-01')).toBe('shidian');
        expect(versionKeyFromOld('open-guji')).toBe('open-guji');
        expect(versionKeyFromOld('book')).toBeUndefined();
        expect(versionKeyFromOld('Bad_Key')).toBeUndefined();
    });

    it('来源名 → 来源短名；key 去序号后缀', () => {
        expect(sourceFromName('維基文庫')).toBe('wikisource');
        expect(sourceFromName('维基文库')).toBe('wikisource');
        expect(sourceFromName('Kanripo')).toBe('kanripo');
        expect(sourceFromName('識典古籍')).toBe('shidian');
        expect(sourceFromName('某站')).toBeUndefined();
        expect(sourceOfKey('wikisource-2')).toBe('wikisource');
        expect(sourceOfKey('wikisource-01')).toBe('wikisource');
        expect(sourceOfKey('open-guji')).toBe('open-guji');
    });

    it('按来源优先级排：整理本 → 维基 → Kanripo → 识典 → 其他；同来源保持原序', () => {
        const vs = [{ key: 'x' }, { key: 'shidian' }, { key: 'kanripo' }, { key: 'wikisource-2' }, { key: 'wikisource' }, { key: 'collated' }];
        expect(rankVersions(vs).map(v => v.key)).toEqual(['collated', 'wikisource-2', 'wikisource', 'kanripo', 'shidian', 'x']);
    });
});

const ft = (key: string, source_name: string, extra: Partial<WorkFullTextEntry> = {}): WorkFullTextEntry => ({
    key, owner_type: 'Work', path: `Work/x/${key}`, version_label: source_name, source_name, total_chapters: 3, primary: false, ...extra,
});

describe('旧结构合成 manifest', () => {
    it('整理本 + 维基 + Kanripo：default 是整理本，其余按来源优先级', () => {
        const collated = { work_id: 'w', juan_files: ['juan/001.json', 'juan/002.json'] } as CollatedEditionIndex;
        const r = synthesizeManifest({ id: 'w', collated, fullTexts: [ft('kanripo-01', 'Kanripo', { primary: true }), ft('wikisource-01', '維基文庫', { license: 'CC BY-SA 4.0' })] })!;
        expect(r.manifest.versions.map(v => [v.key, v.kind, v.label])).toEqual([
            ['default', 'collated', '整理本'],
            ['wikisource', 'transcription', '維基文庫'],
            ['kanripo', 'transcription', 'Kanripo'],
        ]);
        expect(r.manifest.versions[1].license).toBe('CC BY-SA 4.0');
        expect(r.legacy).toEqual({
            default: { kind: 'collated' },
            wikisource: { kind: 'work-full', oldKey: 'wikisource-01' },
            kanripo: { kind: 'work-full', oldKey: 'kanripo-01' },
        });
    });

    it('没有整理本：维基排在 Kanripo 前成为 default（章数不参与，来源优先）', () => {
        const r = synthesizeManifest({ id: 'w', fullTexts: [ft('kanripo-01', 'Kanripo', { total_chapters: 50, primary: true }), ft('wikisource-01', '維基文庫', { total_chapters: 2 })] })!;
        expect(r.manifest.versions.map(v => v.key)).toEqual(['default', 'kanripo']);
        expect(r.manifest.versions[0].source).toBe('wikisource');
        expect(r.legacy.default).toEqual({ kind: 'work-full', oldKey: 'wikisource-01' });
    });

    it('同来源两份：第二份 key 带序号、标签加序号（維基文庫 2）', () => {
        const r = synthesizeManifest({ id: 'w', fullTexts: [ft('wikisource-01', '維基文庫'), ft('wikisource-02', '維基文庫')] })!;
        expect(r.manifest.versions.map(v => [v.key, v.label])).toEqual([['default', '維基文庫'], ['wikisource-2', '維基文庫 2']]);
        expect(r.legacy['wikisource-2']).toEqual({ kind: 'work-full', oldKey: 'wikisource-02' });
    });

    it('只有一份：那份就是 default；Book 层的清单项忽略', () => {
        const r = synthesizeManifest({ id: 'w', fullTexts: [ft('wikisource-01', '維基文庫'), ft('book', '某', { owner_type: 'Book' })] })!;
        expect(r.manifest.versions.map(v => v.key)).toEqual(['default']);
    });

    it('Book 全文：按来源名定来源，标签只写来源', () => {
        const bookFull = { book_id: 'b', version_label: '程甲本', source: { name: '維基文庫', url: 'https://x', license: 'CC BY-SA 4.0' }, total_chapters: 2, chapters: [{ n: 1, title: '一', file: '第001.md' }] } as BookFullTextIndex;
        const r = synthesizeManifest({ id: 'b', bookFull })!;
        expect(r.manifest.versions).toHaveLength(1);
        expect(r.manifest.versions[0]).toMatchObject({ key: 'default', kind: 'transcription', label: '維基文庫', license: 'CC BY-SA 4.0' });
        expect(r.legacy.default).toEqual({ kind: 'book-full' });
    });

    it('什么都没有 → null（空目录的整理本、空章的 Book 全文都不算）', () => {
        expect(synthesizeManifest({ id: 'w' })).toBeNull();
        expect(synthesizeManifest({ id: 'w', collated: { work_id: 'w', juan_files: [] } as CollatedEditionIndex })).toBeNull();
        expect(synthesizeManifest({ id: 'b', bookFull: { book_id: 'b', chapters: [] } as unknown as BookFullTextIndex })).toBeNull();
    });
});

describe('旧目录 → TextIndex', () => {
    it('整理本：章 key 取卷文件主干，分组 files 与册号键同步换；卷名取 files[].title', () => {
        const idx = {
            work_id: 'w', title: '書錄', type: 'catalog', juan_files: ['juan/001.json', 'juan/002.json'],
            juan_groups: [{ label: '經錄', files: ['juan/001.json'], children: [{ label: '子', files: ['juan/002.json'] }] }],
            juan_metadata: { 'juan/001.json': { vol_label: '49' } },
        } as CollatedEditionIndex;
        const t = convertLegacyCollatedIndex(idx);
        expect(t.chapters.map(c => [c.n, c.file, c.legacy_file, c.has_json])).toEqual([[1, '001', 'juan/001.json', true], [2, '002', 'juan/002.json', true]]);
        expect(t.juan_groups).toEqual([{ label: '經錄', files: ['001'], children: [{ label: '子', files: ['002'], children: undefined }] }]);
        expect(t.juan_metadata).toEqual({ '001': { vol_label: '49' } });
        expect(t.title).toBe('書錄');
    });

    it('整理本：主干有重名时整批改用完整路径，章 key 仍唯一', () => {
        const t = convertLegacyCollatedIndex({ work_id: 'w', juan_files: ['a/001.json', 'b/001.json'] } as CollatedEditionIndex);
        expect(t.chapters.map(c => c.file)).toEqual(['a/001', 'b/001']);
    });

    it('考证类：用 files[].filename／title', () => {
        const t = convertLegacyCollatedIndex({ work_id: 'w', type: 'kaozhen', files: [{ filename: '史記.json', title: '史記' }] } as CollatedEditionIndex);
        expect(t.chapters[0]).toMatchObject({ file: '史記', title: '史記', legacy_file: '史記.json' });
    });

    it('全文：章 key 取主干，保留表格写法与来源', () => {
        const t = convertLegacyFullTextIndex({
            work_id: 'w', version_label: '某', source: { name: '維基文庫', url: 'u' }, total_chapters: 1, table_notation: 'guji-table-v1', guji_markdown: '0.2.0',
            chapters: [{ n: 1, title: '第一回', file: '第001.md' }],
        } as WorkFullTextIndex);
        expect(t.chapters[0]).toMatchObject({ n: 1, file: '第001', legacy_file: '第001.md', title: '第一回' });
        expect(t.table_notation).toBe('guji-table-v1');
        expect(t.guji_markdown).toBe('0.2.0');
    });
});

describe('切版本落在哪一章', () => {
    const idx = (...files: string[]) => ({ chapters: files.map((f, i) => ({ n: i + 1, file: f, title: f })) });
    it('同章 key 优先；其次同序号；都对不上回第一章；新目录空返回 null', () => {
        expect(matchChapterAcrossVersions({ file: '003', n: 3 }, idx('001', '002', '003'))).toBe('003');
        expect(matchChapterAcrossVersions({ file: 'x', n: 2 }, idx('001', '002', '003'))).toBe('002');
        expect(matchChapterAcrossVersions({ file: '009', n: 9 }, idx('001', '002'))).toBe('001');
        expect(matchChapterAcrossVersions(null, idx('001', '002'))).toBe('001');
        expect(matchChapterAcrossVersions({ file: '001' }, { chapters: [] })).toBeNull();
        expect(matchChapterAcrossVersions({ file: '001' }, null)).toBeNull();
    });

    it('pickTextVersion：key 有效用它，否则 default，再否则第一份', () => {
        const m = { id: 'x', versions: [{ key: 'default', kind: 'collated', label: 'a' }, { key: 'w', kind: 'transcription', label: 'b' }] } as const;
        expect(pickTextVersion(m as never, 'w')?.key).toBe('w');
        expect(pickTextVersion(m as never, 'zzz')?.key).toBe('default');
        expect(pickTextVersion(m as never, null)?.key).toBe('default');
        expect(pickTextVersion(null, 'w')).toBeUndefined();
    });
});
