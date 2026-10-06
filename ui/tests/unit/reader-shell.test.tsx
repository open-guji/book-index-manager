/**
 * 阅读器外壳（N5a）：跳到正文、目录（游走 tabindex、可收起）、书影面板、工具条，
 * 以及整理本 / 全文两个组件接上外壳后的表现。
 */
import React, { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { ImagePanel } from '../../src/components/Reader/ImagePanel';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import type { ReaderPageImage, ReaderTocItem } from '../../src/components/Reader/types';
import { READER_CSS } from '../../src/components/Reader/reader-css';
import { TextReader } from '../../src/components/TextReader';
import type { CollatedJuan } from '../../src/types';
import { fakeTextTransport } from './helpers/text-transport';

/** 宋史式：496 卷 */
const MANY: ReaderTocItem[] = Array.from({ length: 496 }, (_, i) => ({ key: `${i + 1}`.padStart(3, '0'), label: `卷${i + 1}` }));
/** getByRole 在几百个按钮上很慢；只测工具条等的用例用短目录 */
const FEW = MANY.slice(0, 5);

function Harness({ toc = MANY, images, initial = '001', onSelect }: {
    toc?: ReaderTocItem[];
    images?: ReaderPageImage[] | null;
    initial?: string;
    onSelect?: (k: string) => void;
}) {
    const [active, setActive] = useState(initial);
    const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
    return (
        <ReaderShell
            title="宋史"
            subtitle="全文"
            toc={toc}
            activeKey={active}
            onSelect={k => { setActive(k); onSelect?.(k); }}
            images={images}
            prefs={prefs}
            onPrefsChange={p => setPrefs(prev => ({ ...prev, ...p }))}
            paragraphToggle
        >
            <h1>正文標題 {active}</h1>
            <article><p>太祖啟運立極。</p></article>
        </ReaderShell>
    );
}

describe('跳过目錄：「跳到正文」与游走 tabindex', () => {
    it('第一个可聚焦元素是「跳到正文」，指向可聚焦的正文容器', () => {
        const { container } = render(<Harness />);
        const focusables = container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]');
        const skip = focusables[0] as HTMLAnchorElement;
        expect(skip.textContent).toBe('跳到正文');
        const target = container.querySelector(skip.getAttribute('href')!) as HTMLElement;
        expect(target).toBeTruthy();
        expect(target.tabIndex).toBe(-1);
        expect(target.textContent).toContain('太祖啟運立極');
        fireEvent.click(skip);
        expect(document.activeElement).toBe(target);
    });

    it('「跳到正文」平时按 visually-hidden 收起，获得焦点才出现', () => {
        const base = READER_CSS.match(/\.bim-rd-skip \{([^}]*)\}/)![1];
        // 标准写法：1px + 裁切，不靠位移藏到屏外（窄屏／宿主有顶栏时位移会外露）
        expect(base).toMatch(/position: absolute/);
        expect(base).toMatch(/width: 1px; height: 1px/);
        expect(base).toMatch(/overflow: hidden/);
        expect(base).toMatch(/clip: rect\(0 0 0 0\)/);
        expect(base).toMatch(/clip-path: inset\(50%\)/);
        expect(base).not.toMatch(/transform/);
        const focus = READER_CSS.match(/\.bim-rd-skip:focus \{([^}]*)\}/)![1];
        expect(focus).toMatch(/width: auto; height: auto/);
        expect(focus).toMatch(/clip: auto; clip-path: none/);
        expect(focus).toMatch(/overflow: visible/);
        // 窄屏断点里不得再把它放出来
        const narrow = READER_CSS.slice(READER_CSS.indexOf('@media (max-width: 719px)'));
        expect(narrow).not.toMatch(/\.bim-rd-skip(?!:focus)[^{]*\{/);
        render(<Harness toc={FEW} />);
        const skip = screen.getByText('跳到正文');
        expect(skip.className).toBe('bim-rd-skip');
        skip.focus();
        expect(document.activeElement).toBe(skip);
    });

    it('496 卷的目錄里只有当前卷进 Tab 序列', () => {
        const { container } = render(<Harness initial="120" />);
        const toc = container.querySelector('.bim-rd-toc')!;
        const tabbable = toc.querySelectorAll('[data-rd-toc-key][tabindex="0"]');
        expect(toc.querySelectorAll('[data-rd-toc-key]')).toHaveLength(496);
        expect(tabbable).toHaveLength(1);
        expect(tabbable[0].getAttribute('aria-current')).toBe('true');
        expect(tabbable[0].textContent).toBe('卷120');
    });

    it('↑↓ / Home / End 在目錄里移动焦点，Tab 位随之移动', () => {
        const { container } = render(<Harness initial="002" />);
        const cur = container.querySelector<HTMLButtonElement>('[aria-current="true"]')!;
        cur.focus();
        fireEvent.keyDown(cur, { key: 'ArrowDown' });
        expect(document.activeElement?.textContent).toBe('卷3');
        fireEvent.keyDown(document.activeElement!, { key: 'End' });
        expect(document.activeElement?.textContent).toBe('卷496');
        fireEvent.keyDown(document.activeElement!, { key: 'Home' });
        expect(document.activeElement?.textContent).toBe('卷1');
        expect(container.querySelectorAll('.bim-rd-toc [tabindex="0"]')).toHaveLength(1);
    });
});

