/**
 * N3a（2026-09-28）：条目页三栏版——Work / Book / Collection / Entity 四种详情组件。
 *
 * 覆盖：新数据字段（classification、_edition_count、_member_count、todo、review）
 * 有值才出现；整页只有一个主按钮「阅读全文」且链到宿主给的 readLink；
 * 谱系 / 考证 / 反馈三个 tab 不再有入口；版本表的年代页签与「只看有影印」复选框；
 * 著录分栏切换；辅助字对比度 ≥ 4.5。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { BookDetailLayoutProps } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';
import { BIM_TOKENS } from '../../src/styles/tokens';

const WORK: IndexDetailData = {
    id: 'w1', type: 'work', title: '史記',
    authors: [{ name: '司馬遷', role: 'author', dynasty: '西漢', entity_id: 'e1' }],
    description: { text: '紀傳體通史。' },
    juan_count: { number: 130 },
    loss_status: 'extant',
    classification: { l1: '史部', l2: '正史類', l3: '', l4: '', basis: 'S', source: '欽定四庫全書總目' },
    _edition_count: 3,
    books: ['b1', 'b2', 'b3'],
    indexed_by: [
        { source: '漢書藝文志', title_info: '太史公百三十篇', summary: '十篇有錄無書。' },
        { source: '隋書經籍志', title_info: '史記一百三十卷', summary: '目錄一卷。' },
    ],
    emendated_by: [{ source: '漢志考證' }],
    related_works: [
        { id: 'c9', title: '二十四史', relation: 'collected_in' },
        { id: 'w2', title: '史記索隱', relation: 'studied_by' },
    ],
    todo: [{ what: '核對卷數', by: '目錄總管' }],
    review: { status: 'reviewed', by: '甲', date: '2026-09-28' },
    revision: '1.0.3',
} as unknown as IndexDetailData;

const BOOKS: Record<string, Record<string, unknown>> = {
    b1: {
        id: 'b1', type: 'book', title: '史記', edition: '宋建安黃善夫家塾刻本',
        resources: [{ name: '維基共享', url: 'https://commons.wikimedia.org/wiki/File:a.pdf', types: ['image'] }],
    },
    b2: { id: 'b2', type: 'book', title: '史記', edition: '明嘉靖四年汪諒刊本' },
    b3: { id: 'b3', type: 'book', title: '史記', edition: '清乾隆武英殿本' },
};

function transportFor(main: IndexDetailData, extra: Record<string, Record<string, unknown>> = {}) {
    const all: Record<string, unknown> = { [main.id]: main, ...extra };
    return {
        getItem: vi.fn(async (id: string) => (all[id] ?? null) as Record<string, unknown> | null),
        getEntry: vi.fn(async () => null),
        getCollatedEditionIndex: vi.fn(async () => null),
        getLineageGraph: vi.fn(async () => null),
        getWorkFullTextList: vi.fn(async () => []),
        getBookFullTextIndex: vi.fn(async () => null),
    };
}

function props(data: IndexDetailData, over: Partial<BookDetailLayoutProps> = {}, extra = BOOKS): BookDetailLayoutProps {
    return {
        id: data.id,
        transport: transportFor(data, extra) as never,
        initialDetail: data,
        activeTab: 'basic',
        onTabChange: () => {},
        ...over,
    };
}

describe('WorkPage（三栏）', () => {
    it('提要卡：分类、版本数、存佚、著录与考证计数、审核状态、待核', async () => {
        render(<BookDetailLayout {...props(WORK)} />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('史記');
        expect(screen.getByText('史部')).toBeTruthy();
        expect(screen.getByText('正史類')).toBeTruthy();
        expect(screen.getByText('據《欽定四庫全書總目》')).toBeTruthy();
        expect(screen.getByText('今存')).toBeTruthy();
        expect(screen.getByText(/考證 1 條/)).toBeTruthy();
        expect(screen.getByText(/已審核 甲 2026-09-28/)).toBeTruthy();
        expect(screen.getByText('待核 1 項')).toBeTruthy();
        expect(screen.getByText(/數據版本 1\.0\.3/)).toBeTruthy();
        // _edition_count 优先于 books 长度
        const dl = document.querySelector('.bim-d-card dl')!;
        expect(within(dl as HTMLElement).getByText(/^3/)).toBeTruthy();
    });

    it('没有 classification / todo / review 就不显示', () => {
        const bare = { ...WORK, classification: undefined, todo: undefined, review: undefined, revision: undefined } as IndexDetailData;
        render(<BookDetailLayout {...props(bare)} />);
        expect(screen.queryByText('史部')).toBeNull();
        expect(screen.queryByText(/待核/)).toBeNull();
        expect(screen.queryByText(/已審核/)).toBeNull();
        expect(document.querySelector('.bim-d-card-foot')?.textContent ?? '').toBe('');
    });

    it('review.status 是原始英文状态字（draft）时卡底不露出，草稿显示中文', () => {
        const raw = { ...WORK, review: { status: 'draft' }, revision: undefined } as unknown as IndexDetailData;
        render(<BookDetailLayout {...props(raw)} />);
        expect(document.body.textContent).not.toMatch(/\bdraft\b/);
    });

    it('「阅读全文」是整页唯一的主按钮，链到宿主给的 readLink', () => {
        const readLink = vi.fn(() => '/read/w1');
        render(<BookDetailLayout {...props(WORK, { readLink })} />);
        const btns = document.querySelectorAll('.bim-d-btn');
        expect(btns).toHaveLength(1);
        expect(btns[0].tagName).toBe('A');
        expect(btns[0].getAttribute('href')).toBe('/read/w1');
        expect(btns[0].textContent).toBe('閱讀全文');
        expect(readLink).toHaveBeenCalledWith(expect.objectContaining({ kind: null }));
    });

    it('readLink 返回 null：不出按钮；不传 readLink 且无整理本/全文：也不出', () => {
        const { unmount } = render(<BookDetailLayout {...props(WORK, { readLink: () => null })} />);
        expect(document.querySelector('.bim-d-btn')).toBeNull();
        unmount();
        render(<BookDetailLayout {...props(WORK)} />);
        expect(document.querySelector('.bim-d-btn')).toBeNull();
    });

    it('谱系、考证、反馈不再有入口', () => {
        render(<BookDetailLayout {...props(WORK, { showFeedbackTab: true })} />);
        expect(screen.queryByText(/版本傳承|版本谱系|版本譜系/)).toBeNull();
        expect(screen.queryByRole('button', { name: /反饋|勘誤|提交新版本/ })).toBeNull();
        expect(screen.queryByRole('heading', { name: '考證' })).toBeNull();
    });

    it('版本表：年代页签与「只看有影印」复选框筛选行', async () => {
        render(<BookDetailLayout {...props(WORK)} />);
        await waitFor(() => expect(screen.getByText('宋建安黃善夫家塾刻本')).toBeTruthy());
        const table = document.querySelector('#versions table')!;
        expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
        // 按年代排：宋 → 明 → 清
        const names = [...table.querySelectorAll('tbody tr td:first-child a')].map(a => a.textContent);
        expect(names).toEqual(['宋建安黃善夫家塾刻本', '明嘉靖四年汪諒刊本', '清乾隆武英殿本']);
        // 只有「有影印」是色块
        expect(table.querySelectorAll('.bim-d-flag')).toHaveLength(1);

        fireEvent.click(screen.getByRole('checkbox', { name: '只看有影印' }));
        expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
        fireEvent.click(screen.getByRole('checkbox', { name: '只看有影印' }));

        fireEvent.click(screen.getByRole('button', { name: '明' }));
        expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
        expect(table.textContent).toContain('汪諒');
    });

    it('著录分栏：点左列书目换右侧原文', () => {
        render(<BookDetailLayout {...props(WORK)} />);
        expect(screen.getByText('十篇有錄無書。')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: '隋書經籍志' }));
        expect(screen.getByText('目錄一卷。')).toBeTruthy();
        expect(screen.queryByText('十篇有錄無書。')).toBeNull();
        // 原文用宋体类
        expect(screen.getByText('目錄一卷。').closest('.bim-d-quote')).toBeTruthy();
    });

    it('旁栏：收入丛编与相关书目（关系类型是浅色小字）', () => {
        render(<BookDetailLayout {...props(WORK)} />);
        const collected = document.getElementById('collected')!;
        expect(collected.textContent).toContain('二十四史');
        const related = document.getElementById('related')!;
        expect(related.textContent).toContain('史記索隱');
        expect(within(related).getByText('研究').className).toContain('bim-d-meta');
    });

    it('概览页顶条与页脚的辅助字走 --bim-aux-fg（不再用 label-fg）', () => {
        render(<BookDetailLayout {...props(WORK)} />);
        const top = document.querySelector('.bim-d-top') as HTMLElement;
        const foot = document.querySelector('footer') as HTMLElement;
        expect(top.style.color).toContain('--bim-aux-fg');
        expect(foot.style.color).toContain('--bim-aux-fg');
    });

        it('宿主的 railTop 渲染在左栏', () => {
        render(<BookDetailLayout {...props(WORK, { railTop: <input aria-label="站內檢索" /> })} />);
        expect(screen.getByLabelText('站內檢索').closest('.bim-d-g-rail')).toBeTruthy();
    });
});

describe('左栏「更多」：extraTabs 与丛编目录的入口', () => {
    it('宿主注入的 extraTabs 在概览页有入口，点了切 tab', () => {
        const onTabChange = vi.fn();
        render(<BookDetailLayout {...props(WORK, {
            onTabChange,
            extraTabs: [{ key: 'digital', label: '數字化', shouldShow: () => true, render: () => null }],
        })} />);
        const link = screen.getByRole('link', { name: /數字化/ });
        expect(link.closest('.bim-d-g-rail')).toBeTruthy();
        fireEvent.click(link);
        expect(onTabChange).toHaveBeenCalledWith('digital');
    });

    it('shouldShow 为假的 extraTab 不出入口', () => {
        render(<BookDetailLayout {...props(WORK, {
            extraTabs: [{ key: 'digital', label: '數字化', shouldShow: () => false, render: () => null }],
        })} />);
        expect(screen.queryByRole('link', { name: /數字化/ })).toBeNull();
    });

    it('丛编有多份目录：每份都有入口', async () => {
        const coll = { id: 'c2', type: 'collection', title: '某叢書', books: ['b1'] } as unknown as IndexDetailData;
        const tr = transportFor(coll, BOOKS) as Record<string, unknown>;
        tr.getCollectionCatalogs = vi.fn(async () => [
            { resource_id: 'r1', short_name: '甲本', data: { volumes: [] } },
            { resource_id: 'r2', short_name: '乙本', data: { volumes: [] } },
        ]);
        const onTabChange = vi.fn();
        render(<BookDetailLayout id="c2" transport={tr as never} initialDetail={coll}
            activeTab="basic" onTabChange={onTabChange} />);
        const second = await screen.findByRole('link', { name: /乙本/ });
        expect(screen.getByRole('link', { name: /甲本/ })).toBeTruthy();
        fireEvent.click(second);
        expect(onTabChange).toHaveBeenCalledWith('catalog:r2');
    });
});

describe('BookPage / CollectionPage / EntityPage（三栏）', () => {
    it('Book：书名作标题、版本名作副题，有全文时出「阅读全文」', async () => {
        const book = {
            id: 'b9', type: 'book', title: '測試書', edition: '明刻本',
            has_full_text: true,
            resources: [{ name: '某館', types: ['physical'] }],
        } as unknown as IndexDetailData;
        const tr = transportFor(book);
        tr.getBookFullTextIndex = vi.fn(async () => ({ total_chapters: 2, version_label: 'x', chapters: [{ n: 1, file: '1.md' }] })) as never;
        const onTabChange = vi.fn();
        render(<BookDetailLayout id="b9" transport={tr as never} initialDetail={book}
            activeTab="basic" onTabChange={onTabChange} />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('測試書');
        expect(screen.getByText('明刻本', { selector: '.bim-d-card-sub' })).toBeTruthy();
        const btn = await screen.findByRole('button', { name: '閱讀全文' });
        fireEvent.click(btn);
        expect(onTabChange).toHaveBeenCalledWith('fulltext');
    });

    it('Collection：_member_count 作种数；只有 books[] 时为可见行补取书名', async () => {
        const coll = {
            id: 'c1', type: 'collection', title: '二十四史武英殿本', subtype: 'book_collection',
            books: ['b1', 'b2'], _member_count: 25,
        } as unknown as IndexDetailData;
        render(<BookDetailLayout {...props(coll)} />);
        expect(screen.getByText('25 部')).toBeTruthy();
        await waitFor(() => expect(screen.getAllByText('史記').length).toBeGreaterThan(0));
        expect(screen.queryByText('b1')).toBeNull();
    });

    it('Entity：别名分类进提要卡，著作表按职任页签筛选', async () => {
        const ent = {
            id: 'e1', type: 'entity', subtype: 'people', title: '孔子', primary_name: '孔子',
            dynasty: '春秋', birth_year: -551, death_year: -479,
            alt_names: [{ name: '仲尼', type: '字' }],
            works: [{ work_id: 'w1', role: '撰' }, { work_id: 'w2', role: '校' }],
        } as unknown as IndexDetailData;
        render(<BookDetailLayout {...props(ent, {}, { w1: WORK as never, w2: { id: 'w2', type: 'work', title: '尚書' } })} />);
        expect(screen.getByText('仲尼')).toBeTruthy();
        expect(screen.getAllByText('前551—前479').length).toBeGreaterThan(0);
        await waitFor(() => expect(screen.getByText('尚書')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /^撰/ }));
        expect(screen.queryByText('尚書')).toBeNull();
    });
});

describe('辅助字对比度（Q5）', () => {
    function lum(hex: string): number {
        const h = hex.replace('#', '');
        const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function ratio(a: string, b: string): number {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
    }

    it.each(['aux-fg', 'label-fg', 'hint-fg', 'meta-fg'] as const)('--bim-%s 在纸底、斑马底、现网纸色上 ≥ 4.5', (name) => {
        const fg = BIM_TOKENS[name].value;
        for (const bg of [BIM_TOKENS['page-bg'].value, BIM_TOKENS['zebra-bg'].value, BIM_TOKENS['card-bg'].value, '#faf7f2']) {
            expect(ratio(fg, bg), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
    });
});
