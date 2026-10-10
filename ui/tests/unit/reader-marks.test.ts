/**
 * 阅读器标点转换（transformMark）：三种引号样式对八个字符的映射、书名号隐去、多字符串、空串、非引号标点原样。
 */
import { describe, expect, it } from 'vitest';
import { transformMark } from '../../src/components/Reader/marks';

describe('transformMark 引号样式', () => {
    it('original：引号一律不变', () => {
        for (const c of ['“', '”', '‘', '’', '「', '」', '『', '』']) {
            expect(transformMark(c, { quoteStyle: 'original' })).toBe(c);
        }
    });
    it('modern：「」『』 → “” ‘’，“”‘’ 不变', () => {
        expect(transformMark('「', { quoteStyle: 'modern' })).toBe('“');
        expect(transformMark('」', { quoteStyle: 'modern' })).toBe('”');
        expect(transformMark('『', { quoteStyle: 'modern' })).toBe('‘');
        expect(transformMark('』', { quoteStyle: 'modern' })).toBe('’');
        expect(transformMark('“', { quoteStyle: 'modern' })).toBe('“');
        expect(transformMark('”', { quoteStyle: 'modern' })).toBe('”');
        expect(transformMark('‘', { quoteStyle: 'modern' })).toBe('‘');
        expect(transformMark('’', { quoteStyle: 'modern' })).toBe('’');
    });
    it('classic：“” ‘’ → 「」『』，「」『』 不变', () => {
        expect(transformMark('“', { quoteStyle: 'classic' })).toBe('「');
        expect(transformMark('”', { quoteStyle: 'classic' })).toBe('」');
        expect(transformMark('‘', { quoteStyle: 'classic' })).toBe('『');
        expect(transformMark('’', { quoteStyle: 'classic' })).toBe('』');
        expect(transformMark('「', { quoteStyle: 'classic' })).toBe('「');
        expect(transformMark('」', { quoteStyle: 'classic' })).toBe('」');
        expect(transformMark('『', { quoteStyle: 'classic' })).toBe('『');
        expect(transformMark('』', { quoteStyle: 'classic' })).toBe('』');
    });
});

describe('transformMark 书名号', () => {
    it('hideBookBrackets 为真：《 》 〈 〉 全部删掉；为假或缺省：原样', () => {
        for (const c of ['《', '》', '〈', '〉']) {
            expect(transformMark(c, { quoteStyle: 'original', hideBookBrackets: true })).toBe('');
            expect(transformMark(c, { quoteStyle: 'original', hideBookBrackets: false })).toBe(c);
            expect(transformMark(c, { quoteStyle: 'original' })).toBe(c);
        }
    });
});

describe('transformMark 多字符与其它字符', () => {
    it('多字符串逐字转换：「《史記》」在 modern＋隐书名号下 → “史記”', () => {
        expect(transformMark('「《史記》」', { quoteStyle: 'modern', hideBookBrackets: true })).toBe('“史記”');
        expect(transformMark('「《史記》」', { quoteStyle: 'original' })).toBe('「《史記》」');
    });
    it('空串返回空串', () => {
        expect(transformMark('', { quoteStyle: 'modern', hideBookBrackets: true })).toBe('');
        expect(transformMark('', { quoteStyle: 'classic' })).toBe('');
    });
    it('非引号标点原样保留', () => {
        for (const c of ['，', '。', '、', '；', '：', '？', '！']) {
            expect(transformMark(c, { quoteStyle: 'modern', hideBookBrackets: true })).toBe(c);
            expect(transformMark(c, { quoteStyle: 'classic' })).toBe(c);
        }
    });
});
