/**
 * 版式「界栏」（v4，overview#291）：样式只在 <html data-layout="boxed"> 下生效，疏朗（默认）零变化；
 * 值走 --bim-fr-* 令牌，不写死颜色；墨配色下行内链接另加下划线。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LAYOUT_CSS, Sec } from '../../src/components/detail/layout';
import { CATALOG_CSS } from '../../src/components/catalog/catalog-css';
import { READER_CSS } from '../../src/components/Reader/reader-css';

const boxedRules = (css: string) => css.split('\n').filter(l => l.includes('data-layout="boxed"') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'));

describe('界栏：只在 data-layout="boxed" 下生效', () => {
    for (const [name, css] of [['详情页', LAYOUT_CSS], ['总目', CATALOG_CSS], ['阅读器', READER_CSS]] as const) {
        it(`${name}：有界栏规则，且都读 --bim-fr-* 令牌、不写死颜色`, () => {
            const rules = boxedRules(css);
            expect(rules.length).toBeGreaterThan(0);
            expect(rules.join('\n')).toContain('--bim-fr-');
            expect(rules.join('\n')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
        });
    }

    it('详情页区块：外框＋标题栏下沿线＋正文内边距，全走令牌', () => {
        const css = boxedRules(LAYOUT_CSS).join('\n');
        expect(css).toMatch(/\.bim-d-sec \{[^}]*border: var\(--bim-fr-bd/);
        expect(css).toMatch(/\.bim-d-sec-head \{[^}]*padding: var\(--bim-fr-hd-pad[^}]*border-bottom: var\(--bim-fr-hd-bd/);
        expect(css).toMatch(/\.bim-d-sec-body \{[^}]*padding: var\(--bim-fr-bd-pad/);
    });

    it('Sec 把正文包进 .bim-d-sec-body（界栏给它内边距；疏朗下没有内边距）', () => {
        const { container } = render(<Sec id="x" title="版本"><p>正文</p></Sec>);
        const body = container.querySelector('section > .bim-d-sec-body');
        expect(body?.textContent).toBe('正文');
        expect(LAYOUT_CSS).not.toMatch(/^\.bim-d-sec-body/m);   // 默认（疏朗）不为它写任何规则
    });
});

describe('总目界栏（9-30 反馈：标题无间距、卡片无框、列表未界栏）', () => {
    const css = boxedRules(CATALOG_CSS).join('\n');
    it('标题栏下方留间距', () => {
        expect(css).toMatch(/\.bim-ct-head \{[^}]*margin: 0 0 14px/);
    });
    it('卡片画框', () => {
        expect(css).toMatch(/\.bim-ct-card > a \{[^}]*border: var\(--bim-fr-bd/);
    });
    it('列表整表一框、去斑马、行间线', () => {
        expect(css).toMatch(/\.bim-ct-list \{[^}]*border: var\(--bim-fr-bd/);
        expect(css).toMatch(/\.bim-ct-lrow:nth-child\(odd\) \{[^}]*background: none/);
        expect(css).toMatch(/\.bim-ct-lrow \+ \.bim-ct-lrow \{[^}]*border-top: var\(--bim-fr-hd-bd/);
    });
});

describe('墨：行内链接加下划线（强调色≈正文色）', () => {
    it('详情页与阅读器都有 data-theme="ink" 的下划线规则', () => {
        expect(LAYOUT_CSS).toMatch(/:root\[data-theme="ink"\][^{]*a \{[^}]*text-decoration: underline/);
        expect(READER_CSS).toMatch(/:root\[data-theme="ink"\][^{]*\{[^}]*text-decoration: underline/);
    });

    it('阅读器工具条「已开启」按钮在墨下不只靠颜色', () => {
        expect(READER_CSS).toMatch(/:root\[data-theme="ink"\] \.bim-rd-t\[aria-pressed="true"\][^{]*\{[^}]*text-decoration: underline/);
    });
});
