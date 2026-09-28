/**
 * B1（2026-09-28，overview#251）：Book / Collection / Entity 三类详情页新设计。
 *
 * 用户在样张上定的几条都有断言：
 * - Book 正文顺序「全文 → 影印 → 源流」，放版本源流；
 * - Collection、Entity 不放主按钮；Collection 长说明留在提要卡里截断；子目表不出部类；
 * - Entity 别名折叠（提要卡只露字、號）。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { BookDetailLayoutProps } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';

function transportFor(main: IndexDetailData, extra: Record<string, unknown> = {}, fullText: unknown = null) {
    const all: Record<string, unknown> = { [main.id]: main, ...extra };
    return {
        getItem: vi.fn(async (id: string) => (all[id] ?? null) as Record<string, unknown> | null),
        getEntry: vi.fn(async () => null),
        getCollatedEditionIndex: vi.fn(async () => null),
        getLineageGraph: vi.fn(async () => null),
        getWorkFullTextList: vi.fn(async () => []),
        getBookFullTextIndex: vi.fn(async () => fullText),
    };
}

function props(
    data: IndexDetailData,
    extra: Record<string, unknown> = {},
    over: Partial<BookDetailLayoutProps> = {},
    fullText: unknown = null,
): BookDetailLayoutProps {
    return {
        id: data.id,
        transport: transportFor(data, extra, fullText) as never,
        initialDetail: data,
        activeTab: 'basic',
        onTabChange: () => {},
        ...over,
    };
}

// ── Book ──

const BOOK: IndexDetailData = {
    id: 'b1', type: 'book', title: '新鐫全部繡像紅樓夢', edition: '程甲本', work_id: 'w1',
    has_full_text: true,
    authors: [{ name: '曹霑', role: '撰', dynasty: '清' }],
    publication_info: { year: '1791', details: '清乾隆五十六年辛亥萃文書屋木活字本' },
    resources: [
        { id: 'ws', name: '維基文庫', url: 'https://zh.wikisource.org/wiki/x', types: ['text'], details: '120 回完整本' },
        { id: 'nlc', name: '中華古籍資源庫', url: 'http://read.nlc.cn/x', types: ['image'], group: 'g1', group_role: 'origin' },
        { id: 'ia', name: 'Internet Archive', url: 'https://archive.org/details/x', types: ['image'], group: 'g1', group_role: 'mirror' },
        { id: 'bd', name: '百度网盘', url: 'https://pan.baidu.com/s/x', types: ['image'], group: 'g1', group_role: 'mirror' },
    ],
    resource_groups: { g1: { label: '程甲本原本掃描', description: '國圖全本黑白。' } },
    lineage: {
        year: 1791, year_text: '清乾隆五十六年（1791）', category: '刻本', status: 'extant',
        derived_from: [{ ref: 'b0', ref_type: 'book', relation: '底本', confidence: 'consensus', evidence: '文字簡約' }],
    },
    base_edition: [{ role: '底本', book_id: 'b0', name: '夢覺本' }],
    appendix: [{ title: '清代程甲系翻刻本一覽', text: '- 本衙藏板本' }],
} as unknown as IndexDetailData;

const BOOK_EXTRA = {
    w1: { id: 'w1', type: 'work', title: '紅樓夢', books: ['b0', 'b1', 'b2'], _edition_count: 3 },
    b0: { id: 'b0', type: 'book', title: '紅樓夢', edition: '夢覺本', dating: { year: 1784 } },
    b2: { id: 'b2', type: 'book', title: '新鐫全部繡像紅樓夢', edition: '程乙本', dating: { year: 1792 } },
};

const FULL_TEXT = {
    book_id: 'b1', version_label: '程甲本', total_chapters: 12,
    source: { name: '維基文庫', url: 'https://zh.wikisource.org/wiki/x', license: 'CC BY-SA 4.0' },
    chapters: Array.from({ length: 12 }, (_, i) => ({
        n: i + 1, file: `${String(i + 1).padStart(3, '0')}.md`,
        title: `第${'一二三四五六七八九十'[i % 10]}回　回目${i + 1}上句　回目${i + 1}下句`,
    })),
};

describe('BookPage（B1）', () => {
    it('提要卡：「版本」小字、主按钮之外只有文字链接「看原書影印」', async () => {
        render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, { readLink: () => '/read/b1' }, FULL_TEXT)} />);
        await waitFor(() => expect(document.querySelector('.bim-d-card-kind')?.textContent).toBe('版本'));
        await waitFor(() => expect(screen.getByRole('link', { name: '閱讀全文' })).toBeTruthy());
        expect(screen.getByRole('link', { name: '看原書影印' }).getAttribute('href')).toBe('#images');
    });

    it('has_full_text 先出主按钮占位；目录取回为空就收回，全文区块只剩站外全文', async () => {
        const readLink = (ctx: { kind: string | null }) => (ctx.kind ? '/read/b1' : null);
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, { readLink }, null)} />);
        // 首帧就有按钮（不等目录，免得提要卡晚到长高）
        expect(container.querySelector('.bim-d-btn')).toBeTruthy();
        await waitFor(() => expect(container.querySelector('.bim-d-btn')).toBeNull());
        expect(container.querySelector('.bim-d-ft')).toBeNull();
        expect(screen.getByRole('link', { name: /維基文庫/ })).toBeTruthy();
    });

    it('正文顺序：全文 → 影印 → 版本源流', async () => {
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, {}, FULL_TEXT)} />);
        await screen.findByText(/從第一回讀起/);
        const heads = [...container.querySelectorAll('.bim-d-g-main .bim-d-sec-head h2')].map(h => h.textContent);
        expect(heads).toEqual(['全文', '影印', '版本源流']);
    });

    it('回目逐回带 juan 取宿主链接；先露 9 回，其余可展开', async () => {
        const readLink = vi.fn((ctx: { kind: string | null; juan?: string }) =>
            ctx.kind ? `/read/b1${ctx.juan ? `?juan=${ctx.juan}` : ''}` : null);
        render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, { readLink }, FULL_TEXT)} />);
        const go = await screen.findByRole('link', { name: /進入閱讀頁/ });
        expect(go.getAttribute('href')).toBe('/read/b1?juan=001');
        const chap = document.querySelector('.bim-d-chap')!;
        expect(chap.querySelectorAll('a').length).toBe(9);
        expect(within(chap as HTMLElement).getAllByRole('link')[1].getAttribute('href')).toBe('/read/b1?juan=002');
        fireEvent.click(screen.getByRole('button', { name: '展開其餘 3 回' }));
        expect(chap.querySelectorAll('a').length).toBe(12);
    });

    it('站外全文进「全文」区块；影印按组列，组名只写一次，镜像收成一行', async () => {
        render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, {}, FULL_TEXT)} />);
        const images = (await screen.findByText('程甲本原本掃描')).closest('section')!;
        expect(within(images).getAllByText('程甲本原本掃描').length).toBe(1);
        expect(within(images).getByText('鏡像')).toBeTruthy();
        expect(within(images).getByRole('link', { name: /Internet Archive/ })).toBeTruthy();
        // 维基文库不在影印区，在全文区
        expect(within(images).queryByText(/維基文庫/)).toBeNull();
        const ft = screen.getByText('站外全文').closest('section')!;
        expect(within(ft).getByRole('link', { name: /維基文庫/ })).toBeTruthy();
    });

    it('版本源流：底本（用 base_edition 的名字）→ 本版 → 附记可展开', async () => {
        render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, {}, FULL_TEXT)} />);
        const sec = (await screen.findByRole('heading', { name: '版本源流' })).closest('section')!;
        expect(within(sec).getByText('底本')).toBeTruthy();
        expect(within(sec).getByText('夢覺本')).toBeTruthy();
        expect(within(sec).getByText(/文字簡約/)).toBeTruthy();
        expect(within(sec).getByText('本版')).toBeTruthy();
        expect(within(sec).getByText('清代程甲系翻刻本一覽')).toBeTruthy();
    });

    it('左栏「所屬作品」；同作品版本按年代排、本页高亮', async () => {
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, {}, FULL_TEXT)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-up')?.textContent).toContain('紅樓夢'));
        await waitFor(() => expect(container.querySelector('#siblings li[aria-current="page"]')).toBeTruthy());
        const items = [...container.querySelectorAll('#siblings li')].map(li => li.textContent);
        expect(items[0]).toContain('夢覺本');
        expect(items[1]).toContain('程甲本');
        expect(items[1]).toContain('本頁');
        expect(items[2]).toContain('程乙本');
    });
});

// ── Collection ──

const LONG_DESC = '清乾隆三十八年詔開四庫館，自《永樂大典》及各家藏本輯得世所罕傳之書，擇要交武英殿排印。'.repeat(4);

const COLL: IndexDetailData = {
    id: 'c1', type: 'collection', title: '武英殿聚珍版叢書', subtype: 'book_collection',
    contained_in: ['c0'],
    description: { text: LONG_DESC },
    contained_works: Array.from({ length: 20 }, (_, i) => ({
        id: `cw${i}`, title: i === 0 ? '周易口訣義' : i === 1 ? '易說' : `子目${i}`, volume_index: [i * 2 + 2, i * 2 + 3],
    })),
    resources: [{ id: 'wm', name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/Category:x', types: ['image'] }],
    _member_count: 40,
} as unknown as IndexDetailData;

const COLL_EXTRA = {
    c0: { id: 'c0', type: 'collection', title: '武英殿刻書' },
    cw0: { id: 'cw0', type: 'work', title: '周易口訣義', authors: [{ name: '史徴', dynasty: '唐', role: '撰' }], juan_count: { number: 6 }, _edition_count: 4 },
};

describe('CollectionPage（B1）', () => {
    it('没有主按钮；「叢編」小字；长说明截断可展开', async () => {
        const { container } = render(<BookDetailLayout {...props(COLL, COLL_EXTRA, { readLink: () => '/read/c1' })} />);
        await waitFor(() => expect(container.querySelector('.bim-d-card-kind')?.textContent).toBe('叢編'));
        expect(container.querySelector('.bim-d-btn')).toBeNull();
        const desc = container.querySelector('.bim-d-card-desc')!;
        expect(desc.className).toContain('bim-d-clamp');
        fireEvent.click(screen.getByRole('button', { name: '展開' }));
        expect(desc.className).not.toContain('bim-d-clamp');
    });

    it('左栏「上級叢編」；子目行补出撰人、卷数、版本数；不出部类', async () => {
        const { container } = render(<BookDetailLayout {...props(COLL, COLL_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-up')?.textContent).toContain('武英殿刻書'));
        await screen.findByText('〔唐〕史徴 撰');
        expect(screen.getByText('4 種')).toBeTruthy();
        expect(screen.queryByText('部類')).toBeNull();
        expect(container.querySelector('.bim-d-g-main .bim-d-tab')).toBeNull();
    });

    it('本丛编内检索：按书名过滤', async () => {
        render(<BookDetailLayout {...props(COLL, COLL_EXTRA)} />);
        const input = await screen.findByRole('searchbox', { name: '在本叢編中檢索' });
        fireEvent.change(input, { target: { value: '易說' } });
        const table = document.querySelector('#titles table')!;
        expect(table.querySelectorAll('tbody tr').length).toBe(1);
        expect(table.textContent).toContain('易說');
    });
});

// ── Entity ──

const ENTITY: IndexDetailData = {
    id: 'e1', type: 'entity', subtype: 'people', primary_name: '朱熹', title: '朱熹',
    dynasty: '南宋', birth_year: 1130, death_year: 1200, native_place: '建州',
    alt_names: [
        { name: '仲晦', type: '字' }, { name: '元晦', type: '字' },
        { name: '晦庵', type: '號' }, { name: '文公', type: '諡號' }, { name: '沈郎', type: '小名' },
    ],
    works: [
        { work_id: 'ew1', role: '撰' }, { work_id: 'ew2', role: '撰' },
        { work_id: 'ew3', role: '撰' }, { work_id: 'ew4', role: '編' },
    ],
    external_ids: { cbdb_id: 3257, cbdb_match: 'auto', wikidata_id: 'Q9397' },
} as unknown as IndexDetailData;

const ENTITY_EXTRA = {
    ew1: { id: 'ew1', type: 'work', title: '詩集傳', _edition_count: 7, has_image: true, classification: { l1: '經部', l2: '詩類' }, juan_count: { number: 8 } },
    ew2: { id: 'ew2', type: 'work', title: '四書章句集注', _edition_count: 6 },
    ew3: { id: 'ew3', type: 'work', title: '御批資治通鑑綱目', _edition_count: 15, classification: { l1: '史部' } },
    ew4: { id: 'ew4', type: 'work', title: '伊洛淵源錄', _edition_count: 0 },
};

describe('EntityPage（B1）', () => {
    it('提要卡：「人物」小字、「字某，號某」、籍贯；只露字與號，其余收进「更多別名」；没有主按钮', async () => {
        const { container } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        expect(await screen.findByText('字仲晦，號晦庵')).toBeTruthy();
        expect(screen.getByText('建州人')).toBeTruthy();
        const card = container.querySelector('.bim-d-card') as HTMLElement;
        const more = card.querySelector('details.bim-d-more-names') as HTMLDetailsElement;
        expect(more).toBeTruthy();
        expect(more.open).toBe(false);
        expect(within(more).getByText('更多別名（2）')).toBeTruthy();
        expect(within(more).getByText('文公')).toBeTruthy();
        expect(container.querySelector('.bim-d-btn')).toBeNull();
    });

    it('著作舉要：已解析行里版本最多的三种', async () => {
        const { container } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-picks[aria-busy]')).toBeNull());
        const picks = [...container.querySelectorAll('.bim-d-pick-t')].map(p => p.textContent);
        expect(picks).toEqual(['御批資治通鑑綱目', '詩集傳', '四書章句集注']);
    });

    it('著作表：部类·卷数小字、「有影印」；旁栏站外资料', async () => {
        render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        const table = (await screen.findByText('作品')).closest('table')!;
        await waitFor(() => expect(within(table).getByText('經部 詩類')).toBeTruthy());
        expect(within(table).getByText('有影印')).toBeTruthy();
        expect(screen.getByRole('link', { name: /CBDB/ }).getAttribute('href')).toContain('id=3257');
        expect(screen.getByRole('link', { name: /Wikidata/ }).getAttribute('href')).toContain('Q9397');
    });
});
