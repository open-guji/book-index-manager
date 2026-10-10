/**
 * 简体模式下各页不应残留常见繁体字（overview#337）。
 *
 * 在 LocaleProvider zh-Hans 里渲染：条目页四类（作品／版本／丛编／人物）、元数据首页、阅读首页、
 * 目录、搜索结果、阅读页，取正文与 aria-label／title／placeholder，交给 findTraditionalChars。
 * 命中就说明有界面文字没走 t()，或数据文字没过 convert。专名白名单见 traditional-check.ts。
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { findTraditionalChars } from '../../src/i18n/traditional-check';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { BookDetailLayoutProps } from '../../src/components/BookDetailLayout';
import { MetaHomeView } from '../../src/components/meta-home';
import type { MetaHomeSections } from '../../src/components/meta-home';
import { ReadHomeView } from '../../src/components/read-home';
import type { ReadSections } from '../../src/components/read-home';
import { CatalogPage, buildCatalogTree } from '../../src/components/catalog';
import { IndexBrowser } from '../../src/components/IndexBrowser';
import { TextReader } from '../../src/components/TextReader';
import type { IndexStorage } from '../../src/storage/types';
import type { IndexDetailData, IndexEntry } from '../../src/types';
import META from './fixtures/meta-sections.json';
import READ from './fixtures/read-sections.json';

afterEach(() => { cleanup(); });

/** 页面上用户看得到／读屏读得到的文字 */
function visibleText(root: HTMLElement): string {
    const parts = [root.textContent ?? ''];
    root.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach((el) => {
        for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
            const v = el.getAttribute(a);
            if (v) parts.push(v);
        }
    });
    root.querySelectorAll('option').forEach((o) => parts.push(o.textContent ?? ''));
    // <style> 里的 content: '…' 也算界面文字，但 CSS 本身不算
    return parts.join('\n');
}

async function settle() {
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

function expectNoTraditional(label: string, root: HTMLElement) {
    root.querySelectorAll('style,script').forEach((n) => n.remove());
    const hits = findTraditionalChars(visibleText(root));
    const report = [...new Map(hits.map((h) => [h.char + h.context, `${h.char}  …${h.context}…`])).values()];
    if (report.length) console.log(`【${label}】\n` + report.join("\n"));
    expect(report.length, `${label} 简体模式残留繁体字`).toBe(0);
}

function Hans({ children }: { children: React.ReactNode }) {
    return <LocaleProvider locale="zh-Hans">{children}</LocaleProvider>;
}

// ── 条目页 ──

function detailProps(data: IndexDetailData, extra: Record<string, unknown> = {}, fullText: unknown = null): BookDetailLayoutProps {
    const all: Record<string, unknown> = { [data.id]: data, ...extra };
    return {
        id: data.id,
        transport: {
            getItem: vi.fn(async (id: string) => (all[id] ?? null) as Record<string, unknown> | null),
            getEntry: vi.fn(async () => null),
            getLineageGraph: vi.fn(async () => null),
            getTextManifest: vi.fn(async () => (fullText ? { id: data.id, versions: [{ key: 'default', kind: 'transcription', label: '全文' }] } : null) as never),
            getTextIndex: vi.fn(async () => (fullText ?? null) as never),
        } as never,
        initialDetail: data,
        activeTab: 'basic',
        onTabChange: () => {},
        readLink: () => `/read/${data.id}`,
    };
}

const WORK = {
    id: 'w1', type: 'work', title: '史記',
    authors: [{ name: '司馬遷', role: 'author', dynasty: '西漢', entity_id: 'e1' }],
    description: { text: '紀傳體通史，記黃帝至漢武帝時事。' },
    juan_count: { number: 130 }, loss_status: 'extant',
    classification: { l1: '史部', l2: '正史類', l3: '', l4: '', basis: 'S', source: '欽定四庫全書總目' },
    _edition_count: 3, books: ['b1', 'b2', 'b3'],
    indexed_by: [{ source: '漢書藝文志', title_info: '太史公百三十篇', summary: '十篇有錄無書。' }],
    emendated_by: [{ source: '漢志考證' }],
    related_works: [{ id: 'c9', title: '二十四史', relation: 'collected_in' }, { id: 'w2', title: '史記索隱', relation: 'studied_by' }],
    todo: [{ what: '核對卷數', by: '目錄總管' }],
    review: { status: 'reviewed', by: '甲', date: '2026-09-28' },
    revision: '1.0.3',
} as unknown as IndexDetailData;
const WORK_EXTRA = {
    b1: { id: 'b1', type: 'book', title: '史記', edition: '宋建安黃善夫家塾刻本', resources: [{ name: '維基共享', url: 'https://commons.wikimedia.org/wiki/File:a.pdf', types: ['image'] }] },
    b2: { id: 'b2', type: 'book', title: '史記', edition: '明嘉靖四年汪諒刊本' },
    b3: { id: 'b3', type: 'book', title: '史記', edition: '清乾隆武英殿本' },
};

const BOOK = {
    id: 'b1', type: 'book', title: '新鐫全部繡像紅樓夢', edition: '程甲本', work_id: 'w1', text_count: 1,
    authors: [{ name: '曹霑', role: '撰', dynasty: '清' }],
    publication_info: { year: '1791', details: '清乾隆五十六年辛亥萃文書屋木活字本' },
    resources: [
        { id: 'ws', name: '維基文庫', url: 'https://zh.wikisource.org/wiki/x', types: ['text'], details: '120 回完整本' },
        { id: 'nlc', name: '中華古籍資源庫', url: 'http://read.nlc.cn/x', types: ['image'], group: 'g1', group_role: 'origin' },
        { id: 'ia', name: 'Internet Archive', url: 'https://archive.org/details/x', types: ['image'], group: 'g1', group_role: 'mirror' },
    ],
    resource_groups: { g1: { label: '程甲本原本掃描', description: '國圖全本黑白。' } },
    lineage: {
        year: 1791, year_text: '清乾隆五十六年（1791）', category: '刻本', status: 'extant',
        derived_from: [{ ref: 'b0', ref_type: 'book', relation: '底本', confidence: 'consensus', evidence: '文字簡約' }],
    },
    base_edition: [{ role: '底本', book_id: 'b0', name: '夢覺本' }],
    appendix: [{ title: '清代程甲系翻刻本一覽', text: '- 本衙藏板本' }],
    location_history: [{ holder: '國家圖書館', note: '舊藏' }],
} as unknown as IndexDetailData;
const BOOK_EXTRA = {
    w1: { id: 'w1', type: 'work', title: '紅樓夢', books: ['b0', 'b1', 'b2'], _edition_count: 3 },
    b0: { id: 'b0', type: 'book', title: '紅樓夢', edition: '夢覺本', dating: { year: 1784 } },
    b2: { id: 'b2', type: 'book', title: '新鐫全部繡像紅樓夢', edition: '程乙本', dating: { year: 1792 } },
};
const FULL_TEXT = {
    version_label: '程甲本',
    source: { name: '維基文庫', url: 'https://zh.wikisource.org/wiki/x', license: 'CC BY-SA 4.0' },
    chapters: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, file: String(i + 1).padStart(3, '0'), title: `第${'一二三四五六七八九十'[i % 10]}回　甄士隱夢幻識通靈` })),
};

