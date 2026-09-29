/**
 * 古籍总目页：左栏分类树，右栏「总目内检索框（插槽）＋作品卡片网格＋分页」。
 * 窄屏（≤719px）分类树折成顶部抽屉，默认收起；选中节点后自动收起。
 *
 * 组件只收 props、不取数（数据契约见 overview#218 第 4 条，与网站 N4b 共用）：
 * tree / selectedId / page / pageCount / works / onSelect / onPage 必传语义，
 * searchSlot 可选；workLink / nodeHref / pageHref 等是可选的宿主定制。
 */
import React, { useCallback, useId, useState } from 'react';
import type { CatalogNode, CatalogWorkCard } from '../../types';
import { useConvert } from '../../i18n';
import { CATALOG_CSS } from './catalog-css';
import { CatalogTree } from './CatalogTree';
import { WorkCardGrid } from './WorkCardGrid';
import { CATALOG_ALL_ID, CATALOG_PAGE_SIZE, catalogTotal, findCatalogPath } from './model';

export interface CatalogPageProps {
    tree: CatalogNode[];
    /** 当前节点；空或 CATALOG_ALL_ID 表示「全部」 */
    selectedId?: string | null;
    /** 当前页，从 1 起 */
    page: number;
    pageCount: number;
    /** 当前页的作品（≤20 条，排序由数据侧决定） */
    works: CatalogWorkCard[];
    onSelect: (id: string) => void;
    onPage: (page: number) => void;
    /** 总目内检索框，放在右栏卡片网格上方 */
    searchSlot?: React.ReactNode;
    /** 作品链接；默认 `/item/<id>` */
    workLink?: (id: string) => string;
    /** 分页链接；给了就渲染成真 <a>（普通点击仍走 onPage） */
    pageHref?: (page: number) => string;
    /** 「全部」行与标题的文字；传 null 不显示「全部」行。默认「全部」 */
    allLabel?: string | null;
    /** 未选节点时的标题，默认「全部典籍」 */
    allTitle?: string;
    /** 每页条数（只用于标题里的「每页 N 条」），默认 20 */
    pageSize?: number;
    /** 呈现（受控）：不给则组件自己记，默认卡片 */
    view?: 'card' | 'list';
    onViewChange?: (view: 'card' | 'list') => void;
    className?: string;
}

const Caret = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

export function CatalogPage({
    tree, selectedId, page, pageCount, works, onSelect, onPage,
    searchSlot, workLink, pageHref,
    allLabel = '全部', allTitle = '全部典籍', pageSize = CATALOG_PAGE_SIZE, className, view: viewProp, onViewChange,
}: CatalogPageProps) {
    const { convert } = useConvert();
    const uid = useId();
    const drawerId = `bim-ct-drawer-${uid.replace(/:/g, '')}`;
    const [drawerOpen, setDrawerOpen] = useState(false);
    // 呈现切换：首帧一律卡片（与 SSR 一致），只在用户点了之后变
    const [viewState, setViewState] = useState<'card' | 'list'>('card');
    const view = viewProp ?? viewState;
    const chooseView = (v: 'card' | 'list') => { setViewState(v); onViewChange?.(v); };

    const path = findCatalogPath(tree, selectedId && selectedId !== CATALOG_ALL_ID ? selectedId : null);
    const node = path.length ? path[path.length - 1] : null;
    const title = node ? node.label : allTitle;
    const total = node ? node.count : catalogTotal(tree);

    const handleSelect = useCallback((id: string) => {
        setDrawerOpen(false);
        onSelect(id);
    }, [onSelect]);

    return (
        <div className={className ? `bim-ct ${className}` : 'bim-ct'} data-drawer={drawerOpen ? 'open' : 'closed'}>
            <style>{CATALOG_CSS}</style>
            <aside className="bim-ct-side" aria-label={convert('分類導航')}>
                <button
                    type="button"
                    className="bim-ct-drawer-btn"
                    aria-expanded={drawerOpen}
                    aria-controls={drawerId}
                    onClick={() => setDrawerOpen(o => !o)}
                >
                    <span>{convert('分類')}：{convert(path.length ? path.map(n => n.label).join(' › ') : (allLabel ?? allTitle))}</span>
                    <Caret />
                </button>
                <div className="bim-ct-drawer" id={drawerId}>
                    <h2 className="bim-ct-side-h">{convert('分類')}</h2>
                    <CatalogTree tree={tree} selectedId={selectedId} onSelect={handleSelect} allLabel={allLabel} />
                </div>
            </aside>
            {/* 用 div 而非 <main>：宿主外壳里已有 <main>（同 detail/primitives PageFrame） */}
            <div className="bim-ct-main">
                <header className="bim-ct-head">
                    <h1 className="bim-ct-title">{convert(title)}</h1>
                    {path.length > 1 && (
                        <span className="bim-ct-crumb">{convert(path.slice(0, -1).map(n => n.label).join(' › '))}</span>
                    )}
                    <span className="bim-ct-stat">
                        {convert(`共 ${total.toLocaleString('en-US')} 種 · 每頁 ${pageSize} 條`)}
                        {pageCount > 1 && convert(` · 第 ${page} / ${pageCount} 頁`)}
                    </span>
                    <span className="bim-ct-view" role="group" aria-label={convert('呈現方式')}>
                        <button type="button" aria-pressed={view === 'card'} onClick={() => chooseView('card')}>{convert('卡片')}</button>
                        <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>{convert('列表')}</button>
                    </span>
                </header>
                {searchSlot && <div className="bim-ct-search">{searchSlot}</div>}
                <WorkCardGrid
                    works={works}
                    view={view}
                    workLink={workLink}
                    page={page}
                    pageCount={pageCount}
                    onPage={onPage}
                    pageHref={pageHref}
                />
            </div>
        </div>
    );
}