describe('目錄可收起', () => {
    it('工具条「目錄」带 aria-expanded / aria-controls，点击收起再展开', () => {
        const { container } = render(<Harness toc={FEW} />);
        const btn = screen.getByRole('button', { name: '目錄' });
        const toc = container.querySelector('.bim-rd-toc')!;
        expect(btn.getAttribute('aria-controls')).toBe(toc.id);
        expect(btn).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(btn);
        expect(btn).toHaveAttribute('aria-expanded', 'false');
        expect(container.querySelector('.bim-rd')!.getAttribute('data-toc')).toBe('closed');
        fireEvent.click(btn);
        expect(btn).toHaveAttribute('aria-expanded', 'true');
    });

    it('分组标题是 <button aria-expanded>，展开后才出现子项', () => {
        const toc: ReaderTocItem[] = [
            { key: 'g1', label: '本紀', children: [{ key: 'a', label: '太祖一' }, { key: 'b', label: '太祖二' }] },
            { key: 'g2', label: '志', children: [{ key: 'c', label: '天文一' }] },
        ];
        render(<Harness toc={toc} initial="a" />);
        const g2 = screen.getByRole('button', { name: /志/ });
        expect(g2).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('天文一')).toBeNull();
        fireEvent.click(g2);
        expect(g2).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('天文一')).toBeTruthy();
        // 当前卷所在的分组默认展开
        expect(screen.getByRole('button', { name: /本紀/ })).toHaveAttribute('aria-expanded', 'true');
    });

    it('底部「上一卷 / 下一卷」按目錄顺序', () => {
        const onSelect = vi.fn();
        render(<Harness toc={FEW} initial="002" onSelect={onSelect} />);
        const pager = screen.getByRole('navigation', { name: '翻卷' });
        fireEvent.click(within(pager).getByText(/卷3/));
        expect(onSelect).toHaveBeenCalledWith('003');
    });
});

describe('翻卷导航不撑宽页面（overview#268 P1-1）', () => {
    it('长回目标题带省略号截断类，两侧各占不超过一半', () => {
        render(<Harness toc={FEW} initial="002" />);
        const pager = screen.getByRole('navigation', { name: '翻卷' });
        expect(pager.querySelectorAll('.bim-rd-pglabel').length).toBe(2);
        expect(READER_CSS).toMatch(/\.bim-rd-pglabel \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis/);
        // v3 卡片：两列等宽 1fr 1fr（＝各占一半），卡片 min-width: 0 才能让长标题被截断而不撑宽页面
        expect(READER_CSS).toMatch(/\.bim-rd-pager \{[^}]*grid-template-columns: 1fr 1fr/);
        expect(READER_CSS).toMatch(/\.bim-rd-pg \{[^}]*min-width: 0/);
    });

    it('翻卷卡片 v3：上一卷／下一卷带说明字，两端占位「已是第一卷」不可点', () => {
        const { unmount } = render(<Harness toc={FEW} initial="001" />);
        const nav = screen.getByRole('navigation', { name: '翻卷' });
        expect(within(nav).queryByRole('button', { name: /上一卷/ })).toBeNull();
        expect(nav.textContent).toContain('已是第一卷');
        expect(within(nav).getByRole('button', { name: /下一卷/ })).toBeTruthy();
        unmount();
        render(<Harness toc={FEW} initial="002" />);
        const nav2 = screen.getByRole('navigation', { name: '翻卷' });
        expect(within(nav2).getByRole('button', { name: /上一卷/ })).toBeTruthy();
    });
});

