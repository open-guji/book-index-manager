import React, { useId, useState } from 'react';
import { useConvert, useT, formatTemplate } from '../../i18n';
import {
    CLASSIFICATIONS, DYNASTY_GROUPS, LOSS_OPTIONS, countActiveFilters, EMPTY_FILTERS, type SearchFilters,
} from '../../core/search-filters';

export interface SearchFiltersPanelProps {
    filters: SearchFilters;
    onChange: (next: SearchFilters) => void;
}

function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
}

/**
 * 搜索页左栏「筛选」：朝代、部类、资源、存佚四组＋「清除全部筛选」（设计稿「搜索页 v2」）。
 * 受控组件：状态在宿主（进 URL）。窄屏（≤719px）收成一个「筛选」按钮，点开展开面板（CSS 控制显隐，
 * 这里只管 aria-expanded）。各组暂不显示命中数：代理没放行 facets。
 */
export const SearchFiltersPanel: React.FC<SearchFiltersPanelProps> = ({ filters, onChange }) => {
    const t = useT().searchV4;
    const { convert } = useConvert();
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const n = countActiveFilters(filters);
    const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });

    return (
        <aside className="bim-sr-aside" aria-label={convert(t.filterTitle)}>
            <button
                type="button"
                className="bim-sr-fbtn"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen(o => !o)}
            >
                <span>
                    {convert(t.filterButton)}
                    {n > 0 && <span className="bim-sr-fn">{convert(formatTemplate(t.filterSelected, { n }))}</span>}
                </span>
                <span className="bim-sr-fa" aria-hidden="true">{convert(open ? t.collapse : t.expand)} {open ? '▴' : '▾'}</span>
            </button>
            <div className="bim-sr-filters" id={panelId} data-open={open ? 'true' : 'false'} {...(open ? {} : { 'data-collapsed': 'true' })}>
                <section className="bim-sr-fg">
                    <h3>{convert(t.dynasty)}</h3>
                    <div className="bim-sr-chips">
                        {DYNASTY_GROUPS.map(g => (
                            <button
                                key={g.key}
                                type="button"
                                className="bim-sr-chip"
                                aria-pressed={filters.dynasty.includes(g.key)}
                                onClick={() => set({ dynasty: toggle(filters.dynasty, g.key) })}
                            >{convert(g.key)}</button>
                        ))}
                    </div>
                </section>
                <section className="bim-sr-fg">
                    <h3>{convert(t.classification)}</h3>
                    {CLASSIFICATIONS.map(c => (
                        <label key={c.value || '_'} className="bim-sr-opt">
                            <input
                                type="checkbox"
                                checked={filters.classification.includes(c.value)}
                                onChange={() => set({ classification: toggle(filters.classification, c.value) })}
                            />
                            {convert(c.label)}
                        </label>
                    ))}
                </section>
                <section className="bim-sr-fg">
                    <h3>{convert(t.resources)}</h3>
                    <label className="bim-sr-opt">
                        <input type="checkbox" checked={filters.hasImage} onChange={e => set({ hasImage: e.target.checked })} />
                        {convert(t.hasImage)}
                    </label>
                    <label className="bim-sr-opt">
                        <input type="checkbox" checked={filters.hasText} onChange={e => set({ hasText: e.target.checked })} />
                        {convert(t.hasText)}
                    </label>
                    <label className="bim-sr-opt">
                        <input type="checkbox" checked={filters.hasCollated} onChange={e => set({ hasCollated: e.target.checked })} />
                        {convert(t.hasCollated)}
                    </label>
                </section>
                <section className="bim-sr-fg">
                    <h3 id={`${panelId}-loss`}>{convert(t.extant)}</h3>
                    <div className="bim-sr-seg" role="group" aria-labelledby={`${panelId}-loss`}>
                        {LOSS_OPTIONS.map(o => (
                            <button
                                key={o.value || 'all'}
                                type="button"
                                aria-pressed={filters.loss === o.value}
                                onClick={() => set({ loss: o.value })}
                            >{convert(o.label)}</button>
                        ))}
                    </div>
                </section>
                <p className="bim-sr-note">{convert(t.onlyWorksNote)}</p>
                {n > 0 && (
                    <button type="button" className="bim-sr-clear" onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}>
                        {convert(t.clearAllFilters)}
                    </button>
                )}
            </div>
        </aside>
    );
};
