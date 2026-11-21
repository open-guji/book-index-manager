/**
 * 目录与拖宽把手同在 grid-column:1；把手显式占 (1,1)，目录也必须显式写 grid-row:1，
 * 否则 CSS Grid 先放把手，目录被挤到第 2 行、书影区高度 0（0.66.16-rc.2 的缩放用例红）。
 */
import { describe, it, expect } from 'vitest';
import { READER_CSS } from '../../src/components/Reader/reader-css';

const rule = (sel: string) => {
    const i = READER_CSS.indexOf(`\n${sel} {`);
    expect(i).toBeGreaterThan(-1);
    return READER_CSS.slice(i, READER_CSS.indexOf('}', i));
};

describe('目录与把手的网格行', () => {
    it('.bim-rd-toc 与 .bim-rd-toc-grip 都显式在第 1 行', () => {
        expect(rule('.bim-rd-toc')).toMatch(/grid-column:\s*1;\s*grid-row:\s*1/);
        expect(rule('.bim-rd-toc-grip')).toMatch(/grid-column:\s*1;\s*grid-row:\s*1/);
    });
});
