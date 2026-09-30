/**
 * UI2（overview#248）：
 * - 阅读器「版本」下拉框（#235）：显隐、默认 primary、切换回调、切换后回第一卷、出处与授权跟着版本走；
 * - INT Q4：窄屏／触屏点击区 ≥44×44（伪元素扩热区，按钮本身外观不变）；
 * - INT Q5：标题不跳级（axe heading-order 的判法：每个标题最多比上一个深一级）；
 * - INT Q3：条目页次级数据晚到前先占位（提要卡「最早存世」、朝代页签行、版本表行高）。
 */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { ReaderMdText } from '../../src/components/Reader/ReaderText';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import type { ReaderTocItem, ReaderVersion } from '../../src/components/Reader/types';
import { READER_CSS } from '../../src/components/Reader/reader-css';
import {
    readerVersionsFromFullText, readerVersionOptionLabel, pickReaderVersion,
} from '../../src/components/Reader/versions';
import * as publicApi from '../../src/index';
import { LAYOUT_CSS } from '../../src/components/detail/layout';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexDetailData, WorkFullTextEntry } from '../../src/types';

// ── 数据：詩序 d59f2ew0ctmo 的两份全文（#235「数据现状」），外加一份 CBETA 式授权 ──

const SHIXU: WorkFullTextEntry[] = [
    {
        key: 'wikisource-01', owner_type: 'Work', path: 'Work/t/m/o/d59f2ew0ctmo/full_text/wikisource-01',
        version_label: '詩序', source_name: '維基文庫',
        source_url: 'https://zh.wikisource.org/wiki/詩序', license: 'CC BY-SA 4.0',
        grade: 'source', total_chapters: 2, primary: true,
    },
    {
        key: 'kanripo-01', owner_type: 'Work', path: 'Work/t/m/o/d59f2ew0ctmo/full_text/kanripo-01',
        version_label: '詩序（Kanripo WYG 本）', source_name: 'Kanripo',
        source_url: 'https://github.com/kanripo/KR1c0003', license: 'CC BY-SA 4.0',
        grade: 'source', total_chapters: 3, primary: false,
    },
];

const TWO: ReaderVersion[] = [
    { key: 'wikisource-01', label: '雜阿含經', sourceName: '維基文庫', license: 'CC BY-SA 4.0', sourceUrl: 'https://zh.wikisource.org/', primary: false },
    { key: 'cbeta-01', label: '雜阿含經（CBETA）', sourceName: 'CBETA', license: 'CC BY-NC-SA 4.0', sourceUrl: 'https://cbeta.org/', primary: true },
];

const tocOf = (n: number, tag: string): ReaderTocItem[] =>
    Array.from({ length: n }, (_, i) => ({ key: `${i + 1}`.padStart(3, '0'), label: `${tag}卷${i + 1}` }));

function Shell(props: Partial<React.ComponentProps<typeof ReaderShell>>) {
    const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
    return (
        <ReaderShell
            title="雜阿含經"
            toc={tocOf(3, 'a')}
            activeKey="001"
            onSelect={() => {}}
            prefs={prefs}
            onPrefsChange={p => setPrefs(prev => ({ ...prev, ...p }))}
            {...props}
        >
            {props.children ?? <h1>正文</h1>}
        </ReaderShell>
    );
}

const srcLine = (c: HTMLElement) => c.querySelector('.bim-rd-src')?.textContent ?? null;

