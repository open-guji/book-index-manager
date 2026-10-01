/**
 * 元数据首页（/book-index 无检索词时，overview#322）各分区组件：页首类型签、最近浏览、历代史志（书架＋著录进度＋同类书目）、
 * 四部、丛编、人物时间轴、版本谱系、在线资源、数据与授权，以及把它们排在一起的 MetaHomeView。
 *
 * 和阅读首页同一套外壳与判准（分区、书架、四部、行列表直接用 read-home 的组件与 bim-rh-* 样式）；
 * 阅读首页偏普通读者，这里偏学术：四部计全部作品，书架点进作品页并标著录条目数。
 * 组件只收 props、不取数（数据见 ./model 的 MetaHomeSections）；「最近浏览」例外：读本浏览器 localStorage，经 transport 取条目。
 * 界面文字走 t('metaHome.*')（字典 i18n/messages/meta-home.ts），sections.json 来的书目名、分组名、人名等数据走 convert。没有数据的分区整块不出（策展文件没交时丛编、人物、谱系为空）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey, TFunction } from '../../i18n';
import type { IndexType } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { clearAllRecentIds, loadRecentIds, resolveRecentEntry, type RecentEntry } from '../../core/recent';
import { READ_HOME_CSS } from '../read-home/read-home-css';
import { groupCapped, ReadSection, ReadShelf, ReadSibu } from '../read-home/ReadHome';
import { authorsLine, fmtCount } from '../read-home/model';
import type { ReadHomeLinks } from '../read-home/model';
import { META_HOME_CSS } from './meta-home-css';
import { pct, timelineLayout, withMetaLinks, yearText } from './model';
import type { MetaBibliographer, MetaCatalogProgress, MetaHomeLinks, MetaHomeSections, MetaSite, MetaWorkRef } from './model';

type Links = ReturnType<typeof withMetaLinks>;

/** 阅读首页组件吃的链接：书脊、行都进条目页，分类节点进总目 */
function readLinks(l: Links): Partial<ReadHomeLinks> {
    return { read: l.item, work: l.item, node: l.node };
}


/** 页首类型签：全部／作品／版本／丛编／人物（带条目数）；宿主没给 links.type 就不出 */
export function MetaTypeChips({ counts, links }: { counts: MetaHomeSections['counts']; links?: Partial<MetaHomeLinks> }) {
    const { t } = useI18n();
    const href = links?.type;
    if (!href) return null;
    const rows: ['all' | IndexType, string, number | null][] = [
        ['all', t('metaHome.typeAll'), null], ['work', t('metaHome.typeLabel.work'), counts.works], ['book', t('metaHome.typeLabel.book'), counts.books],
        ['collection', t('metaHome.typeLabel.collection'), counts.collections], ['entity', t('metaHome.typeLabel.entity'), counts.entities],
    ];
    return (
        <ul className="bim-mh-types bim-rh-num" aria-label={t('metaHome.typeChipsLabel')}>
            {rows.map(([k, label, n]) => (
                <li key={k}>
                    <a href={href(k)}><b>{label}</b>{n != null && n > 0 && <small>{fmtCount(n)}</small>}</a>
                </li>
            ))}
        </ul>
    );
}

/**
 * 最近浏览的条目（本浏览器 localStorage，与 IndexBrowser 同一个键）。
 * 首帧为 null（服务端与客户端一致，不读 localStorage），挂载后读出并经 transport 取条目。
 */
export function useRecentEntries(transport: Pick<IndexStorage, 'getItem' | 'getEntry'> | undefined, limit = 5) {
    const [entries, setEntries] = useState<RecentEntry[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        const ids = loadRecentIds().slice(0, limit);
        if (!ids.length || !transport) { setEntries([]); return; }
        Promise.all(ids.map((id) => resolveRecentEntry(transport, id))).then((r) => {
            if (!cancelled) setEntries(r.filter((e) => !e.notFound));
        });
        return () => { cancelled = true; };
    }, [transport, limit]);
    const clear = useCallback(() => { clearAllRecentIds(); setEntries([]); }, []);
    return { entries, clear };
}

