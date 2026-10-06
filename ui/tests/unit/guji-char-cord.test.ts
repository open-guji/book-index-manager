/**
 * char／cord 适配（overview#425）：用 guji-format 规范样例的形状。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { adaptPunctJson, iiifVolumeOf } from '../../src/core/guji-pages';
import { adaptEntityJson } from '../../src/core/entity-annotations';

const char = {
    version: '1.0.0', book_id: '96mid1ogzk', volume: 3,
    pages: [{
        page: 3, label: '一',
        columns: [
            { col: 4, raised: 1, cells: [
                { a: '3:4:-1', c: '讀' }, { a: '3:4:1', c: '易' },
                { a: '3:4:2a', c: '兩' }, { a: '3:4:3a', c: '江' }, { a: '3:4:2b', c: '採' }, { a: '3:4:3b', c: '進' },
                { a: '3:4:4', c: '□', lacuna: true },
            ] },
            { col: 1, cells: [{ a: '3:1:1', c: '欽' }, { a: '3:1:2', c: '定' }, { a: 'bad', c: 'x' }] },
        ],
    }, { page: 4, columns: [] }],
};
const cord = {
    pages: [{
        page: 3,
        canvas: { id: 'https://data.kaiyuanguji.com/iiif/96mid1ogzk/canvas/03/0003', seq: '0003', width: 2361, height: 3096 },
        cells: [{ a: '3:1:1', box: [1851, 341, 177, 134] }, { a: '3:4:2a', box: [10, 20, 30, 40] }],
    }],
};

describe('adaptCharCord', () => {
    const [p, ...rest] = adaptCharCord(char, cord);

    it('没有字的页不收；页序与尺寸取自 cord 的 canvas', () => {
        expect(rest).toHaveLength(0);
        expect(p).toMatchObject({ page: 3, seq: '0003', width: 2361, height: 3096 });
    });

    it('列按列号排（小的在右），列内保持 char 数组顺序（夹注 2a 3a 2b 3b 不重排）；坏锚点丢弃', () => {
        expect(p.columns.map(c => c.col)).toEqual([1, 4]);
        expect(p.columns[0].chars.map(c => c.id)).toEqual(['3:1:1', '3:1:2']);
        expect(p.columns[1].chars.map(c => c.id)).toEqual(['3:4:-1', '3:4:1', '3:4:2a', '3:4:3a', '3:4:2b', '3:4:3b', '3:4:4']);
    });

    it('按格位 key 对框：[x,y,w,h] → [x0,y0,x1,y1]；cord 没有的格为 null；负格、夹注子列', () => {
        expect(p.columns[0].chars[0]).toMatchObject({ char: '欽', slot: 1, sub: null, bbox: [1851, 341, 2028, 475] });
        expect(p.columns[0].chars[1].bbox).toBeNull();
        const c4 = p.columns[1].chars;
        expect(c4[0]).toMatchObject({ slot: -1, sub: null, bbox: null });
        expect(c4[2]).toMatchObject({ slot: 2, sub: 'a', bbox: [10, 20, 40, 60] });
        expect(c4[4]).toMatchObject({ slot: 2, sub: 'b' });
    });

    it('没有 cord：只有字，尺寸 0、seq 空', () => {
        const [q] = adaptCharCord(char);
        expect(q).toMatchObject({ page: 3, seq: '', width: 0, height: 0 });
        expect(q.columns[0].chars[0].bbox).toBeNull();
    });

    it('乱七八糟的输入不抛错', () => {
        expect(adaptCharCord(null)).toEqual([]);
        expect(adaptCharCord({ pages: [null, 3, { page: 'x' }] }, 'zzz')).toEqual([]);
    });

    it('册号取自 cord 的 canvas id', () => {
        expect(iiifVolumeOf(cord)).toEqual({ bookId: '96mid1ogzk', vol: '03' });
    });
});

const SAMPLES = 'D:/workspace/guji-format/examples/spec-samples';
describe.skipIf(!existsSync(SAMPLES))('规范样例', () => {
    const read = (n: string) => JSON.parse(readFileSync(`${SAMPLES}/${n}`, 'utf-8'));

    it('sample.char＋cord 可对上；punct、entity 按格位锚点读入', () => {
        const pages = adaptCharCord(read('sample.char.json'), read('sample.cord.json'));
        expect(pages.length).toBeGreaterThan(0);
        expect(pages[0].columns.flatMap(c => c.chars).some(c => c.bbox)).toBe(true);
        expect(adaptPunctJson(read('sample.punct.json')).length).toBeGreaterThan(0);
        const ents = adaptEntityJson(read('sample.entity.json'));
        expect(ents.length).toBeGreaterThan(0);
        expect(ents.every(e => e.anchor?.start && e.anchor?.end)).toBe(true);
        expect(ents.some(e => e.kind === 'person')).toBe(true);
    });
});
