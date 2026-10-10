/**
 * overview#525：norm 读（规范层）。
 * 适配：adaptNorm／adaptCharCord 第三参数；显示：通行繁體／簡體档逐位用 norm，原字档忽略。
 * 缺省（不传、空表、该位没条目）＝与改前逐字段一致。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord, adaptNorm, adaptNormDetailed } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

const norm = (items: unknown[]) => ({ schema: 'guji-norm/0.2', book_id: 'x', volume: 3, table: null, items });
const cell = (a: string, c: string) => ({ a, c });
const char = { pages: [{ page: 3, columns: [{ col: 1, cells: [cell('3:1:1', '內'), cell('3:1:2', '外'), cell('3:1:3a', '羣'), cell('3:1:3b', '爲')] }] }] };

describe('adaptNorm', () => {
    it('空表、缺 items、不是对象：得到空 map，不抛错', () => {
        expect(adaptNorm(norm([])).size).toBe(0);
        expect(adaptNorm({ schema: 'guji-norm/0.2' }).size).toBe(0);
        for (const bad of [null, undefined, 0, 'x', [], true]) expect(adaptNorm(bad).size).toBe(0);
    });

    it('一条异体：格位 key → 通行字；why 缺省也收', () => {
        const m = adaptNorm(norm([{ a: '3:1:1', t: '内', by: 'variants@1', why: '异体' }, { a: '3:1:3a', t: '群' }]));
        expect([...m.entries()]).toEqual([['3:1:1', '内'], ['3:1:3a', '群']]);
    });

    it('非法项丢弃并按原因计数：坏 key、通行字不是恰好一个字（空／多字／非字符串）、why 不是「异体」、条目不是对象', () => {
        const r = adaptNormDetailed(norm([
            { a: '3:1:1', t: '内', why: '异体' },       // 好
            { a: 'bogus', t: '内' },                    // 坏 key
            { t: '内' },                                // 没 key
            { a: '3:1:2', t: '' },                      // 空
            { a: '3:1:2', t: '内外' },                  // 多字
            { a: '3:1:2', t: 5 },                       // 非字符串
            { a: '3:1:2', t: '内', why: '校勘' },       // 校勘改字不进规范层
            null, 'x',                                  // 不是对象
        ]));
        expect([...r.map.keys()]).toEqual(['3:1:1']);
        expect(r.dropped).toEqual({ badAnchor: 2, badChar: 3, badWhy: 1, notObject: 2 });
    });

    it('通行字按码点数：Ext-B 字（两个 UTF-16 单元）算一个字', () => {
        expect(adaptNorm(norm([{ a: '3:1:1', t: '𠀀' }])).get('3:1:1')).toBe('𠀀');
        expect(adaptNorm(norm([{ a: '3:1:1', t: '𠀀𠀁' }])).size).toBe(0);
    });
});

describe('adaptCharCord 第三参数', () => {
    const plain = adaptCharCord(char);

    it('不传／传 null／空表：输出与改前逐字段一致（不带 norm 键）', () => {
        expect(adaptCharCord(char, undefined, undefined)).toEqual(plain);
        expect(adaptCharCord(char, undefined, null)).toEqual(plain);
        expect(adaptCharCord(char, undefined, norm([]))).toEqual(plain);
        for (const c of plain[0].columns[0].chars) expect('norm' in c).toBe(false);
    });

    it('有条目的格多 norm 键，别的格不带；夹注的子列格（3a）也按 key 对上', () => {
        const ch = adaptCharCord(char, undefined, norm([{ a: '3:1:1', t: '内' }, { a: '3:1:3a', t: '群' }]))[0].columns[0].chars;
        expect(ch.map(c => c.norm)).toEqual(['内', undefined, '群', undefined]);
        expect(ch.map(c => 'norm' in c)).toEqual([true, false, true, false]);
        // 其余字段与不带 norm 时完全相同
        const base = plain[0].columns[0].chars;
        ch.forEach((c, i) => { const { norm: _n, ...rest } = c; expect(rest).toEqual(base[i]); });
    });

    it('条目的通行字与原字相同：没有信息量，不带键', () => {
        const ch = adaptCharCord(char, undefined, norm([{ a: '3:1:1', t: '內' }]))[0].columns[0].chars;
        expect('norm' in ch[0]).toBe(false);
    });

    it('norm 里有、char 里没有的格位：忽略，不凭空造字', () => {
        const pages = adaptCharCord(char, undefined, norm([{ a: '3:9:9', t: '内' }]));
        expect(pages).toEqual(plain);
    });
});

describe('阅读器取字：原字档忽略 norm，转换档逐位用 norm', () => {
    const pages = adaptCharCord(char, undefined, norm([{ a: '3:1:1', t: '内' }, { a: '3:1:3a', t: '群' }]));
    const text = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-char-id]')).map(e => e.textContent).join('');
    const mount = (convert?: (s: string) => string) => render(
        <LocaleProvider locale="zh-Hant">
            <GujiTextViewer pageData={{ page_id: 'vol:3', columns: [], pages } as any} pages={pages as any} selectedCharIds={new Set()} convert={convert} />
        </LocaleProvider>,
    );

    it('不传 convert（原字档）：显示原字，norm 被忽略', () => {
        expect(text(mount().container)).toBe('內外羣爲');
    });

    it('传 convert（通行繁體：这里用恒等函数）：有 norm 的位用通行字，别的位原样', () => {
        expect(text(mount(s => s).container)).toBe('内外群爲');
    });

    it('传 convert（簡體）：norm 先替换，再整段转换；没有 norm 的位照旧走 convert', () => {
        // 假「简体」：外→wai 的占位不好看，用单字映射：内→內 会暴露顺序；这里用 外→外2 不行（码点数要不变），改用 爲→为、群→羣（故意反向）
        const fake = (s: string) => s.replace(/爲/g, '为').replace(/群/g, '羣');
        // 群(norm)→羣(convert) 证明「先 norm、后 convert」；爲 没 norm，照旧被 convert 改成 为
        expect(text(mount(fake).container)).toBe('内外羣为');
    });

    it('id 与选区不受影响：data-char-id 仍是格位 key', () => {
        const ids = Array.from(mount(s => s).container.querySelectorAll('[data-char-id]')).map(e => e.getAttribute('data-char-id'));
        expect(ids).toEqual(['3:1:1', '3:1:2', '3:1:3a', '3:1:3b']);
    });
});
