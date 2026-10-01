/**
 * 元数据首页组件（overview#322 C 块）。
 * 样例数据 fixtures/meta-sections.json 按网站 build-meta-home.mjs 的输出格式，数字取自设计稿（元数据首页.html，R8 10-01）。
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
    MetaHomeView, MetaCatalogTable, MetaCollectionGroups, MetaRelatedCatalogs, MetaPeopleTimeline, MetaOnlineSites, MetaDataLicense, MetaRecentPanel,
    META_HOME_CSS, pct, timelineLayout, yearText,
} from '../../src/components/meta-home';
import type { MetaHomeSections } from '../../src/components/meta-home';
import { RECENT_IDS_STORAGE_KEY } from '../../src/core/recent';
import SECTIONS from './fixtures/meta-sections.json';

const S = SECTIONS as unknown as MetaHomeSections;
const EMPTY: MetaHomeSections = {
    counts: { works: 0, books: 0, collections: 0, entities: 0 },
    shelf: null, related_catalogs: [], catalog_progress: [], bu: [], unclassified: 0, collection_groups: [],
    bibliographers: [], lineage: [], sites: [],
    stats: { works: 0, books: 0, collections: 0, entities: 0, has_image: 0, has_text: 0, article: 0, poem: 0, loss: { extant: 0, partially_extant: 0, lost: 0, unknown: 0 } },
};
const LINKS = {
    item: (id: string) => `/book-index/${id}`,
    node: (id: string) => `/catalog?node=${id}`,
    type: (t: string) => `/book-index?type=${t}`,
    loss: (k: string) => `/book-index?loss=${k}`,
};

describe('model', () => {
    it('pct：取整、夹在 0–100，分母 0 为 0', () => {
        expect(pct(549, 621)).toBe(88);
        expect(pct(5, 0)).toBe(0);
        expect(pct(12, 10)).toBe(100);
    });
    it('timelineLayout：有年份的按年份成比例，缺一端补 50 年，都缺的放 missing', () => {
        const r = timelineLayout(S.bibliographers);
        expect(r.min).toBe(-77);
        expect(r.max).toBe(1805);
        expect(r.missing.map((p) => p.name)).toEqual(['班固']);
        expect(r.placed[0].p.name).toBe('劉向');
        expect(r.placed[0].left).toBe(0);
        const chen = r.placed.find((x) => x.p.name === '陳振孫')!;
        expect(chen.to - chen.from).toBe(50);
        expect(timelineLayout([{ id: 'x', name: '甲' }]).placed).toEqual([]);
    });
    it('yearText：公元前写「前N」', () => {
        expect(yearText(-77)).toBe('前77');
        expect(yearText(1007)).toBe('1007');
    });
});

describe('MetaHomeView', () => {
    it('分区齐全：分区导航 7 项，书架进作品页、书脊标著录条目数', () => {
        render(<MetaHomeView sections={S} links={LINKS} />);
        const nav = screen.getByRole('navigation', { name: '元數據首頁分區' });
        expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(
            ['#zhi', '#sibu', '#cong', '#people', '#lineage', '#sites', '#data'],
        );
        const spine = screen.getByRole('link', { name: /^漢書藝文志，正史原志，著錄 621 條/ });
        expect(spine.getAttribute('href')).toBe('/book-index/d59f23o7ygw2');
        expect(screen.getByText('脊下數字＝著錄條目')).toBeTruthy();
        expect(screen.getByText('點書脊進作品頁')).toBeTruthy();
        expect(screen.queryByRole('heading', { level: 3, name: /歷代史志/ })).toBeNull();
        // 四部链到总目节点，未分类的说明换成元数据首页的
        expect(screen.getByRole('link', { name: /^經部13,065/ }).getAttribute('href')).toBe('/catalog?node=jing');
        expect(screen.getByText('多為只見於史志著錄、尚未歸類的書')).toBeTruthy();
    });
    it('页面上不出现「整理本」「全文」，不出大小标题', () => {
        const html = renderToString(<MetaHomeView sections={S} links={LINKS} />);
        expect(html).not.toMatch(/整理本|全文/);
        expect(html).not.toMatch(/<h1/);
    });
    it('没有数据的分区整块不出，只剩数据与授权；没有 transport 不出最近浏览', () => {
        render(<MetaHomeView sections={EMPTY} links={LINKS} />);
        expect(screen.queryByRole('navigation', { name: '元數據首頁分區' })).toBeNull();
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['數據與授權']);
        expect(screen.queryByText('最近瀏覽')).toBeNull();
    });
    it('页首类型签：给 links.type 才出，带条目数', () => {
        render(<MetaHomeView sections={S} links={LINKS} head={<form role="search" />} />);
        const types = screen.getByRole('list', { name: '按類型檢索' });
        expect(within(types).getAllByRole('link').map((a) => a.textContent)).toEqual(['全部', '作品95,055', '版本20,899', '叢編84', '人物30,994']);
        expect(within(types).getByRole('link', { name: /版本/ }).getAttribute('href')).toBe('/book-index?type=book');
    });
    it('标题行「全部 →」链接：宿主给了地址才出', () => {
        const { rerender } = render(<MetaHomeView sections={S} links={LINKS} />);
        expect(screen.queryByText('全部 84 種 →')).toBeNull();
        rerender(<MetaHomeView sections={S} links={LINKS} collectionsHref="/collections" entitiesHref="/people" catalogHref="/catalog" />);
        expect(screen.getByText('全部 84 種 →').getAttribute('href')).toBe('/collections');
        expect(screen.getByText('全部 30,994 人 →').getAttribute('href')).toBe('/people');
        expect(screen.getByText('進入目錄 →').getAttribute('href')).toBe('/catalog');
    });
});

describe('分区组件', () => {
    it('著录进度表：书目只在对得上条目时是链接；进度、状态', () => {
        render(<MetaCatalogTable rows={S.catalog_progress} links={LINKS} />);
        const table = screen.getByRole('table', { name: /書目著錄進度/ });
        const rows = within(table).getAllByRole('row');
        expect(rows).toHaveLength(5);
        expect(within(rows[1]).getByRole('link', { name: '漢書藝文志' }).getAttribute('href')).toBe('/book-index/d59f23o7ygw2');
        expect(within(rows[1]).getByText('88%')).toBeTruthy();
        expect(within(rows[3]).queryByRole('link')).toBeNull();
        expect(within(rows[4]).getByText('進行中')).toBeTruthy();
    });
    it('丛编：七阁一排方格（读屏念全名），其余分组列表', () => {
        render(<MetaCollectionGroups groups={S.collection_groups} links={LINKS} />);
        const ge = screen.getByRole('list', { name: '四庫七閣' });
        const cells = within(ge).getAllByRole('link');
        expect(cells.map((a) => a.getAttribute('aria-label'))).toEqual(['欽定四庫全書·文淵閣本', '欽定四庫全書·文津閣本']);
        expect(cells[0].textContent).toBe('文淵閣');
        expect(screen.getByRole('list', { name: '四庫續補' })).toBeTruthy();
    });
    it('丛编分组：超过 5 条（只多一条不收）出「全部 N 種」（手机端才显示），点了展开（overview#325）', () => {
        const big = {
            key: 'kebenyingyin', label: '刻本與影印',
            items: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, title: `叢編${i}` })),
        } as unknown as MetaHomeSections['collection_groups'][number];
        const { container } = render(<MetaCollectionGroups groups={[big]} links={LINKS} />);
        const btn = screen.getByText(`全部 ${big.items.length} 種`);
        expect(btn).toHaveAttribute('aria-expanded', 'false');
        expect(container.querySelector('.bim-rh-grp')!.hasAttribute('data-cap')).toBe(true);
        fireEvent.click(btn);
        expect(container.querySelector('.bim-rh-grp')!.hasAttribute('data-open')).toBe(true);
    });
    it('同类书目与考证：超过 5 条也按分组收起，出「全部 N 部」（overview#325）', () => {
        const works = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `w${i}`, title: `書目${i}` })) as unknown as Parameters<typeof MetaRelatedCatalogs>[0]['works'];
        const { container } = render(<MetaRelatedCatalogs works={works} links={LINKS} />);
        expect(container.querySelector('.bim-rh-grp')!.hasAttribute('data-cap')).toBe(true);
        fireEvent.click(screen.getByText('全部 6 部'));
        expect(container.querySelector('.bim-rh-grp')!.hasAttribute('data-open')).toBe(true);
    });
    it('丛编分组：5 条（只比 4 多一条）不收，也不出按钮', () => {
        const five = {
            key: 'g5', label: '五種',
            items: [1, 2, 3, 4, 5].map((i) => ({ id: `d${i}`, title: `叢編${i}` })),
        } as unknown as MetaHomeSections['collection_groups'][number];
        const { container } = render(<MetaCollectionGroups groups={[five]} links={LINKS} />);
        expect(container.querySelector('.bim-rh-grp')!.hasAttribute('data-cap')).toBe(false);
        expect(container.querySelector('.bim-rh-expand')).toBeNull();
    });
    it('人物：有年份的上轴，缺年份的轴下注明', () => {
        const { container } = render(<MetaPeopleTimeline people={S.bibliographers} links={LINKS} />);
        expect(container.querySelectorAll('.bim-mh-tl-bar')).toHaveLength(4);
        expect(screen.getByText(/生卒年未錄、未上軸：班固/)).toBeTruthy();
        expect(container.querySelector('.bim-mh-tl-bar a')!.textContent).toBe('劉向前77–前6');
        expect(container.querySelector('.bim-mh-tl-axis')!.getAttribute('aria-hidden')).toBe('true');
    });
    it('人物：都没有年份时只出列表', () => {
        const { container } = render(<MetaPeopleTimeline people={[{ id: 'a', name: '班固', dynasty: '東漢' }]} links={LINKS} />);
        expect(container.querySelector('.bim-mh-tl-rows')).toBeNull();
        expect(container.querySelector('.bim-mh-tl-list')!.hasAttribute('data-only')).toBe(true);
    });
    it('在线资源：对接中的画比例条，计划中的列一行；副题不写分母（overview#337 B3）', () => {
        render(<MetaOnlineSites sites={S.sites} />);
        expect(screen.getByRole('link', { name: 'CText 中國哲學書電子化計劃' }).getAttribute('href')).toBe('https://ctext.org');
        expect(screen.getByText(/5,700 \/ 11,381/)).toBeTruthy();
        expect(screen.getByText('計劃接入：國家圖書館·中華古籍資源庫')).toBeTruthy();
        render(<MetaHomeView sections={S} links={LINKS} />);
        expect(screen.getByText('外部數字圖書館與本站條目的對接')).toBeTruthy();
        expect(screen.queryByText(/為分母/)).toBeNull();
    });
    it('数据与授权：8 项规模；存佚没有计数时只写说明；版本给了才出', () => {
        const { rerender } = render(<MetaDataLicense stats={S.stats} links={LINKS} />);
        expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(12);
        expect(screen.getByRole('link', { name: /^殘/ }).getAttribute('href')).toBe('/book-index?loss=partially_extant');
        expect(screen.getByRole('link', { name: /^殘/ }).textContent).toBe('殘部分存世');
        expect(screen.queryByText(/當前數據版本/)).toBeNull();
        rerender(<MetaDataLicense stats={{ ...S.stats, loss: { extant: 30000, partially_extant: 900, lost: 40000, unknown: 24155 } }} links={LINKS} version="501935e · 2026-09-27" />);
        expect(screen.getByRole('link', { name: /^佚/ }).textContent).toBe('佚40,000 部 · 僅見著錄');
        expect(screen.getByText('501935e · 2026-09-27')).toBeTruthy();
    });
});

describe('最近浏览', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('首帧（服务端）不出列表也不出空状态', () => {
        const html = renderToString(<MetaRecentPanel entries={null} links={LINKS} />);
        expect(html).toContain('最近瀏覽');
        expect(html).not.toContain('還沒有瀏覽記錄');
    });
    it('读 localStorage 经 transport 取条目；取不到的不列；清除后显示空状态', async () => {
        localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(['w1', 'gone', 'b1']));
        const transport = {
            getItem: vi.fn(async (id: string) => (id === 'b1' ? { title: '新鐫全部繡像紅樓夢', type: 'book', edition: '程甲本' } : null)),
            getEntry: vi.fn(async (id: string) => (id === 'w1' ? { id: 'w1', title: '史記', type: 'work' as const, dynasty: '西漢' } : null)),
        };
        render(<MetaHomeView sections={EMPTY} links={LINKS} transport={transport} />);
        const panel = screen.getByRole('complementary', { name: '最近瀏覽' });
        await waitFor(() => expect(within(panel).getAllByRole('link')).toHaveLength(2));
        const links = within(panel).getAllByRole('link');
        expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['作品 史記', '版本 新鐫全部繡像紅樓夢']);
        expect(links[1].getAttribute('href')).toBe('/book-index/b1');
        expect(within(links[1]).getByText('程甲本')).toBeTruthy();
        fireEvent.click(within(panel).getByRole('button', { name: '清除' }));
        expect(within(panel).getByText('還沒有瀏覽記錄。打開任一條目後會出現在這裏。')).toBeTruthy();
        expect(localStorage.getItem(RECENT_IDS_STORAGE_KEY)).toBeNull();
    });
    it('没有记录：空状态、不出清除按钮', async () => {
        render(<MetaHomeView sections={EMPTY} links={LINKS} transport={{ getItem: async () => null }} />);
        await screen.findByText('還沒有瀏覽記錄。打開任一條目後會出現在這裏。');
        expect(screen.queryByRole('button', { name: '清除' })).toBeNull();
    });
});

describe('样式', () => {
    it('版式判准：边框一律走 --bim-fr-* 令牌，不写死', () => {
        const decls = META_HOME_CSS.match(/border(?:-(?:top|bottom|left|right|block))?:\s*[^;]+;/g) ?? [];
        const hard = decls.filter((d) => !/var\(--bim-fr-|:\s*0;|transparent/.test(d));
        expect(hard).toEqual([]);
        expect(META_HOME_CSS).toMatch(/\.bim-mh-tbl td \{[^}]*border: var\(--bim-fr-tbl-cell-bd/);
        expect(META_HOME_CSS).toMatch(/\.bim-mh-recent \{[^}]*border: var\(--bim-fr-rail-bd/);
        expect(META_HOME_CSS).toMatch(/\.bim-mh-tl-axis \{[^}]*border-top: var\(--bim-fr-axis-bd/);
    });
});
