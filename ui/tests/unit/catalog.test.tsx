/**
 * N4a 古籍总目组件（overview#218）：分类树 / 作品卡片网格 / 总目页 + 数据派生。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import {
    CatalogPage, CatalogTree, WorkCardGrid,
    buildCatalogTree, findCatalogPath, catalogTotal, catalogPageCount, paginationItems,
    toCatalogWorkCard, compareCatalogCards, catalogNodeIdsOf,
    CATALOG_ALL_ID, CATALOG_UNCLASSIFIED_ID,
} from '../../src/components/catalog';
import { BIM_TOKENS } from '../../src/styles/tokens';
import type { CatalogNode, CatalogWorkCard, WorkClassification } from '../../src/types';

const cls = (l1: string, l2 = '', l3 = '', l4 = ''): WorkClassification => ({ l1, l2, l3, l4 });

const ORDER = [
    { cata_l1: '經部', cata_l2: '易類' },
    { cata_l1: '史部', cata_l2: '正史類' },
    { cata_l1: '史部', cata_l2: '方誌類', cata_l3: '北直隸', cata_l4: '順天府部' },
    { cata_l1: '子部', cata_l2: '儒家類' },
    { cata_l1: '集部', cata_l2: '別集類' },
];

const WORKS = [
    { classification: cls('史部', '正史類') },
    { classification: cls('史部', '正史類') },
    { classification: cls('史部') },
    { classification: cls('史部', '方誌類', '北直隸', '順天府部') },
    { classification: cls('經部', '易類') },
    { classification: cls('子部', '雜家類') },
    { classification: cls('子部', '儒家類') },
    { classification: null },
    {},
];

const TREE: CatalogNode[] = buildCatalogTree(WORKS, ORDER);

function card(i: number, extra: Partial<CatalogWorkCard> = {}): CatalogWorkCard {
    return { id: `w${i}`, title: `書${i}`, ...extra };
}

describe('model', () => {
    it('buildCatalogTree：《中国古籍总目》词表（overview#292）——各级未分類放最后、同名總類分开、空叢書部不出现', () => {
        const order = [
            { cata_l1: '經部', cata_l2: '未分類' },
            { cata_l1: '經部', cata_l2: '總類', cata_l3: '石經之屬' },
            { cata_l1: '史部', cata_l2: '未分類' },
            { cata_l1: '史部', cata_l2: '紀傳類' },
            { cata_l1: '子部', cata_l2: '總類' },
            { cata_l1: '叢書部', cata_l2: '彙編類' },
        ];
        const c = (l1: string, l2?: string, l3?: string): { classification: WorkClassification } => ({ classification: { l1, l2, l3 } as WorkClassification });
        const tree = buildCatalogTree([c('史部', '未分類'), c('史部', '紀傳類'), c('經部', '總類', '石經之屬'), c('子部', '總類'), {}], order);
        expect(tree.map(n => n.label)).toEqual(['經部', '史部', '子部', CATALOG_UNCLASSIFIED_ID]);
        expect(tree[1].children!.map(n => [n.id, n.label])).toEqual([['史部/紀傳類', '紀傳類'], ['史部/未分類', '未分類']]);
        expect(tree[0].children![0].id).toBe('經部/總類');
        expect(tree[2].children![0].id).toBe('子部/總類');
    });

    it('buildCatalogTree：四库顺序、子树计数、未分類在最后', () => {
        expect(TREE.map(n => n.label)).toEqual(['經部', '史部', '子部', CATALOG_UNCLASSIFIED_ID]);
        const shi = TREE[1];
        expect(shi).toMatchObject({ id: '史部', count: 4 });
        expect(shi.children!.map(n => [n.id, n.count])).toEqual([['史部/正史類', 2], ['史部/方誌類', 1]]);
        const fz = findCatalogPath(TREE, '史部/方誌類/北直隸/順天府部');
        expect(fz.map(n => n.label)).toEqual(['史部', '方誌類', '北直隸', '順天府部']);
        // 表里没有的「雜家類」排在表里有的「儒家類」之后
        expect(TREE[2].children!.map(n => n.label)).toEqual(['儒家類', '雜家類']);
        expect(TREE[3]).toEqual({ id: CATALOG_UNCLASSIFIED_ID, label: CATALOG_UNCLASSIFIED_ID, count: 2 });
        expect(catalogTotal(TREE)).toBe(WORKS.length);
    });

    it('catalogNodeIdsOf：祖先链；空串的级别截断', () => {
        expect(catalogNodeIdsOf(cls('史部', '正史類'))).toEqual(['史部', '史部/正史類']);
        expect(catalogNodeIdsOf(cls('史部', '', '北直隸'))).toEqual(['史部']);
        expect(catalogNodeIdsOf(undefined)).toEqual([CATALOG_UNCLASSIFIED_ID]);
    });

    it('toCatalogWorkCard：卷数、作者朝代、提要、分类签', () => {
        const c = toCatalogWorkCard({
            id: 'x', title: '史記', juan_count: { number: 130 },
            authors: [{ name: '司馬遷', dynasty: '西漢' }],
            description: { text: ' 太史公**書**。 ' },
            classification: cls('史部', '正史類'),
        });
        expect(c).toEqual({
            id: 'x', title: '史記', juan: 130,
            authors: [{ name: '司馬遷', dynasty: '西漢' }],
            summary: '太史公書。', classification: ['史部', '正史類'],
        });
        // 独著作者没写朝代：借作品的 dynasty；measure_info 兜底卷数
        expect(toCatalogWorkCard({ id: 'y', measure_info: '一百三十篇', dynasty: '清', authors: [{ name: '某' }] }))
            .toEqual({ id: 'y', title: 'y', juan: '一百三十篇', authors: [{ name: '某', dynasty: '清' }] });
    });

    it('compareCatalogCards：有提要优先，再按书名', () => {
        const list = [card(1, { title: '乙' }), card(2, { title: '甲', summary: 's' }), card(3, { title: '甲' })];
        expect(list.sort(compareCatalogCards).map(c => c.id)).toEqual(['w2', 'w3', 'w1']);
    });

    it('paginationItems / catalogPageCount', () => {
        expect(paginationItems(1, 1)).toEqual([1]);
        expect(paginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
        expect(paginationItems(7, 20)).toEqual([1, null, 5, 6, 7, 8, 9, null, 20]);
        expect(paginationItems(4, 20)).toEqual([1, 2, 3, 4, 5, 6, null, 20]);
        expect(catalogPageCount(0)).toBe(1);
        expect(catalogPageCount(41)).toBe(3);
    });
});

describe('CatalogTree', () => {
    function setup(selectedId: string | null = null) {
        const onSelect = vi.fn();
        const utils = render(<CatalogTree tree={TREE} selectedId={selectedId} onSelect={onSelect} />);
        const item = (name: string) => screen.getAllByRole('treeitem').find(el => el.dataset.ctId === name)!;
        return { ...utils, onSelect, item };
    }

    it('顶层最后一个节点不管 id 是什么，都有分隔样式（网站用 unclassified）', () => {
        for (const id of ['未分類', 'unclassified']) {
            const tree: CatalogNode[] = [
                { id: '經部', label: '經部', count: 1 },
                { id, label: '未分類', count: 2 },
            ];
            const { container, unmount } = render(<CatalogTree tree={tree} selectedId={null} onSelect={vi.fn()} />);
            const last = container.querySelectorAll('.bim-ct-last');
            expect(last).toHaveLength(1);
            expect((last[0] as HTMLElement).dataset.ctId).toBe(id);
            unmount();
        }
    });

    it('初始只展开选中节点的祖先链，游走 tabindex 只有一项为 0', () => {
        const { item, container } = setup('史部/正史類');
        expect(item('史部').getAttribute('aria-expanded')).toBe('true');
        expect(item('經部').getAttribute('aria-expanded')).toBe('false');
        expect(item('史部/正史類').getAttribute('aria-selected')).toBe('true');
        const tabbable = container.querySelectorAll('[role="treeitem"][tabindex="0"]');
        expect(tabbable).toHaveLength(1);
        expect((tabbable[0] as HTMLElement).dataset.ctId).toBe('史部/正史類');
        // 未分類是最后一个顶层节点
        const top = screen.getAllByRole('treeitem').filter(el => el.getAttribute('aria-level') === '1');
        expect(top[top.length - 1].dataset.ctId).toBe(CATALOG_UNCLASSIFIED_ID);
        // 计数显示
        expect(item('史部').textContent).toContain('4');
    });

    it('无选中：「全部」行被选中且可 Tab', () => {
        const { item } = setup(null);
        expect(item(CATALOG_ALL_ID).getAttribute('aria-selected')).toBe('true');
        expect(item(CATALOG_ALL_ID).tabIndex).toBe(0);
        expect(item(CATALOG_ALL_ID).textContent).toContain(String(WORKS.length));
    });

    it('键盘：↓ 移动、→ 展开并进子级、← 回父级、Enter 选中', async () => {
        const { item, onSelect } = setup(null);
        const all = item(CATALOG_ALL_ID);
        all.focus();
        fireEvent.keyDown(all, { key: 'ArrowDown' });
        await act(() => new Promise(r => requestAnimationFrame(() => r(null))));
        expect(document.activeElement).toBe(item('經部'));
        fireEvent.keyDown(item('經部'), { key: 'ArrowDown' });
        await act(() => new Promise(r => requestAnimationFrame(() => r(null))));
        expect(document.activeElement).toBe(item('史部'));
        expect(item('史部').tabIndex).toBe(0);

        fireEvent.keyDown(item('史部'), { key: 'ArrowRight' });
        expect(item('史部').getAttribute('aria-expanded')).toBe('true');
        fireEvent.keyDown(item('史部'), { key: 'ArrowRight' });
        await act(() => new Promise(r => requestAnimationFrame(() => r(null))));
        expect(document.activeElement).toBe(item('史部/正史類'));

        fireEvent.keyDown(item('史部/正史類'), { key: 'Enter' });
        expect(onSelect).toHaveBeenLastCalledWith('史部/正史類');

        fireEvent.keyDown(item('史部/正史類'), { key: 'ArrowLeft' });
        await act(() => new Promise(r => requestAnimationFrame(() => r(null))));
        expect(document.activeElement).toBe(item('史部'));
        fireEvent.keyDown(item('史部'), { key: 'ArrowLeft' });
        expect(item('史部').getAttribute('aria-expanded')).toBe('false');

        fireEvent.keyDown(item('史部'), { key: 'End' });
        await act(() => new Promise(r => requestAnimationFrame(() => r(null))));
        expect(document.activeElement).toBe(item(CATALOG_UNCLASSIFIED_ID));
    });

    it('点击行：选中并展开；点击箭头只切换展开', () => {
        const { item, onSelect } = setup(null);
        fireEvent.click(item('子部').querySelector('.bim-ct-tw')!);
        expect(item('子部').getAttribute('aria-expanded')).toBe('true');
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.click(item('子部').querySelector('.bim-ct-tw')!);
        expect(item('子部').getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(item('經部').querySelector('.bim-ct-lb')!);
        expect(onSelect).toHaveBeenCalledWith('經部');
        expect(item('經部').getAttribute('aria-expanded')).toBe('true');
    });
});

describe('WorkCardGrid', () => {
    it('卡片是真链接，地址由 workLink 决定；卡片内容齐全', () => {
        render(
            <WorkCardGrid
                works={[card(1, {
                    title: '史記', juan: 130, authors: [{ name: '司馬遷', dynasty: '西漢' }],
                    summary: '太史公書', classification: ['史部', '正史類'],
                })]}
                workLink={id => `/item/${id}?from=catalog`}
                page={1} pageCount={1}
            />,
        );
        const a = screen.getByRole('link');
        expect(a.getAttribute('href')).toBe('/item/w1?from=catalog');
        expect(a.textContent).toContain('史記');
        expect(a.textContent).toContain('130卷');
        expect(a.textContent).toContain('西漢');
        expect(a.textContent).toContain('太史公書');
        expect(a.textContent).toContain('史部 · 正史類');
        // 卡片里不嵌套其他交互元素
        expect(a.querySelectorAll('a, button, input')).toHaveLength(0);
        // 单页不出分页
        expect(screen.queryByRole('navigation')).toBeNull();
    });

    it('分页：上一页 / 下一页 / 页码，边界禁用', () => {
        const onPage = vi.fn();
        render(<WorkCardGrid works={[card(1)]} page={1} pageCount={3} onPage={onPage} />);
        const nav = screen.getByRole('navigation', { name: '分頁' });
        expect(nav.querySelector('[aria-disabled="true"]')!.textContent).toBe('上一頁');
        expect(screen.getByRole('button', { name: '第 1 頁' }).getAttribute('aria-current')).toBe('page');
        fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
        expect(onPage).toHaveBeenLastCalledWith(2);
        fireEvent.click(screen.getByRole('button', { name: '第 3 頁' }));
        expect(onPage).toHaveBeenLastCalledWith(3);
    });

    it('给 pageHref 时分页是真链接；普通点击走 onPage，修饰键点击交给浏览器', () => {
        const onPage = vi.fn();
        render(<WorkCardGrid works={[card(1)]} page={2} pageCount={3} onPage={onPage} pageHref={p => `?page=${p}`} />);
        const next = screen.getByRole('link', { name: '下一頁' });
        expect(next.getAttribute('href')).toBe('?page=3');
        fireEvent.click(next, { ctrlKey: true });
        expect(onPage).not.toHaveBeenCalled();
        fireEvent.click(next);
        expect(onPage).toHaveBeenCalledWith(3);
    });

    it('空列表显示提示', () => {
        render(<WorkCardGrid works={[]} page={1} pageCount={1} />);
        expect(screen.getByText('此類暫無作品')).toBeTruthy();
    });
});

describe('CatalogPage', () => {
    const baseProps = {
        tree: TREE,
        selectedId: '史部/正史類',
        page: 1,
        pageCount: 2,
        works: [card(1), card(2)],
        onSelect: () => {},
        onPage: () => {},
    };

    it('卡片／列表切换：默认卡片；列表是单列行（书名·撰人·分类），切回还原；可受控', () => {
        const onViewChange = vi.fn();
        const { container } = render(<CatalogPage {...baseProps} onViewChange={onViewChange} />);
        expect(container.querySelector('.bim-ct-grid')).toBeTruthy();
        expect(screen.getByRole('button', { name: '卡片' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: '列表' }));
        expect(container.querySelector('.bim-ct-grid')).toBeNull();
        expect(container.querySelectorAll('.bim-ct-list .bim-ct-lrow')).toHaveLength(2);
        expect(container.querySelector('.bim-ct-lrow a')!.getAttribute('href')).toBe('/item/w1');
        expect(onViewChange).toHaveBeenLastCalledWith('list');
        fireEvent.click(screen.getByRole('button', { name: '卡片' }));
        expect(container.querySelector('.bim-ct-grid')).toBeTruthy();
    });

    it('view 受控时以 prop 为准', () => {
        const { container } = render(<CatalogPage {...baseProps} view="list" />);
        expect(container.querySelector('.bim-ct-list')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '卡片' }));
        expect(container.querySelector('.bim-ct-list')).toBeTruthy();
    });

    it('标题取当前节点，显示计数与上级路径；搜索插槽在网格上方', () => {
        const { container } = render(<CatalogPage {...baseProps} searchSlot={<input aria-label="總目內檢索" />} />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('正史類');
        expect(container.querySelector('.bim-ct-stat')!.textContent).toContain('共 2 種');
        expect(container.querySelector('.bim-ct-crumb')!.textContent).toBe('史部');
        const search = screen.getByRole('textbox', { name: '總目內檢索' });
        const grid = container.querySelector('.bim-ct-grid')!;
        expect(search.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(container.querySelector('main')).toBeNull();
    });

    it('未选节点：标题「全部典籍」，计数为总数', () => {
        const { container } = render(<CatalogPage {...baseProps} selectedId={null} />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('全部典籍');
        expect(container.querySelector('.bim-ct-stat')!.textContent).toContain(`共 ${WORKS.length} 種`);
    });

    it('手机抽屉：默认收起，按钮切换，选中节点后收起', () => {
        const onSelect = vi.fn();
        const { container } = render(<CatalogPage {...baseProps} onSelect={onSelect} />);
        const root = container.querySelector('.bim-ct')!;
        // 宽屏样式下按钮 display:none（jsdom 会应用 <style>），直接按类名取
        const btn = container.querySelector<HTMLButtonElement>('.bim-ct-drawer-btn')!;
        expect(btn.textContent).toBe('分類：史部 › 正史類');
        expect(root.getAttribute('data-drawer')).toBe('closed');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(btn);
        expect(root.getAttribute('data-drawer')).toBe('open');
        const jing = screen.getAllByRole('treeitem').find(el => el.dataset.ctId === '經部')!;
        fireEvent.click(jing.querySelector('.bim-ct-lb')!);
        expect(onSelect).toHaveBeenCalledWith('經部');
        expect(root.getAttribute('data-drawer')).toBe('closed');
    });

    it('SSR 首帧与客户端一致：hydrate 无报错', async () => {
        const html = renderToString(<CatalogPage {...baseProps} searchSlot={<input aria-label="q" />} />);
        expect(html).toContain('正史類');
        const el = document.createElement('div');
        el.innerHTML = html;
        document.body.appendChild(el);
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const recoverable = vi.fn();
        await act(async () => {
            hydrateRoot(el, <CatalogPage {...baseProps} searchSlot={<input aria-label="q" />} />, {
                onRecoverableError: recoverable,
            });
        });
        expect(recoverable).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
        el.remove();
    });
});

/* 对比度 ≥4.5（WCAG AA 正文）：总目用到的文字色 × 底色 */
function lum(hex: string): number {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

describe('对比度', () => {
    const fgs = ['ink', 'body-fg', 'quiet-fg', 'aux-fg', 'accent'] as const;
    const bgs = ['page-bg', 'card-bg', 'zebra-bg', 'tint-bg', 'row-hover-bg'] as const;
    for (const fg of fgs) {
        for (const bg of bgs) {
            it(`${fg} on ${bg} ≥ 4.5`, () => {
                expect(contrast(BIM_TOKENS[fg].value, BIM_TOKENS[bg].value)).toBeGreaterThanOrEqual(4.5);
            });
        }
    }
});