describe('閱讀页正文区加宽、目錄栏紧贴正文（overview#268）', () => {
    it('正文列居中（收起目錄／書影后不留右侧空白，overview#308），最大宽 50em', () => {
        expect(READER_CSS).toMatch(/\.bim-rd-col \{ max-width: 50em; margin: 0 auto;/);
        expect(READER_CSS).not.toMatch(/margin: 0 auto 0 0/);
        expect(READER_CSS).toMatch(/\.bim-rd-text \{[^}]*padding: 32px 48px 96px 40px/);
    });
});

describe('工具条：只用文字和图标，状态用 aria-pressed', () => {
    it('字號、自然段、專名線', () => {
        const { container } = render(<LocaleProvider locale="zh-Hant"><Harness toc={FEW} /></LocaleProvider>);
        const root = container.querySelector<HTMLElement>('.bim-rd')!;
        fireEvent.click(screen.getByRole('button', { name: '放大字號' }));
        expect(root.style.getPropertyValue('--bimrd-fs')).toBe('20px');
        const para = screen.getByRole('button', { name: '自然段' });
        expect(para).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(para);
        expect(para).toHaveAttribute('aria-pressed', 'true');
        const pn = screen.getByRole('button', { name: '專名線' });
        fireEvent.click(pn);
        expect(pn).toHaveAttribute('aria-pressed', 'true');
        // 繁简切换在工具条里
        expect(screen.getByRole('button', { name: '切换为简体' })).toBeTruthy();
    });

    it('工具条按钮一律是无框的 .bim-rd-t', () => {
        const { container } = render(<Harness />);
        const bar = container.querySelector('.bim-rd-bar')!;
        for (const b of bar.querySelectorAll('button')) expect(b.className).toContain('bim-rd-t');
        expect(READER_CSS).toMatch(/\.bim-rd-t \{[^}]*border: 0;/);
    });
});

describe('書影', () => {
    const pages: ReaderPageImage[] = [
        { url: 'https://img.example/1.jpg', width: 600, height: 900, label: '葉一上', boxes: [{ x: 1, y: 2, w: 30, h: 30 }, { x: 1, y: 40, w: 30, h: 30 }] },
        { url: 'https://img.example/2.jpg', width: 600, height: 900 },
    ];

    it('没有影像：書影区默认收起，工具条上点开看占位', () => {
        const { container } = render(<Harness toc={FEW} images={null} />);
        const root = container.querySelector('.bim-rd')!;
        expect(root.getAttribute('data-img')).toBe('closed');
        const btn = screen.getByRole('button', { name: '書影' });
        expect(btn).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(btn);
        expect(root.getAttribute('data-img')).toBe('open');
        expect(screen.getByText('暫無書影')).toBeTruthy();
    });

    it('有影像：默认展开，書影在正文之前（左侧），逐字框按原图像素画', () => {
        const { container } = render(<Harness toc={FEW} images={pages} />);
        expect(container.querySelector('.bim-rd')!.getAttribute('data-img')).toBe('open');
        const img = container.querySelector<HTMLImageElement>('.bim-rd-img img')!;
        expect(img.src).toBe('https://img.example/1.jpg');
        expect(img.alt).toBe('書影 第 葉一上 頁');
        const svg = container.querySelector('.bim-rd-img svg')!;
        expect(svg.getAttribute('viewBox')).toBe('0 0 600 900');
        expect(svg.querySelectorAll('rect')).toHaveLength(2);
        // DOM 顺序：书影在正文前（网格第 2 列、正文第 3 列）
        const aside = container.querySelector('.bim-rd-img')!;
        const text = container.querySelector('.bim-rd-text')!;
        expect(aside.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(READER_CSS).toMatch(/\.bim-rd-img \{[^}]*grid-column: 2;/);
        expect(READER_CSS).toMatch(/\.bim-rd-text \{[^}]*grid-column: 3;/);
    });

    it('翻页；未知格式的框不画，交给 renderOverlay', () => {
        const overlay = vi.fn(() => <span className="custom-overlay" />);
        const { container } = render(
            <ImagePanel pages={[{ ...pages[0], boxFormat: 'cv-v1' }, pages[1]]} renderOverlay={overlay} />,
        );
        expect(container.querySelector('svg')).toBeNull();
        expect(container.querySelector('.custom-overlay')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '下一頁書影' }));
        expect(container.querySelector('img')!.getAttribute('src')).toBe('https://img.example/2.jpg');
        expect(overlay).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://img.example/2.jpg' }), 1);
    });

    it('窄屏样式里書影区整个不显示', () => {
        expect(READER_CSS).toMatch(/@media \(max-width: 719px\)[\s\S]*\.bim-rd-img \{ display: none !important; \}/);
    });
});

