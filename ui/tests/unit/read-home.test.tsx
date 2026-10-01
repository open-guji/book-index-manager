/**
 * 阅读首页组件（overview#308 C 块）与阅读页的返回入口、手机底栏。
 * 样例数据 fixtures/read-sections.json 取自设计稿（阅读首页.html，R8 10-01 定稿）。
 */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
    ReadHomeView, ReadPicks, ReadShelf, ReadTopicGroup, ReadFamousWorks, ReadSibu, ReadPeriodBand, ReadPieces,
    READ_HOME_CSS, periodLevel, shelfColumns, spineHeight, withDefaultLinks,
} from '../../src/components/read-home';
import type { ReadSections } from '../../src/components/read-home';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { READER_CSS } from '../../src/components/Reader/reader-css';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import SECTIONS from './fixtures/read-sections.json';

const S = SECTIONS as unknown as ReadSections;
const EMPTY: ReadSections = {
    counts: { readable: 0, works: 0, books: 0, pieces: 0 },
    picks: [], topics: [], famous: [], bu: [], unclassified: 0, periods: [], period_unknown: 0, pieces: { count: 0, authors: [] },
};

describe('model', () => {
    it('periodLevel：按与最大段的比例分 5 档，0 部为 0 档', () => {
        expect([0, 10, 20, 50, 80, 100].map((n) => periodLevel(n, 100))).toEqual([0, 0, 1, 2, 3, 4]);
        expect(periodLevel(5, 0)).toBe(0);
    });
    it('shelfColumns：按 period_of 出现先后分栏，缺省归「其他」', () => {
        const cols = shelfColumns([
            { id: 'a', title: '甲', period_of: '漢' }, { id: 'b', title: '乙', period_of: '晉' },
            { id: 'c', title: '丙', period_of: '漢' }, { id: 'd', title: '丁' },
        ]);
        expect(cols.map((c) => [c.label, c.items.map((x) => x.id)])).toEqual([['漢', ['a', 'c']], ['晉', ['b']], ['其他', ['d']]]);
    });
    it('spineHeight：随字数增长，有下限', () => {
        expect(spineHeight('漢志')).toBe(150);
        expect(spineHeight('補南北史藝文志')).toBeGreaterThan(spineHeight('隋書經籍志'));
    });
    it('withDefaultLinks：默认 /read/<id>、/read?node=、/read?period=、/item/<id>，宿主可逐项覆盖', () => {
        const l = withDefaultLinks({ read: (id) => `/r/${id}` });
        expect([l.read('x'), l.node('c1'), l.period('song'), l.work('w')]).toEqual(['/r/x', '/read?node=c1', '/read?period=song', '/item/w']);
        expect(l.author).toBeUndefined();
    });
});

describe('ReadHomeView：整页', () => {
    it('分区按设计稿顺序，分区导航只列有数据的；不出 h1、导语', () => {
        const { container } = render(<ReadHomeView sections={S} />);
        const h2 = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
        expect(h2).toEqual(['推薦閱讀', '專題', '名著與版本', '四部', '按年代', '單篇詩文']);
        expect(container.querySelector('h1')).toBeNull();
        const nav = screen.getByRole('navigation', { name: '閱讀首頁分區' });
        expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#picks', '#topics', '#classics', '#sibu', '#period', '#pieces']);
        // 每个锚点都有对应的分区
        for (const a of within(nav).getAllByRole('link')) expect(container.querySelector(a.getAttribute('href')!)).not.toBeNull();
    });

    it('史志书架不在阅读首页出（挪到元数据页，overview#322）；其余专题分组照常', () => {
        const { container } = render(<ReadHomeView sections={S} />);
        expect(container.querySelector('.bim-rh-shelf, .bim-rh-spine')).toBeNull();
        expect(within(container.querySelector('#topics') as HTMLElement).getByRole('heading', { name: /^書目與考證/ })).toBeInTheDocument();
        // 只有书架一组时，「专题」整块不出
        const onlyShelf = render(<ReadHomeView sections={{ ...S, topics: S.topics.filter((t) => t.shelf) }} />);
        expect(onlyShelf.container.querySelector('#topics')).toBeNull();
    });

    it('页面上不出现「整理本」「全文」字样（用户 10-01）', () => {
        const html = renderToString(<ReadHomeView sections={S} />);
        const text = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '');
        expect(text).not.toMatch(/整理本|全文|轉錄|转录/);
    });

    it('策展三块为空（文件还没交）时整块不出，导航也不列；其余照常', () => {
        const { container } = render(<ReadHomeView sections={{ ...S, picks: [], topics: [], famous: [] }} />);
        expect(container.querySelector('#picks, #topics, #classics')).toBeNull();
        const nav = screen.getByRole('navigation', { name: '閱讀首頁分區' });
        expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['四部', '按年代', '單篇詩文']);
    });

    it('全空：只出统计，不出分区导航', () => {
        const { container } = render(<ReadHomeView sections={EMPTY} />);
        expect(container.querySelectorAll('section')).toHaveLength(0);
        expect(screen.queryByRole('navigation')).toBeNull();
        expect(container.textContent).toContain('部可讀');
    });

    it('页首插槽放在统计前；统计带千分位', () => {
        render(<ReadHomeView sections={S} head={<form role="search" aria-label="在可讀書中搜索" />} />);
        expect(screen.getByRole('search')).toBeInTheDocument();
        expect(screen.getByText('6,323').parentElement?.textContent).toBe('6,323部可讀');
    });

    it('链接都按 links 走', () => {
        const { container } = render(<ReadHomeView sections={S} links={{ read: (id) => `/r/${id}`, period: (k) => `/p/${k}` }} />);
        const pick = container.querySelector('#picks a')!;
        expect(pick.getAttribute('href')).toBe(`/r/${S.picks[0].id}`);
        expect(container.querySelector('#period a')!.getAttribute('href')).toBe('/p/xianqin');
    });
});

