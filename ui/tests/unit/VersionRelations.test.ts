import { describe, it, expect } from 'vitest';
import { derivedItems, relatedItems, relatedBookIds, buildLineageGraph } from '../../src/core/lineage-graph';
import { sameEditionRep } from '../../src/core/detail-model';

/** 版本关系 06 稿：从 base_edition／related_books 读出边（旧 lineage.derived_from／related_to 已于数据和 schema 中删除） */
describe('版本关系读取', () => {
    const newBook = {
        lineage: { status: 'extant' as const },
        base_edition: [
            { role: '底本', relation: '翻刻', book_id: 'b1', confidence: 'probable' as const, evidence: '序', source: 'x' },
            { role: '底本', name: '某本', book_id: 'b9', source: 'x' },           // 无 relation：不成边
        ],
        related_books: [{ book_id: 'b7' }, { book_id: 'b2', relation: '同版', confidence: 'certain' as const }, { book_id: 'b8' }],
    };
    it('derivedItems：带 relation 的 base_edition 成边，无 relation 的不成边', () => {
        expect(derivedItems(newBook).map(d => [d.ref, d.ref_type, d.relation, d.confidence, d.evidence]))
            .toEqual([['b1', 'book', '翻刻', 'probable', '序']]);
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
    it('sameEditionRep 认新写法', () => {
        expect(sameEditionRep({ id: 'b0', related_books: [{ book_id: 'b2', relation: '同版' }] } as never)).toBe('b2');
    });
    it('buildLineageGraph：新写法的边与节点年代（读 dating）', () => {
        const work = { version_graph: { enabled: true } } as never;
        const g = buildLineageGraph(work, [
            { id: 'b1', title: '甲', lineage: { status: 'extant' }, dating: { year: 1600, text: '明萬曆間', year_uncertain: true } },
            { id: 'b0', title: '乙', base_edition: [{ role: '底本', relation: '翻刻', book_id: 'b1', source: 's' }] },
        ] as never);
        expect(g.edges.filter(e => e.kind === 'derive').map(e => [e.source, e.target, e.relation])).toEqual([['b1', 'b0', '翻刻']]);
        const n = g.nodes.find(x => x.id === 'b1')!;
        expect([n.year, n.year_text, n.year_uncertain]).toEqual([1600, '明萬曆間', true]);
    });
});
