/**
 * overview#528：选中文字时第一个字没有图文互相高亮。
 * 选区端点落在字的文本节点里；探针点必须取 (text,0) 而不是 (span,0)，否则选区起点所在的首字被漏。
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { LocaleProvider } from '../../src/i18n';

const cell = (a: string, c: string) => ({ a, c });
const doc = { pages: [{ page: 3, columns: [{ col: 1, cells: [
    cell('3:1:1', '甲'), cell('3:1:2', '乙'), cell('3:1:3', '丙'), cell('3:1:4', '丁'), cell('3:1:5', '戊'),
] }] }] };

function mount(onSelectionChange: (ids: string[]) => void) {
    const pages = adaptCharCord(doc);
    const pageData: any = { page_id: 'vol:3', columns: [], pages };
    return render(
        <LocaleProvider locale="zh-Hant">
            <GujiTextViewer pageData={pageData} pages={pages as any} selectedCharIds={new Set()} onSelectionChange={onSelectionChange} />
        </LocaleProvider>,
    );
}

const textOf = (c: HTMLElement, id: string) => c.querySelector(`[data-char-id="${id}"]`)!.firstChild as Text;

/** 选区设成 (a 的文本, aOff) → (b 的文本, bOff)，并触发 selectionchange（组件内 120ms 防抖后计算） */
function select(a: Text, aOff: number, b: Text, bOff: number) {
    const r = document.createRange();
    r.setStart(a, aOff);
    r.setEnd(b, bOff);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
}

afterEach(() => { window.getSelection()?.removeAllRanges(); });

describe('阅读器选区 → 字 id（overview#528）', () => {
    it('起点在首字 (text,0)：首字包含在内（选三个字就高亮三个字）', async () => {
        const fn = vi.fn();
        const { container } = mount(fn);
        select(textOf(container, '3:1:1'), 0, textOf(container, '3:1:3'), 1);
        await waitFor(() => expect(fn).toHaveBeenCalled());
        expect(fn.mock.calls.at(-1)![0]).toEqual(['3:1:1', '3:1:2', '3:1:3']);
    });

    it('起点在字的末端 (text,1)：该字一个笔画都没选上，不算', async () => {
        const fn = vi.fn();
        const { container } = mount(fn);
        select(textOf(container, '3:1:2'), 1, textOf(container, '3:1:4'), 1);
        await waitFor(() => expect(fn).toHaveBeenCalled());
        expect(fn.mock.calls.at(-1)![0]).toEqual(['3:1:3', '3:1:4']);
    });

    it('终点恰在下一个字的 (text,0)：下一个字不算（不过选）', async () => {
        const fn = vi.fn();
        const { container } = mount(fn);
        select(textOf(container, '3:1:2'), 0, textOf(container, '3:1:4'), 0);
        await waitFor(() => expect(fn).toHaveBeenCalled());
        expect(fn.mock.calls.at(-1)![0]).toEqual(['3:1:2', '3:1:3']);
    });

    it('只选一个字（(text,0)→(text,1)）：恰好这一个字', async () => {
        const fn = vi.fn();
        const { container } = mount(fn);
        const t = textOf(container, '3:1:1');
        select(t, 0, t, 1);
        await waitFor(() => expect(fn).toHaveBeenCalled());
        expect(fn.mock.calls.at(-1)![0]).toEqual(['3:1:1']);
    });
});
