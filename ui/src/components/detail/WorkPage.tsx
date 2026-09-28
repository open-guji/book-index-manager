/**
 * 作品页（史記这类）—— 2026-09 N3a 三栏版。
 *
 * 左栏：宿主的检索框 + 本页导航；中栏：版本表（年代页签 + 只看有影印）、
 * 著录分栏；右栏：提要卡（唯一主按钮「阅读全文」）、收入丛编、相关书目、在线资源。
 * 版本谱系、考证、反馈三个 tab 本阶段不放入口（考证只在提要卡里计数）。
 *
 * 版本数据靠 transport 逐条解析：≤ RESOLVE_ALL 条时一次解析全部、按年代排；
 * 更多时只解析可见行、保持录入序，读者一动筛选/展开再全量解析。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type {
    WorkDetailData,
    IndexedByEntry,
    ResourceEntry,
} from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, renderInterlinear, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, TabFilter, CheckFilter, MoreLink, SummaryCard, SideList, CardFoot,
    type CardFact, type RailNavItem,
} from './layout';
import {
    buildVersionTable, bucketResources, measureText, sourceText,
    type ResolvedVersion, type VersionRow,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref } from '../../core/resources';
import { AuthorByline, relationLabel, lossStatusLabel, resourceKindLabel } from './shared';

/** 首屏显示的版本行数 */
const CAP_VERSIONS = 12;
/** 版本数不超过此值时一次解析全部并按年代排序 */
const RESOLVE_ALL = 60;

export interface WorkPageProps {
    data: WorkDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 右栏提要卡里的「阅读全文」主按钮（由 layout 注入，见 ReadButton） */
    readAction?: React.ReactNode;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** @deprecated 2026-09 N3a 起谱系入口暂不放，此 prop 不再渲染 */
    lineageAction?: React.ReactNode;
    /** @deprecated 2026-09 N3a 起整理本/全文入口统一为 readAction，此 prop 不再渲染 */
    collatedSection?: React.ReactNode;
}

type Resolved = ResolvedVersion & { measure_info?: string };

