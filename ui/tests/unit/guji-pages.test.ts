/**
 * punct.json 适配与 cord 的 IIIF 册号（overview#389）。
 * 旧 pages.json 适配器 adaptGujiPages 已删（2026-10-10）：char／cord 取代之，见 guji-char-cord.test。
 */
import { describe, expect, it } from 'vitest';
import { adaptPunctJson, iiifVolumeOf } from '../../src/core/guji-pages';

const page = (index: number, seq: string, cells: unknown[]) => ({
    page_id: `b/3/${index}`,
    page: { index },
    canvas: { id: `https://data.kaiyuanguji.com/iiif/b/canvas/03/${seq}`, seq, width: 2000, height: 3000 },
    cells,
});

describe('adaptPunctJson / iiifVolumeOf', () => {
    it('punct.json 取 punctuations；缺 anchor／mark 的丢弃', () => {
        const out = adaptPunctJson({ punctuations: [{ mark: '，', anchor: '3:1:2' }, { mark: '。' }, { anchor: '3:1:3' }] });
        expect(out).toEqual([expect.objectContaining({ mark: '，', anchor: '3:1:2' })]);
        expect(adaptPunctJson([{ mark: '。', anchor: '3:1:4', id: 'x' }])[0].id).toBe('x');
    });

    it('pre_char：恰好一个码点（含代理对）保留；多字符、空串、非字符串的整条丢弃；缺省或 null 不丢', () => {
        const out = adaptPunctJson([
            { anchor: '3:1:1', mark: '。', pre_char: '王' },
            { anchor: '3:1:2', mark: '。', pre_char: '\u{20000}' }, // CJK 扩展 B：2 个 UTF-16 码元，1 个码点
            { anchor: '3:1:3', mark: '。', pre_char: '王弼' },
            { anchor: '3:1:4', mark: '。', pre_char: '' },
            { anchor: '3:1:5', mark: '。', pre_char: 7 },
            { anchor: '3:1:6', mark: '。' },
            { anchor: '3:1:7', mark: '。', pre_char: null },
        ]);
        expect(out.map(p => p.anchor)).toEqual(['3:1:1', '3:1:2', '3:1:6', '3:1:7']);
        expect(out[0].pre_char).toBe('王');
        expect(out[1].pre_char).toBe('\u{20000}');
        expect(out[2].pre_char).toBeUndefined();
        expect(out[3].pre_char).toBeUndefined();
    });

    it('册号从 canvas id 取', () => {
        expect(iiifVolumeOf({ pages: [page(3, '0003', [])] })).toEqual({ bookId: 'b', vol: '03' });
        expect(iiifVolumeOf({ pages: [] })).toBeNull();
    });
});

describe('旧 pages.json 适配器已退出公开 API', () => {
    it('adaptGujiPages 不再导出（char／cord 用 adaptCharCord）', async () => {
        const api = await import('../../src/index');
        expect('adaptGujiPages' in api).toBe(false);
        expect(typeof api.adaptCharCord).toBe('function');
        expect(typeof api.adaptPunctJson).toBe('function');
        expect(typeof api.iiifVolumeOf).toBe('function');
    });
});
