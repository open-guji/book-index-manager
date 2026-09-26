/**
 * W7-阅读展示：Book 全文阅读页「条目分行 ↔ 自然段」＋繁简入口 单测。
 *
 * 样本取《春秋公羊傳》隱公元年—三年（傳文即长夹注，覆盖判据 2）与
 * 《論語》學而第一（语录体，覆盖判据 1）。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ChapterBody } from '../../src/components/BookFullText';
import { LocaleProvider, useConvert } from '../../src/i18n';

const GONGYANG_MD = `## 隱公元年
元年春，王正月。<元年者何？君之始年也。春者何？歲之始也。>

三月，公及邾婁儀父盟于眛。<及者何？與也。>

## 隱公二年
二年春，公會戎于潛。`;

const LUNYU_MD = `## 學而第一

一之一
子曰：「學而時習之，不亦說乎？」

一之二
有子曰：「其爲人也孝弟，而好犯上者，鮮矣。」`;

/** 借 useConvert 把 ChapterBody 接到真实的 LocaleProvider 上 */
function Harness({ text, mode }: { text: string; mode: 'line' | 'paragraph' }) {
    const { convert } = useConvert();
    return <ChapterBody text={text} mode={mode} convert={convert} />;
}

describe('ChapterBody：自然段模式下夹注渲染（公羊傳傳文即长夹注）', () => {
    it('自然段：夹注小字、不露尖括号', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><Harness text={GONGYANG_MD} mode="paragraph" /></LocaleProvider>
        );
        expect(container.textContent).not.toMatch(/[<>]/);
        const jz = container.querySelectorAll('.bim-jiazhu');
        expect(jz.length).toBe(2);
        expect(jz[0].textContent).toBe('元年者何？君之始年也。春者何？歲之始也。');
    });

    it('条目分行：夹注同样不露记号（此前本组件未接 renderInterlinear，顺带补上）', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><Harness text={GONGYANG_MD} mode="line" /></LocaleProvider>
        );
        expect(container.textContent).not.toMatch(/[<>]/);
        expect(container.querySelectorAll('.bim-jiazhu').length).toBe(2);
    });

    it('自然段：隱公元年／二年不同年份不合并成一段', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><Harness text={GONGYANG_MD} mode="paragraph" /></LocaleProvider>
        );
        const paras = Array.from(container.querySelectorAll('p')).map(p => p.textContent);
        expect(paras).toHaveLength(2);
        expect(paras[0]).toContain('元年春，王正月');
        expect(paras[0]).toContain('三月，公及邾婁儀父盟于眛');
        expect(paras[1]).toBe('二年春，公會戎于潛。');
    });
});

describe('ChapterBody：語錄體（論語）自然段聚合', () => {
    it('自然段：學而第一整节拼成一段，标题独立', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><Harness text={LUNYU_MD} mode="paragraph" /></LocaleProvider>
        );
        expect(container.querySelector('h3, h4, h5')?.textContent).toBe('學而第一');
        const paras = container.querySelectorAll('p');
        expect(paras).toHaveLength(1);
        expect(paras[0].textContent).toContain('子曰：「學而時習之，不亦說乎？」');
        expect(paras[0].textContent).toContain('有子曰：「其爲人也孝弟');
    });

    it('条目分行：与现状一致，逐行独立展示（不合并）', () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hant"><Harness text={LUNYU_MD} mode="line" /></LocaleProvider>
        );
        // 分行模式整段原样塞进一个 pre-wrap article，靠 \n 视觉分行，不产生多个 <p>
        expect(container.querySelectorAll('p').length).toBe(0);
        expect(container.textContent).toContain('一之一');
        expect(container.textContent).toContain('子曰：「學而時習之，不亦說乎？」');
    });
});

describe('ChapterBody：判别不了体裁回退「条目分行」，不报错', () => {
    it('灰区文本渲染成功、不抛异常', () => {
        const text = Array(6).fill('甲條內容').join('\n') + '\n\n' + Array(6).fill('乙條內容').join('\n');
        expect(() => render(
            <LocaleProvider locale="zh-Hant"><Harness text={text} mode="paragraph" /></LocaleProvider>
        )).not.toThrow();
    });
});

describe('繁简切换：正文同步变（ChapterBody 复用 useConvert，不额外起状态）', () => {
    it('locale=zh-Hans 时 opencc-js 转换生效，正文出现简体字', async () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hans"><Harness text={LUNYU_MD} mode="paragraph" /></LocaleProvider>
        );
        await screen.findByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('学而时习之'), {}, { timeout: 8000 });
        expect(container.textContent).toContain('学而时习之');
    }, 10000);
});