describe('版本数据换算', () => {
    it('book-text 全文清单 → 下拉项，字段一一对应、顺序不变', () => {
        const v = readerVersionsFromFullText(SHIXU);
        expect(v).toEqual([
            { key: 'wikisource-01', label: '詩序', sourceName: '維基文庫', license: 'CC BY-SA 4.0', sourceUrl: 'https://zh.wikisource.org/wiki/詩序', primary: true },
            { key: 'kanripo-01', label: '詩序（Kanripo WYG 本）', sourceName: 'Kanripo', license: 'CC BY-SA 4.0', sourceUrl: 'https://github.com/kanripo/KR1c0003', primary: false },
        ]);
    });

    it('选项文字 = version_label · source_name；版本说明已含来源名时不重复', () => {
        const [a, b] = readerVersionsFromFullText(SHIXU);
        expect(readerVersionOptionLabel(a)).toBe('詩序 · 維基文庫');
        expect(readerVersionOptionLabel(b)).toBe('詩序（Kanripo WYG 本）');
        expect(readerVersionOptionLabel({ key: 'x', label: '老子' })).toBe('老子');
    });

    it('当前版本：有效 key > primary > 第一份', () => {
        expect(pickReaderVersion(TWO, 'wikisource-01')?.key).toBe('wikisource-01');
        expect(pickReaderVersion(TWO, 'nope')?.key).toBe('cbeta-01');
        expect(pickReaderVersion(TWO)?.key).toBe('cbeta-01');
        expect(pickReaderVersion([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }])?.key).toBe('a');
        expect(pickReaderVersion([])).toBeUndefined();
    });

    it('从包入口导出', () => {
        expect(publicApi.readerVersionsFromFullText).toBe(readerVersionsFromFullText);
        expect(publicApi.readerVersionOptionLabel).toBe(readerVersionOptionLabel);
        expect(publicApi.pickReaderVersion).toBe(pickReaderVersion);
    });
});

