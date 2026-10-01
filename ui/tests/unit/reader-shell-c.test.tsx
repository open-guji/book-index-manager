/** 阅读器外壳（overview#307 C 块、#308）：工具条上一章／下一章、窄屏「报告错字」入口、正文居中、切版本不自动回第一章 */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import type { ReaderTocItem, ReaderVersion } from '../../src/components/Reader/types';
import { READER_CSS } from '../../src/components/Reader/reader-css';

const tocOf = (n: number, tag = 'a'): ReaderTocItem[] =>
    Array.from({ length: n }, (_, i) => ({ key: `${i + 1}`.padStart(3, '0'), label: `${tag}卷${i + 1}` }));

function Shell(props: Partial<React.ComponentProps<typeof ReaderShell>>) {
    const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
    return (
        <ReaderShell
            title="書"
            toc={tocOf(3)}
            activeKey="002"
            onSelect={() => {}}
            prefs={prefs}
            onPrefsChange={p => setPrefs(prev => ({ ...prev, ...p }))}
            {...props}
        >
            <h1>正文</h1>
        </ReaderShell>
    );
}

describe('工具条上一章／下一章（overview#308）', () => {
    it('中间章：两个按钮都可点，点了回传目錄里相邻章的 key', () => {
        const onSelect = vi.fn();
        render(<Shell onSelect={onSelect} />);
        const nav = screen.getByRole('group', { name: '翻卷' });
        fireEvent.click(within(nav).getByRole('button', { name: '上一卷' }));
        fireEvent.click(within(nav).getByRole('button', { name: '下一卷' }));
        expect(onSelect.mock.calls.map(c => c[0])).toEqual(['001', '003']);
    });

    it('首章上一章置灰、末章下一章置灰；按钮文字随单位（章／冊）', () => {
        const { rerender } = render(<Shell activeKey="001" pagerUnit="章" />);
        expect((screen.getByRole('button', { name: '上一章' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: '下一章' }) as HTMLButtonElement).disabled).toBe(false);
        rerender(<Shell activeKey="003" pagerUnit="冊" />);
        expect((screen.getByRole('button', { name: '下一冊' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('跳过置灰（搜索无命中）的章', () => {
        const onSelect = vi.fn();
        const toc = tocOf(3);
        toc[2] = { ...toc[2], disabled: true };
        render(<Shell toc={toc} activeKey="002" onSelect={onSelect} />);
        expect((screen.getByRole('button', { name: '下一卷' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('只有一章或关了翻页（pager=false）：工具条不出这两个按钮', () => {
        const { rerender } = render(<Shell toc={tocOf(1)} activeKey="001" />);
        expect(screen.queryByRole('group', { name: '翻卷' })).toBeNull();
        rerender(<Shell pager={false} />);
        expect(screen.queryByRole('group', { name: '翻卷' })).toBeNull();
    });

    it('窄屏（≤719px）工具条放不下：隐去，翻卷交给正文底部的翻页卡片', () => {
        render(<Shell />);
        expect(screen.getByRole('group', { name: '翻卷' }).className).toContain('bim-rd-hide-narrow');
        expect(READER_CSS).toMatch(/@media \(max-width: 719px\)[\s\S]*\.bim-rd-hide-narrow \{ display: none !important; \}/);
    });
});

describe('「報告錯字」窄屏入口（overview#308）', () => {
    it('右栏在 <860px 藏起来：正文末尾另有入口，同样回传当前卷；宽屏由 CSS 隐去它', () => {
        const onReportError = vi.fn();
        render(<Shell onReportError={onReportError} />);
        const buttons = screen.getAllByRole('button', { name: '報告錯字', hidden: true });
        expect(buttons).toHaveLength(2);
        const foot = buttons.find(b => b.closest('.bim-rd-report-foot'))!;
        fireEvent.click(foot);
        expect(onReportError).toHaveBeenCalledWith(expect.objectContaining({ chapterKey: '002' }));
        expect(READER_CSS).toMatch(/@media \(min-width: 860px\) \{ \.bim-rd-report-foot \{ display: none; \} \}/);
    });

    it('没传 onReportError：不出入口', () => {
        render(<Shell />);
        expect(screen.queryAllByRole('button', { name: '報告錯字', hidden: true })).toHaveLength(0);
        expect(document.querySelector('.bim-rd-report-foot')).toBeNull();
    });
});

describe('正文居中', () => {
    it('正文列 margin 0 auto；有右栏时整组居中', () => {
        expect(READER_CSS).toMatch(/\.bim-rd-col \{ max-width: 50em; margin: 0 auto;/);
        expect(READER_CSS).toMatch(/\.bim-rd-text\[data-rail\] \{[^}]*justify-content: center/);
    });
});

describe('切版本不自动回第一卷（keepChapterOnVersionChange）', () => {
    const VERSIONS: ReaderVersion[] = [
        { key: 'default', label: '整理本', primary: true },
        { key: 'wikisource', label: '維基文庫' },
    ];

    function Host({ keep }: { keep: boolean }) {
        const [key, setKey] = useState('default');
        const [active, setActive] = useState('002');
        return (
            <Shell
                toc={key === 'default' ? tocOf(3, 'a') : tocOf(4, 'b')}
                activeKey={active}
                onSelect={setActive}
                versions={VERSIONS}
                currentVersionKey={key}
                onVersionChange={setKey}
                keepChapterOnVersionChange={keep}
            />
        );
    }
    const current = () => document.querySelector('.bim-rd-toc [aria-current="true"]')?.textContent ?? '';

    it('默认（false）：切版本后选中新目錄的第一卷', async () => {
        render(<Host keep={false} />);
        expect(current()).toContain('a卷2');
        await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource' } }); });
        expect(current()).toContain('b卷1');
    });

    it('keep=true：壳不替宿主选章，宿主决定停在哪一章', async () => {
        render(<Host keep />);
        await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource' } }); });
        expect(current()).toContain('b卷2'); // 章 key 002 在新目录里还在，照旧选中
    });
});
