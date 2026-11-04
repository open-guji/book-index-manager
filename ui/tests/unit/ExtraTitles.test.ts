import { describe, it, expect } from 'vitest';
import { splitExtraTitles } from '../../src/core/storage';

/** 第 12 组 S2-T：附刻之书并入 additional_titles（{book_title, type:'附刻'}），拆回后与旧写法同 */
describe('splitExtraTitles', () => {
    it('旧写法：additional_titles＝异名，attached_texts＝附刻', () => {
        expect(splitExtraTitles(['甲', { book_title: '乙' }], [{ book_title: '丙' }, '丁']))
            .toEqual({ aliases: ['甲', '乙'], attached: ['丙', '丁'] });
    });
    it('新写法拆出的结果与旧写法相同', () => {
        const nu = splitExtraTitles(['甲', { book_title: '丙', type: '附刻' }, { book_title: '丁', type: '附刻' }]);
        expect(nu).toEqual({ aliases: ['甲'], attached: ['丙', '丁'] });
    });
    it('空与坏数据', () => {
        expect(splitExtraTitles(undefined, undefined)).toEqual({ aliases: [], attached: [] });
        expect(splitExtraTitles([{ book_title: '' }, null, { type: '附刻' }], 'x')).toEqual({ aliases: [], attached: [] });
    });
});
