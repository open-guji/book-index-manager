/**
 * 阅读页 A−/A+ 失效回归：对读视图（.guji-text-reflow-view）的字号、段距、宽度必须跟 --bimrd-fs 走，
 * 不能写死 rem／px（否则字号设置没反应，且宽屏时正文被卡在 760px、两侧留白过大）。
 */
import { describe, it, expect } from 'vitest';
import { READER_CSS } from '../../src/components/Reader/reader-css';

function rule(selector: string): string {
    const i = READER_CSS.indexOf(`${selector} {`);
    expect(i).toBeGreaterThanOrEqual(0);
    return READER_CSS.slice(i, READER_CSS.indexOf('}', i));
}

describe('对读视图字号随设置走', () => {
    it('容器取 --bimrd-fs，宽度不卡 760px', () => {
        const r = rule('.guji-text-reflow-view');
        expect(r).toContain('font-size: var(--bimrd-fs');
        expect(r).not.toContain('760px');
    });
    it('段落与标题用 em，不用 rem', () => {
        for (const sel of ['.guji-reflow-paragraph', '.guji-reflow-paragraph.guji-reflow-heading']) {
            expect(rule(sel)).not.toMatch(/\d\s*rem/);
        }
        expect(READER_CSS).not.toMatch(/\.guji-reflow-heading\.guji-reflow-h\d[^}]*\drem/);
    });
});
