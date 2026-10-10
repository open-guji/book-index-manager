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
        getLineageGraph: vi.fn(async () => null),
        // 新结构：manifest＋默认版本的 index.json；没有给 fullText 就是没有 manifest
        getTextManifest: vi.fn(async () => (fullText ? { id: main.id, versions: [{ key: 'default', kind: 'transcription', label: '全文' }] } : null) as never),
        getTextIndex: vi.fn(async () => (fullText ?? null) as never),
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
    text_count: 1,
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
    w1: { id: 'w1', type: 'work', title: '紅樓夢', _books: [{ id: 'b0' }, { id: 'b1' }, { id: 'b2' }], _edition_count: 3 },
    b0: { id: 'b0', type: 'book', title: '紅樓夢', edition: '夢覺本', dating: { year: 1784 } },
    b2: { id: 'b2', type: 'book', title: '新鐫全部繡像紅樓夢', edition: '程乙本', dating: { year: 1792 } },
};

const FULL_TEXT = {
    version_label: '程甲本',
    source: { name: '維基文庫', url: 'https://zh.wikisource.org/wiki/x', license: 'CC BY-SA 4.0' },
    chapters: Array.from({ length: 12 }, (_, i) => ({
        n: i + 1, file: String(i + 1).padStart(3, '0'),
        title: `第${'一二三四五六七八九十'[i % 10]}回　回目${i + 1}上句　回目${i + 1}下句`,
    })),
};

