/**
 * 整理本显示的两处回归。
 *
 * 都是「数据形态变了、显示层没跟上」，且都只在特定条目上暴露——
 * 漢書藝文志（d59f23o7ygw2）页面上一列英文 `category`。
 * 2026-10-10 清退：删旧 ABCD 等级／繁体 type 映射／无调用方的 juanDisplayName，补 tally（小计行）。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OtherSection, CollatedEntries, normSectionType, isPageHeaderContent, entryHeadingLeveler, normalizeTextQualityGrade } from '../../src/components/CollatedEdition';

describe('文本质量档归一（新词表 source／ocr／rough／fine／none／placeholder）', () => {
    it('六个新值原样返回', () => {
        for (const g of ['source', 'ocr', 'rough', 'fine', 'none', 'placeholder']) expect(normalizeTextQualityGrade(g), g).toBe(g);
    });

    it('旧值 published 映射为 source（底本），不再是独立档', () => {
        expect(normalizeTextQualityGrade('published')).toBe('source');
    });

    it('其它未知值、非字符串返回 null（不显示徽标）', () => {
        for (const g of ['bogus', 'constructor', 'toString', '', 'SOURCE', '__proto__']) expect(normalizeTextQualityGrade(g), g).toBeNull();
        for (const g of [undefined, null, 1, {}]) expect(normalizeTextQualityGrade(g), String(g)).toBeNull();
    });
});

describe('normSectionType：英文枚举 → 中文', () => {
    it('2026-08 迁移后的英文枚举都能翻译', () => {
        // 颜色表与徽章文案都按中文写；不归一就是一列英文 + 灰色兜底
        expect(normSectionType('category')).toBe('类');
        expect(normSectionType('book')).toBe('书');
        expect(normSectionType('preface')).toBe('序');
        expect(normSectionType('verification')).toBe('考证');
    });

    it('tally（志书小计行，章 json 里 1,227 条）→ 小计', () => {
        expect(normSectionType('tally')).toBe('小计');
    });

    it('繁体 type 写法（書／類）与旧 ABCD 等级的兼容已删：数据里没有，原样返回', () => {
        expect(normSectionType('書')).toBe('書');
        expect(normSectionType('類')).toBe('類');
    });

    it('已是中文的原样返回，非字符串给空串', () => {
        expect(normSectionType('考证')).toBe('考证');
        expect(normSectionType(undefined)).toBe('');
        expect(normSectionType(null)).toBe('');
    });
});

describe('isPageHeaderContent：page_header 里混着页眉与正文', () => {
    /*
     * 欽定四庫全書總目把卷首一·聖諭（11250 字）、進書表、凡例二十則、
     * 勘閱繕校諸臣職名都标成了 page_header，与「卷二 經部二」这类每页
     * 重复的书口题名同型。此前一律丢弃，于是 29 段共 4 万余字在页面上
     * 完全不存在，「卷首1」打开是空的。
     *
     * 实测该书 212 段：183 段短于 100 字（全是书口题名），29 段长于 100
     * （全是正文），界限干净，故以 100 字为界。
     */
    it('书口题名（短）不当正文', () => {
        expect(isPageHeaderContent({ type: 'page_header', content: '卷二 經部二' })).toBe(false);
        expect(isPageHeaderContent({ type: 'page_header', content: '卷首四•門目' })).toBe(false);
        expect(isPageHeaderContent({ type: 'page_header', content: '' })).toBe(false);
    });

    it('聖諭/進表这类长文当正文', () => {
        expect(isPageHeaderContent({ type: 'page_header', content: '朕'.repeat(100) })).toBe(true);
        expect(isPageHeaderContent({ type: 'page_header', content: '伏'.repeat(4386) })).toBe(true);
    });

    it('非 page_header 一律 false（该走各自的渲染分支）', () => {
        expect(isPageHeaderContent({ type: 'book', content: '書'.repeat(500) })).toBe(false);
        expect(isPageHeaderContent({ type: 'preface', content: '序'.repeat(500) })).toBe(false);
    });
});

describe('entryHeadingLeveler：整理本标题不跳级（h1 是卷名），同级条目同级', () => {
    const run = (kinds: ('类' | '条目')[]) => { const tag = entryHeadingLeveler(); return kinds.map(tag); };

    it('只有条目：全是 h2，不是 h1 下直接 h3', () => {
        expect(run(['条目', '条目'])).toEqual(['h2', 'h2']);
    });

    it('类、条目、条目：h2 h3 h3', () => {
        expect(run(['类', '条目', '条目'])).toEqual(['h2', 'h3', 'h3']);
    });

    it('条目、类、条目：第一个类之前的条目是 h2，之后是 h3', () => {
        expect(run(['条目', '类', '条目'])).toEqual(['h2', 'h2', 'h3']);
    });
});

describe('tally（志书小计行）显示', () => {
    const tally = { type: 'tally', title: '右孝經類凡七家七部', level: 2, content: '' } as never;

    it('字典里有「小计」徽章文字：繁体「小計」、简体「小计」', async () => {
        const { collated } = await import('../../src/i18n/messages/collated');
        expect((collated['zh-Hant'].sectionType as Record<string, string>)['小计']).toBe('小計');
        expect((collated['zh-Hans'].sectionType as Record<string, string>)['小计']).toBe('小计');
    });

    it('条目看法（OtherSection）：显示小计行原文', () => {
        render(<OtherSection section={tally} />);
        expect(screen.getByText('右孝經類凡七家七部')).toBeTruthy();
    });

    it('正文看法（CollatedEntries）：小计行不再丢；书目条目照常', () => {
        const sections = [
            { type: 'book', title: '孝經', book_title: '孝經', content: '' },
            tally,
        ] as never;
        render(<CollatedEntries sections={sections} inline={(s: string) => s} />);
        expect(screen.getByText('右孝經類凡七家七部')).toBeTruthy();
    });
});
