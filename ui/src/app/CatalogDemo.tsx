/**
 * dev app 古籍总目示例页（N4a）：/catalog?node=<id>&page=<n>
 * 数据来自 dev API（server/catalog-demo.ts，book-index 生产数据现场算）。
 * 网站（N4b）用构建期生成的 tree.json / <node>/<page>.json 代替这两个接口。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CatalogPage, CATALOG_ALL_ID } from '../components/catalog';
import type { CatalogNode, CatalogWorkCard } from '../types';
import { bim } from '../styles/tokens';

function readUrl() {
    const sp = new URLSearchParams(window.location.search);
    return { node: sp.get('node') || null, page: Math.max(1, parseInt(sp.get('page') || '1') || 1) };
}

function catalogHref(node: string | null, page: number) {
    const sp = new URLSearchParams();
    if (node) sp.set('node', node);
    if (page > 1) sp.set('page', String(page));
    const qs = sp.toString();
    return qs ? `/catalog?${qs}` : '/catalog';
}

export function CatalogDemo() {
    const [loc, setLoc] = useState(readUrl);
    const [tree, setTree] = useState<CatalogNode[] | null>(null);
    const [works, setWorks] = useState<{ works: CatalogWorkCard[]; pageCount: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/catalog-tree').then(r => r.json()).then(setTree).catch(e => setError(String(e)));
    }, []);
    useEffect(() => {
        const sp = new URLSearchParams({ page: String(loc.page) });
        if (loc.node) sp.set('node', loc.node);
        fetch(`/api/catalog-works?${sp}`)
            .then(r => (r.ok ? r.json() : { works: [], pageCount: 1 }))
            .then(setWorks)
            .catch(e => setError(String(e)));
    }, [loc]);
    useEffect(() => {
        const onPop = () => setLoc(readUrl());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const go = useCallback((node: string | null, page: number) => {
        window.history.pushState(null, '', catalogHref(node, page));
        setLoc({ node, page });
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => { document.title = '古籍總目'; document.body.style.margin = '0'; }, []);

    if (error) return <p style={{ padding: 32, color: bim('danger') }}>{error}</p>;
    if (!tree) return <p style={{ padding: 32, color: bim('aux-fg') }}>正在從 book-index 計算分類樹…</p>;

    return (
        <div style={{ minHeight: '100vh', background: bim('page-bg') }}>
            <CatalogPage
                tree={tree}
                selectedId={loc.node}
                page={loc.page}
                pageCount={works?.pageCount ?? 1}
                works={works?.works ?? []}
                onSelect={id => go(id === CATALOG_ALL_ID ? null : id, 1)}
                onPage={p => go(loc.node, p)}
                pageHref={p => catalogHref(loc.node, p)}
                workLink={id => `/book-index?id=${encodeURIComponent(id)}`}
                searchSlot={<CatalogSearch />}
            />
        </div>
    );
}

/** 总目内检索框（示例：交给首页检索） */
function CatalogSearch() {
    const [q, setQ] = useState('');
    return (
        <form
            role="search"
            onSubmit={e => { e.preventDefault(); if (q.trim()) window.location.href = `/?q=${encodeURIComponent(q.trim())}`; }}
            style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 12px', maxWidth: 480,
                background: bim('tint-bg'), borderRadius: 8, color: bim('aux-fg'),
            }}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
            </svg>
            <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="在總目內檢索書名、作者"
                aria-label="總目內檢索"
                style={{
                    flex: 1, minWidth: 0, height: '100%', border: 0, outline: 'none', background: 'transparent',
                    font: 'inherit', fontSize: 14, color: bim('ink'),
                }}
            />
        </form>
    );
}
