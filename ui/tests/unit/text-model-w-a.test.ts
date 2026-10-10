/**
 * W-A 类型对齐（spec 07）：self_collated 版本种类、版本 note、章级 sidecar 文件名、保留字 extra、
 * 质量六档。构造对象用于让 tsc 检查类型是否接得住；运行时只断言保留字与档位表。
 */
import { describe, expect, it } from 'vitest';
import { RESERVED_TEXT_KEYS, isTextKey, type TextChapter, type TextVersion } from '../../src/core/text-model';
import { TEXT_QUALITY_CRITERIA, TEXT_QUALITY_LABELS, type TextQualityGrade } from '../../src/types';

describe('W-A 类型对齐', () => {
    it('TextVersion 能表达 self_collated 原件版本（is_original＋note）', () => {
        const v: TextVersion = {
            key: 'default',
            kind: 'self_collated',
            label: '開源古籍自校本',
            source: 'original',
            is_original: true,
            note: '本站独立整理',
        };
        expect(v.kind).toBe('self_collated');
        expect(v.is_original).toBe(true);
    });

    it('TextChapter 能带章级 sidecar 文件名，且都是可选的', () => {
        const plain: TextChapter = { n: 1, file: '001', title: '卷一' };
        const full: TextChapter = {
            n: 2, file: '002', title: '卷二',
            char_file: '002.char.json', cord_file: '002.cord.json', punct_file: '002.punct.json',
            entity_file: '002.entity.json', norm_file: '002.norm.json', decision_file: '002.decision.json',
        };
        expect(plain.char_file).toBeUndefined();
        expect(full.entity_file).toBe('002.entity.json');
    });

    it('保留字含 extra：不能作非主版本的 key，isTextKey 返回 false', () => {
        expect(RESERVED_TEXT_KEYS).toContain('extra');
        expect(isTextKey('extra')).toBe(false);
        expect(isTextKey('wikisource')).toBe(true);
    });

    it('质量档是 spec 的六档，且不再有 published', () => {
        const grades: TextQualityGrade[] = ['source', 'ocr', 'rough', 'fine', 'none', 'placeholder'];
        expect(Object.keys(TEXT_QUALITY_LABELS).sort()).toEqual([...grades].sort());
        expect(Object.keys(TEXT_QUALITY_CRITERIA).sort()).toEqual([...grades].sort());
        expect(Object.keys(TEXT_QUALITY_LABELS)).not.toContain('published');
    });
});
