/**
 * 丛编页（武英殿聚珍版叢書这类）—— 2026-09 B1 新设计（overview#251）。
 *
 * 「子目」表的数据有三个来源，按信息量降序：目录档 → contained_works
 * → books[]（见 buildCollectionTable）。武英殿的 144 条走 contained_works。
 *
 * 中栏：子目（本丛编内检索 + 斑马表：冊次｜書名，下附撰人·卷數｜版本數）→ 影印与全文（按资源组分）；
 * 右栏：提要卡（「叢編」小字，长说明截 6 行可展开，不放主按钮）→ 包含作品；
 * 左栏：检索 →「上級叢編」→ 本页导航。
 *
 * 用户 09-28 在样张上定：长说明留在提要卡里截断；主按钮不放。
 * 2026-09-29 设计稿 v3（overview#286）：四部分类页签、册次前的部类色点、提要卡数字格
 * （子目／卷／册）与「全帙册次分布」条、检索框挪到页签行右侧；提要卡去掉「應收」「年代」两行
 * （数字格已含，年代已在「刊印」里）。部类来自各子目自己的分类，须逐条解析：子目不超过
 * CAP_TITLES 条以内时后台自动解析全部（≤16 个请求）；更多的要用户点「按部類分組」才逐批解析
 * （≤RESOLVE_ALL_TITLES 条），解析完页签与分布条才出，不按部分行估算。
 * 不自动全取：大丛编（如 144 子目）进页面就飞 140+ 个请求，测试站 e2e「请求数 <20」因此红。
 */
import React, { useState, useEffect, useMemo } from 'react';
import { bim } from '../../styles/tokens';
import type { AuthorInfo, CollectionDetailData, VolumeBookMapping } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useI18n } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, CapMore, narrowCapped, TabFilter, SummaryCard, SideList, CardFoot, RailUp, descNeedsClamp,
    type CardFact, type RailNavItem, type RailLink,
} from './layout';
import { buildCollectionTable, formatVolumeRange, measureText } from '../../core/detail-model';
import { AuthorByline, ResourceGroupList, ResourceRow, SECTIONS, sectionKey, splitResources } from './shared';

const CAP_TITLES = 16;
/** 子目不超过此数时后台解析全部（为部类页签与册次分布条）；更多的只解析可见行 */
const RESOLVE_ALL_TITLES = 200;
/** 后台解析一批多少条 */
const RESOLVE_BATCH = 16;

export interface CollectionPageProps {
    data: CollectionDetailData;
    /** 丛编目录档（由 layout 预加载，生产仓只有少数丛编有） */
    catalog?: VolumeBookMapping | null;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 完整目录 tab 的入口（由 layout 注入，文字链接） */
    catalogAction?: React.ReactNode;
    /** @deprecated B1 起丛编页不放主按钮（用户 09-28 定），此 prop 不再渲染 */
    readAction?: React.ReactNode;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** 左栏「更多」：切到丛编目录、extraTabs 等其他页面的入口（由 layout 注入） */
    railLinks?: RailLink[];
}