/** 副信息：有数据（版本名、年代、朝代）用数据并 convert，没有就写类型名 */
function recentSub(e: RecentEntry, t: TFunction, convert: (s: string) => string): string {
    const data = e.type === 'book' ? e.edition || e.era : e.type === 'collection' ? '' : e.dynasty;
    return data ? convert(data) : typeLabel(e.type, t);
}

function typeLabel(type: IndexType, t: TFunction): string {
    return t(`metaHome.typeLabel.${type}` as MessageKey);
}

/** 最近浏览栏（页首右侧）：类型标、题名、副信息；可清除；没有记录显示空状态 */
export function MetaRecentPanel({ entries, onClear, links }: {
    /** null＝还没读出来（首帧），不出列表也不出空状态 */
    entries: RecentEntry[] | null;
    onClear?: () => void;
    links?: Partial<MetaHomeLinks>;
}) {
    const { t, convert } = useI18n();
    const l = withMetaLinks(links);
    return (
        <aside className="bim-mh-recent" aria-labelledby="bim-mh-recent-h">
            <div className="bim-mh-recent-h">
                <h2 id="bim-mh-recent-h">{t('metaHome.recentTitle')}</h2>
                {entries && entries.length > 0 && onClear && (
                    <button type="button" onClick={onClear}>{t('metaHome.recentClear')}</button>
                )}
            </div>
            {entries && entries.length > 0 && (
                <ol>
                    {entries.map((e) => (
                        <li key={e.id}>
                            <a href={l.item(e.id)} aria-label={t('metaHome.recentItemLabel', { type: e.type ? typeLabel(e.type, t) : '', title: convert(e.title) })}>
                                <i className="bim-mh-ty" aria-hidden="true">{e.type ? t(`metaHome.typeShort.${e.type}` as MessageKey) : ''}</i>
                                <span>{convert(e.title)}</span>
                                <small aria-hidden="true">{recentSub(e, t, convert)}</small>
                            </a>
                        </li>
                    ))}
                </ol>
            )}
            {entries && entries.length === 0 && (
                <p className="bim-mh-recent-empty">{t('metaHome.recentEmpty')}</p>
            )}
        </aside>
    );
}

/** 进度状态 → 字典里的标签；字典没有的状态原样（经 convert）显示 */
function statusLabel(status: string, t: TFunction, convert: (s: string) => string, site = false): string {
    if (site && (status === 'done' || status === 'in_progress')) return t(`metaHome.siteStatus.${status}`);
    if (status === 'done' || status === 'in_progress' || status === 'todo') return t(`metaHome.status.${status}`);
    return convert(status);
}

