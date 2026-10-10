/**
 * 稀见异体字补漏表（overview#514）：「𠮓」「𡚁」简体模式下要转，不能漏；表本身的形状要对。
 */
import { describe, it, expect } from 'vitest';
import { Converter } from 'opencc-js/t2cn';
import { VARIANT_CHARS, normalizeVariants } from '../../src/i18n/variant-chars';
import { VARIANT_SUPPLEMENT } from '../../src/i18n/variant-supplement';
import { getSimplifiedConverter } from '../../src/i18n/simplified-converter';

const t2cn = Converter({ from: 't', to: 'cn' });
const toSimplified = getSimplifiedConverter();

describe('VARIANT_SUPPLEMENT', () => {
    it('前提：裸 t2cn 不认「𠮓」「𡚁」，也不在生成的 variant-chars.json 里', () => {
        for (const c of ['𠮓', '𡚁']) {
            expect(t2cn(c)).toBe(c);
            expect(VARIANT_CHARS[c]).toBeUndefined();
        }
    });

    it('通行繁体归一：𠮓→變、𡚁→弊', () => {
        expect(normalizeVariants('𠮓')).toBe('變');
        expect(normalizeVariants('𡚁')).toBe('弊');
        expect(normalizeVariants('不𠮓之道，興𡚁除害')).toBe('不變之道，興弊除害');
    });

    it('抽样扫描补进的四条：曅→晔、㠘→屿、㹠→豚、擡→抬', () => {
        expect(normalizeVariants('曅㠘㹠擡')).toBe('曄嶼豚抬');
        expect(toSimplified('曅㠘㹠擡')).toBe('晔屿豚抬');
    });

    it('简体：𠮓→变、𡚁→弊（t2cn 之后不再漏）', () => {
        expect(toSimplified('𠮓')).toBe('变');
        expect(toSimplified('𡚁')).toBe('弊');
        expect(toSimplified('通𠮓而不拘，革𡚁而興利')).toBe('通变而不拘，革弊而兴利');
    });

    it('表的形状：键值都是单个字，键不等于值，键不重复 variant-chars.json，值不再是任何表里的异体字', () => {
        for (const [k, v] of Object.entries(VARIANT_SUPPLEMENT)) {
            expect([...k]).toHaveLength(1);
            expect([...v]).toHaveLength(1);
            expect(k).not.toBe(v);
            expect(VARIANT_CHARS[k], `${k} 已在生成表里，不用补`).toBeUndefined();
            expect(VARIANT_CHARS[v]).toBeUndefined();
            expect(VARIANT_SUPPLEMENT[v]).toBeUndefined();
            // 值是繁体写法，简体由 t2cn 去转；归一后再过 toSimplified 必须是稳定的单个字
            expect([...toSimplified(k)]).toHaveLength(1);
            expect(toSimplified(toSimplified(k))).toBe(toSimplified(k));
        }
    });

    it('已有的异体字归一不受影响', () => {
        expect(normalizeVariants('其㫖縂在')).toBe('其旨總在');
        expect(toSimplified('風月寳鑑')).toBe('风月宝鉴');
    });
});
