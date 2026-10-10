/**
 * overview#516 W-B：读者对所有版本按 guji-markdown v0.2 宽松解析（spec 03 §2.1），不再看 `guji_markdown` 声明。
 * 夹注内 `|` 分行、嵌套夹注、旧 `⟨…⟩` 夹注；声明与否渲染逐字节一致。
 */
import React from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { fakeTextTransport } from './helpers/text-transport';

afterEach(cleanup);
const ID = 'b1';

async function article(md: string, index: Record<string, unknown> = {}) {
    const t = fakeTextTransport(ID, { md, index: { chapters: [{ n: 1, file: '001', title: '卷一' }], ...index } });
    const { container } = render(<TextReader id={ID} transport={t} title="书" />);
    await waitFor(() => expect(container.querySelector('article')).toBeTruthy());
    return container.querySelector('article')!;
}

// 缩自真实写法：汉志式 <a|b>、嵌套夹注、旧 ⟨⟩
const CASES = {
    pipe: '## 卷一\n\n易經十二篇。<施孟梁丘三家|經文與費氏同>\n',
    nested: '## 卷一\n\n周易古經十二篇。<注一<再注>後>\n',
    legacy: '## 卷一\n\n張敷華介軒集⟨字缺安福人⟩\n',
};

describe('未声明 guji_markdown 的版本', () => {
    it('<a|b> 渲染成夹注，| 不留在文本里', async () => {
        const a = await article(CASES.pipe);
        const jz = a.querySelectorAll('.bim-jiazhu');
        expect(jz).toHaveLength(1);
        expect(jz[0].textContent).toBe('施孟梁丘三家經文與費氏同');
        expect(a.textContent).not.toContain('|');
    });

    it('嵌套夹注：内层不截断外层', async () => {
        const a = await article(CASES.nested);
        const outer = a.querySelector('.bim-jiazhu')!;
        expect(outer.textContent).toBe('注一再注後');
        expect(outer.querySelectorAll('.bim-jiazhu')).toHaveLength(1);
        expect(a.textContent).not.toMatch(/[<>]/);
    });

    it('旧 ⟨…⟩ 夹注分支保留', async () => {
        const a = await article(CASES.legacy);
        const jz = a.querySelectorAll('.bim-jiazhu');
        expect(jz).toHaveLength(1);
        expect(jz[0].textContent).toBe('字缺安福人');
        expect(a.textContent).not.toMatch(/[⟨⟩]/);
    });

    it('没有记号的正文不受影响（<div>、<https://…> 不当夹注）', async () => {
        const a = await article('## 卷一\n\n甲乙 <https://example.org> 丙\n');
        expect(a.querySelectorAll('.bim-jiazhu')).toHaveLength(0);
        expect(a.textContent).toContain('<https://example.org>');
    });
});

describe('声明 v0.2 的版本与未声明的渲染逐字节一致', () => {
    for (const [name, md] of Object.entries(CASES)) {
        it(`${name}`, async () => {
            const off = (await article(md)).innerHTML;
            cleanup();
            const on = (await article(md, { guji_markdown: '0.2.0' })).innerHTML;
            expect(on).toBe(off);
        });
    }
});
