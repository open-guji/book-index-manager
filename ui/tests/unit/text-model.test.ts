/** 阅读文本统一数据模型（overview#307，只认新结构）：key、路径安全、切版本停在同章 */
import { describe, expect, it } from 'vitest';
import {
    isChapterSegment, isSafeSegment, isTextKey, matchChapterAcrossVersions, pickTextVersion, textVersionLabel,
} from '../../src/core/text-model';

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

    it('路径安全的单段', () => {
        expect(isSafeSegment('001')).toBe(true);
        for (const s of ['', '..', 'a/b', 'a\\b', '../x']) expect(isSafeSegment(s), s).toBe(false);
        // URL 分隔符、百分号转义、空白、控制字符都不行（章 key 会拼进 fetch 的 URL）
        for (const s of ['001?x=1', '001#frag', '%2e%2e', 'a b', 'a\nb', 'a\u0000b']) expect(isSafeSegment(s), JSON.stringify(s)).toBe(false);
        // 汉字等正常文件名放行
        for (const s of ['第001', '卷01', 'wikisource-2', 'd59f2htm01du']) expect(isSafeSegment(s), s).toBe(true);
    });
});

describe('版本显示名', () => {
    it('label 优先，其次来源名，最后 key', () => {
        expect(textVersionLabel({ key: 'wikisource', label: '維基文庫', source_name: 'x' })).toBe('維基文庫');
        expect(textVersionLabel({ key: 'wikisource', label: '', source_name: '維基文庫' })).toBe('維基文庫');
        // 类别词不进页面：整理本的 label「整理本」改用来源名「開源古籍」（用户 10-01 定）
        expect(textVersionLabel({ key: 'default', label: '整理本', source_name: '開源古籍' })).toBe('開源古籍');
        expect(textVersionLabel({ key: 'x', label: '转录全文', source_name: '維基文庫' })).toBe('維基文庫');
        // 没有来源名可用时只好保留原 label，不丢版本入口
        expect(textVersionLabel({ key: 'default', label: '整理本' })).toBe('整理本');
        expect(textVersionLabel({ key: 'wikisource', label: '' })).toBe('wikisource');
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
