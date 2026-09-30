import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GroupedSearchResult, IndexEntry, IndexType } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useConvert, useT, formatTemplate } from '../../i18n';
import {
    countActiveFilters, CLASSIFICATIONS, DYNASTY_GROUPS, LOSS_OPTIONS, EMPTY_FILTERS, filtersToParams,
    type SearchFilters,
} from '../../core/search-filters';
import { SearchFiltersPanel } from './SearchFiltersPanel';
import { SearchResultsTable } from './SearchResultsTable';
import { SearchCardGrid } from './SearchCardGrid';
import { ResultPager } from './ResultPager';
import { SEARCH_V4_CSS } from './search-css';
import { TypeMark } from '../common/TypeMark';
import { bim } from '../../styles/tokens';

export const SEARCH_VIEW_STORAGE_KEY = 'bim-search-view';
export const RESULT_PAGE_SIZE = 50;
/** 「全部」页签里每类先列几条 */
const ALL_TAB_LIMIT = 5;
/** Meili 默认只翻到前 1000 条（代理 MAX_OFFSET），页码封顶 */
const MAX_HITS = 1000;

export type SearchView = 'table' | 'card';

/** 页签／分组的顺序（设计稿：作品／丛编／版本／人物） */
const TAB_ORDER: IndexType[] = ['work', 'collection', 'book', 'entity'];
const KEY_OF: Record<IndexType, keyof GroupedSearchResult> = { work: 'works', collection: 'collections', book: 'books', entity: 'entities' };
const TOTAL_OF: Record<IndexType, keyof GroupedSearchResult> = { work: 'totalWorks', collection: 'totalCollections', book: 'totalBooks', entity: 'totalEntities' };

function readStoredView(): SearchView {
    try {
        return window.localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) === 'card' ? 'card' : 'table';
    } catch {
        return 'table';
    }
}
function storeView(v: SearchView) {
    try { window.localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, v); } catch { /* 隐私模式等：只在本页生效 */ }
}

export interface SearchResultsProps {
    transport: IndexStorage;
    query: string;
    filters: SearchFilters;
    onFiltersChange: (next: SearchFilters) => void;
    onEntryLinkClick: (entry: IndexEntry, e: React.MouseEvent<HTMLAnchorElement>) => void;
    typeName: (type: IndexType) => string;
}

const totals = (r: GroupedSearchResult | null, type: IndexType) => ((r?.[TOTAL_OF[type]] as number | undefined) ?? 0);
const entriesOf = (r: GroupedSearchResult | null, type: IndexType) => ((r?.[KEY_OF[type]] as IndexEntry[] | undefined) ?? []);

/**
 * 搜索页 v4 结果区（overview#298）：左栏筛选＋类型页签＋表格／卡片视图＋翻页。
 *
 * 数据：「全部」页签走 searchAll（每类先 5 条）；点某一类页签走 search(type, {page, pageSize:50})，
 * 都带 filters（storage 不认就忽略）。页签上的条数始终来自 searchAll 的各类总数。
 * 筛选状态由宿主持有（进 URL）；视图选择存 localStorage（per-viewer 便利，读写包 try/catch）。
 * 换了检索词／筛选就回第 1 页；旧结果在新结果到达前保留（aria-busy），页面不跳。
 */
