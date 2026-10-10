/**
 * overview#517 W-E：原件 char sidecar 的字级／列级／页级旁注字段（guji-format spec/02 §4.2–4.4）。
 * 字：lane(solo)／lacuna／guess／zi；列：raised／lead_blank／kind(blank)；页：label。
 * 缺字段 = 旧行为（适配器输出不带新键、阅读器不带新类名）。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

const cell = (a: string, c: string, extra: Record<string, unknown> = {}) => ({ a, c, ...extra });

const charDoc = (cells: Record<string, unknown>[], col: Record<string, unknown> = {}, page: Record<string, unknown> = {}) => ({
    pages: [{ page: 3, ...page, columns: [{ col: 1, ...col, cells }] }],
});

describe('适配器 adaptCharCord：新字段', () => {
    it('lane: solo／lacuna／guess／zi 带到字上；lane: main 与非法值不带', () => {
        const p = adaptCharCord(charDoc([
            cell('3:1:1', '甲', { lane: 'solo' }),
            cell('3:1:2', '□', { lacuna: true }),
            cell('3:1:3', '春', { guess: true }),
            cell('3:1:4', '木', { zi: '⿰木孚' }),
            cell('3:1:5', '乙', { lane: 'main' }),
            cell('3:1:6', '丙', { lane: 'bogus', lacuna: false, guess: 'yes', zi: '' }),
        ]));
        const ch = p[0].columns[0].chars;
        expect(ch[0].lane).toBe('solo');
        expect(ch[1].lacuna).toBe(true);
        expect(ch[2].guess).toBe(true);
        expect(ch[3].zi).toBe('⿰木孚');
        for (const c of [ch[4], ch[5]]) {
            expect('lane' in c).toBe(false);
            expect('lacuna' in c).toBe(false);
            expect('guess' in c).toBe(false);
            expect('zi' in c).toBe(false);
        }
    });

    it('列 raised／lead_blank／kind；页 label', () => {
        const p = adaptCharCord(charDoc([cell('3:1:1', '甲')], { raised: 2, lead_blank: 3, kind: 'banxin' }, { label: '一' }));
        expect(p[0].label).toBe('一');
        expect(p[0].columns[0]).toMatchObject({ col: 1, raised: 2, lead_blank: 3, kind: 'banxin' });
    });

    it('kind: blank 的空列保留（不丢列），无字的空列不带 kind 仍丢弃', () => {
        const doc = { pages: [{ page: 3, columns: [
            { col: 1, cells: [cell('3:1:1', '甲')] },
            { col: 2, kind: 'blank', cells: [] },
            { col: 3, cells: [] },
        ] }] };
        const cols = adaptCharCord(doc)[0].columns;
        expect(cols.map(c => c.col)).toEqual([1, 2]);
        expect(cols[1]).toMatchObject({ kind: 'blank', chars: [] });
    });

    it('只有 blank 列、没有字的页：仍按无字页处理（不进正文），label 与 blank 空列随页保留', () => {
        const doc = { pages: [{ page: 4, label: '二', columns: [{ col: 1, kind: 'blank', cells: [] }] }] };
        const cord = { pages: [{ page: 4, canvas: { seq: '0004', width: 10, height: 20 }, cells: [] }] };
        const p = adaptCharCord(doc, cord);
        expect(p).toHaveLength(1);
        expect(p[0]).toMatchObject({ page: 4, label: '二', columns: [{ col: 1, kind: 'blank', chars: [] }] });
        const { container } = mount(p);
        expect(container.querySelector('p')).toBeNull(); // 不进正文
    });

    it('缺字段 = 旧行为：输出不带任何新键', () => {
        const p = adaptCharCord(charDoc([cell('3:1:1', '甲'), cell('3:1:2a', '乙')]));
        expect(p[0]).toEqual({ page: 3, seq: '', width: 0, height: 0, columns: [{ col: 1, chars: [
            { id: '3:1:1', char: '甲', slot: 1, pos: 1, sub: null, bbox: null },
            { id: '3:1:2a', char: '乙', slot: 2, pos: 2, sub: 'a', bbox: null },
        ] }] });
    });

    it('raised／lead_blank 为 0、负数、非整数时当缺省', () => {
        const c = adaptCharCord(charDoc([cell('3:1:1', '甲')], { raised: 0, lead_blank: -1 }))[0].columns[0];
        expect('raised' in c).toBe(false);
        expect('lead_blank' in c).toBe(false);
        const d = adaptCharCord(charDoc([cell('3:1:1', '甲')], { raised: 1.5 }))[0].columns[0];
        expect('raised' in d).toBe(false);
    });
});

function mount(pages: ReturnType<typeof adaptCharCord>) {
    const pageData: any = { page_id: 'vol:3', columns: [], pages };
    return render(
        <LocaleProvider locale="zh-Hant">
            <GujiTextViewer pageData={pageData} pages={pages as any} selectedCharIds={new Set()} />
        </LocaleProvider>,
    );
}

const el = (c: HTMLElement, id: string) => c.querySelector(`[data-char-id="${id}"]`) as HTMLElement;

describe('阅读器显示：新字段', () => {
    it('lane: solo 按单行小注排：is-solo，不是 is-sub', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '正'), cell('3:1:2', '注', { lane: 'solo' }), cell('3:1:3a', '右'), cell('3:1:3b', '左')])));
        expect(el(container, '3:1:1').className).not.toMatch(/is-solo|is-sub/);
        expect(el(container, '3:1:2').classList.contains('is-solo')).toBe(true);
        expect(el(container, '3:1:2').classList.contains('is-sub')).toBe(false);
        expect(el(container, '3:1:3a').classList.contains('is-sub')).toBe(true);
        expect(el(container, '3:1:3a').classList.contains('is-solo')).toBe(false);
    });

    it('lacuna：缺字框 □，带「闕文」提示；不是正文字', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '□', { lacuna: true }), cell('3:1:2', '□')])));
        const a = el(container, '3:1:1'), b = el(container, '3:1:2');
        expect(a.classList.contains('is-lacuna')).toBe(true);
        expect(a.textContent).toBe('□');
        expect(a.getAttribute('title')).toBe('闕文');
        expect(b.className).not.toMatch(/is-lacuna/); // 刻本上本来就刻着的方框
    });

    it('guess：残字，灰字加标记，带提示', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '春', { guess: true })])));
        const a = el(container, '3:1:1');
        expect(a.classList.contains('is-guess')).toBe(true);
        expect(a.textContent).toBe('春');
        expect(a.getAttribute('title')).toBe('殘字（推測）');
    });

    it('zi：与 :zi[…] 同源——细框，提示里是原形', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '木', { zi: '⿰木孚' })])));
        const a = el(container, '3:1:1');
        expect(a.classList.contains('is-zi')).toBe(true);
        expect(a.textContent).toBe('木');
        expect(a.getAttribute('title')).toBe('組字：⿰木孚');
    });

    it('raised：本列首字 is-raised＋data-raised，其余字不带', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '甲'), cell('3:1:2', '乙')], { raised: 2 })));
        expect(el(container, '3:1:1').classList.contains('is-raised')).toBe(true);
        expect(el(container, '3:1:1').getAttribute('data-raised')).toBe('2');
        expect(el(container, '3:1:2').className).not.toMatch(/is-raised/);
    });

    it('lead_blank：只是原件列首空格，重排阅读里不留空位（否则换行处会出现两字空白），文本不受影响', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '甲'), cell('3:1:2', '乙')], { lead_blank: 3 })));
        expect(container.querySelector('.guji-text-lead-blank')).toBeNull();
        expect(container.querySelector('p')!.textContent).toBe('甲乙');
    });

    it('kind: blank 空列：显示空位、不丢列、不进文本；页尾空列也留着', () => {
        const doc = { pages: [{ page: 3, columns: [
            { col: 1, cells: [cell('3:1:1', '甲')] },
            { col: 2, kind: 'blank', cells: [] },
            { col: 3, cells: [cell('3:3:1', '乙')] },
            { col: 4, kind: 'blank', cells: [] },
        ] }] };
        const { container } = mount(adaptCharCord(doc));
        const blanks = container.querySelectorAll('.guji-text-blank-col');
        expect(blanks).toHaveLength(2);
        expect(container.querySelector('p')!.textContent).toBe('甲乙');
        // 第一个空列在「甲」「乙」之间
        expect(el(container, '3:3:1').previousElementSibling).toBe(blanks[0]);
        expect(container.querySelector('p')!.lastElementChild).toBe(blanks[1]);
    });

    it('页 label：页分隔处显示 label（有则优先），没有用扫描页号', () => {
        const doc = { pages: [
            { page: 3, label: '一', columns: [{ col: 1, cells: [cell('3:1:1', '甲')] }] },
            { page: 4, label: '二', columns: [{ col: 1, cells: [cell('4:1:1', '乙')] }] },
            { page: 5, columns: [{ col: 1, cells: [cell('5:1:1', '丙')] }] },
        ] };
        const { container } = mount(adaptCharCord(doc));
        const dividers = Array.from(container.querySelectorAll('.guji-page-divider span')).map(s => s.textContent).filter(Boolean);
        expect(dividers).toEqual(['第 二 葉', '第 5 葉']); // 首页不画分隔
    });

    it('缺字段 = 旧行为：不带任何新类名／属性／占位', () => {
        const { container } = mount(adaptCharCord(charDoc([cell('3:1:1', '甲'), cell('3:1:2a', '乙'), cell('3:1:2b', '丙')])));
        const html = container.innerHTML;
        expect(html).not.toMatch(/is-solo|is-lacuna|is-guess|is-zi|is-raised|data-raised|lead-blank|blank-col|data-page-label/);
        expect(container.querySelector('[title]')).toBeNull();
        expect(el(container, '3:1:2a').classList.contains('is-sub')).toBe(true);
    });
});
