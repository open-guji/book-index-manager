import { describe, it, expect } from 'vitest';
import { deriveEra, deriveYear, deriveYearRange, deriveDating, sortYear, publicationYearText } from '../../src/core/detail-model';

/** S2-L：publication_info.year / lineage.year_text 并入 dating 后，推断结果须与迁移前一致 */
const cases: Array<[string, string, { year?: number; year_range?: [number, number]; text?: string }]> = [
    ['数字年', '1869', { year: 1869 }],
    ['区间', '1821-1850', { year_range: [1821, 1850] }],
    ['朝代文本', '清', { text: '清' }],
    ['年号文本', '清乾隆时期', { text: '清乾隆时期' }],
];
const base = { certainty: 'inferred' as const, source: 'catalog' as const, basis: '目錄著錄' };

describe('年代统一后推断不变', () => {
    for (const [name, pub, dt] of cases) {
        it(name, () => {
            const before = { title: '某書', edition: '某本', publication_info: { year: pub } };
            const after = { title: '某書', edition: '某本', dating: { ...base, ...dt } };
            expect(deriveEra(after)).toEqual(deriveEra(before));
            expect(deriveYear(after)).toEqual(deriveYear(before));
            expect(deriveYearRange(after)).toEqual(deriveYearRange(before));
            expect(sortYear(after)).toEqual(sortYear(before));
            const a = deriveDating(after), b = deriveDating(before);
            expect(a?.era).toEqual(b?.era);
            expect(a?.year).toEqual(b?.year);
            expect(a?.yearRange).toEqual(b?.yearRange);
            expect(publicationYearText(after)).toBe(pub);
        });
    }
    it('带朝代的 dating 不受影响', () => {
        const b = { title: 'x', dating: { era: '明', reign: '崇禎', year: 1642, ...base } };
        expect(deriveYear(b)).toBe(1642);
        expect(deriveEra(b).era).toBe('明');
    });
});
