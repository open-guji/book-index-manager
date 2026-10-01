/**
 * 阅读首页与阅读页（overview#308）的无障碍检查台：按查询串设配色、版式、场景，渲染真组件。
 * 用法见 tests/a11y/axe.mjs。
 *   ?s=home|reader  &theme=zhusha|indigo|ink  &layout=airy|boxed
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadHomeView } from '../../src/components/read-home';
import type { ReadSections } from '../../src/components/read-home';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { DEFAULT_READER_PREFS } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import sections from '../unit/fixtures/read-sections.json';

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

createRoot(document.getElementById('root')!).render(q.get('s') === 'reader' ? <Reader /> : <Home />);
