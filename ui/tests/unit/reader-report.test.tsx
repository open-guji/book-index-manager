/** 阅读器右栏「报告错字」与页脚校订日期（overview#299） */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { BookFullText } from '../../src/components/BookFullText';
import { CollatedEdition } from '../../src/components/CollatedEdition';
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

    function selectNode(el: Element) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
    }

    it('在右栏、出处页脚里选字不算正文选区', () => {
        const onReportError = vi.fn();
        shell({
            onReportError, pager: true, rail: <p id="rail-txt">本卷 2 部书</p>,
            versions: [{ key: 'a', label: 'A 本', sourceName: '維基文庫', license: 'CC BY-SA 4.0', primary: true }],
        });
        const btn = () => screen.getByRole('button', { name: '报告错字', hidden: true });
        selectNode(document.getElementById('rail-txt')!);
        fireEvent.click(btn());
        selectNode(document.querySelector('.bim-rd-src')!);
        fireEvent.click(btn());
        selectNode(document.querySelector('.bim-rd-pager')!);
        fireEvent.click(btn());
        expect(onReportError).toHaveBeenCalledTimes(3);
        for (const [ctx] of onReportError.mock.calls) expect(ctx.selectedText).toBeUndefined();
    });

    it('选区从正文拖进右栏（一端在外）也不算', () => {
        const onReportError = vi.fn();
        shell({ onReportError, rail: <p id="rail-txt">本卷 2 部书</p> });
        const range = document.createRange();
        range.setStart(document.getElementById('rd-body')!.firstChild!, 0);
        range.setEnd(document.getElementById('rail-txt')!.firstChild!, 2);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        fireEvent.click(screen.getByRole('button', { name: '报告错字', hidden: true }));
        expect(onReportError.mock.calls[0][0].selectedText).toBeUndefined();
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
    it('没有版本元数据时也显示（独立于 versionSource／version）', () => {
        shell({ revisedAt: '2026-09-12' });
        expect(screen.getByText('最近校订 2026-09-12')).toBeTruthy();
        expect(document.querySelector('.bim-rd-src [data-version]')).toBeNull();
    });

    it('BookFullText 传 revisedAt 就显示（它固定 versionSource=false）', async () => {
        const index = {
            book_id: 'b1', version_label: '宋史', source: { name: '維基文庫', url: 'https://zh.wikisource.org/', license: 'CC BY-SA 4.0' }, total_chapters: 1,
            chapters: [{ n: 1, title: '卷一', file: '001.md' }],
        } as never;
        const transport = { getBookFullTextChapter: async () => '太祖。' } as never;
        render(<LocaleProvider><BookFullText index={index} bookId="b1" transport={transport} revisedAt="2026-09-12" /></LocaleProvider>);
        await waitFor(() => expect(screen.getByText('最近校订 2026-09-12')).toBeTruthy());
    });

    it('CollatedEdition 传 revisedAt 就显示（它不给壳传 version）', async () => {
        const index = { work_id: 'w1', type: 'catalog', title: '直齋書錄解題', juan_files: ['juan/001.json'] } as never;
        const transport = {
            getCollatedJuan: async () => ({ title: '正史類', sections: [{ title: '《史記》', type: 'book', content: '漢太史令撰。' }] }),
            getCollatedJuanText: async () => null,
        } as never;
        render(<LocaleProvider locale="zh-Hant"><CollatedEdition index={index} workId="w1" transport={transport} revisedAt="2026-09-12" /></LocaleProvider>);
        await waitFor(() => expect(screen.getByText('最近校订 2026-09-12')).toBeTruthy());
    });
    it('宿主没传 revisedAt 时两个组件都不显示', async () => {
        const index = { book_id: 'b1', version_label: '宋史', source: { name: '維基文庫', url: 'https://zh.wikisource.org/', license: 'CC BY-SA 4.0' }, total_chapters: 1, chapters: [{ n: 1, title: '卷一', file: '001.md' }] } as never;
        const transport = { getBookFullTextChapter: async () => '太祖。' } as never;
        render(<LocaleProvider><BookFullText index={index} bookId="b1" transport={transport} /></LocaleProvider>);
        await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('太祖'));
        expect(screen.queryByText(/最近校订/)).toBeNull();
    });
});
