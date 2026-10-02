/**
 * 繁→简预设（overview#368）：opencc-js 的 tw 预设把「著録」「所著」「編著」里的「著」转成「着」，
 * 改用 t 预设。网站服务端（kaiyuanguji-web 的 lib/server/simplify.ts 等）须同口径。
 */
import { describe, it, expect } from 'vitest';
import { Converter } from 'opencc-js/t2cn';
import { getSimplifiedConverter } from '../../src/i18n/simplified-converter';

const toSimplified = getSimplifiedConverter();

describe('getSimplifiedConverter', () => {
    it('前提：tw 预设确实会把「著録」转成「着录」', () => {
        expect(Converter({ from: 'tw', to: 'cn' })('著録')).toBe('着录');
    });

    // [输入, 期望]
    const CASES: [string, string][] = [
        ['著録', '著录'],
        ['所著之數', '所著之数'],
        ['編著', '编著'],
        ['撰著', '撰著'],
        ['著錄', '著录'],
        ['著作', '著作'],
        ['著名', '著名'],
        ['顯著', '显著'],
        ['九家著録', '九家著录'],
        ['二百卷，著録書三千', '二百卷，著录书三千'],
        ['諸志所著之數有異', '诸志所著之数有异'],
        ['乾隆', '乾隆'],
        ['後漢書', '后汉书'],
        ['於是', '于是'],
        ['瞭解', '了解'],
        ['嚮往', '向往'],
        ['裡', '里'],
        ['麵', '面'],
        ['髮', '发'],
    ];
    for (const [input, expected] of CASES) {
        it(`${input} → ${expected}`, () => expect(toSimplified(input)).toBe(expected));
    }

    it('异体字表照常先归一再转简', () => {
        expect(toSimplified('風月寳鑑')).toBe('风月宝鉴');
        expect(toSimplified('其㫖縂在')).toBe('其旨总在');
    });

    it('保护表照常生效', () => {
        expect(toSimplified('曹霑著紅樓夢')).toBe('曹霑著红楼梦');
    });
});
