import { describe, it, expect } from 'vitest';
import { formatCollectedPosition, formatVolumeIndex, isPieceSubtype } from '../../src/core/detail-model';

const L = { vol: '卷{n}', shou: '第{n}首', pian: '第{n}篇' };

describe('单篇诗文（方案 A）', () => {
    it('isPieceSubtype：诗词曲赋文算单篇，书与篇章不算', () => {
        for (const st of ['poem', 'ci', 'qu', 'fu', 'article']) expect(isPieceSubtype(st)).toBe(true);
        for (const st of ['book', 'chapter', '', undefined, null]) expect(isPieceSubtype(st)).toBe(false);
    });

    it('formatVolumeIndex：数字、连续数组、不连续数组、字符串', () => {
        expect(formatVolumeIndex(159)).toBe('159');
        expect(formatVolumeIndex([160, 159])).toBe('159–160');
        expect(formatVolumeIndex([1, 3])).toBe('1、3');
        expect(formatVolumeIndex('上')).toBe('上');
        expect(formatVolumeIndex(undefined)).toBe('');
    });

    it('formatCollectedPosition：诗词曲论首，赋与文论篇；缺项不出', () => {
        expect(formatCollectedPosition(159, 3, 'poem', L)).toBe('卷159 · 第3首');
        expect(formatCollectedPosition(12, 2, 'fu', L)).toBe('卷12 · 第2篇');
        expect(formatCollectedPosition(undefined, 5, 'article', L)).toBe('第5篇');
        expect(formatCollectedPosition(7, undefined, 'ci', L)).toBe('卷7');
        expect(formatCollectedPosition(undefined, undefined, 'poem', L)).toBe('');
    });
});
