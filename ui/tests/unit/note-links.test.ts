/**
 * 来源说明里的链接（overview#359 P2-5）：《书名》(网址)、[文字](网址)、裸网址切成链接段。
 */
import { describe, it, expect } from 'vitest';
import { splitNoteLinks } from '../../src/core/note-links';

describe('splitNoteLinks', () => {
    it('「《书名》(网址)」：链接文字是书名，网址不外露（报告里《武职选簿》的原文）', () => {
        const note = '知乎@武泰斗天《明朝武职选簿[册数版]》(https://zhuanlan.zhihu.com/p/1987619270801236141)；整理本由 知乎@武泰斗天 持续更新；最近同步 2026-05-08';
        expect(splitNoteLinks(note)).toEqual([
            { text: '知乎@武泰斗天' },
            { text: '《明朝武职选簿[册数版]》', url: 'https://zhuanlan.zhihu.com/p/1987619270801236141' },
            { text: '；整理本由 知乎@武泰斗天 持续更新；最近同步 2026-05-08' },
        ]);
    });

    it('「[文字](网址)」去掉方括号；全角括号也认', () => {
        expect(splitNoteLinks('见[维基文库](https://zh.wikisource.org/wiki/史記)')).toEqual([
            { text: '见' }, { text: '维基文库', url: 'https://zh.wikisource.org/wiki/史記' },
        ]);
        expect(splitNoteLinks('《某书》（https://a.example/x）')).toEqual([{ text: '《某书》', url: 'https://a.example/x' }]);
    });

    it('裸网址：链接文字取域名', () => {
        expect(splitNoteLinks('来源 https://www.example.org/very/long/path?x=1 抄录')).toEqual([
            { text: '来源 ' }, { text: 'example.org', url: 'https://www.example.org/very/long/path?x=1' }, { text: ' 抄录' },
        ]);
    });

    it('没有网址：整段原样；非 http(s) 不当链接', () => {
        expect(splitNoteLinks('据殿本校')).toEqual([{ text: '据殿本校' }]);
        expect(splitNoteLinks('[x](javascript:alert(1))')).toEqual([{ text: '[x](javascript:alert(1))' }]);
        expect(splitNoteLinks('')).toEqual([]);
    });
});