// ── 接上外壳的两个组件 ──

const FT_CHAPTERS = [
    { n: 1, title: '卷一 本紀第一', file: '001' },
    { n: 2, title: '卷二 本紀第二', file: '002' },
    { n: 3, title: '卷三 本紀第三', file: '003' },
];
const FT_VERSION = { label: '維基文庫', source_name: '維基文庫', source_url: 'https://zh.wikisource.org/wiki/宋史', license: 'CC BY-SA 4.0' };
const ftTransport = (md: string) => fakeTextTransport('b1', { chapters: FT_CHAPTERS, version: FT_VERSION, md });

describe('TextReader（全文章）', () => {
    it('來源链接下划线、不靠颜色区分；卷名是 h1', async () => {
        const { container } = render(<TextReader id="b1" transport={ftTransport('## 卷一\n\n太祖啟運立極。')} />);
        await waitFor(() => expect(container.querySelector('article')?.textContent).toContain('太祖'));
        const link = screen.getByRole('link', { name: '維基文庫' });
        expect(link.className).toBe('bim-rd-link');
        expect(READER_CSS).toMatch(/a\.bim-rd-link \{[^}]*text-decoration: underline;/);
        // 来源链接用次级墨色（--bim-quiet-fg）而非浅色 meta
        expect(READER_CSS).toMatch(/a\.bim-rd-link \{ color: var\(--bim-quiet-fg/);
        expect(container.querySelector('h1')?.textContent).toBe('卷一 本紀第一');
        // 开头与卷名重复的 ## 标题不再出现在正文里
        expect(container.querySelector('article h3')).toBeNull();
    });

    it('按章要書影：resolveImages 收到章 key', async () => {
        const resolveImages = vi.fn(async () => [{ url: 'https://img.example/p.jpg' }]);
        const { container } = render(
            <TextReader id="b1" transport={ftTransport('正文。')} chapter="002" resolveImages={resolveImages} />,
        );
        await waitFor(() => expect(container.querySelector('.bim-rd-img img')).toBeTruthy());
        expect(resolveImages).toHaveBeenCalledWith('002', expect.objectContaining({ versionKey: expect.anything() }));
    });

    it('简体模式下正文也转换（此前全文页不转）', async () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hans"><TextReader id="b1" transport={ftTransport('漢太史令撰。')} /></LocaleProvider>,
        );
        await waitFor(() => expect(container.querySelector('article')?.textContent).toContain('汉太史令撰'), { timeout: 8000 });
    }, 10000);
});

afterEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

