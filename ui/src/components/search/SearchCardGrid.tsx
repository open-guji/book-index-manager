import React from 'react';
import type { IndexEntry, IndexType } from '../../types';
import { useConvert, useT } from '../../i18n';
import { splitHighlightSnippet } from '../../core/highlight';
import { useBidUrl } from '../../core/bid-url';
import { Highlighted } from './SearchResultsTable';
import { bim } from '../../styles/tokens';

export const SEARCH_CARD_CSS = `
.bim-sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 10px; }
.bim-sc { display: flex; flex-direction: column; min-width: 0; padding: 14px 16px 12px; border: 1px solid ${bim('rule')}; background: ${bim('card-bg')}; color: inherit; text-decoration: none; }
.bim-sc:hover { border-color: ${bim('rule-dashed')}; box-shadow: ${bim('fr-shadow')}; }
.bim-sc-t { font-size: 15.5px; font-weight: 500; letter-spacing: .04em; line-height: 1.5; color: ${bim('ink')}; }
.bim-sc:hover .bim-sc-t { color: ${bim('accent')}; }
.bim-sc-m { margin-top: 3px; font-size: 12.5px; color: ${bim('meta-fg')}; }
.bim-sc-s { margin: 8px 0 0; font-size: 13px; line-height: 1.8; color: ${bim('quiet-fg')}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bim-sc-s mark { background: ${bim('selection-bg')}; color: ${bim('ink')}; padding: 0 1px; }
.bim-sc-sp { flex: 1; }
.bim-sc-f { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid ${bim('rule')}; }
.bim-sc-fl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: ${bim('aux-fg')}; }
.bim-sc-tags { display: flex; gap: 4px; flex: none; }
:root[data-layout="boxed"] .bim-sc { box-shadow: none; }
`;

export interface SearchCardGridProps {
    entries: IndexEntry[];
    query?: string;
    onEntryLinkClick: (entry: IndexEntry, e: React.MouseEvent<HTMLAnchorElement>) => void;
    typeName: (type: IndexType) => string;
}

/** 卡片视图（设计稿「搜索页 v2」）：题名、〔朝代〕责任者 · 卷数、简介命中片段、页脚（类型 · 部类）＋资源小标签 */
export const SearchCardGrid: React.FC<SearchCardGridProps> = ({ entries, query, onEntryLinkClick, typeName }) => {
    const t = useT();
    const v = t.searchV4;
    const { convert } = useConvert();
    const buildUrl = useBidUrl();
    return (
        <div className="bim-sc-grid">
            <style>{SEARCH_CARD_CSS}</style>
            {entries.map(e => {
                const title = convert(e.title || e.primary_name || e.id);
                const measure = e.measure_info ? convert(e.measure_info) : (e.juan_count ? `${e.juan_count}${t.unit.juan}` : '');
                const who = e.type === 'entity'
                    ? (e.birth_year != null || e.death_year != null ? `${e.birth_year ?? '？'}—${e.death_year ?? '？'}` : '')
                    : `${e.dynasty ? `〔${convert(e.dynasty)}〕` : ''}${e.author ? convert(e.author) : ''}`;
                const meta = [who, e.type === 'book' && e.edition ? convert(e.edition) : '', measure].filter(Boolean).join(' · ');
                const foot = [typeName(e.type), e.classification ? convert(e.classification) : ''].filter(Boolean).join(' · ');
                const tags: { label: string; cls: string }[] = [];
                if (e.has_image) tags.push({ label: v.tagImage, cls: 'bim-sr-tag--img' });
                if (e.has_text || e.has_collated) tags.push({ label: v.tagText, cls: '' });
                if (e.loss_status === 'lost') tags.push({ label: v.tagLost, cls: 'bim-sr-tag--lost' });
                return (
                    <a key={e.id} className="bim-sc" href={buildUrl(e.id)} onClick={ev => onEntryLinkClick(e, ev)}>
                        <span className="bim-sc-t"><Highlighted text={title} query={query ? convert(query) : undefined} /></span>
                        {meta && <span className="bim-sc-m">{meta}</span>}
                        {e.descriptionSnippet && (
                            <p className="bim-sc-s">
                                {splitHighlightSnippet(e.descriptionSnippet).map((seg, i) => seg.marked
                                    ? <mark key={i}>{convert(seg.text)}</mark>
                                    : <React.Fragment key={i}>{convert(seg.text)}</React.Fragment>)}
                            </p>
                        )}
                        <span className="bim-sc-sp" />
                        <div className="bim-sc-f">
                            <span className="bim-sc-fl">{foot}</span>
                            <span className="bim-sc-tags">
                                {tags.map(g => <span key={g.label} className={`bim-sr-tag ${g.cls}`}>{convert(g.label)}</span>)}
                            </span>
                        </div>
                    </a>
                );
            })}
        </div>
    );
};
