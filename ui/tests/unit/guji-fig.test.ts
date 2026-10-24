/**
 * 图片格与插图块的适配（char v0.3 `fig`／`kind: figure`，cord v0.2 `marks.figure`，fig v0.1；GUJI-741）。
 * 样例用设计里的 148:2:14（册 005「圖作▢形」）。
 */
import { describe, expect, it } from 'vitest';
import { adaptCharCord, adaptFig } from '../../src/core/guji-char-cord';

const col = (cells: { a: string; c: string; [k: string]: unknown }[], extra: Record<string, unknown> = {}) => ({ col: 2, cells, ...extra });
const char = {
    pages: [{
        page: 148,
        columns: [
            col([{ a: '148:2:12', c: '圖' }, { a: '148:2:13', c: '作' }, { a: '148:2:14', c: '□', fig: 'f148-2-14' }, { a: '148:2:15', c: '形' }]),
        ],
    }, {
        page: 149,
        columns: [
            { col: 1, cells: [{ a: '149:1:1', c: '河' }] },
            { col: 2, kind: 'figure', span: 4, fig: 'p149-fig1', cells: [] },
            { col: 6, cells: [{ a: '149:6:1', c: '圖' }] },
        ],
    }],
};

describe('adaptCharCord · 图片格与图列（char v0.3）', () => {
    it('图片格：fig 带到字上，c 仍是 □', () => {
        const pages = adaptCharCord(char);
        const c = pages[0].columns[0].chars[2];
        expect(c).toMatchObject({ id: '148:2:14', char: '□', fig: 'f148-2-14' });
        expect(c.lacuna).toBeUndefined();
        // 普通格不带 fig 键
        expect('fig' in pages[0].columns[0].chars[1]).toBe(false);
    });

    it('fig 与 lacuna／guess／guess_c／zi 同在，或 c 不是 □：格式不对，当普通格', () => {
        const bad = { pages: [{ page: 1, columns: [col([
            { a: '1:2:1', c: '□', lacuna: true, fig: 'x1' },
            { a: '1:2:2', c: '□', zi: '甲', fig: 'x2' },
            { a: '1:2:3', c: '字', fig: 'x3' },
            { a: '1:2:4', c: '□', fig: 'Bad_Id' },
            { a: '1:2:5', c: '□', fig: 'ok-1' },
        ])] }] };
        const chars = adaptCharCord(bad)[0].columns[0].chars;
        expect(chars.map(c => c.fig)).toEqual([undefined, undefined, undefined, undefined, 'ok-1']);
    });

    it('图列：无字的列，带 kind／fig／span，按列号排在前后列之间；span 1 不带', () => {
        const pages = adaptCharCord(char);
        const cols = pages[1].columns;
        expect(cols.map(c => c.col)).toEqual([1, 2, 6]);
        expect(cols[1]).toEqual({ col: 2, chars: [], kind: 'figure', fig: 'p149-fig1', span: 4 });
        const one = adaptCharCord({ pages: [{ page: 1, columns: [{ col: 3, kind: 'figure', fig: 'a-1', cells: [] }] }] });
        expect(one[0].columns[0]).toEqual({ col: 3, chars: [], kind: 'figure', fig: 'a-1' });
    });

    it('整页插图页（只有图列）也收进页列表；缺 fig 或 id 不合法的图列丢弃', () => {
        const only = { pages: [{ page: 7, columns: [{ col: 1, kind: 'figure', span: 8, fig: 'p7-fig1', cells: [] }] }, { page: 8, columns: [{ col: 1, kind: 'figure', cells: [] }] }] };
        const pages = adaptCharCord(only);
        expect(pages.map(p => p.page)).toEqual([7]);
        expect(pages[0].columns).toEqual([{ col: 1, chars: [], kind: 'figure', fig: 'p7-fig1', span: 8 }]);
    });

    it('cord marks.figure 对得上图 id：图列带 figBox（左上右下）', () => {
        const cord = { pages: [{ page: 149, canvas: { id: 'https://x/canvas/05/0149', seq: '0149', width: 100, height: 200 }, cells: [], marks: [
            { kind: 'figure', id: 'm1', fig: 'p149-fig1', col: 2, span: 4, box: [10, 20, 30, 40] },
            { kind: 'blank', id: 'm2', col: 1, slot: 1, box: [1, 2, 3, 4] },
        ] }] };
        const fig = adaptCharCord(char, cord)[1].columns[1];
        expect(fig.figBox).toEqual([10, 20, 40, 60]);
    });

    it('没有图的章：输出里没有 fig／span 键（与改前逐字段一致）', () => {
        const plain = { pages: [{ page: 3, columns: [{ col: 1, cells: [{ a: '3:1:1', c: '欽' }] }] }] };
        expect(JSON.stringify(adaptCharCord(plain))).not.toMatch(/fig|span/);
    });
});

describe('adaptFig（fig.json，spec/09）', () => {
    const one = { id: 'f148-2-14', kind: 'inline', page: 148, box: [1, 2, 3, 4], alt: '左半圈连一实点', file: 'fig/005/f148-2-14.png', sha256: 'a'.repeat(64), mime: 'image/png', width: 120, height: 48, source: 'crop', by: 'cv:export' };

    it('合法项：id → 说明与文件', () => {
        const m = adaptFig({ figures: [one] });
        expect(m.get('f148-2-14')).toEqual({ id: 'f148-2-14', kind: 'inline', alt: '左半圈连一实点', file: 'fig/005/f148-2-14.png', mime: 'image/png', width: 120, height: 48 });
    });

    it('格式不对的项丢弃：路径逃逸、非 fig/ 下、未知 mime、id 不合法、kind 不对', () => {
        const m = adaptFig({ figures: [
            { ...one, id: 'a1', file: 'fig/../x.png' },
            { ...one, id: 'a2', file: '/etc/passwd' },
            { ...one, id: 'a3', file: 'https://evil/x.png' },
            { ...one, id: 'a4', mime: 'text/html' },
            { ...one, id: 'A_5' },
            { ...one, id: 'a6', kind: 'other' },
            null, 'x',
            { ...one, id: 'ok', alt: '  ' },
        ] });
        expect(Array.from(m.keys())).toEqual(['ok']);
        expect(m.get('ok')!.alt).toBe('图形符号'); // alt 缺失退回
    });

    it('整份不是对象、没有 figures：空表，不抛错', () => {
        expect(adaptFig(null).size).toBe(0);
        expect(adaptFig('x').size).toBe(0);
        expect(adaptFig({}).size).toBe(0);
    });
});