describe('阅读器「版本」下拉框（#235）', () => {
    it('没有 versions：不出下拉框，也不出出处行', () => {
        const { container } = render(<Shell />);
        expect(screen.queryByRole('combobox', { name: '版本' })).toBeNull();
        expect(srcLine(container)).toBeNull();
    });

    it('只有一份全文：不出下拉框，出处与授权照常显示', () => {
        const { container } = render(<Shell versions={[TWO[1]]} />);
        expect(screen.queryByRole('combobox', { name: '版本' })).toBeNull();
        expect(srcLine(container)).toBe('出处 CBETA授权 CC BY-NC-SA 4.0');
    });

    it('两份以上：工具条上出下拉框，默认选 primary，选项文字是 version_label · source_name', () => {
        const { container } = render(<Shell versions={readerVersionsFromFullText(SHIXU)} />);
        const select = screen.getByRole('combobox', { name: '版本' }) as HTMLSelectElement;
        expect(select.closest('.bim-rd-tools')).toBeTruthy();
        expect(select.value).toBe('wikisource-01');
        expect([...select.options].map(o => o.textContent)).toEqual(['詩序 · 維基文庫', '詩序（Kanripo WYG 本）']);
        expect(srcLine(container)).toBe('出处 維基文庫授权 CC BY-SA 4.0');
        const link = container.querySelector('.bim-rd-src a') as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('https://zh.wikisource.org/wiki/詩序');
        expect(link.getAttribute('target')).toBe('_blank');
    });

    it('primary 不在第一位也默认选它；宿主给了 currentVersionKey 就用宿主的', () => {
        const { unmount } = render(<Shell versions={TWO} />);
        expect((screen.getByRole('combobox', { name: '版本' }) as HTMLSelectElement).value).toBe('cbeta-01');
        unmount();
        render(<Shell versions={TWO} currentVersionKey="wikisource-01" />);
        expect((screen.getByRole('combobox', { name: '版本' }) as HTMLSelectElement).value).toBe('wikisource-01');
    });

    it('切换：回调给出新 key；组件不改 URL', () => {
        const onVersionChange = vi.fn();
        const before = window.location.href;
        render(<Shell versions={TWO} currentVersionKey="cbeta-01" onVersionChange={onVersionChange} />);
        fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource-01' } });
        expect(onVersionChange).toHaveBeenCalledTimes(1);
        expect(onVersionChange).toHaveBeenCalledWith('wikisource-01');
        expect(window.location.href).toBe(before);
    });

    it('受控：宿主换上新版本与新目录后，授权跟着变，并回到新目录的第一卷（不保留卷号）', async () => {
        const onSelect = vi.fn();
        function Host() {
            const [key, setKey] = useState('cbeta-01');
            const [active, setActive] = useState('003');
            // 两份卷数不同；新目录里也有「003」，仍应回第一卷
            const toc = key === 'cbeta-01' ? tocOf(3, 'c') : tocOf(5, 'w');
            return (
                <Shell
                    versions={TWO}
                    currentVersionKey={key}
                    onVersionChange={setKey}
                    toc={toc}
                    activeKey={active}
                    onSelect={k => { setActive(k); onSelect(k); }}
                />
            );
        }
        const { container } = render(<Host />);
        expect(srcLine(container)).toContain('CC BY-NC-SA 4.0');
        fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource-01' } });
        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('001'));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(srcLine(container)).toBe('出处 維基文庫授权 CC BY-SA 4.0');
        expect((screen.getByRole('combobox', { name: '版本' }) as HTMLSelectElement).value).toBe('wikisource-01');
    });

    it('新目录异步到达（先空后有）：等目录到了才跳第一卷', async () => {
        const onSelect = vi.fn();
        const { rerender } = render(
            <Shell versions={TWO} currentVersionKey="cbeta-01" toc={tocOf(3, 'c')} activeKey="002" onSelect={onSelect} />,
        );
        fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource-01' } });
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={[]} activeKey="002" onSelect={onSelect} />);
        expect(onSelect).not.toHaveBeenCalled();
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={tocOf(5, 'w')} activeKey="002" onSelect={onSelect} />);
        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('001'));
        // 之后正常翻卷不再被拉回第一卷
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={tocOf(5, 'w2')} activeKey="004" onSelect={onSelect} />);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('宿主 toc 不 memo、新目录晚到：先按旧目录回第一卷，新目录（卷 key 不同）到了再选它的第一卷，之后不再干预', async () => {
        const onSelect = vi.fn();
        const newToc = (): ReaderTocItem[] => ['第001.md', '第002.md'].map(k => ({ key: k, label: k }));
        const { rerender } = render(
            <Shell versions={TWO} currentVersionKey="cbeta-01" toc={tocOf(3, 'c')} activeKey="003" onSelect={onSelect} />,
        );
        fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource-01' } });
        // 版本 key 先变，目录还是旧的（但每次渲染都是新数组）
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={tocOf(3, 'c')} activeKey="003" onSelect={onSelect} />);
        await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith('001'));
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={tocOf(3, 'c')} activeKey="001" onSelect={onSelect} />);
        expect(onSelect).toHaveBeenCalledTimes(1);
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={newToc()} activeKey="001" onSelect={onSelect} />);
        await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith('第001.md'));
        rerender(<Shell versions={TWO} currentVersionKey="wikisource-01" toc={newToc()} activeKey="第002.md" onSelect={onSelect} />);
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it('非受控：不给 currentVersionKey 时组件自己记住所选，出处行跟着变', () => {
        const { container } = render(<Shell versions={TWO} />);
        expect(srcLine(container)).toContain('CBETA');
        fireEvent.change(screen.getByRole('combobox', { name: '版本' }), { target: { value: 'wikisource-01' } });
        expect((screen.getByRole('combobox', { name: '版本' }) as HTMLSelectElement).value).toBe('wikisource-01');
        expect(srcLine(container)).toBe('出处 維基文庫授权 CC BY-SA 4.0');
    });

    it('versionSource={false}：宿主自己画出处时不重复', () => {
        const { container } = render(<Shell versions={TWO} versionSource={false} />);
        expect(screen.getByRole('combobox', { name: '版本' })).toBeTruthy();
        expect(srcLine(container)).toBeNull();
    });

    it('窄屏：只露「版本▾」，原生下拉透明盖在上面（仍是同一个可访问的下拉框）', () => {
        render(<Shell versions={TWO} />);
        const short = document.querySelector('.bim-rd-ver-short')!;
        expect(short.getAttribute('aria-hidden')).toBe('true');
        const narrow = READER_CSS.slice(READER_CSS.lastIndexOf('@media (max-width: 719px) {'));
        expect(narrow).toMatch(/\.bim-rd-ver-short \{ display: inline;/);
        expect(narrow).toMatch(/\.bim-rd-ver select \{ position: absolute; inset: 0;[^}]*opacity: 0;/);
        expect(narrow).toMatch(/\.bim-rd-ver \{ min-width: 44px; min-height: 44px;/);
    });
});

