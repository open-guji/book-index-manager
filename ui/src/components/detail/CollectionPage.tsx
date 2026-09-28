/**
 * 丛编页（武英殿聚珍版叢書这类）—— 2026-09 N3a 三栏版。
 *
 * 「收錄書籍」表的数据有三个来源，按信息量降序：目录档 → contained_works
 * → books[]（见 buildCollectionTable）。武英殿的 144 条走 contained_works，零额外请求。
 *
 * 中栏：收录书籍（部类页签 + 斑马表）→ 影印与全文；右栏：提要卡 → 包含作品。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { CollectionDetailData, VolumeBookMapping } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, TabFilter, MoreLink, SummaryCard, SideList, CardFoot,
    type CardFact, type RailNavItem, type RailLink,
} from './layout';
import {
    buildCollectionTable, bucketResources, formatVolumeRange, measureText, resourceNote,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref } from '../../core/resources';
import { AuthorByline, resourceKindLabel } from './shared';

const CAP_TITLES = 16;

export interface CollectionPageProps {
    data: CollectionDetailData;
    /** 丛编目录档（由 layout 预加载，生产仓只有少数丛编有） */
    catalog?: VolumeBookMapping | null;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 完整目录 tab 的入口（由 layout 注入，文字链接） */
    catalogAction?: React.ReactNode;
    /** 右栏提要卡里的「阅读全文」主按钮（由 layout 注入） */
    readAction?: React.ReactNode;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** 左栏「更多」：切到丛编目录、extraTabs 等其他页面的入口（由 layout 注入） */
    railLinks?: RailLink[];
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
    data, catalog, transport, onNavigate, renderLink, catalogAction, readAction, railTop, back, railLinks,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [section, setSection] = useState('');
    const [showAllTitles, setShowAllTitles] = useState(false);

    const table = useMemo(() => buildCollectionTable(data, catalog), [data, catalog]);
    const filtered = useMemo(
        () => (section ? table.rows.filter(r => r.section === section) : table.rows),
        [table.rows, section],
    );
    const visibleTitles = showAllTitles ? filtered : filtered.slice(0, CAP_TITLES);

    /*
     * 只有 books[] 的丛编（二十四史武英殿本等），表里拿到的只有 ID。
     * 旧版就直接把 ID 当书名列出来；这里只为**可见行**补取标题与版本名。
     */
    const [titles, setTitles] = useState<Map<string, { title?: string; edition?: string }>>(new Map());
    const idsToResolve = useMemo(
        () => visibleTitles
            .filter(r => r.id && r.title === r.id && !titles.has(r.id))
            .map(r => r.id!),
        [visibleTitles, titles],
    );
    useEffect(() => {
        if (!transport || idsToResolve.length === 0) return;
        let cancelled = false;
        Promise.all(idsToResolve.map(id =>
            transport.getItem(id)
                .then(raw => [id, {
                    title: (raw as { title?: string } | null)?.title,
                    edition: (raw as { edition?: string } | null)?.edition,
                }] as const)
                .catch(() => [id, {}] as const),
        )).then(entries => {
            if (cancelled) return;
            setTitles(prev => {
                const next = new Map(prev);
                for (const [id, v] of entries) next.set(id, v);
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [transport, idsToResolve]);

    const resources = useMemo(() => {
        const b = bucketResources(data.resources, data.resource_groups);
        return [
            ...b.mirrors.flatMap(g => g.items.map(r => ({ r, kind: convert(g.label) }))),
            ...b.buckets.flatMap(k => k.items.map(r => ({ r, kind: convert(resourceKindLabel(k.key)) }))),
        ];
    }, [data.resources, data.resource_groups, convert]);

    /* 「包含作品」：表格列的就是同一批条目时不再重复一遍 */
    const works = data.contained_works || [];
    const tableIds = new Set(table.rows.map(r => r.id).filter(Boolean));
    const showWorks = works.length > 0 && !works.every(w => tableIds.has(w.id));

    /** 所有行的 edition 都一样 → 逐行标注没有信息量 */
    const uniformEdition = (() => {
        const eds = table.rows.map(r => r.edition).filter(Boolean);
        return eds.length > 1 && new Set(eds).size === 1;
    })();
    const hasSectionColumn = table.sections.length > 0;
    /* 整列都是「—」时不出这一列（只有 books[] 的丛编多半没有册次） */
    const hasVolumeColumn = table.rows.some(r => r.volumes.length > 0 || r.expected != null);

    // ── 提要卡 ──
    const kinds = data._member_count || data.books?.length || works.length;
    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        if (kinds) out.push({ label: '種數', value: `${kinds} ${convert(t.unit.bu)}` });
        const measure = measureText(data, t.unit.juan);
        if (measure) {
            out.push({
                label: '卷數',
                value: convert(measure),
                title: data.juan_count?.description ? convert(data.juan_count.description) : undefined,
            });
        }
        if (table.totalVolumes) out.push({ label: '全帙冊數', value: `${table.totalVolumes} ${convert(t.unit.volume)}` });
        if (data.publication_info?.details) out.push({ label: '刊印', value: convert(data.publication_info.details) });
        if (data.publication_info?.year) out.push({ label: '年代', value: convert(data.publication_info.year) });
        return out;
    }, [data, kinds, table.totalVolumes, convert, t]);

    const card = (
        <SummaryCard
            title={convert(data.title)}
            byline={<AuthorByline authors={data.authors} onNavigate={onNavigate} renderLink={renderLink} />}
            meta={<MetaLine items={[
                convert('叢編'),
                data.subtype === 'work_collection' ? convert('作品集') : '',
                data.publication_info?.year ? convert(data.publication_info.year) : '',
            ]} />}
            description={(data.description?.text || data.history?.length) ? (
                <>
                    {data.description?.text && (
                        <MarkdownText text={data.description.text} style={{ fontSize: 15, lineHeight: 1.85 }} />
                    )}
                    {data.history?.length ? (
                        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 14 }}>
                            {data.history.map((h, i) => <li key={i}>{convert(h)}</li>)}
                        </ul>
                    ) : null}
                </>
            ) : undefined}
            facts={facts}
            readAction={readAction}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        />
    );

    const nav: RailNavItem[] = [];
    if (table.rows.length) nav.push({ id: 'titles', label: t.section.containedBooks, count: table.rows.length });
    if (resources.length) nav.push({ id: 'resources', label: '影印與全文', count: resources.length });
    if (showWorks) nav.push({ id: 'works', label: t.section.containedWorks, count: works.length });

    const sectionTabs = hasSectionColumn
        ? [{ key: '', label: t.catalog.all }, ...table.sections.map(s => ({ key: s, label: s }))]
        : [];

    const main = (
        <>
            {table.rows.length > 0 && (
                <Sec
                    id="titles"
                    title={t.section.containedBooks}
                    meta={<MetaLine items={[
                        convert(`共 ${table.rows.length} ${t.unit.items}`),
                        kinds && kinds !== table.rows.length ? convert(`成員 ${kinds} ${t.unit.bu}`) : '',
                        filtered.length !== table.rows.length ? convert(`當前 ${filtered.length} ${t.unit.items}`) : '',
                    ]} />}
                    action={catalogAction}
                >
                    {sectionTabs.length > 0 && (
                        <div className="bim-d-filters bim-d-ui">
                            <TabFilter items={sectionTabs} value={section}
                                onChange={k => { setSection(k); setShowAllTitles(false); }} />
                        </div>
                    )}
                    <table className="bim-d-zt">
                        <thead className="bim-d-ui">
                            <tr>
                                <th>{convert('書名')}</th>
                                {hasSectionColumn && <th>{convert('部類')}</th>}
                                {hasVolumeColumn && <th>{convert('全帙冊次')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleTitles.map((rawRow, i) => {
                                const fetched = rawRow.id ? titles.get(rawRow.id) : undefined;
                                const row = fetched?.title
                                    ? { ...rawRow, title: fetched.title }
                                    : rawRow;
                                const note = [
                                    row.subItems?.length ? row.subItems.map(s => convert(s)).join('、') : '',
                                    row.edition && !uniformEdition ? convert(row.edition) : '',
                                ].filter(Boolean).join(' · ');
                                const vol = row.volumes.length > 0
                                    ? convert(`第 ${formatVolumeRange(row.volumes, t.unit.volume)} ${t.unit.volume}`)
                                    : row.expected != null
                                        ? convert(`${row.found ?? 0}/${row.expected} ${t.unit.volume}`)
                                        : '';
                                const sec = row.section
                                    ? convert(row.section.endsWith('部') ? row.section : `${row.section}部`)
                                    : '';
                                return (
                                    <tr key={`${row.id ?? row.title}-${i}`}>
                                        <td className="bim-d-zt-main">
                                            {row.id
                                                ? <BidLink id={row.id} label={convert(row.title)} onNavigate={onNavigate} renderLink={renderLink} dense />
                                                : <span className="bim-d-zt-name">{convert(row.title)}</span>}
                                            {note && <span className="bim-d-meta">{note}</span>}
                                        </td>
                                        {hasSectionColumn && (
                                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${sec ? '' : ' bim-d-zt-blank'}`}>
                                                {sec || <span className="bim-d-zt-empty">—</span>}
                                            </td>
                                        )}
                                        {hasVolumeColumn && (
                                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${vol ? '' : ' bim-d-zt-blank'}`}>
                                                {vol || <span className="bim-d-zt-empty">—</span>}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {visibleTitles.length === 0 && (
                        <p className="bim-d-meta bim-d-ui" style={{ margin: '12px 12px 0' }}>{convert(t.catalog.noMatch)}</p>
                    )}
                    {filtered.length > visibleTitles.length && (
                        <MoreLink
                            label={`展開其餘 ${filtered.length - visibleTitles.length} ${t.unit.items}`}
                            onClick={() => setShowAllTitles(true)}
                        />
                    )}
                </Sec>
            )}

            {resources.length > 0 && (
                <Sec id="resources" title="影印與全文" meta={convert(`${resources.length} 處`)}>
                    <table className="bim-d-zt">
                        <tbody>
                            {resources.map(({ r, kind }, i) => {
                                const name = convert((r.url ? getDisplayNameFromUrl(r.url) : undefined) || r.name);
                                const href = resourceHref(r);
                                const note = resourceNote(r) || r.details;
                                return (
                                    <tr key={`${r.id || r.url || r.name}-${i}`}>
                                        <td className="bim-d-zt-main">
                                            {href
                                                ? <a href={href} target="_blank" rel="noopener noreferrer">{name} <span aria-hidden="true">↗</span></a>
                                                : <span className="bim-d-zt-name">{name}</span>}
                                            {note && <span className="bim-d-meta">{convert(note)}</span>}
                                        </td>
                                        <td className={`bim-d-zt-sub bim-d-zt-nowrap${kind ? '' : ' bim-d-zt-blank'}`}>{kind}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Sec>
            )}

            {table.rows.length === 0 && resources.length === 0 && (
                <Sec title={t.section.containedBooks}>
                    <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>{convert('尚未著錄該叢編的子目。')}</p>
                </Sec>
            )}
        </>
    );

    const side = showWorks ? (
        <SideList
            id="works"
            title={t.section.containedWorks}
            meta={convert(`${works.length} 種`)}
            cap={12}
            items={works.map(w => (
                <BidLink id={w.id} label={convert(w.title)} onNavigate={onNavigate} renderLink={renderLink} dense />
            ))}
        />
    ) : null;

    return <DetailGrid railTop={railTop} back={back} nav={nav} railLinks={railLinks} main={main} card={card} side={side} />;
};
