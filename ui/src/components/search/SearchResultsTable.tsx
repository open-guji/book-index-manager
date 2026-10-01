import React from 'react';
import type { IndexEntry, IndexType } from '../../types';
import { useConvert, useT } from '../../i18n';
import { useBidUrl } from '../../core/bid-url';
import { TypeMark } from '../common/TypeMark';

export interface SearchResultsTableProps {
    entries: IndexEntry[];
    query?: string;
    /** 点题名：普通左键交给宿主做客户端路由（同 EntryCard） */
    onEntryLinkClick: (entry: IndexEntry, e: React.MouseEvent<HTMLAnchorElement>) => void;
    typeName: (type: IndexType) => string;
}

/** 把 query 在文本里标黄（大小写不敏感，多次出现都标） */
export function Highlighted({ text, query }: { text: string; query?: string }) {
    const q = (query ?? '').trim();
    if (!q || !text) return <>{text}</>;
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    const out: React.ReactNode[] = [];
    let i = 0;
    let k = 0;
    while (i < text.length) {
        const j = lower.indexOf(needle, i);
        if (j < 0) { out.push(text.slice(i)); break; }
        if (j > i) out.push(text.slice(i, j));
        out.push(<mark key={k++} className="bim-sr-hl">{text.slice(j, j + needle.length)}</mark>);
        i = j + needle.length;
    }
    return <>{out}</>;
}

/**
 * 结果表格（v4 设计稿「搜索页 v2」）：题名｜类型｜责任者｜年代｜部类｜资源。
 * 真 <table>；题名是真 <a href>。窄屏（CSS）退成两行：题名＋一行「责任者 · 年代 · 部类」，不横向溢出。
 * 数据里没有的列显示「—」，不编造。
 */
export const SearchResultsTable: React.FC<SearchResultsTableProps> = ({ entries, query, onEntryLinkClick, typeName }) => {
    const t = useT();
    const v = t.searchV4;
    const { convert } = useConvert();
    const buildUrl = useBidUrl();

    return (
        <div className="bim-sr-tablewrap">
            <table className="bim-sr-table">
                <colgroup>
                    <col style={{ width: '34%' }} /><col style={{ width: '8%' }} /><col style={{ width: '19%' }} />
                    <col style={{ width: '13%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th scope="col">{convert(v.colTitle)}</th>
                        <th scope="col">{convert(v.colType)}</th>
                        <th scope="col">{convert(v.colAuthor)}</th>
                        <th scope="col">{convert(v.colEra)}</th>
                        <th scope="col">{convert(v.colClass)}</th>
                        <th scope="col" style={{ textAlign: 'right' }}>{convert(v.colResource)}</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map(e => {
                        const title = convert(e.title || e.primary_name || e.id);
                        const measure = e.measure_info ? convert(e.measure_info) : (e.juan_count ? `${e.juan_count}${t.unit.juan}` : '');
                        const who = e.type === 'entity'
                            ? [e.birth_year != null || e.death_year != null ? `${e.birth_year ?? '？'}—${e.death_year ?? '？'}` : ''].filter(Boolean).join('')
                            : (e.author ? `${convert(e.author)}${e.role && e.role !== 'author' ? ` ${convert(e.role)}` : ''}` : '');
                        const era = e.type === 'book' ? (e.era ?? e.dynasty) : e.dynasty;
                        const eraText = era ? convert(era) : '';
                        const cls = e.classification ? convert(e.classification) : '';
                        const tags: { label: string; cls: string }[] = [];
                        if (e.has_image) tags.push({ label: v.tagImage, cls: 'bim-sr-tag--img' });
                        if (e.has_text || e.has_collated) tags.push({ label: v.tagText, cls: '' });
                        if (e.loss_status === 'lost') tags.push({ label: v.tagLost, cls: 'bim-sr-tag--lost' });
                        const sub = [who, eraText, cls].filter(Boolean).join(' · ');
                        return (
                            <tr key={e.id}>
                                <td className="bim-sr-c-title">
                                    {/* 链接与卷数各占 flex 一格：不是「正文里夹一个链接」，否则 axe 要求链接与周围字有 3:1 的反差或下划线 */}
                                    <div className="bim-sr-tl">
                                        <a href={buildUrl(e.id)} onClick={ev => onEntryLinkClick(e, ev)}>
                                            <Highlighted text={title} query={query ? convert(query) : undefined} />
                                        </a>
                                        {measure && <span className="bim-sr-measure">{measure}</span>}
                                    </div>
                                    {sub && <span className="bim-sr-sub">{sub}</span>}
                                </td>
                                <td className="bim-sr-c-type"><TypeMark type={e.type} size={6} /> {typeName(e.type)}</td>
                                <td className="bim-sr-c-who">{who || '—'}</td>
                                <td className="bim-sr-c-era">{eraText || '—'}</td>
                                <td className="bim-sr-c-cls">{cls || '—'}</td>
                                <td className="bim-sr-c-res">
                                    {tags.map(g => <span key={g.label} className={`bim-sr-tag ${g.cls}`}>{convert(g.label)}</span>)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
