/**
 * 阅读首页与阅读页（overview#308）的无障碍检查台：按查询串设配色、版式、场景，渲染真组件。
 * 用法见 tests/a11y/axe.mjs。
 *   ?s=home|reader|meta|meta-empty  &theme=zhusha|indigo|ink  &layout=airy|boxed
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadHomeView } from '../../src/components/read-home';
import type { ReadSections } from '../../src/components/read-home';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import { MetaHomeView } from '../../src/components/meta-home';
import type { MetaHomeSections } from '../../src/components/meta-home';
import { RECENT_IDS_STORAGE_KEY } from '../../src/core/recent';
import sections from '../unit/fixtures/read-sections.json';
import metaSections from '../unit/fixtures/meta-sections.json';

const q = new URLSearchParams(location.search);
const theme = q.get('theme') ?? 'zhusha';
const layout = q.get('layout') ?? 'airy';
if (theme !== 'zhusha') document.documentElement.setAttribute('data-theme', theme);
if (layout === 'boxed') document.documentElement.setAttribute('data-layout', 'boxed');

function Home() {
    return (
        <div className="wrap">
            <ReadHomeView
                sections={sections as unknown as ReadSections}
                head={(
                    <form role="search" action="/search">
                        <label htmlFor="q">在可讀書中搜索</label>
                        <input id="q" type="search" name="q" />
                        <button type="submit">搜索</button>
                    </form>
                )}
                piecesMoreHref="/search?subtype=article"
                links={{ author: (n) => `/search?author=${encodeURIComponent(n)}` }}
            />
        </div>
    );
}

function Reader() {
    const toc = Array.from({ length: 22 }, (_, i) => ({ key: String(i + 1).padStart(3, '0'), label: `卷${i + 1}` }));
    const [active, setActive] = useState('001');
    const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
    return (
        <ReaderShell
            title={<a href="/item/d59f2htm01du">直齋書錄解題</a>}
            subtitle="開源古籍"
            byline="〔南宋〕陳振孫 撰"
            current="卷一　易類"
            backHref="/read"
            toc={toc}
            activeKey={active}
            onSelect={setActive}
            prefs={prefs}
            onPrefsChange={(p) => setPrefs((prev) => ({ ...prev, ...p }))}
            images={[]}
            onReportError={() => {}}
            versions={[
                { key: 'default', label: '開源古籍', sourceName: '開源古籍', license: 'CC0 1.0', primary: true },
                { key: 'wikisource', label: '維基文庫', sourceName: '維基文庫', license: 'CC BY-SA 4.0' },
            ]}
        >
            <h1 className="bim-rd-h1">卷一　易類</h1>
            <div className="bim-rd-prose"><p>周易古占法一卷。程迥可久撰。</p><p>易學辨惑一卷。邵伯溫撰。</p></div>
        </ReaderShell>
    );
}

/** 元数据首页；meta-empty＝最近浏览为空 */
function Meta({ empty }: { empty?: boolean }) {
    try {
        if (empty) localStorage.removeItem(RECENT_IDS_STORAGE_KEY);
        else localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(['d59f20aowb9c', 'hixhd2h9bcl2', '96kzkdm8e8']));
    } catch { /* ignore */ }
    const known: Record<string, Record<string, unknown>> = {
        d59f20aowb9c: { title: '史記', type: 'work' },
        hixhd2h9bcl2: { title: '紀昀', type: 'entity' },
        '96kzkdm8e8': { title: '新鐫全部繡像紅樓夢', type: 'book', edition: '程甲本' },
    };
    return (
        <div className="wrap">
            <MetaHomeView
                sections={metaSections as unknown as MetaHomeSections}
                head={(
                    <form role="search" action="/book-index">
                        <label htmlFor="q">檢索古籍元數據</label>
                        <input id="q" type="search" name="q" />
                        <button type="submit">檢索</button>
                    </form>
                )}
                transport={{ getItem: async (id) => known[id] ?? null }}
                links={{
                    item: (id) => `/book-index/${id}`,
                    node: (id) => `/catalog?node=${id}`,
                    type: (t) => `/book-index?type=${t}`,
                    loss: (k) => `/book-index?loss=${k}`,
                }}
                catalogHref="/catalog"
                collectionsHref="/book-index?type=collection"
                entitiesHref="/book-index?type=entity"
                version="501935e · 2026-09-27"
                repoUrl="https://github.com/open-guji/book-index"
            />
        </div>
    );
}

const scene = q.get('s');
createRoot(document.getElementById('root')!).render(
    scene === 'reader' ? <Reader /> : scene === 'meta' ? <Meta /> : scene === 'meta-empty' ? <Meta empty /> : <Home />,
);
