/** 阅读器右栏「报告错字」与页脚校订日期（overview#299） */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';

const TOC = [{ key: '001', label: '卷1　易类' }, { key: '002', label: '卷2' }];

function shell(extra: Partial<React.ComponentProps<typeof ReaderShell>> = {}) {
    return render(
        <LocaleProvider>
            <ReaderShell
                title="直斋书录解题" toc={TOC} activeKey="001" onSelect={() => {}}
                prefs={DEFAULT_READER_PREFS} onPrefsChange={() => {}} pager={false}
                {...extra}
            >
                <h2 id="rd-e-0">《周易》</h2>
                <p id="rd-body">易者，象也。</p>
            </ReaderShell>
        </LocaleProvider>,
    );
}

describe('阅读器「报告错字」', () => {
    it('没传回调就不显示', () => {
        shell();
        expect(screen.queryByRole('button', { name: '报告错字', hidden: true })).toBeNull();
    });

    it('点击回传当前卷；有选中文字就带上', () => {
        const onReportError = vi.fn();
        shell({ onReportError });
        const p = document.getElementById('rd-body')!;
        const range = document.createRange();
        range.selectNodeContents(p);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        fireEvent.click(screen.getByRole('button', { name: '报告错字', hidden: true }));
        expect(onReportError).toHaveBeenCalledTimes(1);
        const ctx = onReportError.mock.calls[0][0];
        expect(ctx.chapterKey).toBe('001');
        expect(ctx.chapterLabel).toBe('卷1　易类');
        expect(ctx.selectedText).toBe('易者，象也。');
        expect(ctx.anchor).toBe('rd-e-0'); // jsdom 里所有 rect 为 0，第一个条目视为已到顶
    });

    it('没有选中文字时不带 selectedText', () => {
        const onReportError = vi.fn();
        shell({ onReportError });
        window.getSelection()!.removeAllRanges();
        fireEvent.click(screen.getByRole('button', { name: '报告错字', hidden: true }));
        expect(onReportError.mock.calls[0][0].selectedText).toBeUndefined();
    });
});

describe('阅读器页脚', () => {
    const versions = [{ key: 'a', label: 'A 本', sourceName: '維基文庫', license: 'CC BY-SA 4.0', primary: true }];
    it('给了 revisedAt 才显示「最近校订」', () => {
        shell({ versions, revisedAt: '2026-09-12' });
        expect(screen.getByText(/最近校订 2026-09-12/)).toBeTruthy();
    });
    it('没给就不显示，也不编', () => {
        shell({ versions });
        expect(screen.queryByText(/最近校订/)).toBeNull();
    });
});
