/**
 * normalizeCatalog 单测
 *
 * 这个函数把各种来源的 volume_book_mapping.json 归一化为统一格式 — 是
 * 调用方（kaiyuanguji-web、guji-platform）唯一的入口。任何格式漂移
 * 都会让丛编目录显示错。
 */
import { describe, it, expect } from 'vitest';
import { normalizeCatalog } from '../../src/core/normalize-catalog';

describe('normalizeCatalog 基本字段', () => {
    it('空数据返回最小结构', () => {
        const r = normalizeCatalog({});
        expect(r).toEqual({
            collection_id: '',
            title: '',
            total_volumes: 0,
            stats: { total_books: 0 },
            books: [],
        });
    });

    it('保留 source / resource_id / resource_name / sections', () => {
        const r = normalizeCatalog({
            collection_id: 'c1',
            title: '丛编',
            total_volumes: 100,
            source: 'wikimedia',
            resource_id: 'r1',
            resource_name: '维基共享',
            sections: [{ title: '经', range: [1, 50] }],
            stats: { total_books: 10 },
            books: [],
        });
        expect(r.collection_id).toBe('c1');
        expect(r.source).toBe('wikimedia');
        expect(r.resource_id).toBe('r1');
        expect(r.sections).toEqual([{ title: '经', range: [1, 50] }]);
    });
});

describe('normalizeCatalog volumes 归一化', () => {
    it('volumes 为 number[] 时原样保留', () => {
        const r = normalizeCatalog({
            books: [{ title: 'X', book_id: 'b1', volumes: [1, 2, 3] }],
        });
        expect(r.books[0].volumes).toEqual([1, 2, 3]);
        expect(r.books[0].volume_details).toBeUndefined();
    });

    it('volumes 为对象数组时拆 volumes + volume_details', () => {
        const r = normalizeCatalog({
            books: [{
                title: 'Y',
                book_id: 'b2',
                volumes: [
                    { volume: 1, status: 'ok', wiki_url: 'http://w1' },
                    { volume: 2, status: 'missing' },
                ],
            }],
        });
        const b = r.books[0];
        expect(b.volumes).toEqual([1, 2]);
        expect(b.volume_details).toHaveLength(2);
        expect(b.volume_details![0]).toEqual({
            volume: 1,
            status: 'ok',
            urls: { wiki_url: 'http://w1' },
            file: undefined,
        });
        expect(b.volume_details![1].urls).toBeUndefined();
    });

    it('多个 url 字段全部归入 urls Record', () => {
        const r = normalizeCatalog({
            books: [{
                title: 'Z', book_id: 'b3',
                volumes: [{ volume: 5, wiki_url: 'a', tw_url: 'b', npm_id: 'c' }],
            }],
        });
        expect(r.books[0].volume_details![0].urls).toEqual({
            wiki_url: 'a',
            tw_url: 'b',
            npm_id: 'c',
        });
    });

    it('missing_vols / missing_volumes 兼容（旧字段）', () => {
        const r1 = normalizeCatalog({
            books: [{ title: 'A', volumes: [1], missing_vols: [2, 3] }],
        });
        const r2 = normalizeCatalog({
            books: [{ title: 'A', volumes: [1], missing_volumes: [2, 3] }],
        });
        expect(r1.books[0].missing_volumes).toEqual([2, 3]);
        expect(r2.books[0].missing_volumes).toEqual([2, 3]);
    });

    it('清理 undefined 字段', () => {
        const r = normalizeCatalog({
            books: [{ title: 'B', book_id: null, volumes: [1] }],
        });
        // book_id: null 应被保留（这是显式的 null 不是 undefined）
        expect(r.books[0]).not.toHaveProperty('section');
        expect(r.books[0]).not.toHaveProperty('edition');
    });
});

describe('normalizeCatalog stats 归一化', () => {
    it('保留各种 stats 字段（容忍部分缺失）', () => {
        const r = normalizeCatalog({
            stats: {
                total_books: 100,
                processed_volumes: 50,
                matched_works: 80,
                unmatched_works: 20,
                total_found_volumes: 200,
            },
        });
        expect(r.stats).toMatchObject({
            total_books: 100,
            processed_volumes: 50,
            matched_works: 80,
            unmatched_works: 20,
            total_found_volumes: 200,
        });
    });

    it('stats 缺失时填默认值', () => {
        const r = normalizeCatalog({});
        expect(r.stats).toEqual({ total_books: 0 });
    });
});