describe('各分区', () => {
    it('推荐：题签竖排（读屏不念），卡片是整块链接，标作品类型与版本名', () => {
        render(<ReadPicks picks={S.picks} />);
        const link = screen.getByRole('link', { name: /脂硯齋重評石頭記/ });
        expect(link.querySelector('.bim-rh-slip')?.getAttribute('aria-hidden')).toBe('true');
        expect(link.querySelector('.bim-rh-slip')?.children.length).toBe(Array.from('石頭記').length);
        expect(within(link).getByText('小说 · 甲戌本')).toBeInTheDocument();
        expect(within(link).getByRole('heading', { level: 3 })).toHaveTextContent('脂硯齋重評石頭記');
    });

    it('史志书架：按所志朝代分栏，正史原志实色，无障碍名称带撰者与本数', () => {
        const shelf = S.topics.find((t) => t.shelf)!;
        const { container } = render(<ReadShelf topic={shelf} />);
        const jin = screen.getByRole('list', { name: '晉' });
        expect(within(jin).getAllByRole('link')).toHaveLength(5);
        const han = screen.getByRole('link', { name: /^漢書藝文志/ });
        expect(han.hasAttribute('data-orig')).toBe(true);
        expect(han.getAttribute('aria-label')).toBe('漢書藝文志，正史原志，站內 3本');
        expect(screen.getByRole('link', { name: /^補晉書藝文志，清 丁國鈞 撰/ })).toBeInTheDocument();
        // 可横向滚动的书架能用键盘聚焦
        expect(container.querySelector('.bim-rh-shelf-wrap')?.getAttribute('tabindex')).toBe('0');
    });

    it('专题分组：超过 GROUP_NARROW_CAP＋1（5）条才收起、出「全部」按钮，点了展开（data-open）', () => {
        const big = S.topics.find((t) => t.key === 'archives')!;
        const { container } = render(<ReadTopicGroup topic={big} />);
        // 桌面上「全部」按钮由样式藏起来（只在手机出；前面用例的 <style> 会留在 head 里），按文字查
        const btn = screen.getByText(`全部 ${big.items.length} 部`);
        expect(btn.tagName).toBe('BUTTON');
        expect(btn).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(btn);
        expect(container.querySelector('.bim-rh-grp')!.hasAttribute('data-open')).toBe(true);
        expect(screen.getByText('收起')).toHaveAttribute('aria-expanded', 'true');
        cleanupAndRender();
        function cleanupAndRender() {
            const small = S.topics.find((t) => t.key === 'congshu')!;
            const r = render(<ReadTopicGroup topic={small} />);
            expect(within(r.container).queryByRole('button', { hidden: true })).toBeNull();
        }
    });

    it('专题分组：本数 >1 才标「N本」，行尾小字是第一作者', () => {
        const bib = S.topics.find((t) => t.key === 'bibliography')!;
        render(<ReadTopicGroup topic={bib} />);
        const siku = screen.getByRole('link', { name: /欽定四庫全書總目/ });
        expect(within(siku).getByText('4本')).toBeInTheDocument();
        expect(within(siku).getByText('清 紀昀')).toBeInTheDocument();
        expect(within(screen.getByRole('link', { name: /^崇文總目宋/ })).queryByText(/本$/)).toBeNull();
    });

    it('名著与版本：版本系统分行（有名才出标签），版本签是链接，作品页链接只在有 work_id 时出', () => {
        const { container } = render(<ReadFamousWorks famous={S.famous} />);
        const hlm = screen.getByRole('heading', { name: '紅樓夢' }).closest('article')!;
        expect(within(hlm).getByRole('group', { name: '脂本' })).toBeInTheDocument();
        expect(within(hlm).getByRole('link', { name: '甲戌本' }).getAttribute('href')).toBe('/read/96kzii6z28');
        expect(within(hlm).getByText('5 個本子')).toBeInTheDocument();
        expect(within(hlm).getByRole('link', { name: /作品頁/ }).getAttribute('href')).toBe('/item/w0');
        const sm = screen.getByRole('heading', { name: '司馬法' }).closest('article')!;
        expect(within(sm).queryByRole('link', { name: /作品頁/ })).toBeNull();
        expect(sm.querySelector('.bim-rh-lin small')).toBeNull(); // 只有一组、没有系统名
        expect(container.querySelectorAll('dl, dt, dd')).toHaveLength(0);
    });

    it('四部：总数、前 6 子类（比例条按最大子类）、未分類单列并链到节点页', () => {
        const { container } = render(<ReadSibu bu={S.bu} unclassified={S.unclassified} />);
        const jing = screen.getByRole('link', { name: /^經部\s*1,348 部$/ });
        expect(jing.getAttribute('href')).toBe(`/read?node=${S.bu[0].id}`);
        const bars = container.querySelectorAll<HTMLElement>('.bim-rh-bu-c:first-child .bim-rh-bar');
        expect(bars[0].style.getPropertyValue('--bimrh-w')).toBe('100%');
        expect(screen.getByRole('link', { name: '查看未分類 →' }).getAttribute('href')).toBe('/read?node=unclassified');
        expect(screen.getByRole('link', { name: '經部全部 10 類 →' })).toBeInTheDocument();
    });

    it('年代带：段宽按占比，深浅 5 档，窄段只露首字（全名在无障碍名称里）；0 部的段不出', () => {
        const periods = [...S.periods, { key: 'x', label: '空', count: 0 }];
        const { container } = render(<ReadPeriodBand periods={periods} unknown={S.period_unknown} />);
        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(9);
        const ming = screen.getByRole('link', { name: '明，2,757 部' });
        expect(ming.getAttribute('data-k')).toBe('4');
        expect(ming.getAttribute('href')).toBe('/read?period=ming');
        const modern = screen.getByRole('link', { name: '近現代，12 部' });
        expect(modern.hasAttribute('data-narrow')).toBe(true);
        expect(modern.getAttribute('data-k')).toBe('0');
        expect(container.textContent).toContain('另有 1,255 部作者無朝代');
    });

    it('单篇诗文：作者分组；「全部」链接只在宿主给了 author 地址时出', () => {
        const { rerender } = render(<ReadPieces authors={S.pieces.authors} />);
        expect(screen.getByRole('heading', { name: /^韓愈/ })).toHaveTextContent('韓愈唐145 篇');
        expect(screen.queryByRole('link', { name: /全部/ })).toBeNull();
        rerender(<ReadPieces authors={S.pieces.authors} links={{ author: (n) => `/search?author=${n}` }} />);
        expect(screen.getByRole('link', { name: '韓愈全部 145 篇 →' }).getAttribute('href')).toBe('/search?author=韓愈');
    });
});

