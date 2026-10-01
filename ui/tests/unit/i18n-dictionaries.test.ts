/**
 * 字典自检（overview#337）：各区域字典繁简两栏同形、占位符一致，简体栏不含常见繁体字；
 * t() 的回落与插值；组件外 getT 可用于服务端 <title>。
 */
import { describe, expect, it } from 'vitest';
import { NAMESPACES } from '../../src/i18n/messages';
import { zhHant } from '../../src/i18n/locales/zh-Hant';
import { zhHans } from '../../src/i18n/locales/zh-Hans';
import { getT, makeT, getMessages } from '../../src/i18n/translate';
import { findTraditionalChars } from '../../src/i18n/traditional-check';

type Tree = { [k: string]: string | Tree };

function leaves(t: Tree, p = ''): Array<[string, string]> {
    return Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : leaves(v, `${p}${k}.`)));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const SETS: Array<[string, Tree, Tree]> = [
    ['core', zhHant as unknown as Tree, zhHans as unknown as Tree],
    ...Object.entries(NAMESPACES).map(([k, s]) => [k, s['zh-Hant'] as Tree, s['zh-Hans'] as Tree] as [string, Tree, Tree]),
];

describe.each(SETS)('字典 %s', (_name, hant, hans) => {
    const H = new Map(leaves(hant));
    const S = new Map(leaves(hans));

    it('繁简两栏键一一对应', () => {
        expect([...S.keys()].sort()).toEqual([...H.keys()].sort());
    });

    it('占位符一致', () => {
        const bad = [...H].filter(([k, v]) => placeholders(v) !== placeholders(S.get(k) ?? ''));
        expect(bad.map(([k]) => k)).toEqual([]);
    });

    it('简体栏没有常见繁体字', () => {
        const bad = [...S].filter(([, v]) => findTraditionalChars(v).length).map(([k, v]) => `${k}: ${v}`);
        expect(bad).toEqual([]);
    });
});

describe('t()', () => {
    it('按语言取值、插值', () => {
        expect(getT('zh-Hant')('common.toHans')).toBe('切换为简体');
        expect(getT('zh-Hans')('indexType.book')).toBe('书籍');
        expect(getT('zh-Hant')('indexType.book')).toBe('書籍');
        expect(getT('zh-Hans')('home.progressFormat' as never, { imported: 3, total: 5 } as never)).not.toContain('{');
    });

    it('缺键回落到繁体，再缺返回键名', () => {
        const partial = { ...getMessages('zh-Hans'), common: {} } as never;
        expect(makeT(partial)('common.toHant')).toBe('切換為繁體');
        expect(makeT(partial)('no.such' as never)).toBe('no.such');
    });
});
