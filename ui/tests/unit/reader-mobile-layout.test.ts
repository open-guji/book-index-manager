/** 手机版面（2026-10-19 用户反馈）：正文两侧不留白；页指示三角跟书影栏绑定 */
import { describe, expect, it } from 'vitest';
import { READER_CSS } from '../../src/components/Reader/reader-css';

describe('手机版面', () => {
    const tail = READER_CSS.slice(READER_CSS.indexOf('/* ── 手机：正文两侧不留白'));
    it('窄屏规则排在对读、界栏规则之后，压掉两侧内边距', () => {
        expect(READER_CSS.indexOf('.bim-rd[data-warp="true"] .bim-rd-text {')).toBeLessThan(READER_CSS.indexOf('/* ── 手机：正文两侧不留白'));
        expect(tail).toMatch(/\.bim-rd\[data-warp="true"\] \.bim-rd-text \{ padding-left: 0; padding-right: 0; \}/);
        expect(tail).toMatch(/\.guji-text-pane-content \{ padding-left: 0; padding-right: 0;/);
    });
    it('书影栏收起、手机上不画页指示三角', () => {
        expect(tail).toContain('.bim-rd:not([data-img="open"]) .guji-page-indicator { display: none; }');
        expect(tail).toMatch(/@media \(max-width: 719px\) \{ \.guji-page-indicator \{ display: none; \} \}/);
    });
});
