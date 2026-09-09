/**
 * 整理本显示的两处回归。
 *
 * 都是「数据形态变了、显示层没跟上」，且都只在特定条目上暴露——
 * 漢書藝文志（d59f23o7ygw2）两样全中，页面上一列英文 `category` 加一排「卷/001」。
 */
import { describe, expect, it } from 'vitest';
import { juanDisplayName, normSectionType, isPageHeaderContent } from '../../src/components/CollatedEdition';

describe('juanDisplayName：卷文件名 → 显示名', () => {
    it('带目录的 juan/001.json（漢書藝文志等）', () => {
        // 原先只剥 `juan` 前缀，剩下 `/001`，读者看到「卷/001」
        expect(juanDisplayName('juan/001.json')).toBe('卷1');
        expect(juanDisplayName('juan/012.json')).toBe('卷12');
    });

    it('扁平的 juan001.json 仍然对', () => {
        expect(juanDisplayName('juan001.json')).toBe('卷1');
        expect(juanDisplayName('juan043.json')).toBe('卷43');
    });

    it('卷首与附录', () => {
        expect(juanDisplayName('juanshou1.json')).toBe('卷首1');
        expect(juanDisplayName('fulu.json')).toBe('附錄');
    });

    it('中文文件名（考证类）原样返回', () => {
        expect(juanDisplayName('漢書藝文志考證.json')).toBe('漢書藝文志考證');
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
