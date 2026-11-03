import { describe, it, expect } from 'vitest';
import { derivedItems, relatedItems, relatedBookIds, buildLineageGraph } from '../../src/core/lineage-graph';
import { sameEditionRep } from '../../src/core/detail-model';

/** 版本关系 06 稿：新旧两种写法读出同一组边 */
describe('版本关系读取', () => {
    const oldBook = {
        lineage: {
            category: '刻本', status: 'extant' as const,
            derived_from: [{ ref: 'b1', ref_type: 'book' as const, relation: '翻刻', confidence: 'probable' as const, evidence: '序' }],
            related_to: [{ book_id: 'b2', relation: '同版', confidence: 'certain' as const }],
        },
    };
    const newBook = {
        lineage: { category: '刻本', status: 'extant' as const },
        base_edition: [
            { role: '底本', relation: '翻刻', book_id: 'b1', confidence: 'probable' as const, evidence: '序', source: 'x' },
            { role: '底本', name: '某本', book_id: 'b9', source: 'x' },           // 无 relation：不成边
        ],
        related_books: ['b7', { book_id: 'b2', relation: '同版', confidence: 'certain' as const }, { book_id: 'b8' }],
    };
    it('derivedItems：新旧读出同一条边，无 relation 的 base_edition 不成边', () => {
        expect(derivedItems(newBook).map(d => [d.ref, d.ref_type, d.relation, d.confidence, d.evidence]))
            .toEqual(derivedItems(oldBook as never).map(d => [d.ref, d.ref_type, d.relation, d.confidence, d.evidence]));
    });
    it('hypothetical_id 成假想边', () => {
        const d = derivedItems({ base_edition: [{ role: '底本', relation: '過錄', hypothetical_id: 'h_x', source: 's' }] });
        expect(d).toHaveLength(1);
        expect(d[0].ref_type).toBe('hypothetical');
    });
    it('relatedItems：只取带 relation 的对象项；relatedBookIds 取全部', () => {
        expect(relatedItems(newBook).map(r => [r.book_id, r.relation])).toEqual([['b2', '同版']]);
        expect(relatedBookIds(newBook)).toEqual(['b7', 'b2', 'b8']);
    });
    it('旧写法优先去重', () => {
        const both = { ...oldBook, base_edition: newBook.base_edition };
        expect(derivedItems(both as never)).toHaveLength(1);
    });
    it('sameEditionRep 认新写法', () => {
        expect(sameEditionRep({ id: 'b0', related_books: [{ book_id: 'b2', relation: '同版' }] } as never)).toBe('b2');
        expect(sameEditionRep({ id: 'b0', lineage: { related_to: [{ book_id: 'b3', relation: '同版' }] } } as never)).toBe('b3');
    });
    it('buildLineageGraph：新写法的边与节点年代（读 dating）', () => {
        const work = { version_graph: { enabled: true } } as never;
        const g = buildLineageGraph(work, [
            { id: 'b1', title: '甲', lineage: { status: 'extant', category: '刻本' }, dating: { year: 1600, text: '明萬曆間', year_uncertain: true } },
            { id: 'b0', title: '乙', base_edition: [{ role: '底本', relation: '翻刻', book_id: 'b1', source: 's' }] },
        ] as never);
        expect(g.edges.filter(e => e.kind === 'derive').map(e => [e.source, e.target, e.relation])).toEqual([['b1', 'b0', '翻刻']]);
        const n = g.nodes.find(x => x.id === 'b1')!;
        expect([n.year, n.year_text, n.year_uncertain]).toEqual([1600, '明萬曆間', true]);
    });
});