// ── Q4：点击区 ≥44×44 ──

/** 取某个 @media 块的内容（按花括号配对） */
function mediaBlock(css: string, query: string): string {
    const at = css.indexOf(`@media ${query} {`);
    expect(at, `缺少 @media ${query}`).toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
    }
    return '';
}

/** 块里所有选择器列表包含 selector 的规则，声明拼在一起 */
function ruleFor(block: string, selector: string): string {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    const css = block.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
        const sels = m[1].split(',').map(s => s.trim());
        if (sels.includes(selector)) out.push(m[2]);
    }
    return out.join(' ');
}

/** 伪元素热区：绝对定位居中，宽高都至少 44px */
function expectHitArea44(decl: string) {
    expect(decl).toMatch(/content: ""/);
    expect(decl).toMatch(/position: absolute/);
    expect(decl).toMatch(/width: max\([^;]*44px\)/);
    expect(decl).toMatch(/height: (max\([^;]*44px\)|44px)/);
    expect(decl).toMatch(/translate\(-50%, -50%\)/);
}

describe('Q4 点击区 ≥44×44（390 宽 / 触屏；伪元素扩热区，外观不变）', () => {
    const coarse = '(max-width: 719px), (pointer: coarse)';

    it('阅读器工具栏：目录、繁｜简、A−、A+、专名线（全是 .bim-rd-tools .bim-rd-t）', () => {
        const block = mediaBlock(READER_CSS, coarse);
        expect(ruleFor(block, '.bim-rd-tools .bim-rd-t')).toMatch(/position: relative/);
        expectHitArea44(ruleFor(block, '.bim-rd-tools .bim-rd-t::after'));
        // 字号「小／中／大」三个挨着：触屏上按钮本身撑到 44×44（不用会叠的伪元素）
        expect(ruleFor(block, '.bim-rd-fsb')).toMatch(/min-width: 44px[^}]*min-height: 44px/);
        expect(ruleFor(block, '.bim-rd-ver select')).toMatch(/min-height: 44px/);

        render(<Shell properNameToggle versions={TWO} />);
        const tools = document.querySelector('.bim-rd-tools')!;
        const t = (name: string) => tools.querySelector(`[aria-label="${name}"]`) ?? [...tools.querySelectorAll('button')].find(b => b.textContent?.includes(name));
        for (const name of ['目录', '专名线']) {
            expect(t(name)?.classList.contains('bim-rd-t'), name).toBe(true);
        }
        for (const name of ['字号 小', '字号 中', '字号 大']) {
            expect(tools.querySelector(`[aria-label="${name}"]`)!.classList.contains('bim-rd-fsb'), name).toBe(true);
        }
    });

    it('阅读器：按钮本身的尺寸与留白在窄屏块里不变（只动伪元素）', () => {
        const block = mediaBlock(READER_CSS, coarse);
        expect(ruleFor(block, '.bim-rd-tools .bim-rd-t')).not.toMatch(/padding|min-width|min-height|width:|height:/);
    });

    it('条目页：返回索引、繁/简、GitHub 图标（顶条 a / button）与朝代页签', () => {
        const block = mediaBlock(LAYOUT_CSS, coarse);
        for (const sel of ['.bim-d-top a', '.bim-d-top button', '.bim-d-tab']) {
            expect(ruleFor(block, sel), sel).toMatch(/position: relative/);
            expectHitArea44(ruleFor(block, `${sel}::after`));
        }
        // 单字页签（「宋」「元」13px 宽）左右多留，与相邻页签的热区不叠
        expect(ruleFor(block, '.bim-d-tab.bim-d-tab-1')).toMatch(/margin: 0 7px/);
        expect(ruleFor(block, '.bim-d-filters')).toMatch(/column-gap: 20px/);
    });
});