describe('BookPage（B1）', () => {
    it('提要卡：「版本」小字、主按钮之外只有文字链接「看原書影印」', async () => {
        render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, { readLink: () => '/read/b1' }, FULL_TEXT)} />);
        await waitFor(() => expect(document.querySelector('.bim-d-card-kind')?.textContent).toBe('版本'));
        await waitFor(() => expect(screen.getByRole('link', { name: '閱讀' })).toBeTruthy());
        expect(screen.getByRole('link', { name: '看原書影印' }).getAttribute('href')).toBe('#images');
    });

    it('text_count 出主按钮（同步、不等目录）；目录取回为空则不出回目网格，站外文本照旧', async () => {
        const readLink = (ctx: { kind: string | null }) => (ctx.kind ? '/read/b1' : null);
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, { readLink }, null)} />);
        // 首帧就有按钮（不等目录，免得提要卡晚到长高）
        expect(container.querySelector('.bim-d-btn')).toBeTruthy();
        await waitFor(() => expect(container.querySelector('.bim-d-ft')).toBeNull());
        expect(screen.getByRole('link', { name: /維基文庫/ })).toBeTruthy();
    });

    it('条目没有 text_count 就没有主按钮，也不去取 manifest', async () => {
        const noText = { ...BOOK, text_count: undefined } as unknown as IndexDetailData;
        const p = props(noText, BOOK_EXTRA, { readLink: (ctx) => (ctx.kind ? '/read/b1' : null) }, FULL_TEXT);
        const { container } = render(<BookDetailLayout {...p} />);
        await waitFor(() => expect(container.querySelector('.bim-d-card')).toBeTruthy());
        await new Promise(r => setTimeout(r, 30));
        expect(container.querySelector('.bim-d-btn')).toBeNull();
        expect((p.transport as never as { getTextManifest: ReturnType<typeof vi.fn> }).getTextManifest).not.toHaveBeenCalled();
    });

    it('正文顺序：文本 → 影印 → 版本源流', async () => {
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, {}, FULL_TEXT)} />);
        await screen.findByText(/從第一回讀起/);
        const heads = [...container.querySelectorAll('.bim-d-g-main .bim-d-sec-head h2')].map(h => h.textContent);
        expect(heads).toEqual(['文本', '影印', '版本源流']);
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

    it('站外文本进「文本」区块；影印按组列，组名只写一次，镜像收成一行', async () => {
        render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA, {}, FULL_TEXT)} />);
        const images = (await screen.findByText('程甲本原本掃描')).closest('section')!;
        expect(within(images).getAllByText('程甲本原本掃描').length).toBe(1);
        expect(within(images).getByText('鏡像')).toBeTruthy();
        expect(within(images).getByRole('link', { name: /Internet Archive/ })).toBeTruthy();
        // 维基文库不在影印区，在文本区
        expect(within(images).queryByText(/維基文庫/)).toBeNull();
        const ft = screen.getByText('站外文本').closest('section')!;
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
    contained_in: [{ id: 'c0' }],
    description: { text: LONG_DESC },
    _members: Array.from({ length: 20 }, (_, i) => ({
        id: `cw${i}`, t: 'work', title: i === 0 ? '周易口訣義' : i === 1 ? '易說' : `子目${i}`, vol: [i * 2 + 2, i * 2 + 3],
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

    it('左栏「上級叢編」：contained_in 只认对象形 {id}，旧裸字符串形不再显示', async () => {
        const legacy = { ...COLL, contained_in: ['c0'] } as unknown as IndexDetailData;
        const { container } = render(<BookDetailLayout {...props(legacy, COLL_EXTRA)} />);
        await screen.findByText('〔唐〕史徴 撰');
        expect(container.querySelector('.bim-d-up')).toBeNull();
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
    _works: [
        { work_id: 'ew1', role: '撰' }, { work_id: 'ew2', role: '撰' },
        { work_id: 'ew3', role: '撰' }, { work_id: 'ew4', role: '編' },
    ],
    external_ids: { cbdb_id: 3257, cbdb_match: 'auto', wikidata_id: 'Q9397' },
} as unknown as IndexDetailData;

const ENTITY_EXTRA = {
    ew1: { id: 'ew1', type: 'work', title: '詩集傳', _edition_count: 7, _has_image: true, _classifications: [{ scheme: 'zongmu', l1: '經部', l2: '詩類' }], juan_count: { number: 8 } },
    ew2: { id: 'ew2', type: 'work', title: '四書章句集注', _edition_count: 6 },
    ew3: { id: 'ew3', type: 'work', title: '御批資治通鑑綱目', _edition_count: 15, _classifications: [{ scheme: 'zongmu', l1: '史部' }] },
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

    it('提要卡 subtype 标签：reign／office 有专名，未知原样露出，不再误标「人物」', async () => {
        for (const [subtype, label] of [['reign', '年號'], ['office', '官職'], ['xyz', 'xyz']]) {
            const d = { ...ENTITY, subtype } as unknown as IndexDetailData;
            const { container, unmount } = render(<BookDetailLayout {...props(d, ENTITY_EXTRA)} />);
            await screen.findByText('字仲晦，號晦庵');
            const kind = (container.querySelector('.bim-d-card') as HTMLElement).textContent ?? '';
            expect(kind).toContain(label);
            expect(kind).not.toContain('人物');
            unmount();
        }
    });

    it('著作舉要：已解析行里版本最多的三种', async () => {
        const { container } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-picks[aria-busy]')).toBeNull());
        const picks = [...container.querySelectorAll('.bim-d-pick-t')].map(p => p.textContent);
        expect(picks).toEqual(['御批資治通鑑綱目', '詩集傳', '四書章句集注']);
    });

    it('著作表：部類独立一列、卷数小字、「有影印」；旁栏站外资料', async () => {
        render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        const table = (await screen.findByText('作品')).closest('table')!;
        await waitFor(() => expect(within(table).getByText('經部 詩類')).toBeTruthy());
        expect(within(table).getByRole('columnheader', { name: '部類' })).toBeTruthy();
        expect(within(table).getByText('八卷')).toBeTruthy();
        expect(within(table).getByText('有影印')).toBeTruthy();
        expect(screen.getByRole('link', { name: /CBDB/ }).getAttribute('href')).toContain('id=3257');
        expect(screen.getByRole('link', { name: /Wikidata/ }).getAttribute('href')).toContain('Q9397');
    });

    it('著作舉要独立成区，副标「存世版本最多的三部」；版本数放大；左栏本页三项', async () => {
        const { container } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-picks[aria-busy]')).toBeNull());
        const featured = container.querySelector('section#featured') as HTMLElement;
        expect(featured.querySelector('h2')?.textContent).toBe('著作舉要');
        expect(within(featured).getByText('存世版本最多的三部')).toBeTruthy();
        expect([...featured.querySelectorAll('.bim-d-pick-num')].map(n => n.textContent)).toEqual(['15', '7', '6']);
        expect(container.querySelector('section#works')).toBeTruthy();
        const nav = [...container.querySelectorAll('.bim-d-rail-nav a')].map(a => a.getAttribute('href'));
        expect(nav).toEqual(['#featured', '#works', '#external']);
    });

    it('生卒条：朝代有起讫且生卒齐全才出；无生卒则整块不出', async () => {
        const { container, unmount } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        await screen.findByText('字仲晦，號晦庵');
        expect(container.querySelector('.bim-d-life-lab')?.textContent).toContain('一生 71 年');
        unmount();
        const noLife = { ...ENTITY, birth_year: undefined, death_year: undefined } as unknown as IndexDetailData;
        const r2 = render(<BookDetailLayout {...props(noLife, ENTITY_EXTRA)} />);
        await screen.findByText('字仲晦，號晦庵');
        expect(r2.container.querySelector('.bim-d-life')).toBeNull();
    });

    it('著作四部分布：全部作品解析完才出，只列有数的部', async () => {
        const { container } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-dist')).toBeTruthy());
        const key = container.querySelector('.bim-d-dist-key')!.textContent;
        expect(key).toContain('經部 1');
        expect(key).toContain('史部 1');
        expect(key).not.toContain('子部');
    });

    it('站外资料：CBDB 自动匹配时注明未经人工核对', async () => {
        const { container } = render(<BookDetailLayout {...props(ENTITY, ENTITY_EXTRA)} />);
        await screen.findByText('字仲晦，號晦庵');
        expect(container.querySelector('.bim-d-side-note')?.textContent).toBe('CBDB 為自動匹配，未經人工核對');
    });
});

// ── Collection：v3（部类页签、数字格、册次分布，overview#286）──

const CLS_COLL = {
    id: 'cc', type: 'collection', title: '某叢書', subtype: 'book_collection',
    count: { juan: 30, ce: 12, zhong: 4, han: null },
    juan_count: { number: 30 },
    publication_info: { year: '1773-1803', details: '清武英殿木活字排印' },
    _members: [
        { id: 'k1', t: 'work', title: '易甲', vol: [1, 2, 3] }, { id: 'k2', t: 'work', title: '易乙', vol: [4, 5] },
        { id: 'k3', t: 'work', title: '史丙', vol: [6, 7, 8, 9] }, { id: 'k4', t: 'work', title: '子丁', vol: [10, 11, 12] },
    ],
} as unknown as IndexDetailData;
const CLS_EXTRA = {
    k1: { id: 'k1', type: 'work', title: '易甲', _classifications: [{ scheme: 'zongmu', l1: '經部' }] },
    k2: { id: 'k2', type: 'work', title: '易乙', _classifications: [{ scheme: 'zongmu', l1: '經部' }] },
    k3: { id: 'k3', type: 'work', title: '史丙', _classifications: [{ scheme: 'zongmu', l1: '史部' }] },
    k4: { id: 'k4', type: 'work', title: '子丁', _classifications: [{ scheme: 'zongmu', l1: '子部' }] },
};

describe('CollectionPage（v3）', () => {
    it('提要卡数字格：子目／卷／冊；不再出「年代」，「應收」只留種、函', async () => {
        const { container } = render(<BookDetailLayout {...props(CLS_COLL, CLS_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-stats')).toBeTruthy());
        expect([...container.querySelectorAll('.bim-d-stats > div')].map(d => d.textContent)).toEqual(['4子目', '30卷', '12冊']);
        const card = container.querySelector('.bim-d-card')!.textContent!;
        expect(card).toContain('清武英殿木活字排印');
        expect(card).toContain('4 種');
        expect(card).not.toContain('年代');
        expect(card).not.toMatch(/種.{0,2}12 冊/);   // 冊已在数字格，不在「應收」里重复
    });

    it('部类页签：全部子目解析完才出，带计数；点页签过滤子目', async () => {
        const { container } = render(<BookDetailLayout {...props(CLS_COLL, CLS_EXTRA)} />);
        await waitFor(() => expect(screen.getByRole('button', { name: '經部 2' })).toBeTruthy());
        expect(screen.getByRole('button', { name: '全部 4' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '史部 1' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /集部/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '史部 1' }));
        const rows = container.querySelectorAll('#titles table tbody tr');
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain('史丙');
    });

    it('册次分布条：按部类上色，点色段过滤，再点还原', async () => {
        const { container } = render(<BookDetailLayout {...props(CLS_COLL, CLS_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('.bim-d-dist-bar')).toBeTruthy());
        expect(container.querySelector('.bim-d-dist-bar')!.textContent).toBe('');
        const seg = screen.getByRole('button', { name: '只看子部' });
        fireEvent.click(seg);
        expect(container.querySelectorAll('#titles table tbody tr')).toHaveLength(1);
        expect(seg.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(seg);
        expect(container.querySelectorAll('#titles table tbody tr')).toHaveLength(4);
    });

    it('大丛编（>16 子目）进页面不自动全取：只取可见 16 条，点「按部類分組」才解析其余', async () => {
        const N = 40;
        const ids = Array.from({ length: N }, (_, i) => `b${i}`);
        const big = {
            ...CLS_COLL, id: 'big',
            _members: ids.map((id, i) => ({ id, t: 'work', title: `書${i}`, vol: [i + 1] })),
        } as unknown as IndexDetailData;
        const extra = Object.fromEntries(ids.map((id, i) => [id, {
            id, type: 'work', title: `書${i}`, _classifications: [{ scheme: 'zongmu', l1: i % 2 ? '史部' : '經部' }],
        }]));
        const tr = transportFor(big, extra, null) as { getItem: (id: string) => Promise<unknown> };
        const asked = new Set<string>();
        const orig = tr.getItem.bind(tr);
        tr.getItem = (id: string) => { asked.add(id); return orig(id); };
        const { container } = render(<BookDetailLayout {...props(big, extra, { transport: tr as never })} />);
        await waitFor(() => expect(container.querySelectorAll('#titles table tbody tr')).toHaveLength(16));
        await new Promise(r => setTimeout(r, 50));
        const initial = [...asked].filter(id => id.startsWith('b')).length;
        expect(initial, `自动请求了 ${initial} 个子目，应只取可见的 16 个`).toBeLessThanOrEqual(16);
        expect(container.querySelector('.bim-d-groupbtn')?.textContent).toBe('按部類分組');
        expect(screen.queryByRole('button', { name: /^經部/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '按部類分組' }));
        await waitFor(() => expect(screen.getByRole('button', { name: '經部 20' })).toBeTruthy());
        expect([...asked].filter(id => id.startsWith('b')).length).toBe(N);
        expect(screen.queryByRole('button', { name: '按部類分組' })).toBeNull();
    }, 20000);

    it('子目没有部类信息（或只有一类）时不出页签与分布条', async () => {
        const one = { ...CLS_EXTRA, k3: { ...CLS_EXTRA.k3, _classifications: [{ scheme: 'zongmu', l1: '經部' }] }, k4: { ...CLS_EXTRA.k4, _classifications: [{ scheme: 'zongmu', l1: '經部' }] } };
        const { container } = render(<BookDetailLayout {...props(CLS_COLL, one)} />);
        await waitFor(() => expect(container.querySelector('#titles table')).toBeTruthy());
        await waitFor(() => expect(container.querySelectorAll('.bim-d-sq').length).toBe(4));
        expect(container.querySelector('.bim-d-g-main .bim-d-tab')).toBeNull();
        expect(container.querySelector('.bim-d-dist')).toBeNull();
    });
});

// ── Book：v3（源流卡片流、标签、影印分组卡，overview#286）──

describe('BookPage（v3）', () => {
    const lineageOf = (container: HTMLElement) => container.querySelector('#lineage') as HTMLElement;

    it('版本源流·卡片流：底本卡 → 本版深色条；没有的不画（无擬構祖本、无翻刻行）', async () => {
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA)} />);
        await waitFor(() => expect(lineageOf(container).querySelector('.bim-d-lf-card')).toBeTruthy());
        const sec = lineageOf(container);
        expect(sec.querySelector('.bim-d-lf-card')!.textContent).toContain('底本');
        expect(sec.querySelector('.bim-d-lf-card')!.textContent).toContain('文字簡約');
        expect(sec.querySelector('.bim-d-lf-here')!.textContent).toContain('本版');
        expect(sec.querySelector('.bim-d-lf-here')!.textContent).toContain('清乾隆五十六年（1791）');
        expect(sec.querySelector('.bim-d-lf-dash')).toBeNull();
        expect(sec.querySelector('.bim-d-lf-out')).toBeNull();
        // 附记收成一行可展开
        expect(within(sec).getByText('清代程甲系翻刻本一覽')).toBeTruthy();
    });

    it('參校等其他关系画成虚线卡，在本版右侧；related_to 出「翻刻 · 衍生」标签行', async () => {
        const data = {
            ...BOOK,
            lineage: {
                ...(BOOK as unknown as { lineage: object }).lineage,
                derived_from: [
                    { ref: 'b0', ref_type: 'book', relation: '底本', confidence: 'consensus', evidence: '文字簡約' },
                    { ref: 'b2', ref_type: 'book', relation: '參校', confidence: 'probable', evidence: '後四十回接近' },
                    { ref: 'x', ref_type: 'reconstructed', relation: '祖本' },
                ],
                related_to: [{ book_id: 'b2', relation: '翻刻', evidence: '依程甲本翻刻' }],
            },
        } as unknown as IndexDetailData;
        const { container } = render(<BookDetailLayout {...props(data, BOOK_EXTRA)} />);
        await waitFor(() => expect(lineageOf(container).querySelector('.bim-d-lf-out')).toBeTruthy());
        const sec = lineageOf(container);
        expect(sec.querySelector('.bim-d-lf-cur .bim-d-lf-side .bim-d-lf-dash')!.textContent).toContain('參校');
        expect(sec.querySelector('.bim-d-lf-out')!.textContent).toContain('翻刻');
        // 祖本：非 book 引用只写「擬構祖本」，不造名字
        expect(sec.textContent).toContain('擬構祖本');
    });

    it('「卡片／關係圖」切换：只有作品有版本图才出，没有就没有切换', async () => {
        const a = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA)} />);
        await waitFor(() => expect(lineageOf(a.container).querySelector('.bim-d-lf-card')).toBeTruthy());
        expect(lineageOf(a.container).querySelector('.bim-d-seg')).toBeNull();
        a.unmount();

        const base = props(BOOK, BOOK_EXTRA);
        const graph = { nodes: [{ id: 'b0', kind: 'book', label: '夢覺本' }, { id: 'b1', kind: 'book', label: '程甲本' }], edges: [] };
        const withGraph = { ...base, transport: { ...(base.transport as object), getLineageGraph: async () => graph } } as never;
        const b = render(<BookDetailLayout {...(withGraph as BookDetailLayoutProps)} />);
        const seg = await waitFor(() => {
            const el = lineageOf(b.container).querySelector('.bim-d-seg');
            expect(el).toBeTruthy();
            return el as HTMLElement;
        });
        expect(within(seg).getByRole('button', { name: '卡片' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(within(seg).getByRole('button', { name: '關係圖' }));
        expect(lineageOf(b.container).querySelector('.bim-d-lf')).toBeNull();
        fireEvent.click(within(seg).getByRole('button', { name: '卡片' }));
        expect(lineageOf(b.container).querySelector('.bim-d-lf')).toBeTruthy();
    });

    it('提要卡：版本类型／年代／卷帙是三个标签；同作品版本带时间轴点', async () => {
        const { container } = render(<BookDetailLayout {...props(BOOK, BOOK_EXTRA)} />);
        await waitFor(() => expect(container.querySelectorAll('.bim-d-card .bim-d-tag').length).toBeGreaterThanOrEqual(2));
        expect(container.querySelector('.bim-d-card .bim-d-tag-0')).toBeTruthy();
        await waitFor(() => expect(container.querySelector('#siblings')).toBeTruthy());
        expect(container.querySelector('#siblings')!.className).toContain('bim-d-side-tl');
    });

    it('影印行：只有结构化标记才出标签（metadata.fragment、color_mode），说明文字里写的不拆', async () => {
        const data = {
            ...BOOK,
            resources: [
                { id: 'a', name: '書格', url: 'https://x/a', types: ['image'], group: 'g1', group_role: 'origin', metadata: { fragment: true }, color_mode: 'color' },
                { id: 'b', name: '國圖', url: 'https://x/b', types: ['image'], group: 'g1', group_role: 'origin', details: '黑白掃描，有水印' },
            ],
        } as unknown as IndexDetailData;
        const { container } = render(<BookDetailLayout {...props(data, BOOK_EXTRA)} />);
        await waitFor(() => expect(container.querySelector('#images')).toBeTruthy());
        const rows = container.querySelectorAll('#images .bim-d-zt tbody tr');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelectorAll('.bim-d-tag')).toHaveLength(2);
        expect(rows[0].textContent).toContain('殘片');
        expect(rows[0].textContent).toContain('彩色');
        expect(rows[1].querySelector('.bim-d-tag')).toBeNull();
    });
});

