/**
 * W7-阅读展示：整理本原文视图「条目分行 ↔ 自然段」＋繁简入口 单测。
 *
 * 覆盖任务书 §二 完成判据 2/3/4/5：
 *   2. 夹注在「自然段」下照常小字、不露记号（两种记法各一条）
 *   3. 搜索高亮在「自然段」下照常
 *   4. 判别不了体裁的文本回退「条目分行」且不报错
 *   5. 繁简开关在阅读工具栏里可用，切换后正文与工具栏标签同步变
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MdTextView, JuanContent } from '../../src/components/CollatedEdition';
import { LocaleProvider } from '../../src/i18n';
import type { CollatedJuan } from '../../src/types';

const CATALOG_MD = `<!-- p4 -->
六藝略
易經十二篇，施、孟、梁丘三家<師古曰：“上、下經及十翼，故十二篇。”>
易傳周氏二篇<字王孫也。>
服氏二篇<師古曰：“劉向《別録》云：服氏，齊人，號服光。”>
楊氏二篇<名何，字叔元，菑川人。>
蔡公二篇<衛人，事周王孫。>
韓氏二篇<名嬰。>
王氏二篇<名同。>
丁氏八篇<名寬，字元襄，梁人也。>
古五子十八篇<自甲子至壬子，說《易》陰陽。>
凡易十三家，二百九十四篇。`;

const RECORD_MD = `## 學而第一

一之一
子曰：「學而時習之，不亦說乎？」

一之二
有子曰：「其爲人也孝弟，而好犯上者，鮮矣。」`;

describe('MdTextView：自然段模式下夹注渲染', () => {
    it('目录体（<…> 新记法）：自然段下夹注仍是小字、不露尖括号', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><MdTextView text={CATALOG_MD} mode="paragraph" /></LocaleProvider>
        );
        expect(container.textContent).not.toMatch(/[<>]/);
        const jz = container.querySelectorAll('.bim-jiazhu');
        expect(jz.length).toBeGreaterThan(0);
        expect(jz[0].textContent).toBe('師古曰：“上、下經及十翼，故十二篇。”');
        // 条目分行模式下同一条内容里的夹注也不应露尖括号（既有行为，顺带确认未回退）；
        // `<!-- p4 -->` 页码注释是既有行为（本道不动），不在此断言范围内。
        const { container: lineContainer } = render(
            <LocaleProvider locale="zh-Hant"><MdTextView text={CATALOG_MD} mode="line" /></LocaleProvider>
        );
        expect(lineContainer.querySelectorAll('.bim-jiazhu').length).toBe(jz.length);
        expect(lineContainer.textContent).toContain('易傳周氏二篇字王孫也。');
    });

    it('语录体（⟨…⟩ 旧记法混排）：自然段下夹注仍是小字、不露记号', () => {
        const text = '## 隱公元年\n元年春，王正月。⟨元年者何？君之始年也。⟩\n\n三月，公及邾婁儀父盟于眛。<及者何？與也。>';
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><MdTextView text={text} mode="paragraph" /></LocaleProvider>
        );
        expect(container.textContent).not.toMatch(/[<>⟨⟩]/);
        expect(container.querySelectorAll('.bim-jiazhu')).toHaveLength(2);
    });
});

describe('MdTextView：自然段模式下搜索高亮照常', () => {
    it('目录体：合并段落里命中词仍高亮', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant">
                <MdTextView text={CATALOG_MD} mode="paragraph" highlightQuery="梁丘" />
            </LocaleProvider>
        );
        const marks = container.querySelectorAll('mark, .bim-highlight, [class*="highlight"]');
        // 不假定高亮实现的具体 DOM 形态，只断言命中文本确实被特殊标记包裹、且未被拼接打散
        expect(container.textContent).toContain('易經十二篇，施、孟、梁丘三家');
        expect(marks.length).toBeGreaterThan(0);
    });

    it('语录体：跨条目合并后命中词仍高亮', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant">
                <MdTextView text={RECORD_MD} mode="paragraph" highlightQuery="孝弟" />
            </LocaleProvider>
        );
        expect(container.textContent).toContain('其爲人也孝弟');
        const marks = container.querySelectorAll('mark, .bim-highlight, [class*="highlight"]');
        expect(marks.length).toBeGreaterThan(0);
    });
});

describe('MdTextView：判别不了体裁回退「条目分行」，不报错', () => {
    it('灰区文本渲染成功、逐行显示，不抛异常', () => {
        const text = Array(6).fill('甲條內容').join('\n') + '\n\n' + Array(6).fill('乙條內容').join('\n');
        expect(() => render(
            <LocaleProvider locale="zh-Hant"><MdTextView text={text} mode="paragraph" /></LocaleProvider>
        )).not.toThrow();
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><MdTextView text={text} mode="paragraph" /></LocaleProvider>
        );
        // 回退分行：应有 12 个独立的 <p>，不是合并成 1~2 段
        expect(container.querySelectorAll('p').length).toBe(12);
    });
});

const FAKE_JUAN: CollatedJuan = {
    title: '六藝略',
    sections: [
        { title: '六藝略', type: '类' },
    ],
};

describe('JuanContent：阅读工具栏——分行/自然段 + 繁简入口', () => {
    it('原文视图下工具栏可见「條目分行」「自然段」按钮与繁简切换', () => {
        render(
            <LocaleProvider locale="zh-Hant">
                <JuanContent juan={FAKE_JUAN} rawText={CATALOG_MD} searchQuery="" />
            </LocaleProvider>
        );
        // 先切到原文视图（默认是目录视图）
        fireEvent.click(screen.getByText('原文'));
        expect(screen.getByText('條目分行')).toBeTruthy();
        expect(screen.getByText('自然段')).toBeTruthy();
        expect(screen.getByText('繁')).toBeTruthy();
        expect(screen.getByText('简')).toBeTruthy();
    });

    it('点击「自然段」后正文按段落聚合展示（不再是逐行 pre-line 的一条一块）', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant">
                <JuanContent juan={FAKE_JUAN} rawText={CATALOG_MD} searchQuery="" />
            </LocaleProvider>
        );
        fireEvent.click(screen.getByText('原文'));
        const pCountBefore = container.querySelectorAll('p').length;
        fireEvent.click(screen.getByText('自然段'));
        const pCountAfter = container.querySelectorAll('p').length;
        expect(pCountAfter).toBeLessThan(pCountBefore);
        expect(container.textContent).toContain('六藝略　易經十二篇');
    });

    it('切换繁简后工具栏标签与正文同步变（简体）', async () => {
        // 用非受控 LocaleProvider（真实使用场景）：种子 localStorage 为繁体起点，
        // 点繁简按钮才能真的切换——受控 `locale` prop 会把 setLocale 盖掉。
        localStorage.setItem('bim-locale', 'zh-Hant');
        render(
            <LocaleProvider>
                <JuanContent juan={FAKE_JUAN} rawText={CATALOG_MD} searchQuery="" />
            </LocaleProvider>
        );
        fireEvent.click(screen.getByText('原文'));
        expect(screen.queryByText('條目分行')).toBeTruthy();
        // LocaleToggle 按钮本身文案固定为「繁／简」，点击按钮（不是文字节点）触发切换
        fireEvent.click(screen.getByTitle('切换为简体'));
        // 正文简体转换是异步的（opencc-js 动态 import），等它落地
        await screen.findByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('易经'), {}, { timeout: 8000 });
        expect(screen.getByTitle('切換為繁體')).toBeTruthy();
    }, 10000);
});
