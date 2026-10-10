/**
 * adaptEntityJson：新规格字段的读入（target.confidence／level／note、顶层 group、ambiguous.candidates），
 * 缺值与非法形状的宽容，以及旧类别输入（person／book）的读侧别名。
 */
import { describe, expect, it } from 'vitest';
import { adaptEntityJson } from '../../src/core/entity-annotations';

const base = {
    id: 'e1',
    type: 'people',
    text: '王弼',
    anchor: { start: '1:2:3', end: '1:2:4' },
    span: { start_offset: 12, end_offset: 14 },
};

describe('adaptEntityJson · 新字段读入', () => {
    it('有值时全部读入：target.confidence/level/note、顶层 group、ambiguous.candidates', () => {
        const [s] = adaptEntityJson({
            entities: [{
                ...base,
                group: 'g7',
                target: {
                    status: 'matched', entity_id: 'book-index://Entity/p1', canonical_name: '王弼',
                    confidence: 0.7, level: 'exact', note: '同名，按上下文定',
                },
                confidence: 0.9,
                ambiguous: { candidates: [{ entity_id: 'p2', canonical_name: '王弼甲', confidence: 0.4 }] },
            }],
        });
        expect(s).toMatchObject({
            key: 'e1', kind: 'people', targetId: 'p1', confidence: 0.9,
            targetConfidence: 0.7, targetLevel: 'exact', targetNote: '同名，按上下文定',
            group: 'g7',
            candidates: [{ entity_id: 'p2', canonical_name: '王弼甲', confidence: 0.4 }],
        });
    });

    it('顶层 confidence 缺失时回退用 target.confidence；顶层有值则保持顶层', () => {
        const [fallback] = adaptEntityJson({ entities: [{ ...base, target: { confidence: 0.6 } }] });
        expect(fallback.confidence).toBe(0.6);
        expect(fallback.targetConfidence).toBe(0.6);
        const [own] = adaptEntityJson({ entities: [{ ...base, confidence: 0.9, target: { confidence: 0.6 } }] });
        expect(own.confidence).toBe(0.9);
        expect(own.targetConfidence).toBe(0.6);
    });

    it('没有这些字段时新字段为 undefined，老条目行为不变', () => {
        const [s] = adaptEntityJson({ entities: [{ ...base, confidence: 0.5, target: { status: 'new_candidate' } }] });
        expect(s.confidence).toBe(0.5);
        expect(s.targetConfidence).toBeUndefined();
        expect(s.targetLevel).toBeUndefined();
        expect(s.targetNote).toBeUndefined();
        expect(s.group).toBeUndefined();
        expect(s.candidates).toBeUndefined();
    });

    it('非法形状一律忽略、不抛错，条目照收', () => {
        const raw = {
            entities: [{
                ...base,
                group: 5,
                target: { confidence: 'high', level: 3, note: null },
                confidence: 'x',
                ambiguous: 'x',
            }, {
                ...base,
                id: 'e2',
                ambiguous: { candidates: 'x' },
            }],
        };
        let out: ReturnType<typeof adaptEntityJson> = [];
        expect(() => { out = adaptEntityJson(raw); }).not.toThrow();
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ key: 'e1' });
        expect(out[0].confidence).toBeUndefined();
        expect(out[0].targetConfidence).toBeUndefined();
        expect(out[0].targetLevel).toBeUndefined();
        expect(out[0].targetNote).toBeUndefined();
        expect(out[0].group).toBeUndefined();
        expect(out[0].candidates).toBeUndefined();
        expect(out[1].candidates).toBeUndefined();
    });

    it('candidates 只收对象项，项内非法字段丢掉、不丢整项', () => {
        const [s] = adaptEntityJson({
            entities: [{
                ...base,
                ambiguous: {
                    candidates: [
                        null, 1, 'a', [],
                        { entity_id: 5, canonical_name: '甲', confidence: 'x' },
                        { entity_id: 'p3' },
                    ],
                },
            }],
        });
        expect(s.candidates).toEqual([{ canonical_name: '甲' }, { entity_id: 'p3' }]);
    });

    it('target 非对象（数字、数组）时不影响条目，新字段为 undefined', () => {
        const [a] = adaptEntityJson({ entities: [{ ...base, target: 3 }] });
        const [b] = adaptEntityJson({ entities: [{ ...base, id: 'e2', target: [{ confidence: 0.5 }] }] });
        for (const s of [a, b]) {
            expect(s.targetConfidence).toBeUndefined();
            expect(s.confidence).toBeUndefined();
        }
    });
});

describe('adaptEntityJson · 类别输入', () => {
    const kindOf = (type: unknown) => adaptEntityJson([{ ...base, type }])[0].kind;

    it('新名字原样读入：people、work、place、office、dynasty、reign、other', () => {
        for (const t of ['people', 'work', 'place', 'office', 'dynasty', 'reign', 'other']) {
            expect(kindOf(t)).toBe(t);
        }
    });

    it('旧输入仍能读：person→people，book→work', () => {
        expect(kindOf('person')).toBe('people');
        expect(kindOf('book')).toBe('work');
    });

    it('未知类别、原型属性名都归为 other', () => {
        expect(kindOf('???')).toBe('other');
        expect(kindOf('constructor')).toBe('other');
        expect(kindOf('__proto__')).toBe('other');
        expect(kindOf(42)).toBe('other');
    });
});
