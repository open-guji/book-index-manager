/**
 * 异体字归一（overview#350）：简体模式下「㫖」「縂」「寳」等 t2cn 不认的异体字也要转成简体；繁体模式原样。
 */
import { describe, it, expect } from 'vitest';
import { VARIANT_CHARS, normalizeVariants } from '../../src/i18n/variant-chars';
import { getSimplifiedConverter } from '../../src/i18n/simplified-converter';
import { findTraditionalChars } from '../../src/i18n/traditional-check';

const toSimplified = getSimplifiedConverter();

describe('normalizeVariants', () => {
    it('把异体字换成正字（繁体写法），其余原样；没有异体字时返回同一个字符串', () => {
        expect(normalizeVariants('風月寳鑑')).toBe('風月寶鑑');
        expect(normalizeVariants('其㫖縂在')).toBe('其旨總在');
        const plain = '甄士隱夢幻識通靈';
        expect(normalizeVariants(plain)).toBe(plain);
        expect(normalizeVariants('')).toBe('');
    });

    it('扩展区（代理对）的异体字也按码位替换', () => {
        const astral = Object.keys(VARIANT_CHARS).find((c) => c.codePointAt(0)! > 0xffff);
        expect(astral).toBeTruthy();
        expect(normalizeVariants(`甲${astral}乙`)).toBe(`甲${VARIANT_CHARS[astral!]}乙`);
    });

    it('表的形状：键值都是单个字，键不等于值，值本身不再是表里的异体字', () => {
        for (const [k, v] of Object.entries(VARIANT_CHARS)) {
            expect([...k]).toHaveLength(1);
            expect([...v]).toHaveLength(1);
            expect(k).not.toBe(v);
            expect(VARIANT_CHARS[v]).toBeUndefined();
        }
    });
});

describe('简体转换（getSimplifiedConverter）', () => {
    it('㫖、縂、寳 转成 旨、总、宝（用户 10-02 报的脂评凡例）', () => {
        expect(toSimplified('㫖')).toBe('旨');
        expect(toSimplified('縂')).toBe('总');
        expect(toSimplified('寳')).toBe('宝');
        expect(toSimplified('風月寳鑑')).toBe('风月宝鉴');
        expect(toSimplified('揔')).toBe('总');
    });

    it('高频异体字：徳髙逺隂㑹 → 德高远阴会', () => {
        expect(toSimplified('徳髙逺隂㑹')).toBe('德高远阴会');
    });

    it('有独立字义的 Big5 字不进表（抬、雰、妳、祐 交给 t2cn 照常处理）', () => {
        for (const c of '抬雰妳祐') expect(VARIANT_CHARS[c]).toBeUndefined();
    });
});

describe('残留检测（findTraditionalChars）', () => {
    it('没归一的异体字算残留；归一并转简体后不再命中', () => {
        expect(findTraditionalChars('其㫖縂在風月寳鑑').map((h) => h.char)).toEqual(expect.arrayContaining(['㫖', '縂', '寳']));
        expect(findTraditionalChars(toSimplified('其㫖縂在風月寳鑑'))).toEqual([]);
    });
});
