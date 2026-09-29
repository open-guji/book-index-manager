/**
 * 布局跳动（CLS）量测台：在真实浏览器里对着组件量 layout-shift，不靠样式推算。
 * 用法见 tests/cls/measure.mjs。页面骨架（页头、页脚）模拟网站：内容区在页头与页脚之间，
 * 内容区高度一变，页脚就会跟着动——这正是 QA 报的 CLS 来源。
 */
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '../../src/i18n/provider';
import { IndexBrowser } from '../../src/components/IndexBrowser';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexEntry, IndexType } from '../../src/types';
import shiji from '../unit/fixtures/shiji-work.json';

const q = new URLSearchParams(location.search);
const scenario = q.get('s') ?? 'search';
const delay = <T,>(ms: number, v: T) => new Promise<T>(r => setTimeout(() => r(v), ms));

const mk = (type: IndexType, n: number, title: string): IndexEntry[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `${type}${i}`, type, title: `${title}${i + 1}`,
        author: '朱熹', dynasty: '宋', edition: i % 2 ? '明嘉靖刻本' : undefined,
    } as IndexEntry));

const searchTransport = {
    loadEntries: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
    search: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
    searchAll: () => delay(700, {
        works: mk('work', 6, '朱子語類'), books: mk('book', 10, '朱子語類'),
        collections: mk('collection', 4, '朱子全書'), entities: [],
        totalWorks: 6, totalBooks: 10, totalCollections: 4, totalEntities: 0,
    }),
    getItem: async () => null,
    getCounts: () => delay(400, {
        works: 12000, books: 60000, collections: 900, entities: 3000,
        resourceCounts: { hasText: 1200, hasImage: 30000 }, subtypeStats: { book: 9000, article: 2000 },
    }),
} as never;

// 史記作品页：版本详情陆续到达（模拟网络，最晚约 4.4 秒）
const books: Record<string, Record<string, unknown>> = {};
const bookIds = ((shiji as { books?: string[] }).books ?? []);
const EDITIONS = ['宋建安黃善夫家塾刻本', '元彭寅翁崇道精舍刻本', '明嘉靖四年汪諒刊本', '明萬曆二十四年金陵國子監刻本', '清乾隆武英殿本', '清同治五年金陵書局刻本'];
bookIds.forEach((id, i) => {
    books[id] = {
        id, type: 'book', title: '史記', edition: EDITIONS[i % EDITIONS.length],
        measure_info: i % 3 === 0 ? `${130 - i}卷 ${20 + i}冊` : undefined,
        resources: i % 4 === 0 ? [{ name: '影印', url: 'https://example.org/a', types: ['image'] }] : undefined,
    };
});
const workTransport = {
    getItem: (id: string) => {
        if (id === (shiji as { id: string }).id) return Promise.resolve(shiji as Record<string, unknown>);
        const i = bookIds.indexOf(id);
        return delay(300 + (i * 4100) / Math.max(bookIds.length, 1), books[id] ?? null);
    },
    getEntry: async () => null,
    getCollatedEditionIndex: async () => null,
    getLineageGraph: async () => null,
    getWorkFullTextList: async () => [],
    getBookFullTextIndex: async () => null,
} as never;

const app = (
    <LocaleProvider locale="zh-Hant">
        {scenario === 'work' ? (
            <BookDetailLayout
                id={(shiji as { id: string }).id}
                transport={workTransport}
                initialDetail={shiji as never}
                activeTab="basic"
                onTabChange={() => {}}
            />
        ) : (
            <IndexBrowser
                transport={searchTransport}
                resultVariant="card"
                initialQuery={scenario === 'search' ? '朱熹' : ''}
            />
        )}
    </LocaleProvider>
);

const root = document.getElementById('root')!;
root.innerHTML = renderToString(app);
hydrateRoot(root, app);
// SSR 内容第一次上屏那一帧，页脚从页头下方被顶到内容下面，是台子自己的空白帧，不属于组件；
// 等它画完再开始计位移（真实网站的 SSR HTML 随文档一起到达，没有这一帧）
requestAnimationFrame(() => requestAnimationFrame(() => {
    (window as unknown as { __mountedAt: number }).__mountedAt = performance.now();
}));
