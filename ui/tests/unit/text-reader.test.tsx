/**
 * TextReader（overview#307 C 块）：整理本与全文合一的统一阅读器。
 * 只认新结构（manifest＋<key>/index.json）；没有 manifest 显示「暂无文本」。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import type { TextLocation, TextLocationCause } from '../../src/components/TextReader';
import type { IndexStorage } from '../../src/storage/types';
import type { CollatedJuan } from '../../src/types';
import { LocaleProvider } from '../../src/i18n';

const WORK = 'd59f2htm01du';

const JUAN: Record<string, CollatedJuan> = {
    '001': { title: '經錄', sections: [{ title: '易', type: '书', book_title: '周易', content: '十二卷', work_id: 'd59f2aaaaaaa' }] },
    '002': { title: '史錄', sections: [{ title: '史記', type: '书', book_title: '史記', content: '百三十卷' }] },
};

// ── 新结构 ──
const MANIFEST = {
    id: WORK,
    versions: [
        { key: 'default', kind: 'collated', label: '整理本', source: 'collated', source_name: '開源古籍', license: 'CC0 1.0' },
        { key: 'wikisource', kind: 'transcription', label: '維基文庫', source: 'wikisource', source_name: '維基文庫', source_url: 'https://zh.wikisource.org/wiki/x', license: 'CC BY-SA 4.0' },
        { key: 'kanripo', kind: 'transcription', label: 'Kanripo', source: 'kanripo', source_name: 'Kanripo', license: 'CC BY-SA 4.0' },
    ],
};
const INDEXES: Record<string, unknown> = {
    default: { title: '書錄', chapters: [{ n: 1, file: '001', title: '經錄', has_json: true }, { n: 2, file: '002', title: '史錄', has_json: true }] },
    wikisource: { chapters: [{ n: 1, file: '001', title: '卷一' }, { n: 2, file: '002', title: '卷二' }, { n: 3, file: '003', title: '卷三' }] },
    kanripo: { chapters: [{ n: 1, file: '001', title: '甲' }] },
};

function nativeTransport(over: Partial<IndexStorage> = {}, manifest: unknown = MANIFEST): IndexStorage {
    return {
        getItem: async () => ({ title: '直齋書錄解題', authors: [{ name: '陳振孫', dynasty: '南宋' }] }),
        getTextManifest: async () => manifest as never,
        getTextIndex: async (_id: string, key: string) => (INDEXES[key] ?? null) as never,
        getChapter: async (_id: string, key: string, ch: string) => ({
            md: `# ${key}-${ch}\n${key}的第${ch}章正文。`,
            json: key === 'default' ? JUAN[ch] ?? null : null,
        }),
        ...over,
    } as unknown as IndexStorage;
}

type Log = Array<[TextLocation, TextLocationCause]>;
function setup(transport: IndexStorage, props: Partial<React.ComponentProps<typeof TextReader>> = {}) {
    const log: Log = [];
    const onLocationChange = (l: TextLocation, c: TextLocationCause) => { log.push([l, c]); };
    const utils = render(<TextReader id={WORK} transport={transport} onLocationChange={onLocationChange} {...props} />);
    return { ...utils, log };
}
const versionSelect = () => screen.getByRole('combobox', { name: '版本' }) as HTMLSelectElement;
const optionTexts = () => Array.from(versionSelect().options).map(o => o.textContent);

describe('TextReader · 新结构', () => {
    it('工具条版本下拉按 manifest 顺序列全部版本（含整理本版本），default 在最前、默认选中；选项只写來源', async () => {
        setup(nativeTransport());
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        // 整理本版本的 label 是类别词「整理本」，下拉改写来源名「開源古籍」（页面上不出现类别词）
        expect(optionTexts()).toEqual(['開源古籍', '維基文庫', 'Kanripo']);
        expect(versionSelect().value).toBe('default');
    });

    it('整理本章有 json：结构化渲染（书目条目、作品链接），卷头小标题带位置', async () => {
        setup(nativeTransport());
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        expect(screen.getAllByText('周易').length).toBeGreaterThan(0);
        expect(document.querySelector('.bim-rd-kicker')?.textContent).toContain('卷1');
    });

    it('書名链接回条目页，作者行取条目数据', async () => {
        const onNavigate = vi.fn();
        setup(nativeTransport(), { onNavigate });
        const link = await screen.findByRole('link', { name: '書錄' });
        expect(link.getAttribute('href')).toBeTruthy();
        fireEvent.click(link);
        expect(onNavigate).toHaveBeenCalledWith(WORK);
        await waitFor(() => expect(document.querySelector('.bim-rd-by')?.textContent).toContain('陳振孫'));
    });

    it('没给 onNavigate 时書名也是链接（按 href 走）', async () => {
        setup(nativeTransport());
        const link = await screen.findByRole('link', { name: '書錄' });
        expect(link.getAttribute('href')).toBeTruthy();
    });

    it('章选中后通知宿主（cause=chapter），位置是「当前版本 key／章 key」', async () => {
        const { log } = setup(nativeTransport());
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        expect(log.map(([l, c]) => [l.key, l.chapter, l.isDefault, c])).toEqual([['default', '001', true, 'auto']]);
        fireEvent.click(screen.getAllByRole('button', { name: /下一卷/ })[0]);
        await screen.findByRole('heading', { level: 1, name: '史錄' });
        expect(log.at(-1)![1]).toBe('chapter');
        expect(log.at(-1)![0]).toEqual({ key: 'default', chapter: '002', isDefault: true });
    });

    it('切版本尽量停在同章号：整理本第 2 章 → 維基文庫第 2 章；换成 md 渲染，出處与授权随版本', async () => {
        const { log } = setup(nativeTransport());
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        fireEvent.click(screen.getAllByRole('button', { name: /下一卷/ })[0]);
        await screen.findByRole('heading', { level: 1, name: '史錄' });

        fireEvent.change(versionSelect(), { target: { value: 'wikisource' } });
        await screen.findByRole('heading', { level: 1, name: '卷二' });
        expect(log.at(-1)).toEqual([{ key: 'wikisource', chapter: '002', isDefault: false }, 'version']);
        expect(screen.getByText(/wikisource的第002章正文/)).toBeTruthy();
        const src = document.querySelector('.bim-rd-src[data-version]')!;
        expect(src.textContent).toContain('維基文庫');
        expect(src.textContent).toContain('CC BY-SA 4.0');
    });

    it('对不上章号回第一章：維基文庫第 3 章 → Kanripo（只有 1 章）', async () => {
        const { log } = setup(nativeTransport(), { versionKey: 'wikisource', chapter: '003' });
        await screen.findByRole('heading', { level: 1, name: '卷三' });
        fireEvent.change(versionSelect(), { target: { value: 'kanripo' } });
        await waitFor(() => expect(log.at(-1)![1]).toBe('version'));
        expect(log.at(-1)![0]).toEqual({ key: 'kanripo', chapter: '001', isDefault: false });
    });

    it('只有一份版本：不出下拉，書名后只标來源名', async () => {
        setup(nativeTransport({}, { id: WORK, versions: [MANIFEST.versions[1]] }), { versionKey: 'wikisource' });
        await screen.findByRole('heading', { level: 1, name: '卷一' });
        expect(screen.queryByRole('combobox', { name: '版本' })).toBeNull();
        expect(document.querySelector('.bim-rd-ttl')?.textContent).toContain('維基文庫');
    });

    it('受控：versionKey／chapter 决定显示哪份哪章；章无效时选第一章并以 auto 通知', async () => {
        const { log } = setup(nativeTransport(), { versionKey: 'wikisource', chapter: '999' });
        await waitFor(() => expect(log.length).toBeGreaterThan(0));
        expect(log[0]).toEqual([{ key: 'wikisource', chapter: '001', isDefault: false }, 'auto']);
    });

    it('受控：chapter 无效时也照常渲染第一章，不空白等宿主回写', async () => {
        setup(nativeTransport(), { versionKey: 'wikisource', chapter: '999' });
        await screen.findByRole('heading', { level: 1, name: '卷一' });
        expect(screen.getByText(/wikisource的第001章正文/)).toBeTruthy();
    });

    it('受控：versionKey 不在 manifest 里，回落 default 并以 auto 通知（宿主据此纠正地址）', async () => {
        const { log } = setup(nativeTransport(), { versionKey: 'nonesuch', chapter: '001' });
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        expect(log.some(([l, c]) => l.key === 'default' && c === 'auto')).toBe(true);
    });

    it('受控：宿主改 props 才换内容（组件自己不改）', async () => {
        const t = nativeTransport();
        const { rerender } = render(<TextReader id={WORK} transport={t} versionKey="default" chapter="001" />);
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        fireEvent.change(versionSelect(), { target: { value: 'wikisource' } });
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByRole('heading', { level: 1, name: '經錄' })).toBeTruthy(); // 宿主没改，仍是整理本
        rerender(<TextReader id={WORK} transport={t} versionKey="wikisource" chapter="001" />);
        await screen.findByRole('heading', { level: 1, name: '卷一' });
    });

    it('目錄按章列出，点目錄换章；整理本目錄顶有跨章搜索框，维基没有', async () => {
        setup(nativeTransport());
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        expect(screen.getByRole('searchbox', { name: /搜索全部卷/ })).toBeTruthy();
        fireEvent.change(versionSelect(), { target: { value: 'wikisource' } });
        await screen.findByRole('heading', { level: 1, name: '卷一' });
        expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('報告錯字：带書名、条目 id 回传；窄屏入口（正文末尾）也在', async () => {
        const onReportError = vi.fn();
        setup(nativeTransport(), { onReportError });
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        const btns = screen.getAllByRole('button', { name: '報告錯字', hidden: true });
        expect(btns.length).toBe(2); // 右栏一个、窄屏正文末尾一个（宽屏由 CSS 隐去后者）
        fireEvent.click(btns[1]);
        expect(onReportError).toHaveBeenCalledWith(expect.objectContaining({ entryId: WORK, bookTitle: '書錄', chapterKey: '001' }));
    });

    it('没有文本：提示而不是空白', async () => {
        setup(nativeTransport({ getTextManifest: async () => null }), {});
        await screen.findByText('暫無文本');
    });

    it('目錄取不到：提示无法加载', async () => {
        setup(nativeTransport({ getTextIndex: async () => null }));
        await screen.findByText('無法加載目錄');
    });
});

describe('TextReader · 上游授权（source.upstream，如 CBETA）', () => {
    const CBETA = {
        name: 'CBETA 電子佛典集成', url: 'https://www.cbeta.org/', license: 'CC BY-NC-SA 4.0',
        license_url: 'https://www.cbeta.org/copyright', note: 'Kanripo 此仓转自 CBETA；限非营利使用',
    };
    const manifest = { id: WORK, versions: [{ key: 'default', kind: 'transcription', label: 'Kanripo', source: 'kanripo', source_name: 'Kanripo', license: 'CC BY-NC-SA 4.0' }] };
    const withUpstream = (upstream: unknown) => nativeTransport({
        getTextIndex: async () => ({ chapters: [{ n: 1, file: '001', title: '卷一' }], source: { name: 'Kanripo', url: 'https://github.com/kanripo/KR6r0060', upstream } }) as never,
    }, manifest);

    it('版权栏多一行「上游」：名字链到上游、授权链到版权说明、带说明文字', async () => {
        setup(withUpstream(CBETA));
        await screen.findByRole('heading', { level: 1, name: '卷一' });
        const line = document.querySelector('[data-bim-upstream]') as HTMLElement;
        expect(line.textContent).toContain('上游');
        expect(line.textContent).toContain('CBETA');
        expect(line.textContent).toContain('限非营利使用');
        const links = Array.from(line.querySelectorAll('a')).map(a => a.getAttribute('href'));
        expect(links).toEqual(['https://www.cbeta.org/', 'https://www.cbeta.org/copyright']);
    });

    it('没有上游就不出这一行；非 http(s) 的链接不放进 href', async () => {
        const { unmount } = setup(withUpstream(undefined));
        await screen.findByRole('heading', { level: 1, name: '卷一' });
        expect(document.querySelector('[data-bim-upstream]')).toBeNull();
        unmount();
        setup(withUpstream({ ...CBETA, url: 'javascript:alert(1)', license_url: 'data:text/html,x' }));
        await screen.findByRole('heading', { level: 1, name: '卷一' });
        const line = document.querySelector('[data-bim-upstream]') as HTMLElement;
        expect(line.querySelectorAll('a').length).toBe(0);
        expect(line.textContent).toContain('CBETA');
    });
});

describe('TextReader · 只认新结构（没有 manifest 显示「暫無文本」）', () => {
    it('条目没有 manifest：显示暫無文本', async () => {
        setup(nativeTransport({ getTextManifest: async () => null }));
        await screen.findByText('暫無文本');
    });

    it('transport 没有新接口：同样暫無文本', async () => {
        setup({ getItem: async () => null } as unknown as IndexStorage);
        await screen.findByText('暫無文本');
    });
});

describe('TextReader · 工具条上一章／下一章', () => {
    it('首章上一章置灰，末章下一章置灰', async () => {
        setup(nativeTransport(), { versionKey: 'default', chapter: '001' });
        await screen.findByRole('heading', { level: 1, name: '經錄' });
        const nav = screen.getByRole('group', { name: '翻卷' });
        expect((within(nav).getByRole('button', { name: '上一卷' }) as HTMLButtonElement).disabled).toBe(true);
        expect((within(nav).getByRole('button', { name: '下一卷' }) as HTMLButtonElement).disabled).toBe(false);
    });
});

describe('TextReader · 简体模式下工具条書名跟着转换（overview#308）', () => {
    it('宿主传字符串書名（网站传繁体条目标题）：简体模式转简体，繁体模式原样', async () => {
        const { unmount } = render(
            <LocaleProvider locale="zh-Hans"><TextReader id={WORK} transport={nativeTransport()} title="脂硯齋重評石頭記" /></LocaleProvider>,
        );
        await waitFor(() => expect(document.querySelector('.bim-rd-ttl b')?.textContent).toBe('脂砚斋重评石头记'), { timeout: 8000 });
        unmount();
        render(<LocaleProvider locale="zh-Hant"><TextReader id={WORK} transport={nativeTransport()} title="脂硯齋重評石頭記" /></LocaleProvider>);
        await waitFor(() => expect(document.querySelector('.bim-rd-ttl b')?.textContent).toBe('脂硯齋重評石頭記'));
    });

    it('宿主传节点書名：原样用，不转换', async () => {
        render(<LocaleProvider locale="zh-Hans"><TextReader id={WORK} transport={nativeTransport()} title={<em>脂硯齋</em>} /></LocaleProvider>);
        await waitFor(() => expect(document.querySelector('.bim-rd-ttl b em')?.textContent).toBe('脂硯齋'));
    });
});
