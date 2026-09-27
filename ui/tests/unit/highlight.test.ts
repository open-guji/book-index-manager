/**
 * splitHighlightSnippet 单测（A4，2026-09-27）。
 *
 * 用控制字符做 sentinel 而不是 <mark> 标签的原因见 core/highlight.ts 头注释：
 * 这里主要验证切段本身对齐、不丢字、不因为简介原文含尖括号而误判。
 */
import { describe, it, expect } from 'vitest';
import { SNIPPET_MARK_START as S, SNIPPET_MARK_END as E, splitHighlightSnippet } from '../../src/core/highlight';

describe('splitHighlightSnippet', () => {
    it('无标记时整段是一个未命中片段', () => {
        expect(splitHighlightSnippet('普通简介文字')).toEqual([
            { text: '普通简介文字', marked: false },
        ]);
    });

    it('单个命中片段前后都有普通文字', () => {
        expect(splitHighlightSnippet(`前段${S}命中词${E}后段`)).toEqual([
            { text: '前段', marked: false },
            { text: '命中词', marked: true },
            { text: '后段', marked: false },
        ]);
    });

    it('多个命中片段', () => {
        expect(splitHighlightSnippet(`甲${S}一${E}乙${S}二${E}丙`)).toEqual([
            { text: '甲', marked: false },
            { text: '一', marked: true },
            { text: '乙', marked: false },
            { text: '二', marked: true },
            { text: '丙', marked: false },
        ]);
    });

    it('命中片段贴头/贴尾时不产生空文本段', () => {
        expect(splitHighlightSnippet(`${S}开头命中${E}中间…结尾`)).toEqual([
            { text: '开头命中', marked: true },
            { text: '中间…结尾', marked: false },
        ]);
    });

    it('简介原文恰好含尖括号也只当普通文本，不当 HTML 解析', () => {
        const snippet = `版本 <乾隆抄本> ${S}百二十回${E} 红楼梦稿`;
        const segs = splitHighlightSnippet(snippet);
        expect(segs.some(s => s.text.includes('<乾隆抄本>'))).toBe(true);
        expect(segs.find(s => s.marked)?.text).toBe('百二十回');
    });

    it('空字符串返回空数组', () => {
        expect(splitHighlightSnippet('')).toEqual([]);
    });
});
