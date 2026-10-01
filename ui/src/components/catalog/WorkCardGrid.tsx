/**
 * 古籍总目作品卡片网格 + 分页。
 *
 * 卡片是真 <a href>（地址由宿主 workLink(id) 决定）：Tab 可达、Enter 可开、
 * 修饰键 / 中键点击交给浏览器；卡片里不嵌套其他交互元素（同 Q5 A1）。
 * 列数由 CSS 断点决定（4 / 2 / 1），见 catalog-css.ts。
 */
import React from 'react';
import type { CatalogWorkCard } from '../../types';
import { useI18n } from '../../i18n';
import type { TFunction } from '../../i18n';
import { paginationItems } from './model';

export interface CatalogPagerProps {
    /** 当前页，从 1 起 */
    page: number;
    pageCount: number;
    onPage?: (page: number) => void;
    /** 给了就渲染成真链接（利于 SSR / 爬虫）；普通点击仍走 onPage */
    pageHref?: (page: number) => string;
    /** 分页导航的无障碍名称 */
    label?: string;
}

export interface WorkCardGridProps extends CatalogPagerProps {
    works: CatalogWorkCard[];
    /** 呈现：卡片网格（默认）或单列列表 */
    view?: 'card' | 'list';
    /** 作品链接；默认 `/item/<id>`（网站条目页） */
    workLink?: (id: string) => string;
    /** 列表为空时的提示 */
    emptyText?: React.ReactNode;
}

export const defaultWorkLink = (id: string) => `/item/${encodeURIComponent(id)}`;

/** 普通左键点击交给 onPage；修饰键 / 中键让浏览器按链接处理 */
function isPlainClick(e: React.MouseEvent) {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function juanText(juan: CatalogWorkCard['juan'], t: TFunction): string | null {
    if (juan === undefined || juan === null || juan === '') return null;
    return typeof juan === 'number' ? t('catalogPage.juanN', { n: juan }) : juan;
}

export function WorkCard({ work, href }: { work: CatalogWorkCard; href: string }) {
    const { t, convert } = useI18n();
    const juan = juanText(work.juan, t);
    const authors = work.authors?.filter(a => a.name) ?? [];
    const cls = work.classification?.filter(Boolean) ?? [];
    return (
        <li className="bim-ct-card">
            <a href={href}>
                <div className="bim-ct-ch">
                    <h2 className="bim-ct-ct">{convert(work.title)}</h2>
                    {juan && <span className="bim-ct-juan">{convert(juan)}</span>}
                </div>
                {authors.length > 0 && (
                    <span className="bim-ct-by">
                        {authors.map((a, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && '、'}
                                {a.dynasty && <span className="bim-ct-dy">〔{convert(a.dynasty)}〕</span>}
                                {convert(a.name)}
                            </React.Fragment>
                        ))}
                    </span>
                )}
                {work.summary && <p className="bim-ct-sum">{convert(work.summary)}</p>}
                {cls.length > 0 && <span className="bim-ct-cls">{cls.map(c => convert(c)).join(' · ')}</span>}
            </a>
        </li>
    );
}

/** 列表视图的一行：书名（＋卷数）｜撰人｜分类；摘要不出（列表求密度） */
export function WorkRow({ work, href }: { work: CatalogWorkCard; href: string }) {
    const { t, convert } = useI18n();
    const juan = juanText(work.juan, t);
    const authors = work.authors?.filter(a => a.name) ?? [];
    const cls = work.classification?.filter(Boolean) ?? [];
    return (
        <li className="bim-ct-lrow">
            <a href={href}>
                <span className="bim-ct-lt">
                    {convert(work.title)}
                    {juan && <span className="bim-ct-juan">{convert(juan)}</span>}
                </span>
                <span className="bim-ct-by">
                    {authors.map((a, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && '、'}
                            {a.dynasty && <span className="bim-ct-dy">〔{convert(a.dynasty)}〕</span>}
                            {convert(a.name)}
                        </React.Fragment>
                    ))}
                </span>
                <span className="bim-ct-cls">{cls.map(c => convert(c)).join(' · ')}</span>
            </a>
        </li>
    );
}

export function CatalogPager({ page, pageCount, onPage, pageHref, label }: CatalogPagerProps) {
    const { t, convert } = useI18n();
    if (pageCount <= 1) return null;
    const go = (p: number) => (e: React.MouseEvent) => {
        if (!onPage) return;
        if (pageHref && !isPlainClick(e)) return;
        e.preventDefault();
        onPage(p);
    };
    const control = (p: number, text: React.ReactNode, opts: { disabled?: boolean; current?: boolean; aria?: string }) => {
        if (opts.disabled) {
            return <span className="bim-ct-pg" aria-disabled="true">{text}</span>;
        }
        const common = {
            className: 'bim-ct-pg',
            'aria-current': opts.current ? ('page' as const) : undefined,
            'aria-label': opts.aria,
        };
        if (pageHref) return <a {...common} href={pageHref(p)} onClick={go(p)}>{text}</a>;
        return <button type="button" {...common} onClick={opts.current ? undefined : go(p)}>{text}</button>;
    };
    return (
        <nav className="bim-ct-pager" aria-label={label ? convert(label) : t('catalogPage.pagerLabel')}>
            {control(page - 1, t('catalogPage.prevPage'), { disabled: page <= 1 })}
            <ol>
                {paginationItems(page, pageCount).map((p, i) => (
                    <li key={p ?? `gap${i}`} style={{ display: 'contents' }}>
                        {p === null
                            ? <span className="bim-ct-gap" aria-hidden="true">…</span>
                            : control(p, p, { current: p === page, aria: t('catalogPage.pageN', { n: p }) })}
                    </li>
                ))}
            </ol>
            {/* 窄屏页码条放不下：只留「当前 / 总页数」（宽屏 display:none，读屏不会重复） */}
            <span className="bim-ct-pg-of" aria-current="page">{page} / {pageCount}</span>
            {control(page + 1, t('catalogPage.nextPage'), { disabled: page >= pageCount })}
        </nav>
    );
}

export function WorkCardGrid({
    works, workLink = defaultWorkLink, emptyText, view = 'card', ...pager
}: WorkCardGridProps) {
    const { t, convert } = useI18n();
    return (
        <div className="bim-ct-works">
            {works.length === 0 ? (
                <p className="bim-ct-empty">{emptyText === undefined ? t('catalogPage.emptyWorks') : typeof emptyText === 'string' ? convert(emptyText) : emptyText}</p>
            ) : (
                view === 'list'
                    ? (
                        <ul className="bim-ct-list">
                            {works.map(w => <WorkRow key={w.id} work={w} href={workLink(w.id)} />)}
                        </ul>
                    )
                    : (
                        <ul className="bim-ct-grid">
                            {works.map(w => <WorkCard key={w.id} work={w} href={workLink(w.id)} />)}
                        </ul>
                    )
            )}
            <CatalogPager {...pager} />
        </div>
    );
}