const CE_INDEX = {
    title: '直齋書錄解題',
    type: 'catalog',
    text_quality: { grade: 'rough', source_note: '維基文庫' },
};
const CE_CHAPTERS = [
    { n: 1, file: '001', title: '卷1', has_json: true },
    { n: 2, file: '002', title: '卷2', has_json: true },
];
/** 整理本阅读页（TextReader 读新结构：default 版本的章带 json） */
const ceTransport = (extra: Record<string, unknown> = {}, item?: Record<string, unknown> | null) =>
    fakeTextTransport('w1', { chapters: CE_CHAPTERS, index: { ...CE_INDEX, ...extra }, json: JUAN, kind: 'collated', item });

const JUAN: CollatedJuan = {
    title: '正史類',
    sections: [
        { title: '《史記》一百三十卷', type: 'book', content: '漢太史令夏陽司馬遷子長撰。案班固云：采《世本》。', work_id: 'wsj' },
        { title: '《續後漢書》四十二卷', type: 'book', content: '廬陵貢士蕭常撰。周益公序云：曹氏代漢，名禪實篡，特新莽之流亞。丕方登禪壇，自形舜、禹之言，固不敢欺其心矣。今隔千載，好惡豈復相沿？而蘇軾記王、彭之說。', summary: '提要文字。' },
    ],
};