// ── Q5：标题层级 ──

/** axe heading-order 的判法：按文档顺序，每个标题最多比上一个深一级 */
function headingOrderViolations(root: ParentNode): string[] {
    const hs = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const bad: string[] = [];
    let prev = 0;
    for (const h of hs) {
        const lv = Number(h.tagName[1]);
        if (prev && lv > prev + 1) bad.push(`${h.tagName}「${h.textContent}」接在 h${prev} 后`);
        prev = lv;
    }
    return bad;
}

describe('Q5 标题层级（heading-order）', () => {
    it('阅读页：h1 卷名下直接是 ### 小节／整行粗体条目 → 标签降为 h2 起步，外观 class 保留原层级', () => {
        const { container } = render(
            <Shell>
                <h1 className="bim-rd-h1">卷一</h1>
                <article className="bim-rd-prose">
                    <ReaderMdText text={'### 本紀第一\n\n太祖啟運立極。\n\n**建隆元年**\n\n正月。\n\n## 太宗\n\n#### 雍熙'} mode="line" />
                </article>
            </Shell>,
        );
        expect(headingOrderViolations(container)).toEqual([]);
        const hs = [...container.querySelectorAll('article h2, article h3, article h4')];
        expect(hs.map(h => `${h.tagName}.${h.className}`)).toEqual([
            'H2.bim-rd-hl4', // ### → 外观四级，标签 h2
            'H3.bim-rd-hl4', // **粗体** → 外观四级，标签 h3（上一个是 h2）
            'H3.bim-rd-hl3', // ## → 外观三级
            'H4.bim-rd-hl4', // #### → 外观四级
        ]);
    });

    it('外观 class 覆盖标签默认字号（class 选择器比 .bim-rd-prose hN 更具体）', () => {
        expect(READER_CSS).toMatch(/\.bim-rd-prose \.bim-rd-hl2 \{ font-size: 1\.2em;/);
        expect(READER_CSS).toMatch(/\.bim-rd-prose \.bim-rd-hl3 \{ font-size: 1\.06em;/);
        expect(READER_CSS).toMatch(/\.bim-rd-prose \.bim-rd-hl4 \{ font-size: 1em;/);
    });

    it('条目页：「收入叢編」等旁栏小标题是 h2（提要卡 h1 之下），外观 class 不变', async () => {
        const WORK = {
            id: 'w1', type: 'work', title: '史記',
            books: ['b1'],
            related_works: [
                { id: 'c9', title: '二十四史', relation: 'collected_in' },
                { id: 'w2', title: '史記索隱', relation: 'studied_by' },
            ],
        } as unknown as IndexDetailData;
        const transport = {
            getItem: vi.fn(async (id: string) => (id === 'w1' ? WORK : { id, type: 'book', title: '史記', edition: '宋刻本' })),
            getEntry: vi.fn(async () => null),
            getCollatedEditionIndex: vi.fn(async () => null),
            getLineageGraph: vi.fn(async () => null),
            getWorkFullTextList: vi.fn(async () => []),
            getBookFullTextIndex: vi.fn(async () => null),
        };
        const { container } = render(
            <BookDetailLayout id="w1" transport={transport as never} initialDetail={WORK} activeTab="basic" onTabChange={() => {}} />,
        );
        await waitFor(() => expect(container.querySelector('#collected')).toBeTruthy());
        const h = container.querySelector('#collected > h2')!;
        expect(h.textContent).toContain('收入叢編');
        expect(h.classList.contains('bim-d-side-h')).toBe(true);
        expect(container.querySelector('#collected > h3')).toBeNull();
        expect(headingOrderViolations(container.querySelector('.bim-d-g-card')!.parentElement!)).toEqual([]);
        expect(LAYOUT_CSS).toMatch(/\.bim-d-side h3, \.bim-d-side \.bim-d-side-h \{ margin: 0 0 6px; font-size: 15px; font-weight: 700;/);
    });
});

// ── Q3：次级数据晚到前先占位 ──

describe('Q3 条目页 CLS：次级区块先占高', () => {
    const WORK = {
        id: 'w1', type: 'work', title: '史記',
        authors: [{ name: '司馬遷', role: 'author', dynasty: '西漢' }],
        books: ['b1', 'b2', 'b3'],
    } as unknown as IndexDetailData;
    const BOOKS: Record<string, unknown> = {
        b1: { id: 'b1', type: 'book', title: '史記', edition: '宋建安黃善夫家塾刻本' },
        b2: { id: 'b2', type: 'book', title: '史記', edition: '明嘉靖四年汪諒刊本' },
        b3: { id: 'b3', type: 'book', title: '史記', edition: '清乾隆武英殿本' },
    };

    it('版本解析完成前：提要卡先留「最早存世」一行、朝代页签行标记待定、版本行标记载入中；到齐后换成真值', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const transport = {
            getItem: vi.fn(async (id: string) => { await gate; return BOOKS[id] ?? null; }),
            getEntry: vi.fn(async () => null),
            getCollatedEditionIndex: vi.fn(async () => null),
            getLineageGraph: vi.fn(async () => null),
            getWorkFullTextList: vi.fn(async () => []),
            getBookFullTextIndex: vi.fn(async () => null),
        };
        const { container } = render(
            <BookDetailLayout id="w1" transport={transport as never} initialDetail={WORK} activeTab="basic" onTabChange={() => {}} />,
        );
        const dt = () => [...container.querySelectorAll('.bim-d-card dt')].map(d => d.textContent);
        await waitFor(() => expect(dt()).toContain('最早存世'));
        const placeholder = [...container.querySelectorAll('.bim-d-card dt')].find(d => d.textContent === '最早存世')!.nextElementSibling!;
        expect(placeholder.textContent).toBe('…');
        expect(container.querySelector('.bim-d-filters')!.hasAttribute('data-pending')).toBe(true);
        expect(container.querySelectorAll('.bim-d-zt-ver tbody tr[data-loading]').length).toBe(3);
        // 每行都带一个卷帙小字位（没有内容也留空行），行高加载前后一致（overview#268 P2-8）
        expect(container.querySelectorAll('.bim-d-zt-ver tbody tr .bim-d-zt-main .bim-d-meta').length).toBe(3);

        release();
        await waitFor(() => expect(container.querySelectorAll('.bim-d-zt-ver tbody tr[data-loading]').length).toBe(0));
        const earliest = [...container.querySelectorAll('.bim-d-card dt')].find(d => d.textContent === '最早存世')!.nextElementSibling!;
        expect(earliest.textContent).toBe('宋');
        expect(container.querySelector('.bim-d-filters')!.hasAttribute('data-pending')).toBe(false);
        expect(container.querySelectorAll('.bim-d-zt-ver tbody tr .bim-d-zt-main .bim-d-meta').length).toBe(3);
        // 行数不变：先占位的那一行被真值替换，不是再插一行
        expect(dt().filter(x => x === '最早存世')).toHaveLength(1);
    });

    it('CSS：朝代页签行、版本表行先占高；手机上载入中的版本行按两行占高', () => {
        expect(LAYOUT_CSS).toMatch(/\.bim-d-filters \{ min-height: 26px;/);
        expect(LAYOUT_CSS).toMatch(/\.bim-d-zt-ver tbody tr \{ height: 58px; \}/);
        // 桌面：版本行一律「名 + 一行卷帙小字」等高，加载前后表格高度不变（overview#268 P2-8）
        const narrow = mediaBlock(LAYOUT_CSS, '(max-width: 719px)');
        expect(ruleFor(narrow, '.bim-d-zt-ver tbody tr')).toMatch(/height: auto/);
        expect(ruleFor(narrow, '.bim-d-zt-ver tbody tr[data-loading]')).toMatch(/min-height: 84px/);
        expect(ruleFor(narrow, '.bim-d-filters[data-pending]')).toMatch(/min-height: 66px/);
    });
});
