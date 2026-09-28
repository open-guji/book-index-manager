/**
 * 「条目分行 ↔ 自然段」聚合规则单测（core/paragraphize.ts）。
 *
 * 三段取材取自 book-text 真实条目（T7 展示格式方案样张同源），
 * 覆盖两种体裁与「判不了」回退：
 *   - 目录体（漢書藝文志·六藝略）：以 `<!-- pN -->` 分页，页内逐行以 　 相接。
 *   - 语录体（論語·學而第一）：以 `##` 分节，节内条目以 　 相接，条目内部
 *     原有的单个 `\n`（编号行+正文行）原样保留，交给容器 CSS 折叠。
 */
import { describe, expect, it } from 'vitest';
import { detectGenre, buildParagraphBlocks } from '../../src/core/paragraphize';

const CATALOG_FIXTURE = `<!-- p4 -->
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
淮南道訓二篇<淮南王安聘明《易》者九人，號九師說。>
章句，施、孟、梁丘氏各二篇
凡易十三家，二百九十四篇。

<!-- p5 -->
尚書古文經四十六卷<爲五十七篇。>
經二十九卷<大、小夏侯二家。>
傳四十一篇
凡書九家，四百一十二篇。`;

const RECORD_FIXTURE = `## 學而第一

一之一
子曰：「學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？」

一之二
有子曰：「其爲人也孝弟，而好犯上者，鮮矣；不好犯上，而好作亂者，未之有也。」

一之三
子曰：「巧言令色，鮮矣仁。」`;

const RECORD_JIAZHU_FIXTURE = `## 隱公元年
元年春，王正月。<元年者何？君之始年也。>

三月，公及邾婁儀父盟于眛。<及者何？與也。>

## 隱公二年
二年春，公會戎于潛。`;

describe('detectGenre：按空行分块后的平均块长判体裁', () => {
    it('目录体：页内十余行，块长远大于阈值', () => {
        expect(detectGenre(CATALOG_FIXTURE)).toBe('catalog');
    });

    it('语录体：条目一两行，块长远小于阈值', () => {
        expect(detectGenre(RECORD_FIXTURE)).toBe('record');
    });

    it('全篇无空行：单块，直接判目录体（零成本情形）', () => {
        expect(detectGenre('甲\n乙\n丙')).toBe('catalog');
    });

    it('空文本：判不了，unknown', () => {
        expect(detectGenre('')).toBe('unknown');
    });

    it('块长落在 4~8 灰区：判不了，unknown（不许出错排）', () => {
        // 两块，每块 6 行，不上不下
        const text = Array(6).fill('甲').join('\n') + '\n\n' + Array(6).fill('乙').join('\n');
        expect(detectGenre(text)).toBe('unknown');
    });
});

describe('buildParagraphBlocks：目录体——页内逐行以 　 相接，页与页不合并', () => {
    it('两页各自成一段，页码注释不进入正文', () => {
        const blocks = buildParagraphBlocks(CATALOG_FIXTURE);
        const bodies = blocks.filter(b => b.kind === 'body');
        expect(bodies).toHaveLength(2);
        expect(bodies[0].text.startsWith('六藝略　易經十二篇')).toBe(true);
        expect(bodies[0].text).not.toContain('<!-- p4 -->');
        expect(bodies[0].text).toContain('凡易十三家，二百九十四篇。');
        expect(bodies[1].text.startsWith('尚書古文經四十六卷')).toBe(true);
        expect(bodies[1].text).not.toContain('<!-- p5 -->');
    });

    it('页内条目以全角空格相接，不是普通空格或换行', () => {
        const blocks = buildParagraphBlocks(CATALOG_FIXTURE);
        const first = blocks.find(b => b.kind === 'body')!;
        expect(first.text).toContain('易經十二篇，施、孟、梁丘三家<師古曰：“上、下經及十翼，故十二篇。”>　易傳周氏二篇<字王孫也。>');
        expect(first.text).not.toContain('\n');
    });
});

describe('buildParagraphBlocks：语录体——同节条目拼一段，标题独立成块', () => {
    it('學而第一：标题块 + 一个合并段落', () => {
        const blocks = buildParagraphBlocks(RECORD_FIXTURE);
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ kind: 'heading', text: '學而第一' });
        expect(blocks[1].kind).toBe('body');
        // 条目之间用 　，条目内部编号行与正文行保留原有单个 \n
        expect(blocks[1].text).toContain('一之一\n子曰：「學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？」　一之二\n有子曰：');
    });

    it('隱公元年／二年：按标题分节，不同年份不合并', () => {
        const blocks = buildParagraphBlocks(RECORD_JIAZHU_FIXTURE);
        const bodies = blocks.filter(b => b.kind === 'body');
        expect(bodies).toHaveLength(2);
        expect(bodies[0].text).toContain('元年春，王正月。<元年者何？君之始年也。>　三月，公及邾婁儀父盟于眛。<及者何？與也。>');
        expect(bodies[1].text).toBe('二年春，公會戎于潛。');
        // 夹注标记原样留在拼好的字符串里，渲染时才由 renderInterlinear 处理
        expect(bodies[0].text).toContain('<元年者何？君之始年也。>');
    });
});

describe('buildParagraphBlocks：判不了体裁时回退「条目分行」，不出错排', () => {
    it('灰区文本：逐行成块，等同分行模式，不合并、不抛异常', () => {
        const text = Array(6).fill('甲條').join('\n') + '\n\n' + Array(6).fill('乙條').join('\n');
        expect(() => buildParagraphBlocks(text)).not.toThrow();
        const blocks = buildParagraphBlocks(text);
        expect(blocks.every(b => b.kind === 'body')).toBe(true);
        expect(blocks).toHaveLength(12); // 逐行，未合并
    });

    it('空文本回空数组，不抛异常', () => {
        expect(buildParagraphBlocks('')).toEqual([]);
    });
});
