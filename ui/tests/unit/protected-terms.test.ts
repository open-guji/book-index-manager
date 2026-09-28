/**
 * 繁→简保护表（overview#268：OpenCC 把「曹霑」转成「曹沾」）
 */
import { describe, it, expect } from 'vitest';
import { Converter } from 'opencc-js/t2cn';
import { withProtectedTerms, PROTECTED_TERMS } from '../../src/i18n/protected-terms';

const raw = Converter({ from: 'tw', to: 'cn' });
const conv = withProtectedTerms(raw);

describe('withProtectedTerms', () => {
    it('前提：裸 OpenCC 确实会误转「曹霑」', () => {
        expect(raw('曹霑')).not.toBe('曹霑');
    });

    // 新增保护词时在这里补一行：[输入, 期望]
    const CASES: [string, string][] = [
        ['曹霑', '曹霑'],
        ['曹霑著紅樓夢', '曹霑着红楼梦'],
        ['紅樓夢作者曹霑', '红楼梦作者曹霑'],
        ['曹霑與曹霑', '曹霑与曹霑'],
    ];
    for (const [input, expected] of CASES) {
        it(`${input} → ${expected}`, () => expect(conv(input)).toBe(expected));
    }

    it('保护表里的词都不被改动', () => {
        for (const term of PROTECTED_TERMS) expect(conv(`前${term}后`)).toContain(term);
    });

    it('无关文本与空串照常转换', () => {
        expect(conv('')).toBe('');
        expect(conv('史記')).toBe(raw('史記'));
    });

    it('长词优先、可自定义词表', () => {
        const c = withProtectedTerms(s => s.toUpperCase(), ['ab', 'abc']);
        expect(c('xabcx abx')).toBe('XabcX abX');
    });

    it('词表为空时返回原函数', () => {
        const f = (s: string) => s;
        expect(withProtectedTerms(f, [])).toBe(f);
    });
});