/** 书目著录进度表：书目｜著录条目｜已对上作品｜进度｜状态。书目名只在对得上条目时才是链接 */
export function MetaCatalogTable({ rows, links }: { rows: MetaCatalogProgress[]; links?: Partial<MetaHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withMetaLinks(links);
    if (!rows.length) return null;
    return (
        <div className="bim-mh-tbl-wrap" tabIndex={0} role="region" aria-label={t('metaHome.catalogTitle')}>
            <table className="bim-mh-tbl">
                <caption>{t('metaHome.catalogTitle')}<small>{t('metaHome.catalogNote')}</small></caption>
                <thead>
                    <tr>
                        <th scope="col">{t('metaHome.colCatalog')}</th>
                        <th scope="col" className="bim-mh-r">{t('metaHome.colRecords')}</th>
                        <th scope="col" className="bim-mh-r">{t('metaHome.colMatched')}</th>
                        <th scope="col">{t('metaHome.colProgress')}</th>
                        <th scope="col">{t('metaHome.colStatus')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const p = pct(r.imported, r.total);
                        const target = r.work_id ?? r.collection_id;
                        const name = convert(r.edition ? `${r.name}·${r.edition}` : r.name);
                        return (
                            <tr key={r.id || r.name}>
                                <th scope="row">
                                    {target ? <a href={l.item(target)}>{name}</a> : name}
                                </th>
                                <td className="bim-mh-r">{fmtCount(r.total)}</td>
                                <td className="bim-mh-r">{fmtCount(r.imported)}</td>
                                <td>
                                    <span className="bim-mh-meter">
                                        <i aria-hidden="true" style={{ ['--bimmh-w' as string]: `${p}%` }} />
                                        <small>{p}%</small>
                                    </span>
                                </td>
                                <td>{r.status && <span className="bim-mh-st" data-st={r.status}>{statusLabel(r.status, t, convert)}</span>}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** 作品行列表（同类书目、丛编分组共用）：题名＋右侧小字 */
function Rows({ items, links, label }: { items: { id: string; title: string; sub?: string }[]; links: Links; label?: string }) {
    const { convert } = useI18n();
    return (
        <ul className="bim-rh-rows" aria-label={label ? convert(label) : undefined}>
            {items.map((x) => (
                <li key={x.id}>
                    <a href={links.item(x.id)}>
                        <span className="bim-rh-t">{convert(x.title)}</span>
                        {x.sub && <small>{convert(x.sub)}</small>}
                    </a>
                </li>
            ))}
        </ul>
    );
}

/** 同类书目与考证（不在书架上的）。手机端同丛编分组，只露前 4 条，「全部 N 部」展开（overview#325） */
export function MetaRelatedCatalogs({ works, links }: { works: MetaWorkRef[]; links?: Partial<MetaHomeLinks> }) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    if (!works.length) return null;
    const capped = groupCapped(works.length);
    return (
        <div className="bim-rh-grp" data-cap={capped ? '' : undefined} data-open={open ? '' : undefined}>
            <h3 className="bim-rh-gt">{t('metaHome.relatedTitle')}<small>{t('metaHome.relatedNote')}</small></h3>
            <Rows items={works.map((w) => ({ id: w.id, title: w.title, sub: authorsLine(w) || undefined }))} links={withMetaLinks(links)} />
            {capped && (
                <button type="button" className="bim-rh-expand" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                    {open ? t('action.collapse') : t('metaHome.allNWorks', { n: works.length })}
                </button>
            )}
        </div>
    );
}

/** 七阁的分组 key：这一组画成一排方格，其余分组画成列表 */
export const SEVEN_PAVILIONS_KEY = 'siku_qige';

/** 丛编的一组：手机端和阅读首页专题一样只露前 4 条（GROUP_NARROW_CAP），「全部 N 種」展开（overview#325） */
function CollectionGroup({ group, links }: { group: MetaHomeSections['collection_groups'][number]; links: Links }) {
    const { t, convert } = useI18n();
    const [open, setOpen] = useState(false);
    return (
        <div className="bim-rh-grp" data-cap={groupCapped(group.items.length) ? '' : undefined} data-open={open ? '' : undefined}>
            <h3 className="bim-rh-gt">{convert(group.label)}<small className="bim-rh-num">{t('metaHome.nKinds', { n: group.items.length })}</small></h3>
            <Rows items={group.items} links={links} label={group.label} />
            {groupCapped(group.items.length) && (
                <button type="button" className="bim-rh-expand" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                    {open ? t('action.collapse') : t('metaHome.allNKinds', { n: group.items.length })}
                </button>
            )}
        </div>
    );
}

/** 丛编：「四库七阁」一排方格，其余各组分栏列表 */
export function MetaCollectionGroups({ groups, links }: { groups: MetaHomeSections['collection_groups']; links?: Partial<MetaHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withMetaLinks(links);
    if (!groups.length) return null;
    const ge = groups.find((g) => g.key === SEVEN_PAVILIONS_KEY);
    const rest = groups.filter((g) => g !== ge);
    // 七阁格上只写阁名一字头（文淵閣本 → 文淵）；取不到就写全名
    const short = (title: string) => title.match(/(文[^\s·・閣阁]+)[閣阁]/)?.[1] ?? title;
    return (
        <>
            {ge && (
                <>
                    <h3 className="bim-rh-gt">{convert(ge.label)}<small>{convert(ge.items.map((x) => short(x.title)).join('、'))}</small></h3>
                    <ul className="bim-mh-ge" aria-label={convert(ge.label)}>
                        {ge.items.map((x) => (
                            <li key={x.id}>
                                <a href={l.item(x.id)} aria-label={convert(x.title)} title={convert(x.title)}>
                                    <span aria-hidden="true">{convert(short(x.title))}</span>
                                    {short(x.title) !== x.title && <small aria-hidden="true">{t('metaHome.pavilion')}</small>}
                                </a>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {rest.length > 0 && (
                <div className="bim-mh-cg" style={ge ? undefined : { marginTop: 0 }}>
                    {rest.map((g) => <CollectionGroup key={g.key} group={g} links={l} />)}
                </div>
            )}
        </>
    );
}

const LANE_H = 34;
/** 一人名字大约占轴宽的百分比（排车道用，防重叠） */
const LABEL_SHARE = 13;

function lifeText(p: MetaBibliographer, t: TFunction): string {
    if (p.birth_year == null && p.death_year == null) return '';
    return `${p.birth_year != null ? yearText(p.birth_year, t) : '?'}–${p.death_year != null ? yearText(p.death_year, t) : '?'}`;
}

/** 轴上的刻度：取整到 100／300 年 */
function axisTicks(min: number, max: number): number[] {
    const span = max - min;
    const step = span > 1200 ? 300 : span > 400 ? 100 : 50;
    const out: number[] = [];
    for (let y = Math.ceil(min / step) * step; y <= max; y += step) out.push(y);
    return out;
}

/** 人物：按生卒年成比例排在一条时间轴上；生卒年都没录的不上轴，在轴下注明。手机改列表 */
export function MetaPeopleTimeline({ people, links }: { people: MetaBibliographer[]; links?: Partial<MetaHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withMetaLinks(links);
    if (!people.length) return null;
    const { min, max, placed, missing } = timelineLayout(people);
    const lanes: number[] = [];
    const bars = placed.map((x) => {
        // 靠右端的名字往左排（右对齐卒年），占的区间跟着变
        const end = x.left > 70;
        const from = end ? Math.min(x.left, x.left + x.width - LABEL_SHARE) : x.left;
        let lane = 0;
        while (lanes[lane] != null && lanes[lane] > from) lane++;
        lanes[lane] = end ? x.left + x.width : x.left + Math.max(x.width, LABEL_SHARE);
        return { ...x, lane, end };
    });
    const range = Math.max(1, max - min);
    return (
        <>
            {bars.length > 0 && (
                <div className="bim-mh-tl">
                    <ul className="bim-mh-tl-rows" style={{ height: lanes.length * LANE_H + 10 }}>
                        {bars.map((b) => (
                            <li
                                key={b.p.id}
                                className="bim-mh-tl-bar"
                                data-end={b.end ? '' : undefined}
                                style={{ left: `${b.left}%`, top: b.lane * LANE_H + 4, width: `${Math.max(b.width, 0.5)}%` }}
                            >
                                <i aria-hidden="true" style={{ width: '100%' }} />
                                <a href={l.item(b.p.id)}>{convert(b.p.name)}<small className="bim-rh-num">{lifeText(b.p, t)}</small></a>
                            </li>
                        ))}
                    </ul>
                    <div className="bim-mh-tl-axis" aria-hidden="true">
                        {axisTicks(min, max).map((y) => (
                            <span key={y} style={{ left: `${((y - min) / range) * 100}%` }}>{yearText(y, t)}</span>
                        ))}
                    </div>
                </div>
            )}
            {/* 列表：手机代替时间轴；没人有生卒年时宽屏也用它。宽屏有轴时整份 display:none（轴上的链接本身可读可点） */}
            <ul className="bim-mh-tl-list" data-only={bars.length ? undefined : ''}>
                {(bars.length ? people : missing).map((p) => (
                    <li key={p.id}>
                        <a href={l.item(p.id)}>
                            <span>{convert(p.name)}</span>
                            <small className="bim-rh-num">{[p.dynasty ? convert(p.dynasty) : '', lifeText(p, t)].filter(Boolean).join('　')}</small>
                        </a>
                    </li>
                ))}
            </ul>
            {missing.length > 0 && bars.length > 0 && (
                <p className="bim-mh-tl-foot">{t('metaHome.missingLife', { names: convert(missing.map((p) => p.name).join('、')) })}</p>
            )}
        </>
    );
}

const TREE_ICON = (
    <svg width="54" height="34" viewBox="0 0 54 34" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <circle cx="27" cy="5" r="3.5" /><circle cx="10" cy="29" r="3.5" /><circle cx="27" cy="29" r="3.5" /><circle cx="44" cy="29" r="3.5" />
        <path d="M27 8.5v17M27 15H10v10.5M27 15h17v10.5" />
    </svg>
);

/** 版本谱系：有谱系的作品，一部一张卡，点进作品页 */
export function MetaLineageCards({ works, links }: { works: MetaWorkRef[]; links?: Partial<MetaHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withMetaLinks(links);
    if (!works.length) return null;
    return (
        <ul className="bim-mh-lin">
            {works.map((w) => {
                const by = authorsLine(w);
                return (
                    <li key={w.id}>
                        <a href={l.item(w.id)}>
                            {TREE_ICON}
                            <b>{convert(w.title)}</b>
                            {by && <small>{convert(by)}</small>}
                            <span>{t('metaHome.viewLineage')}</span>
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

/** 在线资源：已对接与进行中的画比例条；计划中的列一行 */
export function MetaOnlineSites({ sites }: { sites: MetaSite[] }) {
    const { t, convert } = useI18n();
    const live = sites.filter((s) => s.status !== 'todo' && s.total > 0);
    const todo = sites.filter((s) => !live.includes(s));
    if (!sites.length) return null;
    return (
        <>
            {live.length > 0 && (
                <ul className="bim-mh-cov">
                    {live.map((s) => {
                        const p = pct(s.imported, s.total);
                        return (
                            <li key={s.id || s.name}>
                                {s.url ? <a href={s.url} rel="noopener noreferrer" target="_blank">{convert(s.name)}</a> : <span>{convert(s.name)}</span>}
                                <span className="bim-mh-bar" aria-hidden="true" style={{ ['--bimmh-w' as string]: `${p}%` }} />
                                <small>
                                    {`${fmtCount(s.imported)} / ${fmtCount(s.total)}　${p}%　`}
                                    {s.status && <span className="bim-mh-st" data-st={s.status}>{statusLabel(s.status, t, convert, true)}</span>}
                                </small>
                            </li>
                        );
                    })}
                </ul>
            )}
            {todo.length > 0 && <p className="bim-mh-todo">{t('metaHome.plannedSites', { names: convert(todo.map((s) => s.name).join('、')) })}</p>}
        </>
    );
}

/** 存佚四档（标签与说明在字典 metaHome.loss／lossNote） */
const LOSS_KEYS = ['extant', 'partially_extant', 'lost', 'unknown'] as const;

/** 数据与授权：数据规模 8 项、按存佚检索 4 个入口、CC0 授权与数据版本 */
export function MetaDataLicense({ stats, links, version, repoUrl, downloadHref }: {
    stats: MetaHomeSections['stats'];
    links?: Partial<MetaHomeLinks>;
    /** 当前数据版本（宿主从 latest.json／version.json 取），如「501935e · 2026-09-27」；不给不出 */
    version?: React.ReactNode;
    /** 数据仓库地址；不给只写仓库名 */
    repoUrl?: string;
    /** 引用方式与数据下载；不给不出 */
    downloadHref?: string;
}) {
    const { t } = useI18n();
    const nums = (['works', 'books', 'collections', 'entities', 'has_image', 'has_text', 'article', 'poem'] as const)
        .map((k) => [stats[k], t(`metaHome.stat.${k}`)] as [number, string])
        .filter(([n]) => n > 0);
    const lossHref = links?.loss;
    const hasLossCounts = LOSS_KEYS.some((k) => (stats.loss?.[k] ?? 0) > 0);
    return (
        <div className="bim-mh-data">
            {nums.length > 0 && (
                <div>
                    <h3 className="bim-rh-gt">{t('metaHome.dataScale')}</h3>
                    <ul className="bim-mh-nums">
                        {nums.map(([n, label]) => <li key={label}><b className="bim-rh-num">{fmtCount(n)}</b><span>{label}</span></li>)}
                    </ul>
                </div>
            )}
            {lossHref && (
                <div>
                    <h3 className="bim-rh-gt">{t('metaHome.byLoss')}</h3>
                    <ul className="bim-mh-loss">
                        {LOSS_KEYS.map((k) => {
                            const n = stats.loss?.[k] ?? 0;
                            const note = t(`metaHome.lossNote.${k}`);
                            return (
                                <li key={k}>
                                    <a href={lossHref(k)}>
                                        {t(`metaHome.loss.${k}`)}
                                        <small className="bim-rh-num">{hasLossCounts && n > 0 ? t('metaHome.lossCount', { n: fmtCount(n), note }) : note}</small>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            <div className="bim-mh-lic">
                <p><span className="bim-mh-cc0">CC0</span>{t('metaHome.license')}</p>
                <p>{t('metaHome.repo')}{repoUrl ? <a href={repoUrl}><code>book-index</code></a> : <code>book-index</code>}{t('metaHome.repoNote')}</p>
                {version && <p>{t('metaHome.version')}<code>{version}</code></p>}
                {downloadHref && <p><a href={downloadHref}>{t('metaHome.download')}</a></p>}
            </div>
        </div>
    );
}

export interface MetaHomeViewProps {
    sections: MetaHomeSections;
    links?: Partial<MetaHomeLinks>;
    /** 页首左栏（宿主的检索框），类型签接在它下面 */
    head?: React.ReactNode;
    /** 最近浏览：传 transport 由组件自己读 localStorage 并取条目；不传不出最近浏览栏 */
    transport?: Pick<IndexStorage, 'getItem' | 'getEntry'>;
    /** 「四部」标题行右侧「进入目录 →」 */
    catalogHref?: string;
    /** 「丛编」标题行右侧「全部 N 种 →」 */
    collectionsHref?: string;
    /** 「人物」标题行右侧「全部 N 人 →」 */
    entitiesHref?: string;
    /** 数据与授权里的版本行、仓库地址、下载链接 */
    version?: React.ReactNode;
    repoUrl?: string;
    downloadHref?: string;
    className?: string;
}

/** 分区 id（也是分区导航的锚点） */
export const META_HOME_SECTION_IDS = {
    zhi: 'zhi', sibu: 'sibu', cong: 'cong', people: 'people', lineage: 'lineage', sites: 'sites', data: 'data',
} as const;

/**
 * 元数据首页整页：页首（检索插槽＋类型签｜最近浏览）→ 分区导航 → 历代史志 → 四部 → 丛编 → 人物 → 版本谱系 → 在线资源 → 数据与授权。
 * 没有数据的分区整块不出，分区导航也跟着不列。不出大小标题和导语（用户 10-01）。
 */
export function MetaHomeView({
    sections, links, head, transport, catalogHref, collectionsHref, entitiesHref, version, repoUrl, downloadHref, className,
}: MetaHomeViewProps) {
    const { t } = useI18n();
    const s = sections;
    const l = withMetaLinks(links);
    const rl = readLinks(l);
    const ids = META_HOME_SECTION_IDS;
    const recent = useRecentEntries(transport);
    const has = {
        zhi: !!s.shelf?.items.length || s.catalog_progress.length > 0 || s.related_catalogs.length > 0,
        sibu: s.bu.length > 0 || s.unclassified > 0,
        cong: s.collection_groups.length > 0,
        people: s.bibliographers.length > 0,
        lineage: s.lineage.length > 0,
        sites: s.sites.length > 0,
        data: true,
    };
    const nav = (Object.keys(ids) as (keyof typeof ids)[]).filter((k) => has[k]);
    const navText = (k: keyof typeof ids) => t(`metaHome.nav.${k}`);
    const more = (href: string | undefined, text: string) => (href ? <a className="bim-rh-more" href={href}>{text}</a> : undefined);
    const sitesDen = s.sites.find((x) => x.total > 0)?.total;
    const sameDen = sitesDen != null && s.sites.every((x) => x.total === 0 || x.total === sitesDen);
    return (
        <div className={className ? `bim-rh bim-mh ${className}` : 'bim-rh bim-mh'}>
            <style>{READ_HOME_CSS + META_HOME_CSS}</style>
            <div className="bim-mh-head">
                <div className="bim-mh-q">
                    {head}
                    <MetaTypeChips counts={s.counts} links={links} />
                </div>
                {transport && <MetaRecentPanel entries={recent.entries} onClear={recent.clear} links={links} />}
            </div>
            {nav.length > 1 && (
                <nav className="bim-rh-secnav" aria-label={t('metaHome.navLabel')}>
                    <ul>{nav.map((k) => <li key={k}><a href={`#${ids[k]}`}>{navText(k)}</a></li>)}</ul>
                </nav>
            )}
            <div className="bim-rh-main">
                {has.zhi && (
                    <ReadSection id={ids.zhi} title={navText('zhi')} sub={t('metaHome.zhiSub')}>
                        {s.shelf && s.shelf.items.length > 0 && (
                            <ReadShelf
                                topic={{ key: 'shelf', label: s.shelf.label, shelf: true, items: s.shelf.items }}
                                links={rl}
                                showTitle={false}
                                legendCount={s.shelf.items.some((x) => x.records) ? t('metaHome.shelfLegendCount') : null}
                                legendExtra={[t('metaHome.shelfLegendClick')]}
                            />
                        )}
                        {(s.catalog_progress.length > 0 || s.related_catalogs.length > 0) && (
                            <div className="bim-mh-zhi" style={s.shelf?.items.length ? undefined : { marginTop: 0 }}>
                                <MetaCatalogTable rows={s.catalog_progress} links={links} />
                                <MetaRelatedCatalogs works={s.related_catalogs} links={links} />
                            </div>
                        )}
                    </ReadSection>
                )}
                {has.sibu && (
                    <ReadSection id={ids.sibu} title={navText('sibu')} sub={t('metaHome.sibuSub')} more={more(catalogHref, t('metaHome.toCatalog'))}>
                        <ReadSibu bu={s.bu} unclassified={s.unclassified} links={rl} unclassifiedNote={t('metaHome.unclassifiedNote')} />
                    </ReadSection>
                )}
                {has.cong && (
                    <ReadSection
                        id={ids.cong}
                        title={navText('cong')}
                        sub={t('metaHome.congSub')}
                        more={more(collectionsHref, t('metaHome.allNKindsMore', { n: fmtCount(s.counts.collections) }))}
                    >
                        <MetaCollectionGroups groups={s.collection_groups} links={links} />
                    </ReadSection>
                )}
                {has.people && (
                    <ReadSection
                        id={ids.people}
                        title={navText('people')}
                        sub={t('metaHome.peopleSub')}
                        more={more(entitiesHref, t('metaHome.allNPeopleMore', { n: fmtCount(s.counts.entities) }))}
                    >
                        <MetaPeopleTimeline people={s.bibliographers} links={links} />
                    </ReadSection>
                )}
                {has.lineage && (
                    <ReadSection id={ids.lineage} title={navText('lineage')} sub={t('metaHome.lineageSub')}>
                        <MetaLineageCards works={s.lineage} links={links} />
                    </ReadSection>
                )}
                {has.sites && (
                    <ReadSection
                        id={ids.sites}
                        title={navText('sites')}
                        sub={sameDen ? t('metaHome.sitesSubDen', { n: fmtCount(sitesDen!) }) : t('metaHome.sitesSub')}
                    >
                        <MetaOnlineSites sites={s.sites} />
                    </ReadSection>
                )}
                <ReadSection id={ids.data} title={navText('data')} sub={t('metaHome.dataSub')}>
                    <MetaDataLicense stats={s.stats} links={links} version={version} repoUrl={repoUrl} downloadHref={downloadHref} />
                </ReadSection>
            </div>
        </div>
    );
}