/** 子目行补取到的信息 */
interface RowInfo {
    title?: string;
    edition?: string;
    authors?: AuthorInfo[];
    measure?: string;
    versionCount?: number;
    /** 四部一级：classification.l1 */
    l1?: string;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
    data, catalog, transport, onNavigate, renderLink, catalogAction, railTop, back, railLinks,
}) => {
    const { t, convert, messages: m } = useI18n();

    const [query, setQuery] = useState('');
    const [showAllTitles, setShowAllTitles] = useState(false);
    const [parent, setParent] = useState<{ id: string; title?: string } | null>(null);
    /** 部类页签：'' = 全部 */
    const [sec, setSec] = useState('');
    /** 用户点了「按部類分組」：才对超过 CAP_TITLES 条的丛编解析全部子目 */
    const [groupAll, setGroupAll] = useState(false);

    const table = useMemo(() => buildCollectionTable(data, catalog), [data, catalog]);

    /* 子目行补取：书名（只有 ID 的）、撰人、卷数、版本数。只取可见行 */
    const [info, setInfo] = useState<Map<string, RowInfo>>(new Map());

    const canResolveAll = !!transport && table.rows.length > 0 && table.rows.length <= RESOLVE_ALL_TITLES;
    const resolveAll = canResolveAll && (table.rows.length <= CAP_TITLES || groupAll);
    const allResolved = resolveAll && table.rows.every(r => !r.id || info.has(r.id));
    const rowSection = (id?: string) => sectionKey(id ? info.get(id)?.l1 : undefined);

    const filtered = useMemo(() => {
        const q = query.trim();
        // 繁简都能搜：比对两边都转成当前显示字形
        const needle = q ? convert(q) : '';
        return table.rows.filter(r => {
            if (sec && sectionKey(r.id ? info.get(r.id)?.l1 : undefined) !== sec) return false;
            if (!needle) return true;
            const title = (r.id && info.get(r.id)?.title) || r.title;
            return convert(title).includes(needle) || (r.subItems || []).some(s => convert(s).includes(needle));
        });
    }, [table.rows, query, sec, info, convert]);
    const visibleTitles = showAllTitles ? filtered : filtered.slice(0, CAP_TITLES);

    const idsToResolve = useMemo(
        () => (resolveAll ? table.rows : visibleTitles).filter(r => r.id && !info.has(r.id)).map(r => r.id!),
        [resolveAll, table.rows, visibleTitles, info],
    );
    useEffect(() => {
        if (!transport || idsToResolve.length === 0) return;
        let cancelled = false;
        // 分批：一次 144 个请求同时飞出去会顶满连接；批内并发、批间顺序
        const batch = idsToResolve.slice(0, RESOLVE_BATCH);
        Promise.all(batch.map(id =>
            transport.getItem(id)
                .then(raw => {
                    const d = (raw ?? {}) as {
                        title?: string; edition?: string; authors?: AuthorInfo[]; measure_info?: string;
                        juan_count?: { number?: number; description?: string };
                        _edition_count?: number; books?: string[];
                        classification?: { l1?: string };
                    };
                    const v: RowInfo = {
                        title: d.title,
                        edition: d.edition,
                        authors: d.authors,
                        measure: raw ? measureText(raw as never, m.unit.juan) : undefined,
                        versionCount: d._edition_count ?? d.books?.length,
                        l1: d.classification?.l1 || undefined,
                    };
                    return [id, v] as const;
                })
                .catch(() => [id, {} as RowInfo] as const),
        )).then(entries => {
            if (cancelled) return;
            setInfo(prev => {
                const next = new Map(prev);
                for (const [id, v] of entries) next.set(id, v);
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [transport, idsToResolve, m.unit.juan]);

    // ── 上级丛编 ──
    const parentId = (data.contained_in || [])[0];
    useEffect(() => {
        if (!parentId) { setParent(null); return; }
        setParent({ id: parentId });
        if (!transport) return;
        let cancelled = false;
        transport.getItem(parentId)
            .then(raw => { if (!cancelled) setParent({ id: parentId, title: (raw as { title?: string } | null)?.title }); })
            .catch(() => { /* 取不到就只显示 ID */ });
        return () => { cancelled = true; };
    }, [transport, parentId]);

    const res = useMemo(() => splitResources(data.resources, data.resource_groups, t), [data.resources, data.resource_groups, t]);
    const resCount = res.text.length + res.groups.reduce((n, g) => n + g.rows.length + g.mirrors.length, 0);

    /* 「包含作品」：表格列的就是同一批条目时不再重复一遍 */
    const works = data.contained_works || [];
    const tableIds = new Set(table.rows.map(r => r.id).filter(Boolean));
    const showWorks = works.length > 0 && !works.every(w => tableIds.has(w.id));

    /** 所有行的 edition 都一样 → 逐行标注没有信息量 */
    const uniformEdition = (() => {
        const eds = table.rows.map(r => r.edition).filter(Boolean);
        return eds.length > 1 && new Set(eds).size === 1;
    })();
    /* 整列都是「—」时不出这一列（只有 books[] 的丛编多半没有册次） */
    const hasVolumeColumn = table.rows.some(r => r.volumes.length > 0 || r.expected != null);

    // ── 提要卡 ──
    const members = data._member_count || data.books?.length || works.length;
    const measure = measureText(data, m.unit.juan);
    const cnt = data.count;
    const numOf = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    /* 数字格：子目 / 卷 / 册。卷取「應收」的 juan，缺则用卷帙里的数；册取「應收」的 ce，缺则用目录算出的总册数 */
    const juanNum = numOf(cnt?.juan) ?? numOf(data.juan_count?.number);
    const ceNum = numOf(cnt?.ce) ?? (table.totalVolumes || null);
    const stats = [
        { value: table.rows.length, label: t('collectionPage.stat.titles') },
        { value: juanNum ?? 0, label: m.unit.juan },
        { value: ceNum ?? 0, label: m.unit.volume },
    ];
    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        if (data.publication_info?.details) out.push({ label: t('collectionPage.fact.publication'), value: convert(data.publication_info.details) });
        if (members && members !== table.rows.length) {
            const memberLabel = data._member_type === 'Book' ? t('collectionPage.member.Book')
                : data._member_type === 'Work' ? t('collectionPage.member.Work') : t('collectionPage.member.other');
            out.push({ label: memberLabel, value: `${members} ${m.unit.bu}`, title: t('collectionPage.memberNote') });
        }
        // 「應收」只留数字格没有的两项：種、函（卷、冊已在数字格里）；都没有就不出这一行
        const zhongHan = [
            numOf(cnt?.zhong) != null ? t('collectionPage.nZhong', { n: cnt!.zhong! }) : '',
            numOf(cnt?.han) != null ? t('collectionPage.nHan', { n: cnt!.han! }) : '',
        ].filter(Boolean);
        if (zhongHan.length) out.push({ label: t('collectionPage.fact.expected'), value: zhongHan.join('　') });
        // 卷数没进数字格（缺数字）时，卷帙文字仍留在事实表里
        if (juanNum == null && measure) {
            out.push({
                label: t('collectionPage.fact.measure'), value: convert(measure),
                title: data.juan_count?.description ? convert(data.juan_count.description) : undefined,
            });
        }
        // 「年代」不再出：已在「刊印」与副题里
        return out;
    }, [data, members, table.rows.length, juanNum, measure, cnt, convert, t, m]);

    // ── 部类页签与册次分布（须全部子目解析完） ──
    const secTabs = useMemo(() => {
        if (!allResolved) return [];
        const n = new Map<string, number>();
        for (const r of table.rows) {
            const k = rowSection(r.id);
            if (k) n.set(k, (n.get(k) ?? 0) + 1);
        }
        const present = SECTIONS.filter(x => (n.get(x.key) ?? 0) > 0);
        if (present.length < 2) return [];
        return [
            { key: '', label: `${m.catalog.all} ${table.rows.length}` },
            ...present.map(x => ({ key: x.key, label: `${x.label} ${n.get(x.key)}` })),
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allResolved, table.rows, info, m]);

    /** 册次分布条：每个子目占其册次区间（最小到最大）那么宽，按部类上色；相邻同色合并 */
    const distribution = useMemo(() => {
        if (!allResolved || !table.rows.some(r => r.volumes.length > 0)) return null;
        const segs: { key: string; from: number; to: number; n: number }[] = [];
        const ordered = table.rows
            .filter(r => r.volumes.length > 0)
            .map(r => ({ k: rowSection(r.id) ?? '', from: Math.min(...r.volumes), to: Math.max(...r.volumes) }))
            .sort((a, b) => a.from - b.from);
        for (const r of ordered) {
            const n = r.to - r.from + 1;
            const last = segs[segs.length - 1];
            if (last && last.key === r.k) { last.to = Math.max(last.to, r.to); last.n += n; }
            else segs.push({ key: r.k, from: r.from, to: r.to, n });
        }
        const last = ordered.reduce((m, r) => Math.max(m, r.to), 0);
        return segs.length > 1 && segs.some(s => s.key) ? { segs, last } : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allResolved, table.rows, info]);

    const descText = data.description?.text;
    const card = (
        <SummaryCard
            kind={t('collectionPage.kind')}
            title={convert(data.title)}
            byline={<AuthorByline authors={data.authors} onNavigate={onNavigate} renderLink={renderLink} />}
            meta={<MetaLine items={[
                data.subtype === 'work_collection' ? t('collectionPage.workCollection') : '',
                data.publication_info?.year ? convert(data.publication_info.year) : '',
            ]} />}
            description={(descText || data.history?.length) ? (
                <>
                    {descText && <MarkdownText text={descText} style={{ fontSize: 15, lineHeight: 1.85 }} />}
                    {data.history?.length ? (
                        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 14 }}>
                            {data.history.map((h, i) => <li key={i}>{convert(h)}</li>)}
                        </ul>
                    ) : null}
                </>
            ) : undefined}
            clampDescription={descNeedsClamp(descText) || (data.history?.length ?? 0) > 2 ? 6 : undefined}
            stats={stats}
            facts={facts}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        >
            {distribution && (
                <div className="bim-d-dist bim-d-ui">
                    <div className="bim-d-dist-head"><span>{t('collectionPage.dist.head')}</span></div>
                    <div className="bim-d-dist-bar" role="group" aria-label={t('collectionPage.dist.head')}>
                        {distribution.segs.map((g, i) => {
                            const def = SECTIONS.find(x => x.key === g.key);
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className="bim-d-dist-seg"
                                    disabled={!def}
                                    title={def ? t('collectionPage.dist.segTitle', { section: convert(def.label), from: g.from, to: g.to }) : undefined}
                                    aria-label={def ? t('collectionPage.dist.only', { section: convert(def.label) }) : t('collectionPage.dist.unclassified')}
                                    aria-pressed={!!def && sec === g.key}
                                    style={{ flexGrow: g.n, background: def ? bim(def.token) : bim('rule') }}
                                    onClick={() => { if (def) { setSec(sec === g.key ? '' : g.key); setShowAllTitles(false); } }}
                                />
                            );
                        })}
                    </div>
                    <div className="bim-d-life-lab">
                        <span>{t('catalog.volume', { n: 1 })}</span>
                        <span>{t('collectionPage.dist.hint')}</span>
                        <span>{t('catalog.volume', { n: distribution.last })}</span>
                    </div>
                </div>
            )}
        </SummaryCard>
    );

    const nav: RailNavItem[] = [];
    if (table.rows.length) nav.push({ id: 'titles', label: t('collectionPage.sec.titles'), count: table.rows.length });
    if (resCount) nav.push({ id: 'resources', label: t('collectionPage.sec.resources'), count: resCount });
    if (showWorks) nav.push({ id: 'works', label: m.section.containedWorks, count: works.length });

    const main = (
        <>
            {table.rows.length > 0 && (
                <Sec
                    id="titles"
                    title={t('collectionPage.sec.titles')}
                    meta={<MetaLine items={[
                        `${table.rows.length} ${m.unit.items}`,
                        table.totalVolumes ? t('collectionPage.totalVolumes', { n: table.totalVolumes, unit: m.unit.volume }) : '',
                        filtered.length !== table.rows.length ? t('collectionPage.currentN', { n: filtered.length, unit: m.unit.items }) : '',
                    ]} />}
                    action={catalogAction}
                >
                    {(table.rows.length > CAP_TITLES || secTabs.length > 0) && (
                        <div className="bim-d-filters bim-d-ui">
                            {secTabs.length > 0 && (
                                <TabFilter items={secTabs} value={sec} onChange={k => { setSec(k); setShowAllTitles(false); }} />
                            )}
                            {canResolveAll && table.rows.length > CAP_TITLES && !allResolved && (
                                <button
                                    type="button"
                                    className="bim-d-groupbtn"
                                    disabled={groupAll}
                                    onClick={() => setGroupAll(true)}
                                    title={t('collectionPage.loadAllTitle', { n: table.rows.length, unit: m.unit.items })}
                                >
                                    {groupAll ? t('collectionPage.grouping') : t('collectionPage.groupBySection')}
                                </button>
                            )}
                            <span className="bim-d-spacer" />
                            {table.rows.length > CAP_TITLES && <input
                                type="search"
                                className="bim-d-find"
                                value={query}
                                placeholder={t('collectionPage.find')}
                                aria-label={t('collectionPage.find')}
                                onChange={e => { setQuery(e.target.value); setShowAllTitles(false); }}
                            />}
                        </div>
                    )}
                    <table className="bim-d-zt" data-ncap={!showAllTitles && narrowCapped(filtered.length) ? '' : undefined}>
                        <thead className="bim-d-ui">
                            <tr>
                                {hasVolumeColumn && <th style={{ width: '8.5em' }}>{t('collectionPage.col.volumes')}</th>}
                                <th>{t('collectionPage.col.title')}</th>
                                <th style={{ textAlign: 'right' }}>{t('collectionPage.col.versions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleTitles.map((row, i) => {
                                const got = row.id ? info.get(row.id) : undefined;
                                const title = got?.title && row.title === row.id ? got.title : row.title;
                                const author = (got?.authors || []).find(a => a && a.name);
                                const note = [
                                    author ? `${author.dynasty ? `〔${convert(author.dynasty)}〕` : ''}${convert(author.name)}${author.role ? ` ${convert(author.role)}` : ''}` : '',
                                    got?.measure ? convert(got.measure) : '',
                                    row.subItems?.length ? row.subItems.map(s => convert(s)).join('、') : '',
                                    (got?.edition || row.edition) && !uniformEdition ? convert(got?.edition || row.edition || '') : '',
                                ].filter(Boolean);
                                const rowSec = SECTIONS.find(x => x.key === rowSection(row.id));
                                const vol = row.volumes.length > 0
                                    ? t('collectionPage.volumeRange', { range: formatVolumeRange(row.volumes, m.unit.volume), unit: m.unit.volume })
                                    : row.expected != null
                                        ? `${row.found ?? 0}/${row.expected} ${m.unit.volume}`
                                        : '';
                                return (
                                    <tr key={`${row.id ?? row.title}-${i}`}>
                                        {hasVolumeColumn && (
                                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${vol ? '' : ' bim-d-zt-blank'}`}>
                                                {rowSec && <i className="bim-d-sq" aria-hidden="true" style={{ background: bim(rowSec.token) }} />}
                                                {vol || <span className="bim-d-zt-empty">—</span>}
                                            </td>
                                        )}
                                        <td className="bim-d-zt-main">
                                            {row.id
                                                ? <BidLink id={row.id} label={convert(title)} onNavigate={onNavigate} renderLink={renderLink} dense />
                                                : <span className="bim-d-zt-name">{convert(title)}</span>}
                                            {note.length > 0
                                                ? <MetaLine items={note} />
                                                /* 撰人、卷数晚到：先占一行，免得整表往下长（INT Q3） */
                                                : row.id && !got && transport ? <span className="bim-d-meta" aria-hidden="true">&nbsp;</span> : null}
                                        </td>
                                        <td className={`bim-d-zt-sub bim-d-zt-nowrap${got?.versionCount ? '' : ' bim-d-zt-blank'}`} style={{ textAlign: 'right' }}>
                                            {got?.versionCount ? t('collectionPage.nZhong', { n: got.versionCount }) : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {visibleTitles.length === 0 && (
                        <p className="bim-d-meta bim-d-ui" style={{ margin: '12px 12px 0' }}>{t('catalog.noMatch')}</p>
                    )}
                    {!showAllTitles && (
                        <CapMore total={filtered.length} shown={visibleTitles.length} unit={m.unit.items} onClick={() => setShowAllTitles(true)} />
                    )}
                </Sec>
            )}

            {resCount > 0 && (
                <Sec id="resources" title={t('collectionPage.sec.resources')} meta={t('collectionPage.resourcesCount', { n: resCount })}>
                    {res.text.length > 0 && (
                        <div className="bim-d-rg">
                            {res.groups.length > 0 && <h3 className="bim-d-rg-h bim-d-ui">{t('collectionPage.text')}</h3>}
                            <table className="bim-d-zt">
                                <tbody>
                                    {res.text.map((r, i) => (
                                        <ResourceRow key={`${r.id || r.url || r.name}-${i}`} item={r} siblings={res.text} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <ResourceGroupList groups={res.groups} />
                </Sec>
            )}

            {table.rows.length === 0 && resCount === 0 && (
                <Sec title={t('collectionPage.sec.titles')}>
                    <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>{t('collectionPage.empty')}</p>
                </Sec>
            )}
        </>
    );

    const side = showWorks ? (
        <SideList
            id="works"
            title={m.section.containedWorks}
            meta={t('collectionPage.nZhong', { n: works.length })}
            cap={12}
            items={works.map(w => (
                <BidLink id={w.id} label={convert(w.title)} onNavigate={onNavigate} renderLink={renderLink} dense />
            ))}
        />
    ) : null;

    const up = parent ? (
        <RailUp caption={t('collectionPage.parent')}>
            <BidLink id={parent.id} label={convert(parent.title || parent.id)} onNavigate={onNavigate} renderLink={renderLink} dense />
        </RailUp>
    ) : undefined;

    return <DetailGrid railTop={railTop} back={back} up={up} nav={nav} railLinks={railLinks} main={main} card={card} side={side} />;
};
