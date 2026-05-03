/**
 * buildLineageGraph 单测
 *
 * 这是版本传承图的核心算法，纯函数 — work + books → graph。
 * 用真实数据形状测，确保水浒传/红楼梦等版本图正确渲染。
 */
import { describe, it, expect } from 'vitest';
import { buildLineageGraph, validateLineageGraph } from '../../src/core/lineage-graph';
import type { WorkDetailData, BookDetailData } from '../../src/types';

function mkWork(vg: WorkDetailData['version_graph']): WorkDetailData {
    return {
        id: 'w1',
        type: 'work',
        title: '示例作品',
        version_graph: vg,
    } as WorkDetailData;
}

function mkBook(id: string, title: string, lineage?: BookDetailData['lineage']): BookDetailData {
    return {
        id,
        type: 'book',
        title,
        lineage,
    } as BookDetailData;
}

describe('buildLineageGraph 边界', () => {
    it('未启用 version_graph 时返回空图', () => {
        const r = buildLineageGraph(mkWork(undefined), []);
        expect(r.nodes).toHaveLength(0);
        expect(r.edges).toHaveLength(0);
    });

    it('enabled=false 时也返回空图', () => {
        const r = buildLineageGraph(mkWork({ enabled: false }), []);
        expect(r.nodes).toHaveLength(0);
    });

    it('保留 title/description/layout', () => {
        const r = buildLineageGraph(mkWork({
            enabled: true,
            title: '版本图',
            description: '说明',
            layout: 'TB',
        }), []);
        expect(r.title).toBe('版本图');
        expect(r.description).toBe('说明');
        expect(r.layout).toBe('TB');
    });
});

describe('buildLineageGraph 节点构造', () => {
    it('仅含 lineage 字段的 Book 才进图', () => {
        const r = buildLineageGraph(
            mkWork({ enabled: true }),
            [
                mkBook('b1', '有 lineage 本', { year: 1700, category: '繁本' }),
                mkBook('b2', '无 lineage 本'),
            ],
        );
        expect(r.nodes.map(n => n.id)).toEqual(['b1']);
    });

    it('hypothetical_nodes 进图', () => {
        const r = buildLineageGraph(mkWork({
            enabled: true,
            hypothetical_nodes: [{
                id: 'h1', label: '原本（已佚）', year: 1370, group: 'early',
            }],
        }), []);
        expect(r.nodes).toHaveLength(1);
        expect(r.nodes[0]).toMatchObject({
            id: 'h1',
            kind: 'hypothetical',
            label: '原本（已佚）',
            group: 'early',
        });
    });

    it('node_groups 把 book 归到对应 group', () => {
        const r = buildLineageGraph(
            mkWork({
                enabled: true,
                node_groups: { b1: 'fanben' },
                groups: [{ id: 'fanben', label: '繁本', color: '#aaa' }],
            }),
            [mkBook('b1', '繁本', { year: 1600 })],
        );
        expect(r.nodes[0].group).toBe('fanben');
    });
});

describe('buildLineageGraph 边构造', () => {
    it('Book.lineage.derived_from 生成 derive 边', () => {
        const r = buildLineageGraph(
            mkWork({ enabled: true }),
            [
                // 父本 b0 必须有 lineage 否则不进图，悬挂边会被丢弃
                mkBook('b0', '祖本', { year: 1500 }),
                mkBook('b1', '派生本', {
                    year: 1700,
                    derived_from: [{ ref: 'b0', relation: '过录', confidence: 'probable' }],
                }),
            ],
        );
        const edge = r.edges.find(e => e.kind === 'derive');
        expect(edge).toBeDefined();
        expect(edge!.source).toBe('b0');
        expect(edge!.target).toBe('b1');
        expect(edge!.relation).toBe('过录');
        expect(edge!.confidence).toBe('probable');
    });

    it('derived_from 引用不存在的节点时边被丢弃（防悬挂）', () => {
        const r = buildLineageGraph(
            mkWork({ enabled: true }),
            [mkBook('b1', '派生本', {
                year: 1700,
                derived_from: [{ ref: 'b_missing', relation: '过录' }],
            })],
        );
        // 端点 b_missing 不存在 → 边被合理丢弃
        expect(r.edges).toHaveLength(0);
        expect(r.nodes).toHaveLength(1);  // b1 自己仍然在
    });

    it('Book.lineage.related_to 生成 sibling 边（按 ID 字典序去重）', () => {
        const r = buildLineageGraph(
            mkWork({ enabled: true }),
            [
                mkBook('b1', 'A', {
                    year: 1700,
                    related_to: [{ book_id: 'b2', relation: '兄弟' }],
                }),
                mkBook('b2', 'B', {
                    year: 1700,
                    related_to: [{ book_id: 'b1', relation: '兄弟' }],
                }),
            ],
        );
        // 双向 related_to 应该只产生一条边（id 字典序合并）
        const siblingEdges = r.edges.filter(e => e.kind === 'sibling');
        expect(siblingEdges).toHaveLength(1);
        // source/target 按字典序
        expect(siblingEdges[0].source).toBe('b1');
        expect(siblingEdges[0].target).toBe('b2');
    });

    it('hypothetical_nodes 内的 derived_from 也产生边', () => {
        const r = buildLineageGraph(mkWork({
            enabled: true,
            hypothetical_nodes: [
                { id: 'h0', label: '祖本' },
                {
                    id: 'h1',
                    label: '次祖',
                    derived_from: [{ ref: 'h0', ref_type: 'hypothetical', relation: '过录' }],
                },
            ],
        }), []);
        const edge = r.edges.find(e => e.kind === 'derive');
        expect(edge).toBeDefined();
        expect(edge!.source).toBe('h0');
        expect(edge!.target).toBe('h1');
    });
});

describe('buildLineageGraph excluded_books', () => {
    it('excluded_books 中的 Book 不进图', () => {
        const r = buildLineageGraph(
            mkWork({
                enabled: true,
                excluded_books: ['b2'],
            }),
            [
                mkBook('b1', '保留', { year: 1600 }),
                mkBook('b2', '排除', { year: 1700 }),
            ],
        );
        expect(r.nodes.map(n => n.id)).toEqual(['b1']);
        expect(r.excluded).toEqual(['b2']);
    });
});

describe('validateLineageGraph', () => {
    it('找出 derived_from 引用了不存在的 Book ID', () => {
        const work = mkWork({ enabled: true });
        const books = [mkBook('b1', '派生本', {
            year: 1700,
            derived_from: [{ ref: 'b_missing', relation: '过录' }],
        })];
        const issues = validateLineageGraph(work, books);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some(i => i.includes('b_missing'))).toBe(true);
    });

    it('合法图返回空 issues', () => {
        const work = mkWork({
            enabled: true,
            hypothetical_nodes: [{ id: 'h0', label: '祖' }],
        });
        const books = [mkBook('b1', '派生本', {
            year: 1700,
            derived_from: [{ ref: 'h0', ref_type: 'hypothetical', relation: '过录' }],
        })];
        const issues = validateLineageGraph(work, books);
        expect(issues).toEqual([]);
    });
});
