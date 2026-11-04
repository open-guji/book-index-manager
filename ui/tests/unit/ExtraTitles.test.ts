import { describe, it, expect } from 'vitest';
import { splitExtraTitles } from '../../src/core/storage';

/** 第 12 组 S2-T：附刻之书在 additional_titles 里（{book_title, type:'附刻'}），拆成异名与附刻 */
describe('splitExtraTitles', () => {
    it('按 type 拆出异名与附刻', () => {
        expect(splitExtraTitles(['甲', { book_title: '乙' }, { book_title: '丙', type: '附刻' }, { book_title: '丁', type: '附刻' }]))
            .toEqual({ aliases: ['甲', '乙'], attached: ['丙', '丁'] });
    });
    it('空与坏数据', () => {
        expect(splitExtraTitles(undefined)).toEqual({ aliases: [], attached: [] });
        expect(splitExtraTitles([{ book_title: '' }, null, { type: '附刻' }])).toEqual({ aliases: [], attached: [] });
    });
});
