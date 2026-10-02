import React from 'react';
import { useConvert, useT, formatTemplate } from '../../i18n';

/** 页码序列：首、尾、当前±1，其余折成 …（返回数字或 'gap'） */
export function pageWindow(page: number, pages: number): (number | 'gap')[] {
    const keep = new Set([1, pages, page - 1, page, page + 1].filter(p => p >= 1 && p <= pages));
    const sorted = Array.from(keep).sort((a, b) => a - b);
    const out: (number | 'gap')[] = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
        out.push(p);
    });
    return out;
}

/** 页码钳到 [1, 最后一页]（总数为 0 时是 1） */
export function clampPage(page: number, total: number, pageSize: number): number {
    const last = Math.max(1, Math.ceil(total / pageSize));
    return Math.min(Math.max(1, page), last);
}

export interface ResultPagerProps {
    page: number;
    pageSize: number;
    total: number;
    /** 「共 N 条」里显示的数（如封顶时的「1,000+」）；缺省 total */
    totalLabel?: string;
    onPage: (page: number) => void;
}

/** 「共 N 条 · 每页 50 条 · 第 1 / 20 页」＋ 上一页／页码／下一页（设计稿「搜索页 v2」） */
export const ResultPager: React.FC<ResultPagerProps> = ({ page, pageSize, total, totalLabel, onPage }) => {
    const t = useT().searchV4;
    const { convert } = useConvert();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (total <= 0) return null;
    return (
        <nav className="bim-sr-pager" aria-label={convert(t.pagerLabel)}>
            <span className="bim-sr-info">
                {convert(formatTemplate(t.pageInfo, { total: totalLabel ?? total.toLocaleString(), size: pageSize, page, pages }))}
            </span>
            {pages > 1 && (
                <ul>
                    <li><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{convert(t.prevPage)}</button></li>
                    {pageWindow(page, pages).map((p, i) => p === 'gap'
                        ? <li key={`g${i}`} className="bim-sr-gap" aria-hidden="true">…</li>
                        : (
                            <li key={p}>
                                <button
                                    type="button"
                                    aria-current={p === page ? 'page' : undefined}
                                    aria-label={`${p}`}
                                    onClick={() => onPage(p)}
                                >{p}</button>
                            </li>
                        ))}
                    <li><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{convert(t.nextPage)}</button></li>
                </ul>
            )}
        </nav>
    );
};