describe('样式：只走令牌', () => {
    it('界栏规则读 --bim-fr-*；有手机断点；墨下文字链接加下划线（写死颜色由 tokens.test 守门）', () => {
        expect(READ_HOME_CSS).toMatch(/\.bim-rh-sec \{[^}]*border: var\(--bim-fr-bd/);
        expect(READ_HOME_CSS).toMatch(/\.bim-rh-hd \{[^}]*background: var\(--bim-fr-hd-bg/);
        expect(READ_HOME_CSS).toMatch(/\.bim-rh-bu-c \{[^}]*border: var\(--bim-fr-card-bd/);
        expect(READ_HOME_CSS).toMatch(/\.bim-rh-rows a \{[^}]*border-top: var\(--bim-fr-row-bd/);
        expect(READ_HOME_CSS).toMatch(/\.bim-rh-shelf \{[^}]*border-bottom: var\(--bim-fr-plank/);
    });

    it('版式判准：边框一律走 --bim-fr-* 令牌，不写死；data-layout 选择器只用在悬停态与标题间距这几处例外', () => {
        const decls = READ_HOME_CSS.match(/border(?:-(?:top|bottom|left|right|block))?:\s*[^;]+;/g) ?? [];
        const hard = decls.filter((d) => !/var\(--bim-fr-|:\s*0;|transparent/.test(d));
        expect(hard).toEqual([]);
        const boxed = READ_HOME_CSS.split('\n').filter((l) => l.startsWith(':root[data-layout="boxed"]'));
        expect(boxed.every((l) => /:hover|bim-rh-hd \{/.test(l))).toBe(true);
        expect(READ_HOME_CSS).toContain('@media (max-width: 719px)');
        expect(READ_HOME_CSS).toMatch(/:root\[data-theme="ink"\][^{]*\{[^}]*text-decoration: underline/);
    });
});

// ── 阅读页：返回入口与手机底栏 ──

function Shell({ onReport, backHref }: { onReport?: () => void; backHref?: string }) {
    const [active, setActive] = useState('001');
    const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
    return (
        <ReaderShell
            title="直齋書錄解題"
            toc={[{ key: '001', label: '卷一' }, { key: '002', label: '卷二' }]}
            activeKey={active}
            onSelect={setActive}
            prefs={prefs}
            onPrefsChange={(p) => setPrefs((prev) => ({ ...prev, ...p }))}
            onReportError={onReport}
            backHref={backHref}
            images={[]}
        >
            <p>正文</p>
        </ReaderShell>
    );
}

function withViewport(width: number, fn: () => void) {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => {
        const max = /max-width:\s*(\d+)px/.exec(q);
        const min = /min-width:\s*(\d+)px/.exec(q);
        const matches = (!max || width <= +max[1]) && (!min || width >= +min[1]) && !/pointer/.test(q);
        return { matches, media: q, addEventListener() {}, removeEventListener() {} };
    }) as unknown as typeof window.matchMedia;
    try { fn(); } finally { window.matchMedia = orig; }
}

describe('阅读页：返回阅读首页与手机底栏（overview#308）', () => {
    it('工具条最左「‹ 阅读」链回阅读首页；不给 backHref 不出', () => {
        const { rerender } = render(<Shell backHref="/read" />);
        expect(screen.getByRole('link', { name: '返回阅读首页' }).getAttribute('href')).toBe('/read');
        rerender(<Shell />);
        expect(screen.queryByRole('link', { name: '返回阅读首页' })).toBeNull();
    });

    it('宽屏（≥860px）与服务端渲染：不出底栏', () => {
        withViewport(1200, () => {
            render(<Shell onReport={() => {}} />);
            expect(screen.queryByRole('navigation', { name: '阅读工具' })).toBeNull();
        });
        expect(renderToString(<Shell onReport={() => {}} />)).not.toContain('aria-label="阅读工具"');
    });

    it('手机：底栏有卷目／书影／字号／报告错字；字号抽屉能调字号，Esc 关闭并把焦点还给按钮', () => {
        withViewport(390, () => {
            const onReport = vi.fn();
            const { container } = render(<Shell onReport={onReport} />);
            const bar = screen.getByRole('navigation', { name: '阅读工具' });
            expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['卷目', '书影', 'A字号', '!报告错字']);
            expect(container.querySelector('.bim-rd')!.hasAttribute('data-bb')).toBe(true);

            const fsBtn = within(bar).getByRole('button', { name: /字号/ });
            fireEvent.click(fsBtn);
            const dlg = screen.getByRole('dialog', { name: '字号' });
            expect(dlg).toHaveAttribute('aria-modal', 'true');
            const before = within(dlg).getByRole('status').textContent;
            fireEvent.click(within(dlg).getByRole('button', { name: '放大字号' }));
            expect(within(dlg).getByRole('status').textContent).not.toBe(before);
            fireEvent.keyDown(dlg, { key: 'Escape' });
            expect(screen.queryByRole('dialog', { name: '字号' })).toBeNull();
            expect(document.activeElement).toBe(fsBtn);

            fireEvent.click(within(bar).getByRole('button', { name: /书影/ }));
            expect(screen.getByRole('dialog', { name: '书影' })).toBeInTheDocument();

            fireEvent.click(within(bar).getByRole('button', { name: /报告错字/ }));
            expect(onReport).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('dialog')).toBeNull();

            const toc = within(bar).getByRole('button', { name: /卷目/ });
            expect(toc).toHaveAttribute('aria-expanded', 'false');
            fireEvent.click(toc);
            expect(toc).toHaveAttribute('aria-expanded', 'true');
        });
    });

    it('没有报告入口时底栏不出「报告错字」；底栏样式只在 <860px 出，工具条上的重复按钮那时藏起来', () => {
        withViewport(390, () => {
            render(<Shell />);
            expect(within(screen.getByRole('navigation', { name: '阅读工具' })).queryByRole('button', { name: /报告错字/ })).toBeNull();
        });
        expect(READER_CSS).toMatch(/@media \(min-width: 860px\) \{ \.bim-rd-bb, \.bim-rd-sheet, \.bim-rd-sheet-scrim \{ display: none; \} \}/);
        expect(READER_CSS).toMatch(/\.bim-rd\[data-bb\] \.bim-rd-bb-dup \{ display: none !important; \}/);
    });
});
