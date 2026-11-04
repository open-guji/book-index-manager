import { describe, expect, it } from 'vitest';
import { normalizeCollatedJuan, normalizeCollatedSection } from '../../src/core/collated-normalize';
import type { CollatedJuan, CollatedSection } from '../../src/types';

const sec = (o: Partial<CollatedSection>) => ({ title: 't', level: 3, type: 'book', content: '', ...o }) as CollatedSection;

describe('normalizeCollatedSection（第 11 组两认）', () => {
    it('旧写法 work_id 补出 work_ids', () => {
        const s = normalizeCollatedSection(sec({ work_id: 'w1' }));
        expect(s.work_id).toBe('w1');
        expect(s.work_ids).toEqual(['w1']);
    });
    it('旧写法 work_id: null 视作明确未链', () => {
        const s = normalizeCollatedSection(sec({ work_id: null }));
        expect(s.work_id).toBeNull();
        expect(s.work_ids).toEqual([]);
    });
    it('新写法只有 work_ids：单链取第一项', () => {
        expect(normalizeCollatedSection(sec({ work_ids: ['a'] })).work_id).toBe('a');
        const m = normalizeCollatedSection(sec({ work_ids: ['a', 'b'] }));
        expect(m.work_id).toBe('a');
        expect(m.work_ids).toEqual(['a', 'b']);
        expect(normalizeCollatedSection(sec({ work_ids: [] })).work_id).toBeNull();
    });
    it('两者都有取并集，work_id 排第一', () => {
        expect(normalizeCollatedSection(sec({ work_id: 'c', work_ids: ['a', 'c'] })).work_ids).toEqual(['c', 'a']);
    });
    it('两个键都没有就原样', () => {
        const s = sec({});
        expect(normalizeCollatedSection(s)).toBe(s);
    });
});

describe('normalizeCollatedJuan', () => {
    it('meta 里的 page_title／source_url 补到顶层', () => {
        const j = normalizeCollatedJuan({ title: 'x', sections: [], meta: { page_title: 'p', source_url: 'https://u' } } as unknown as CollatedJuan)!;
        expect(j.page_title).toBe('p');
        expect(j.source_url).toBe('https://u');
    });
    it('旧写法顶层字段不动', () => {
        const j = normalizeCollatedJuan({ title: 'x', page_title: 'old', sections: [sec({ work_id: 'w' })] } as CollatedJuan)!;
        expect(j.page_title).toBe('old');
        expect(j.sections[0].work_ids).toEqual(['w']);
    });
    it('null 原样返回', () => {
        expect(normalizeCollatedJuan(null)).toBeNull();
    });
});