describe('TextReader（整理本章）', () => {
    function mountCE(onNavigate = vi.fn()) {
        const transport = ceTransport();
        return render(
            <LocaleProvider locale="zh-Hant">
                <TextReader id="w1" transport={transport} onNavigate={onNavigate} />
            </LocaleProvider>,
        );
    }

    it('正文：卷名 h1、元数据一行（不上 badge）、書名链到作品', async () => {
        const onNavigate = vi.fn();
        const { container } = mountCE(onNavigate);
        await waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('正史類'));
        const meta = container.querySelector('.bim-rd-meta')!;
        // 卷序移到卷头小标题（h1 上方），信息行只留部数与底本
        expect(container.querySelector('.bim-rd-kicker')?.textContent).toBe('卷1');
        expect(meta.textContent).toBe('2 部書底本 維基文庫粗校');
        expect(meta.querySelectorAll('.bim-rd-dot')).toHaveLength(1);
        const h3 = container.querySelectorAll('article.bim-rd-prose .bim-rd-entry-h');
        expect(h3).toHaveLength(2);
        // 没有「类」小标题：h1 下条目都是 h2，不跳级、同级同标签
        expect([...h3].map(h => h.tagName)).toEqual(['H2', 'H2']);
        fireEvent.click(within(h3[0] as HTMLElement).getByRole('link', { name: /^《史記》/ }));
        expect(onNavigate).toHaveBeenCalledWith('wsj');
        // 工具条书名取自索引
        expect(container.querySelector('.bim-rd-ttl b')?.textContent).toBe('直齋書錄解題');
        // 目录项取自 index.json 的章名（新结构里章名由数据给，不再靠读过的卷回填）
        await waitFor(() => expect(container.querySelector('.bim-rd-toc [aria-current="true"]')?.textContent).toBe('卷1'));
    });

    it('卷头 v3：品质等级是徽标（.bim-rd-grade），不再是括号里的字；没有 license 数据就不出许可证', async () => {
        const { container } = mountCE();
        await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
        const g = container.querySelector('.bim-rd-meta .bim-rd-grade');
        expect(g?.textContent).toBe('粗校');
        expect(container.querySelector('.bim-rd-meta')!.textContent).not.toMatch(/CC BY|授權|授权|（粗校）/);
    });

    it('目錄选中行：左侧色条（aria-current 行带 inset 阴影）', () => {
        expect(READER_CSS).toMatch(/\.bim-rd-ti\[aria-current="true"\] \{[^}]*box-shadow: inset 2px 0 0/);
    });

    it('工具条 v3：書名链作品页、作者行取作品数据、当前卷；作者缺就不出', async () => {
        const onNavigate = vi.fn();
        const transport = ceTransport({}, { id: 'w1', title: '直齋書錄解題', authors: [{ name: '陳振孫', dynasty: '南宋' }] });
        const { container } = render(
            <LocaleProvider locale="zh-Hant">
                <TextReader id="w1" transport={transport} onNavigate={onNavigate} />
            </LocaleProvider>,
        );
        await waitFor(() => expect(container.querySelector('.bim-rd-by')?.textContent).toBe('〔南宋〕陳振孫 撰'));
        const bar = container.querySelector('.bim-rd-ttl')!;
        fireEvent.click(within(bar as HTMLElement).getByRole('link', { name: '直齋書錄解題' }));
        expect(onNavigate).toHaveBeenCalledWith('w1');
        await waitFor(() => expect(bar.querySelector('.bim-rd-cur')?.textContent).toMatch(/^卷1/));
        // 没有作者数据：不出作者行，不编造
        const { container: c2 } = mountCE();
        await waitFor(() => expect(c2.querySelector('h1')).toBeTruthy());
        expect(c2.querySelector('.bim-rd-by')).toBeNull();
    });

    it('「標出作品鏈接」：默认开、有 work_id 的条目标题旁出「作品 →」；关掉后无链接；有名字可访问', async () => {
        const onNavigate = vi.fn();
        const { container } = mountCE(onNavigate);
        await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
        const box = screen.getByRole('checkbox', { name: '標出作品鏈接' });
        expect(box).toBeChecked();
        const chips = container.querySelectorAll('.bim-rd-wl');
        expect(chips).toHaveLength(1);   // 只有第一条有 work_id；版本数没数据，不写「N 种版本」
        expect(chips[0].textContent).toBe('作品 →');
        expect(chips[0].getAttribute('aria-label')).toBe('查看作品：《史記》一百三十卷');
        fireEvent.click(chips[0]);
        expect(onNavigate).toHaveBeenCalledWith('wsj');
        fireEvent.click(box);
        expect(container.querySelectorAll('.bim-rd-wl')).toHaveLength(0);
        expect(container.querySelectorAll('article .bim-rd-entry-h a')).toHaveLength(0);
        expect(JSON.parse(localStorage.getItem('bim-reader-prefs') ?? '{}').workLinks).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: '條目' }));
        expect(container.querySelector('.bim-rd-entries')!.textContent).not.toContain('→作品');
    });

    it('条目看法 v3：表格式行（序号、書名、作品 →／未關聯），仍可展开；標出作品鏈接关掉就没有右列', async () => {
        const { container } = mountCE();
        await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: '條目' }));
        const rows = container.querySelectorAll('.bim-rd-entries .bim-rd-row');
        expect(rows).toHaveLength(2);
        expect([...rows].map(r => r.querySelector('.bim-rd-no')?.textContent)).toEqual(['1', '2']);
        expect(container.querySelector('.bim-rd-rowhead')?.getAttribute('aria-hidden')).toBe('true');
        // 第一条有 work_id：「作品 →」；第二条没有：「未关联」
        expect(within(rows[0] as HTMLElement).getByRole('link', { name: /查看作品：/ }).textContent).toBe('作品 →');
        expect(rows[1].textContent).toContain('未關聯');
        fireEvent.click(screen.getByRole('checkbox', { name: '標出作品鏈接' }));
        expect(container.querySelector('.bim-rd-entries')!.textContent).not.toMatch(/作品 →|未關聯/);
    });

    it('右栏 v3：本卷计数（部書／已关联）＋条目锚点；点锚点滚到对应条目；有 work_id 的点亮', async () => {
        const scroll = vi.fn();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scroll;
        const { container } = mountCE();
        await waitFor(() => expect(container.querySelector('.bim-rd-rail')).toBeTruthy());
        const rail = container.querySelector('.bim-rd-rail') as HTMLElement;
        expect(rail.querySelector('.bim-rd-rail-n b')?.textContent).toBe('2');
        expect(rail.querySelector('.bim-rd-rail-linked')?.textContent).toBe('已關聯 1');
        expect(rail.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('已關聯 1 / 2');
        const links = [...rail.querySelectorAll('a')];  // jsdom 里 <860px 规则把栏藏了，不走 role 查询
        expect(links).toHaveLength(2);
        expect(links[0].querySelector('.bim-rd-rail-dot')?.className).toContain('on');
        expect(links[1].querySelector('.bim-rd-rail-dot')?.className).not.toContain('on');
        fireEvent.click(links[1]);
        expect(scroll).toHaveBeenCalled();
        expect(document.getElementById('rd-e-1')).toBeTruthy();
        // 有名字的地标
        expect(rail.tagName).toBe('ASIDE');
        expect(rail.getAttribute('aria-label')).toBe('本卷');
    });

    it('右栏：切到「条目」看法后锚点仍指向存在的条目 id', async () => {
        const { container } = mountCE();
        await waitFor(() => expect(container.querySelector('.bim-rd-rail')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: '條目' }));
        expect(container.querySelector('.bim-rd-entries #rd-e-0')).toBeTruthy();
        expect(container.querySelector('.bim-rd-rail')).toBeTruthy();
    });

    it('条目看法：「▶ 展开」是 <button aria-expanded>（Q5）', async () => {
        const { container } = mountCE();
        await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: '條目' }));
        // 短解题（第一条）没有可展开的内容，不给开关；长解题带提要的才有
        const toggles = container.querySelectorAll('.bim-rd-entries button[aria-expanded]');
        expect(toggles.length).toBe(1);
        const t = toggles[0] as HTMLButtonElement;
        expect(t).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(t);
        expect(t).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('提要文字。')).toBeTruthy();
    });

    it('跨卷搜索框在目錄里，命中高亮', async () => {
        const { container } = mountCE();
        await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
        const search = screen.getByRole('searchbox', { name: '搜索全部卷' });
        expect(container.querySelector('.bim-rd-toc')!.contains(search)).toBe(true);
        fireEvent.change(search, { target: { value: '蕭常' } });
        await waitFor(() => expect(container.querySelector('article mark')?.textContent).toBe('蕭常'));
    });
});