export const WorkPage: React.FC<WorkPageProps> = ({
    data, transport, onNavigate, renderLink, readAction, railTop, back,
}) => {
    const t = useT();
    const { convert } = useConvert();

    // ── 版本解析 ──
    const versionIds = useMemo(
        () => [...(data.books || []), ...(data.collections || [])],
        [data.books, data.collections],
    );

    const [resolved, setResolved] = useState<Map<string, Resolved>>(new Map());
    const [showAll, setShowAll] = useState(false);
    const [era, setEra] = useState('');
    const [scanOnly, setScanOnly] = useState(false);

    const smallSet = versionIds.length <= RESOLVE_ALL;
    const needAll = smallSet || showAll || !!era || scanOnly;
    const idsToResolve = useMemo(
        () => (needAll ? versionIds : versionIds.slice(0, CAP_VERSIONS)),
        [versionIds, needAll],
    );

    useEffect(() => {
        if (!transport || idsToResolve.length === 0) return;
        const pending = idsToResolve.filter(id => !resolved.has(id));
        if (pending.length === 0) return;

        let cancelled = false;
        Promise.all(pending.map(id =>
            transport.getItem(id)
                .then(raw => {
                    const b = (raw ?? {}) as Partial<Resolved>;
                    return [id, {
                        id,
                        title: b.title,
                        edition: b.edition,
                        resources: b.resources,
                        publication_info: b.publication_info,
                        current_location: b.current_location,
                        lineage: b.lineage,
                        measure_info: b.measure_info,
                    }] as const;
                })
                .catch(() => [id, { id }] as const),
        )).then(entries => {
            if (cancelled) return;
            setResolved(prev => {
                const next = new Map(prev);
                for (const [id, v] of entries) next.set(id, v);
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [transport, idsToResolve, resolved]);

    const versions: Resolved[] = useMemo(
        () => versionIds.map(id => resolved.get(id) ?? { id }),
        [versionIds, resolved],
    );
    const allResolved = versionIds.length > 0 && versionIds.every(id => resolved.has(id));

    // 能全量解析时按年代排；否则保持录入序（部分解析时按年代排会随解析跳动）
    const byYear = smallSet || needAll;
    const table = useMemo(
        () => buildVersionTable(versions, data.version_graph, { era, scanOnly, sort: byYear ? 'year' : 'default' }),
        [versions, data.version_graph, era, scanOnly, byYear],
    );
    const visibleRows = showAll ? table.rows : table.rows.slice(0, CAP_VERSIONS);
    const imageCount = table.allRows.filter(r => r.hasImage).length;

    // ── 关联 ──
    const related = data.related_works || [];
    const collectedIn = related.filter(r => r.relation === 'collected_in');
    const otherRelated = useMemo(() => {
        const order = ['part_of', 'has_part', 'studied_by', 'studies', 'preceded_by', 'followed_by'];
        const rank = (r?: string) => { const i = order.indexOf(r ?? ''); return i < 0 ? order.length : i; };
        return related
            .filter(r => r.relation !== 'collected_in')
            .map((r, i) => ({ r, i }))
            .sort((a, b) => rank(a.r.relation) - rank(b.r.relation) || a.i - b.i)
            .map(x => x.r);
    }, [related]);

    // ── 资源 ──
    const resources = useMemo(() => {
        const b = bucketResources(data.resources, data.resource_groups);
        return [
            ...b.mirrors.flatMap(g => g.items.map(r => ({ r, kind: convert(g.label) }))),
            ...b.buckets.flatMap(k => k.items.map(r => ({ r, kind: convert(resourceKindLabel(k.key)) }))),
        ];
    }, [data.resources, data.resource_groups, convert]);

    const indexed = data.indexed_by || [];
    const emendated = data.emendated_by || [];

    // ── 提要卡 ──
    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        const dynasty = data.authors?.[0]?.dynasty;
        if (dynasty) out.push({ label: '成書', value: convert(dynasty) });

        const measure = measureText(data, t.unit.juan);
        if (measure) {
            const desc = data.juan_count?.description;
            out.push({
                label: '卷帙',
                value: <>{convert(measure)}{desc && desc !== measure
                    ? <span className="bim-d-meta">（{convert(desc)}）</span> : null}</>,
            });
        }
        if (data.loss_status) out.push({ label: '存佚', value: convert(lossStatusLabel(data.loss_status)) });

        const editions = data._edition_count ?? versionIds.length;
        if (editions) {
            out.push({
                label: '版本',
                value: <>{editions} {convert('種')}{allResolved && imageCount
                    ? <span className="bim-d-meta">　{convert(`${imageCount} 種有影印`)}</span> : null}</>,
            });
        }

        const dated = table.allRows.filter(r => r.sortYear != null);
        if (dated.length > 0) {
            const earliest = dated.reduce((a, b) => (a.sortYear! <= b.sortYear! ? a : b));
            if (earliest.era.era) {
                out.push({
                    label: '最早存世',
                    value: convert([earliest.era.era, earliest.era.reign].filter(Boolean).join(' ')),
                    title: earliest.era.source === 'edition' ? convert('據版本題名推斷') : undefined,
                });
            }
        }

        if (indexed.length || emendated.length) {
            out.push({
                label: '著錄',
                value: <>
                    {indexed.length ? `${indexed.length} ${convert('家')}` : '—'}
                    {emendated.length ? <span className="bim-d-meta">　{convert(`考證 ${emendated.length} 條`)}</span> : null}
                </>,
            });
        }

        const aliases = flatten(data.additional_titles);
        if (aliases.length) out.push({ label: '又名', value: aliases.map(convert).join('、') });
        const attached = flatten(data.attached_texts);
        if (attached.length) out.push({ label: '附載', value: attached.map(convert).join('、') });
        const appendixWorks = (data.additional_works || []).map(w =>
            convert(w.book_title) + (w.n_juan != null ? ` ${w.n_juan}${convert(t.unit.juan)}` : ''));
        if (appendixWorks.length) out.push({ label: '附錄', value: appendixWorks.join('、') });
        return out;
    }, [data, convert, t, versionIds.length, allResolved, imageCount, table.allRows, indexed.length, emendated.length]);

    const cls = data.classification;
    const clsItems = cls
        ? [cls.l1, cls.l2, cls.l3, cls.l4].filter(Boolean).map(s => convert(s!))
        : [];
    const subtypeLabel = data.subtype
        ? convert((t.workSubtype as Record<string, string>)[data.subtype] ?? data.subtype)
        : '';

    const card = (
        <SummaryCard
            title={convert(data.title)}
            byline={<AuthorByline authors={data.authors} onNavigate={onNavigate} renderLink={renderLink} />}
            meta={
                <MetaLine
                    items={[
                        ...clsItems,
                        cls?.source ? convert(`據《${cls.source.split('/')[0]}》`) : '',
                        subtypeLabel,
                    ]}
                />
            }
            description={data.description?.text ? (
                <>
                    <MarkdownText text={data.description.text} style={{ fontSize: 15, lineHeight: 1.85 }} />
                    {data.description.sources?.length ? (
                        <div className="bim-d-meta bim-d-ui" style={{ marginTop: 6, fontSize: 12 }}>
                            {data.description.sources.map(s => convert(sourceText(s))).filter(Boolean).join(' · ')}
                        </div>
                    ) : null}
                </>
            ) : undefined}
            facts={facts}
            readAction={readAction}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        >
            {data.appendix?.map((entry, i) => (
                <details key={i} style={{ marginTop: 12 }}>
                    <summary className="bim-d-ui" style={{ cursor: 'pointer', fontSize: 13, minHeight: 32 }}>
                        {convert(entry.title)}
                    </summary>
                    <MarkdownText text={entry.text} plainStrong style={{ marginTop: 8, fontSize: 14, lineHeight: 1.9 }} />
                </details>
            ))}
        </SummaryCard>
    );

    // ── 中栏 ──
    const eraTabs = table.eras.length >= 2
        ? [{ key: '', label: t.catalog.all }, ...table.eras.map(e => ({ key: e, label: e }))]
        : [];

    const nav: RailNavItem[] = [];
    if (versionIds.length) nav.push({ id: 'versions', label: '版本', count: versionIds.length });
    if (indexed.length) nav.push({ id: 'catalogs', label: '著錄', count: indexed.length });
    if (collectedIn.length) nav.push({ id: 'collected', label: '收入叢編', count: collectedIn.length });
    if (otherRelated.length) nav.push({ id: 'related', label: '相關書目', count: otherRelated.length });
    if (resources.length) nav.push({ id: 'resources', label: '在線資源', count: resources.length });

    const isEmpty = versionIds.length === 0 && indexed.length === 0;

    const main = (
        <>
            {versionIds.length > 0 && (
                <Sec
                    id="versions"
                    title="版本"
                    meta={<MetaLine items={[
                        convert(`共 ${versionIds.length} 種`),
                        allResolved && imageCount ? convert(`${imageCount} 種有影印`) : '',
                        table.rows.length !== table.allRows.length ? convert(`當前 ${table.rows.length} 種`) : '',
                    ]} />}
                >
                    <div className="bim-d-filters bim-d-ui">
                        {eraTabs.length > 0 && (
                            <TabFilter
                                items={eraTabs}
                                value={era}
                                onChange={k => { setEra(k); setShowAll(false); }}
                            />
                        )}
                        <span className="bim-d-spacer" />
                        <CheckFilter
                            label="只看有影印"
                            checked={scanOnly}
                            onChange={v => { setScanOnly(v); setShowAll(false); }}
                        />
                        <span className="bim-d-meta">{convert(byYear ? '按年代排列' : '按著錄順序')}</span>
                    </div>
                    <table className="bim-d-zt">
                        <thead className="bim-d-ui">
                            <tr>
                                <th>{convert('版本')}</th>
                                <th>{convert('年代')}</th>
                                <th>{convert('館藏')}</th>
                                <th><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{convert('影印')}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map(row => (
                                <VersionRowView
                                    key={row.id}
                                    row={row}
                                    measure={resolved.get(row.id)?.measure_info}
                                    loaded={resolved.has(row.id)}
                                    onNavigate={onNavigate}
                                    renderLink={renderLink}
                                />
                            ))}
                        </tbody>
                    </table>
                    {visibleRows.length === 0 && (
                        <p className="bim-d-meta bim-d-ui" style={{ margin: '12px 12px 0' }}>
                            {convert(era || scanOnly ? '當前篩選下沒有版本' : '暫無版本著錄')}
                        </p>
                    )}
                    {table.rows.length > visibleRows.length && (
                        <MoreLink
                            label={`展開其餘 ${table.rows.length - visibleRows.length} 種版本`}
                            onClick={() => setShowAll(true)}
                        />
                    )}
                    {table.hasInferredEra && (
                        <p className="bim-d-meta bim-d-ui" style={{ margin: '8px 0 0', fontSize: 12 }}>
                            {convert('部分年代據版本題名推斷，非著錄原文')}
                        </p>
                    )}
                </Sec>
            )}

            {indexed.length > 0 && (
                <CatalogSection items={indexed} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {/*
              * 什么都没有的作品：生产仓 9 万余部里有数百部既无版本、也无著录——
              * 中栏只剩空白，读者不知道是没数据还是页面坏了。给一句说明。
              */}
            {isEmpty && (
                <Sec title="版本">
                    <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>
                        {convert('尚未著錄該作品的版本與書目收錄。')}
                    </p>
                </Sec>
            )}
        </>
    );

    // ── 旁栏 ──
    const link = (id: string, label: string) => (
        <BidLink id={id} label={convert(label)} onNavigate={onNavigate} renderLink={renderLink} dense />
    );
    const side = (
        <>
            <SideList
                id="collected"
                title="收入叢編"
                items={collectedIn.map(r => link(r.id, r.title))}
            />
            <SideList
                id="related"
                title="相關書目"
                meta={convert(`${otherRelated.length} 部`)}
                items={otherRelated.map(r => (
                    <>
                        {link(r.id, r.title)}
                        <span className="bim-d-meta" title={r.note ? convert(r.note) : undefined}>
                            {convert(relationLabel(r.relation))}
                        </span>
                    </>
                ))}
            />
            <SideList
                id="resources"
                title="在線資源"
                cap={6}
                items={resources.map(({ r, kind }) => {
                    const name = convert((r.url ? getDisplayNameFromUrl(r.url) : undefined) || r.name);
                    const href = resourceHref(r);
                    return (
                        <>
                            {href
                                ? <a href={href} target="_blank" rel="noopener noreferrer">{name} <span aria-hidden="true">↗</span></a>
                                : <span>{name}</span>}
                            {kind && <span className="bim-d-meta">{kind}</span>}
                        </>
                    );
                })}
            />
        </>
    );

    return <DetailGrid railTop={railTop} back={back} nav={nav} main={main} card={card} side={side} />;
};

// ══════════════════════════════════════════════════════════════

function flatten(items?: (string | { book_title: string })[]): string[] {
    return (items || [])
        .map(x => (typeof x === 'string' ? x : x?.book_title))
        .filter((x): x is string => !!x);
}

function resourceName(it: ResourceEntry, convert: (s: string) => string): string {
    return convert((it.url ? getDisplayNameFromUrl(it.url) : undefined) || it.name);
}

/** 版本表一行：版本名（下附卷帙小字）｜年代｜馆藏｜「有影印」色块 */
function VersionRowView({ row, measure, loaded, onNavigate, renderLink }: {
    row: VersionRow;
    measure?: string;
    loaded: boolean;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const { convert } = useConvert();
    const eraLabel = [row.era.era, row.era.reign].filter(Boolean).join(' ');
    const inferred = row.era.source === 'edition';
    const holder = row.holders[0];
    const holderName = holder ? resourceName(holder, convert) : (row.locationName ? convert(row.locationName) : '');
    const image = row.images[0];
    const imageHref = image ? resourceHref(image) : undefined;
    const imageTitle = row.images.map(r => resourceName(r, convert)).join('、');

    return (
        <tr>
            <td className="bim-d-zt-main">
                <BidLink
                    id={row.id}
                    label={convert(row.name)}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                    dense
                />
                {measure && <span className="bim-d-meta">{convert(measure)}</span>}
            </td>
            <td
                className={`bim-d-zt-sub bim-d-zt-nowrap${eraLabel ? '' : ' bim-d-zt-blank'}`}
                title={inferred ? convert('據版本題名推斷') : undefined}
            >
                {eraLabel ? convert(eraLabel) : (loaded ? <span className="bim-d-zt-empty">—</span> : null)}
            </td>
            <td className={`bim-d-zt-sub${holderName ? '' : ' bim-d-zt-blank'}`}>
                {/* 馆藏只写名称不做外链：一行里只留版本名与「有影印」两个点击目标 */}
                {holderName || (loaded ? <span className="bim-d-zt-empty">—</span> : null)}
                {row.holders.length > 1 && <span className="bim-d-meta"> +{row.holders.length - 1}</span>}
            </td>
            <td className={row.hasImage ? undefined : 'bim-d-zt-blank'} style={{ textAlign: 'right' }}>
                {row.hasImage && (imageHref
                    ? <a className="bim-d-flag" href={imageHref} target="_blank" rel="noopener noreferrer" title={imageTitle}>{convert('有影印')}</a>
                    : <span className="bim-d-flag" title={imageTitle}>{convert('有影印')}</span>)}
            </td>
        </tr>
    );
}

/** 著录分栏：左列书目名，右列选中那家的著录原文（宋体） */
function CatalogSection({ items, onNavigate, renderLink }: {
    items: IndexedByEntry[];
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const t = useT();
    const { convert } = useConvert();
    const [sel, setSel] = useState(0);
    const e = items[Math.min(sel, items.length - 1)];

    return (
        <Sec id="catalogs" title="著錄" meta={convert(`歷代書目 ${items.length} 家`)}>
            <div className="bim-d-lu">
                <ul className="bim-d-lu-list bim-d-ui" role="tablist" aria-label={convert('著錄書目')}>
                    {items.map((x, i) => (
                        <li key={i} role="presentation">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={i === sel}
                                onClick={() => setSel(i)}
                            >
                                {convert(x.source)}
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="bim-d-lu-body" role="tabpanel">
                    {e.title_info && <div className="bim-d-lu-title">{convert(e.title_info)}</div>}
                    <MetaLine
                        className="bim-d-ui"
                        style={{ display: 'block', marginTop: 2 }}
                        items={[
                            e.source_bid
                                ? <BidLink id={e.source_bid} label={convert(e.source)} onNavigate={onNavigate} renderLink={renderLink} dense />
                                : convert(e.source),
                            e.section ? convert(e.section) : '',
                            e.author_info ? `${convert(t.label.authorInfo)} ${convert(e.author_info)}` : '',
                            e.edition ? `${convert(t.label.edition)} ${convert(e.edition)}` : '',
                            e.page ?? '',
                        ]}
                    />
                    {e.summary && <p className="bim-d-quote">{renderInterlinear(convert(e.summary))}</p>}
                    {e.comment && (
                        <>
                            <div className="bim-d-quote-label bim-d-ui">{convert(t.section.comment)}</div>
                            <p className="bim-d-quote">{renderInterlinear(convert(e.comment))}</p>
                        </>
                    )}
                    {e.additional_comment && (
                        <>
                            <div className="bim-d-quote-label bim-d-ui">{convert(t.section.additionalComment)}</div>
                            <p className="bim-d-quote">{renderInterlinear(convert(e.additional_comment))}</p>
                        </>
                    )}
                    {!e.summary && !e.comment && !e.additional_comment && !e.title_info && (
                        <p className="bim-d-meta bim-d-ui" style={{ marginTop: 12 }}>{convert('僅著錄書名，無提要。')}</p>
                    )}
                </div>
            </div>
        </Sec>
    );
}
