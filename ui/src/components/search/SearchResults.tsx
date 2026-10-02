import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GroupedSearchResult, IndexEntry, IndexType } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useConvert, useT, formatTemplate } from '../../i18n';
import {
    countActiveFilters, CLASSIFICATIONS, DYNASTY_GROUPS, EMPTY_FILTERS, filtersToParams,
    type SearchFilters,
} from '../../core/search-filters';
import { SearchFiltersPanel } from './SearchFiltersPanel';
import { SearchResultsTable } from './SearchResultsTable';
import { SearchCardGrid } from './SearchCardGrid';
import { ResultPager, clampPage } from './ResultPager';
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
export type ResultTab = IndexType | 'all';

const TAB_PARAM: Record<string, IndexType> = {
    work: 'work', works: 'work', book: 'book', books: 'book',
    collection: 'collection', collections: 'collection', entity: 'entity', entities: 'entity',
};

/** 地址里的结果页签（?tab=）→ 页签；单复数都认（work／works），认不出的回「全部」（overview#359 P2-3） */
export function resultTabFromParam(v: string | null | undefined): ResultTab {
    return (v && TAB_PARAM[v.toLowerCase()]) || 'all';
}

/** 页签 → 地址参数值；「全部」不进地址 */
export function resultTabToParam(tab: ResultTab): string | null {
    return tab === 'all' ? null : tab;
}

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
    /** 当前页签（宿主放进地址时传）；不传就由组件自己记 */
    tab?: ResultTab;
    /**
     * 用户点了页签。换检索词／筛选（不含只换排序）时组件自己回「全部」、不回调：
     * 受控的宿主改地址时应顺手去掉 tab，免得两次改地址互相覆盖。
     */
    onTabChange?: (tab: ResultTab) => void;
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
 * 切页签则不留旧结果：上一类的条目立即撤下，换成加载中，直到这一类的结果到达（overview#359 P2-2）。
 * 页签可由宿主受控（tab／onTabChange，网站放进 ?tab=，刷新、分享后保留）。
 */