describe('审查修订（#24 网站总管）', () => {
    it('窄屏正文仍是 18px、行高 2.05：窄屏样式不覆盖字號与行高', () => {
        const narrow = READER_CSS.slice(READER_CSS.indexOf('@media (max-width: 719px)'));
        expect(narrow).not.toMatch(/bimrd-fs, 1[0-7]px/);
        expect(narrow).not.toMatch(/line-height/);
        expect(READER_CSS).toMatch(/\.bim-rd-col \{[^}]*var\(--bimrd-fs, 18px\)/);
        expect(READER_CSS).toMatch(/\.bim-rd-prose \{[^}]*line-height: 2\.05;/);
    });

    it('抽屉打开时 Tab 圈在抽屉里（aria-modal 配焦点陷阱）', () => {
        const orig = window.matchMedia;
        window.matchMedia = ((q: string) => ({
            matches: false, media: q, addEventListener() {}, removeEventListener() {},
        })) as unknown as typeof window.matchMedia;
        try {
            const { container } = render(<Harness toc={FEW} />);
            fireEvent.click(screen.getByRole('button', { name: '目錄' }));
            const toc = container.querySelector<HTMLElement>('.bim-rd-toc')!;
            expect(toc.getAttribute('aria-modal')).toBe('true');
            const close = within(toc).getByRole('button', { name: '收起目錄' });
            const cur = toc.querySelector<HTMLElement>('[aria-current="true"]')!;
            // 最后一个可 Tab 项上按 Tab → 回到第一个
            cur.focus();
            fireEvent.keyDown(cur, { key: 'Tab' });
            expect(document.activeElement).toBe(close);
            // 第一个上 Shift+Tab → 到最后一个
            fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
            expect(document.activeElement).toBe(cur);
        } finally {
            window.matchMedia = orig;
        }
    });

    it('简体模式下整理本元数据行也转成简体', async () => {
        const { container } = render(
            <LocaleProvider locale="zh-Hans">
                <TextReader id="w1" transport={ceTransport()} />
            </LocaleProvider>,
        );
        await waitFor(() => expect(container.querySelector('.bim-rd-meta')?.textContent).toContain('2 部书'), { timeout: 8000 });
        expect(container.querySelector('.bim-rd-meta')?.textContent).toContain('底本 维基文库粗校');
    }, 10000);
});
