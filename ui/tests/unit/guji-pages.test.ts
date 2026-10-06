/**
 * guji-pages/0.1 适配（overview#389）：按 canvas.seq 对位书影，拆页的页号≠leaf 号。
 */
import { describe, expect, it } from 'vitest';
import { adaptGujiPages, adaptPunctJson, iiifVolumeOf } from '../../src/core/guji-pages';

const cell = (a: string, c: string, box: number[] | null = [10, 20, 30, 40]) => ({ id: 'g' + a, a, o: 0, c, box });
const page = (index: number, seq: string, cells: unknown[]) => ({
    page_id: `b/3/${index}`,
    page: { index },
    canvas: { id: `https://data.kaiyuanguji.com/iiif/b/canvas/03/${seq}`, seq, width: 2000, height: 3000 },
    cells,
});

describe('adaptGujiPages', () => {
    const raw = {
        schema: 'guji-pages/0.1',
        pages: [
            page(1, '0001', []),
            page(105, '0105a', [cell('105:1:1', '旋'), cell('105:1:2', '爲', null), cell('105:2:3a', '注'), cell('bad', 'x')]),
        ],
    };

    it('没有字的页不收；拆页按 canvas.seq 带出页序', () => {
        const pages = adaptGujiPages(raw);
        expect(pages).toHaveLength(1);
        expect(pages[0]).toMatchObject({ page: 105, seq: '0105a', width: 2000, height: 3000 });
    });

    it('字框 [x,y,w,h] 换成 [x0,y0,x1,y1]；夹注 a/b 记在 sub；坏锚点丢弃；无框为 null', () => {
        const [p] = adaptGujiPages(raw);
        expect(p.columns.map(c => c.col)).toEqual([1, 2]);
        expect(p.columns[0].chars[0]).toMatchObject({ id: '105:1:1', char: '旋', slot: 1, sub: null, bbox: [10, 20, 40, 60] });
        expect(p.columns[0].chars[1].bbox).toBeNull();
        expect(p.columns[1].chars[0]).toMatchObject({ id: '105:2:3a', slot: 3, sub: 'a' });
        expect(p.columns.flatMap(c => c.chars)).toHaveLength(3);
    });

    it('乱七八糟的输入不抛错', () => {
        expect(adaptGujiPages(null)).toEqual([]);
        expect(adaptGujiPages({ pages: [null, 3, { page: {} }] })).toEqual([]);
    });
});

describe('adaptPunctJson / iiifVolumeOf', () => {
    it('punct.json 取 punctuations；缺 anchor／mark 的丢弃', () => {
        const out = adaptPunctJson({ punctuations: [{ mark: '，', anchor: '3:1:2' }, { mark: '。' }, { anchor: '3:1:3' }] });
        expect(out).toEqual([expect.objectContaining({ mark: '，', anchor: '3:1:2' })]);
        expect(adaptPunctJson([{ mark: '。', anchor: '3:1:4', id: 'x' }])[0].id).toBe('x');
    });

    it('册号从 canvas id 取', () => {
        expect(iiifVolumeOf({ pages: [page(3, '0003', [])] })).toEqual({ bookId: 'b', vol: '03' });
        expect(iiifVolumeOf({ pages: [] })).toBeNull();
    });
});