export const SearchResults: React.FC<SearchResultsProps> = ({ transport, query, filters, onFiltersChange, onEntryLinkClick, typeName }) => {
    const t = useT();
    const v = t.searchV4;
    const { convert } = useConvert();

    const [view, setViewState] = useState<SearchView>('table');
    useEffect(() => { setViewState(readStoredView()); }, []);
    const setView = (next: SearchView) => { setViewState(next); storeView(next); };

    const [activeType, setActiveType] = useState<IndexType | 'all'>('all');
    const [page, setPage] = useState(1);
    const [all, setAll] = useState<GroupedSearchResult | null>(null);
    const [typed, setTyped] = useState<{ entries: IndexEntry[]; total: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const filtersKey = filtersToParams(filters).toString();
    const active = countActiveFilters(filters) > 0;

    // 检索词／筛选变了：回「全部」第 1 页（筛选后原来的页签可能已经没有结果）
    const seen = useRef({ query, filtersKey });
    useEffect(() => {
        if (seen.current.query !== query || seen.current.filtersKey !== filtersKey) {
            seen.current = { query, filtersKey };
            setActiveType('all');
            setPage(1);
        }
    }, [query, filtersKey]);

    // 「全部」：各类前几条＋各类总数（页签条数的来源）
    useEffect(() => {
        let cancelled = false;
        setBusy(true);
        setError('');
        (async () => {
            try {
                let res: GroupedSearchResult;
                if (transport.searchAll) {
                    res = await transport.searchAll(query, ALL_TAB_LIMIT, filters);
                } else {
                    const types: IndexType[] = ['work', 'book', 'collection', 'entity'];
                    const rs = await Promise.all(types.map(ty => transport.search(query, ty, { page: 1, pageSize: ALL_TAB_LIMIT, filters })));
                    res = {
                        works: rs[0].entries, books: rs[1].entries, collections: rs[2].entries, entities: rs[3].entries,
                        totalWorks: rs[0].total, totalBooks: rs[1].total, totalCollections: rs[2].total, totalEntities: rs[3].total,
                    };
                }
                if (!cancelled) setAll(res);
            } catch (err) {
                if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setAll(null); }
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, query, filtersKey]);

    // 某一类的第 page 页
    useEffect(() => {
        if (activeType === 'all') { setTyped(null); return; }
        let cancelled = false;
        setBusy(true);
        (async () => {
            try {
                const r = await transport.search(query, activeType, { page, pageSize: RESULT_PAGE_SIZE, filters });
                if (!cancelled) setTyped({ entries: r.entries, total: r.total });
            } catch (err) {
                if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setTyped(null); }
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, query, filtersKey, activeType, page]);

    const tabs = useMemo(() => TAB_ORDER.filter(ty => totals(all, ty) > 0), [all]);
    const sum = tabs.reduce((n, ty) => n + totals(all, ty), 0);
    const empty = !busy && !error && all !== null && sum === 0;

    const choose = useCallback((ty: IndexType | 'all') => { setActiveType(ty); setPage(1); }, []);

    // 结果区顶上的「已选」小标签：点一个取消一个
    const chips = useMemo(() => {
        const out: { name: string; remove: () => void }[] = [];
        filters.dynasty.forEach(k => out.push({ name: k, remove: () => onFiltersChange({ ...filters, dynasty: filters.dynasty.filter(x => x !== k) }) }));
        filters.classification.forEach(c => out.push({
            name: CLASSIFICATIONS.find(x => x.value === c)?.label ?? c,
            remove: () => onFiltersChange({ ...filters, classification: filters.classification.filter(x => x !== c) }),
        }));
        if (filters.hasImage) out.push({ name: v.hasImage, remove: () => onFiltersChange({ ...filters, hasImage: false }) });
        if (filters.hasText) out.push({ name: v.hasText, remove: () => onFiltersChange({ ...filters, hasText: false }) });
        if (filters.hasCollated) out.push({ name: v.hasCollated, remove: () => onFiltersChange({ ...filters, hasCollated: false }) });
        if (filters.loss) out.push({ name: `${v.extant}：${LOSS_OPTIONS.find(o => o.value === filters.loss)?.label ?? ''}`, remove: () => onFiltersChange({ ...filters, loss: '' }) });
        return out;
    }, [filters, onFiltersChange, v]);

    const commonProps = { query, onEntryLinkClick, typeName };
    const renderList = (entries: IndexEntry[]) => view === 'table'
        ? <SearchResultsTable entries={entries} {...commonProps} />
        : <SearchCardGrid entries={entries} {...commonProps} />;

    const allTabEntries = TAB_ORDER.flatMap(ty => entriesOf(all, ty));

    return (
        <div className="bim-sr-layout">
            <style>{SEARCH_V4_CSS}</style>
            <SearchFiltersPanel filters={filters} onChange={onFiltersChange} />
            <div className="bim-sr-main" aria-busy={busy}>
                {/* 结果页签：全部 ＋ 各类（带条数） */}
                {tabs.length > 0 && (
                    <div className="bim-sr-tabs" role="group" aria-label={t.search.resultTabs} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px', borderBottom: `1px solid ${bim('rule')}` }}>
                        <TabButton on={activeType === 'all'} onClick={() => choose('all')}>
                            {t.search.allTab} <small>{sum.toLocaleString()}</small>
                        </TabButton>
                        {tabs.map(ty => (
                            <TabButton key={ty} on={activeType === ty} onClick={() => choose(ty)}>
                                {typeName(ty)} <small>{totals(all, ty).toLocaleString()}</small>
                            </TabButton>
                        ))}
                    </div>
                )}

                <div className="bim-sr-tools">
                    <div className="bim-sr-view" role="group" aria-label={convert(v.viewLabel)}>
                        <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>{convert(v.viewTable)}</button>
                        <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')}>{convert(v.viewCard)}</button>
                    </div>
                </div>

                {active && (
                    <div className="bim-sr-chips-row">
                        <span className="bim-sr-count" role="status">{convert(formatTemplate(v.filteredCount, { n: sum.toLocaleString() }))}</span>
                        {chips.map(c => (
                            <button key={c.name} type="button" className="bim-sr-tag-x" aria-label={convert(formatTemplate(v.removeFilter, { name: c.name }))} onClick={c.remove}>
                                {convert(c.name)}<span aria-hidden="true">×</span>
                            </button>
                        ))}
                    </div>
                )}

                {error && <div className="bim-sr-empty" role="alert">{error}</div>}
                {empty && <div className="bim-sr-empty">{convert(active ? v.emptyFiltered : formatTemplate(t.search.noResultsFor, { query }))}</div>}

                {!error && !empty && activeType === 'all' && all && (
                    view === 'table'
                        ? (
                            <>
                                <SearchResultsTable entries={allTabEntries} {...commonProps} />
                                <p className="bim-sr-note" style={{ marginTop: 10 }}>{convert(v.limitedNote)}</p>
                            </>
                        )
                        : (
                            <>
                                {tabs.map(ty => (
                                    <section key={ty} style={{ marginTop: 22 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <TypeMark type={ty} size={8} />{typeName(ty)}
                                                <span style={{ fontSize: 12.5, fontWeight: 400, color: bim('meta-fg') }}>{totals(all, ty).toLocaleString()} {t.unit.items}</span>
                                            </h2>
                                            {totals(all, ty) > entriesOf(all, ty).length && (
                                                <button type="button" className="bim-sr-clear" style={{ textDecoration: 'none' }} onClick={() => choose(ty)}>
                                                    {t.action.viewAll}
                                                </button>
                                            )}
                                        </div>
                                        <SearchCardGrid entries={entriesOf(all, ty)} {...commonProps} />
                                    </section>
                                ))}
                            </>
                        )
                )}

                {!error && activeType !== 'all' && typed && typed.entries.length > 0 && (
                    <>
                        {renderList(typed.entries)}
                        <ResultPager page={page} pageSize={RESULT_PAGE_SIZE} total={Math.min(typed.total, MAX_HITS)} onPage={setPage} />
                    </>
                )}
            </div>
        </div>
    );
};

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            style={{
                border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 14.5, minHeight: 44,
                padding: '8px 12px', letterSpacing: '.06em',
                color: on ? bim('ink') : bim('meta-fg'), fontWeight: on ? 700 : 400,
                boxShadow: on ? `inset 0 -2px 0 ${bim('accent')}` : 'none',
            }}
        >{children}</button>
    );
}