const COLL = {
    id: 'c1', type: 'collection', title: '武英殿聚珍版叢書', subtype: 'book_collection', contained_in: [{ id: 'c0' }],
    description: { text: '清乾隆三十八年詔開四庫館，擇要交武英殿排印。' },
    contained_works: Array.from({ length: 12 }, (_, i) => ({ id: `cw${i}`, title: i === 0 ? '周易口訣義' : `易說${i}`, volume_index: [i * 2 + 2] })),
    resources: [{ id: 'wm', name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/Category:x', types: ['image'] }],
    _member_count: 40,
} as unknown as IndexDetailData;
const COLL_EXTRA = {
    c0: { id: 'c0', type: 'collection', title: '武英殿刻書' },
    cw0: { id: 'cw0', type: 'work', title: '周易口訣義', authors: [{ name: '史徵', dynasty: '唐', role: '撰' }], juan_count: { number: 6 }, _edition_count: 4 },
};

const ENTITY = {
    id: 'e1', type: 'entity', subtype: 'people', primary_name: '朱熹', title: '朱熹',
    dynasty: '南宋', birth_year: 1130, death_year: 1200, native_place: '建州',
    alt_names: [{ name: '仲晦', type: '字' }, { name: '晦庵', type: '號' }, { name: '文公', type: '諡號' }],
    works: [{ work_id: 'ew1', role: '撰' }, { work_id: 'ew2', role: '編' }],
    external_ids: { cbdb_id: 3257, cbdb_match: 'auto', wikidata_id: 'Q9397' },
} as unknown as IndexDetailData;
const ENTITY_EXTRA = {
    ew1: { id: 'ew1', type: 'work', title: '詩集傳', _edition_count: 7, has_image: true, classification: { l1: '經部', l2: '詩類' }, juan_count: { number: 8 } },
    ew2: { id: 'ew2', type: 'work', title: '伊洛淵源錄', _edition_count: 0 },
};

describe('简体模式无残留繁体字', () => {
    it('作品页', async () => {
        const { container } = render(<Hans><BookDetailLayout {...detailProps(WORK, WORK_EXTRA)} /></Hans>);
        await settle();
        expectNoTraditional('作品页', container);
    });

    it('版本页', async () => {
        const { container } = render(<Hans><BookDetailLayout {...detailProps(BOOK, BOOK_EXTRA, FULL_TEXT)} /></Hans>);
        await settle();
        expectNoTraditional('版本页', container);
    });

    it('丛编页', async () => {
        const { container } = render(<Hans><BookDetailLayout {...detailProps(COLL, COLL_EXTRA)} /></Hans>);
        await settle();
        expectNoTraditional('丛编页', container);
    });

    it('人物页', async () => {
        const { container } = render(<Hans><BookDetailLayout {...detailProps(ENTITY, ENTITY_EXTRA)} /></Hans>);
        await settle();
        expectNoTraditional('人物页', container);
    });

    it('元数据首页', async () => {
        const links = { item: (id: string) => `/i/${id}`, node: (id: string) => `/c?n=${id}`, type: (t: string) => `/s?t=${t}`, loss: (k: string) => `/s?l=${k}` };
        const { container } = render(<Hans><MetaHomeView sections={META as unknown as MetaHomeSections} links={links} /></Hans>);
        await settle();
        expectNoTraditional('元数据首页', container);
    });

    it('阅读首页', async () => {
        const { container } = render(<Hans><ReadHomeView sections={READ as unknown as ReadSections} /></Hans>);
        await settle();
        expectNoTraditional('阅读首页', container);
    });

    it('目录与目录节点', async () => {
        const tree = buildCatalogTree(
            [{ classification: { l1: '史部', l2: '正史類', l3: '', l4: '' } }, { classification: { l1: '經部', l2: '易類', l3: '', l4: '' } }, {}],
            [{ cata_l1: '經部', cata_l2: '易類' }, { cata_l1: '史部', cata_l2: '正史類' }],
        );
        const works = [
            { id: 'w1', title: '史記', author: '司馬遷', dynasty: '西漢', juan_count: 130, has_image: true, has_text: true },
            { id: 'w2', title: '漢書', author: '班固', dynasty: '東漢' },
        ];
        const { container } = render(<Hans><CatalogPage tree={tree} selectedId="史部/正史類" page={1} pageCount={2} works={works as never} onSelect={() => {}} onPage={() => {}} /></Hans>);
        await settle();
        expectNoTraditional('目录', container);
    });

    it('搜索结果', async () => {
        const mk = (id: string, type: string, title: string, extra: Record<string, unknown> = {}) => ({ id, type, title, name: title, status: 'official', ...extra }) as unknown as IndexEntry;
        const WORKS = [
            mk('w1', 'work', '史記', { author: '司馬遷', dynasty: '西漢', classification: '史部', has_image: true, has_text: true, has_collated: true, juan_count: 130 }),
            mk('w2', 'work', '史記集解', { author: '裴駰', dynasty: '南朝宋', classification: '史部', loss_status: 'lost' }),
        ];
        const transport = {
            loadEntries: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
            getItem: async () => null,
            getCounts: async () => ({ works: 0, books: 0, collections: 0, entities: 0, resourceCounts: { hasText: 0, hasImage: 0 }, subtypeStats: {} }),
            supportsSearchFilters: true,
            searchAll: async () => ({ works: WORKS, books: [mk('b1', 'book', '宋建安黃善夫家塾刻本', { edition: '刻本', era: '宋', has_image: true })], collections: [], entities: [mk('p1', 'entity', '司馬遷', { birth_year: -145, death_year: -86, dynasty: '西漢' })], totalWorks: 2, totalBooks: 1, totalCollections: 0, totalEntities: 1 }),
            search: async (_q: string, type: string) => ({ entries: type === 'work' ? WORKS : [], total: type === 'work' ? 2 : 0, page: 1, pageSize: 50 }),
        } as unknown as IndexStorage;
        const { container } = render(<Hans><IndexBrowser transport={transport} hideModeIndicator initialQuery="史記" filtersEnabled /></Hans>);
        await screen.findAllByText(/史记/);
        await settle();
        expectNoTraditional('搜索', container);
    });

    it('阅读页', async () => {
        const transport = {
            getItem: async () => ({ title: '直齋書錄解題', authors: [{ name: '陳振孫', dynasty: '南宋' }] }),
            getTextManifest: async () => ({
                id: 'w', versions: [
                    { key: 'default', kind: 'collated', label: '整理本', source: 'collated', source_name: '開源古籍', license: 'CC0 1.0' },
                    { key: 'wikisource', kind: 'transcription', label: '維基文庫', source: 'wikisource', source_name: '維基文庫', license: 'CC BY-SA 4.0' },
                ],
            }) as never,
            getTextIndex: async () => ({ title: '書錄', chapters: [{ n: 1, file: '001', title: '經錄', has_json: true }, { n: 2, file: '002', title: '史錄', has_json: true }] }) as never,
            getChapter: async () => ({ md: '# 經錄\n易類總敘。', json: { title: '經錄', sections: [{ title: '易', type: '书', book_title: '周易', content: '十二卷', work_id: 'd59f2aaaaaaa' }] } }),
        } as unknown as IndexStorage;
        const { container } = render(<Hans><TextReader id="d59f2htm01du" transport={transport} title="直齋書錄解題" /></Hans>);
        await screen.findByRole('heading', { level: 1 });
        await settle();
        expectNoTraditional('阅读页', container);
    });
});