export const SearchResults: React.FC<SearchResultsProps> = ({ transport, query, filters: filtersProp, onFiltersChange, onEntryLinkClick, typeName, tab, onTabChange }) => {
    const t = useT();
    const v = t.searchV4;
    const { convert } = useConvert();

    /** 存储层没声明认筛选：不显示筛选栏与排序，也不把 filters 交给它 */
    const supported = !!transport.supportsSearchFilters;
    const filters = useMemo(() => (supported ? filtersProp : EMPTY_FILTERS), [supported, filtersProp]);

    const [view, setViewState] = useState<SearchView>('table');
    useEffect(() => { setViewState(readStoredView()); }, []);
    const setView = (next: SearchView) => { setViewState(next); storeView(next); };

    const [activeType, setActiveType] = useState<ResultTab>(tab ?? 'all');
    // 宿主传来的页签变了（后退、改地址）：以宿主为准
    useEffect(() => { if (tab !== undefined) { setActiveType(tab); setPage(1); } }, [tab]);
    const [page, setPage] = useState(1);
    const [all, setAll] = useState<GroupedSearchResult | null>(null);
    /** 某一类的结果；key 记它属于哪一类，对不上（切了页签、新结果还没到）就不显示 */
    const [typed, setTyped] = useState<{ key: string; entries: IndexEntry[]; total: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const filtersKey = filtersToParams(filters).toString();
    const active = countActiveFilters(filters) > 0;

    // 检索词／筛选变了：回「全部」第 1 页（筛选后原来的页签可能已经没有结果）；只换排序：留在当前页签、回第 1 页
    const filterOnlyKey = filtersToParams({ ...filters, sort: '' }).toString();
    const seen = useRef({ query, filterOnlyKey, sort: filters.sort });
    useEffect(() => {
        const prev = seen.current;
        if (prev.query !== query || prev.filterOnlyKey !== filterOnlyKey) {
            setActiveType('all');
            setPage(1);
        } else if (prev.sort !== filters.sort) {
            setPage(1);
        }
        seen.current = { query, filterOnlyKey, sort: filters.sort };
    }, [query, filterOnlyKey, filters.sort]);

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
    // 只按类区分：同一类翻页时旧页留着（aria-busy），换了类才撤下
    const typedKey = activeType;
    useEffect(() => {
        if (activeType === 'all') { setTyped(null); return; }
        let cancelled = false;
        setBusy(true);
        (async () => {
            try {
                const r = await transport.search(query, activeType, { page, pageSize: RESULT_PAGE_SIZE, filters });
                if (!cancelled) setTyped({ key: typedKey, entries: r.entries, total: r.total });
            } catch (err) {
                if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setTyped(null); }
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, query, filtersKey, activeType, page]);

    // 页码越界（重新筛选后总数变少、或手输的旧链接）：按这一类自己的总数钳回最后一页
    // 这一类的结果到了没有（切页签后、新结果到达前为 null）
    const current = typed && typed.key === typedKey ? typed : null;

    useEffect(() => {
        if (activeType === 'all' || !current || busy) return;
        const capped = Math.min(current.total, MAX_HITS);
        const target = clampPage(page, capped, RESULT_PAGE_SIZE);
        if (current.entries.length === 0 && capped > 0 && target !== page) setPage(target);
    }, [activeType, current, busy, page]);

    const tabs = useMemo(() => TAB_ORDER.filter(ty => totals(all, ty) > 0), [all]);
    const sum = tabs.reduce((n, ty) => n + totals(all, ty), 0);
    const empty = !busy && !error && all !== null && sum === 0;

    const choose = useCallback((ty: ResultTab) => {
        setActiveType(ty);
        setPage(1);
        onTabChange?.(ty);
    }, [onTabChange]);

    // 结果区顶上的「已选」小标签：点一个取消一个
    const chips = useMemo(() => {
        const out: { name: string; remove: () => void }[] = [];
        filters.dynasty.forEach(k => out.push({ name: k, remove: () => onFiltersChange({ ...filters, dynasty: filters.dynasty.filter(x => x !== k) }) }));
        filters.classification.forEach(c => out.push({
            name: c ? (CLASSIFICATIONS.find(x => x.value === c)?.label ?? c) : t.searchPage.unclassified,
            remove: () => onFiltersChange({ ...filters, classification: filters.classification.filter(x => x !== c) }),
        }));
        if (filters.hasImage) out.push({ name: v.hasImage, remove: () => onFiltersChange({ ...filters, hasImage: false }) });
        if (filters.hasText) out.push({ name: v.hasText, remove: () => onFiltersChange({ ...filters, hasText: false }) });
        if (filters.hasCollated) out.push({ name: v.hasCollated, remove: () => onFiltersChange({ ...filters, hasCollated: false }) });
        if (filters.loss) out.push({ name: `${v.extant}：${t.searchPage.loss[filters.loss]}`, remove: () => onFiltersChange({ ...filters, loss: '' }) });
        return out;
    }, [filters, onFiltersChange, v, t]);

    const commonProps = { query, onEntryLinkClick, typeName };
    const renderList = (entries: IndexEntry[]) => view === 'table'
        ? <SearchResultsTable entries={entries} {...commonProps} />
        : <SearchCardGrid entries={entries} {...commonProps} />;

    const allTabEntries = TAB_ORDER.flatMap(ty => entriesOf(all, ty));

    return (
        <div className="bim-sr-layout" data-nofilters={supported ? undefined : 'true'}>
            <style>{SEARCH_V4_CSS}</style>
            {supported && <SearchFiltersPanel filters={filters} onChange={onFiltersChange} />}
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
                    {supported && (
                    <>
                    <div className="bim-sr-sorts" role="group" aria-label={convert(v.sortLabel)}>
                        <button type="button" aria-pressed={!filters.sort} onClick={() => onFiltersChange({ ...filters, sort: '' })}>{convert(v.sortRelevance)}</button>
                        {(['era', 'title'] as const).map(k => {
                            const cur = filters.sort.startsWith(`${k}:`) ? (filters.sort.endsWith('desc') ? 'desc' : 'asc') : null;
                            const label = k === 'era' ? v.sortEra : v.sortTitle;
                            const hint = k === 'era' ? (cur === 'desc' ? v.sortEraDesc : v.sortEraAsc) : (cur === 'desc' ? v.sortTitleDesc : v.sortTitleAsc);
                            return (
                                <button
                                    key={k}
                                    type="button"
                                    aria-pressed={cur !== null}
                                    title={convert(hint)}
                                    // 再点一次当前项＝翻转方向；点另一项从升序开始
                                    onClick={() => onFiltersChange({ ...filters, sort: `${k}:${cur === 'asc' ? 'desc' : 'asc'}` as SearchFilters['sort'] })}
                                >{convert(label)}{cur ? <span aria-hidden="true"> {cur === 'asc' ? '↑' : '↓'}</span> : null}</button>
                            );
                        })}
                    </div>
                    <span className="bim-sr-vsep" aria-hidden="true" />
                    </>
                    )}
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

                {/* 切到某一类、结果未到：不挂上一类的旧条目，也不留白 */}
                {!error && activeType !== 'all' && !current && (
                    <div className="bim-sr-empty" role="status" style={{ minHeight: 240 }}>{t.search.loading}</div>
                )}
                {!error && activeType !== 'all' && current && current.entries.length > 0 && (
                    <>
                        {renderList(current.entries)}
                        <ResultPager page={page} pageSize={RESULT_PAGE_SIZE} total={Math.min(current.total, MAX_HITS)} onPage={setPage} />
                    </>
                )}
                {/* 这一类这一页没有条目（页码过期／越界、或与「全部」的总数对不上）：给空状态，不留白 */}
                {!error && activeType !== 'all' && current && current.entries.length === 0 && !busy && (
                    <div className="bim-sr-empty">
                        {convert(active ? v.emptyFiltered : formatTemplate(t.search.noResultsFor, { query }))}
                        <div><button type="button" className="bim-sr-clear" onClick={() => choose('all')}>{t.search.allTab}</button></div>
                    </div>
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
