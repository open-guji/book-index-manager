/**
 * 版本页（御定佩文韻府这类）—— 2026-09 N3a 三栏版。
 *
 * 中栏：影印与全文（资源清单，斑马行）→ 收入丛编（册次）→ 流转历史；
 * 右栏：提要卡（版本名、作品署名、版本类型·年代、事实表、唯一主按钮「阅读全文」）
 * → 所属作品 → 同作品其他版本。
 *
 * Book 的 description 只有 2.5% 有，所以提要卡多数时候只有事实表。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type {
    BookDetailData,
    WorkDetailData,
    CollectionDetailData,
    ResourceEntry,
} from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, VolumeLinks, flattenTitles, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, SummaryCard, SideList, CardFoot, MoreLink,
    type CardFact, type RailNavItem,
} from './layout';
import {
    bucketResources, deriveEra, deriveEditionType,
    normalizeVolumeIndex, formatVolumeRange, measureText, resourceNote, resourceDisambiguator,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref, volumeStats } from '../../core/resources';
import { AuthorByline, resourceKindLabel } from './shared';

const CAP_SIBLINGS = 8;

export interface BookPageProps {
    data: BookDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 右栏提要卡里的「阅读全文」主按钮（由 layout 注入） */
    readAction?: React.ReactNode;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** @deprecated 2026-09 N3a 起全文入口统一为 readAction，此 prop 不再渲染 */
    fullTextSection?: React.ReactNode;
}

interface ResolvedRef {
    id: string;
    title?: string;
    edition?: string;
}

export const BookPage: React.FC<BookPageProps> = ({
    data, transport, onNavigate, renderLink, readAction, railTop, back,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [work, setWork] = useState<WorkDetailData | null>(null);
    const [collections, setCollections] = useState<Map<string, CollectionDetailData>>(new Map());
    const [siblings, setSiblings] = useState<ResolvedRef[]>([]);
    const [showAllSiblings, setShowAllSiblings] = useState(false);

    // ── 所属作品 ──
    useEffect(() => {
        if (!transport || !data.work_id) { setWork(null); return; }
        let cancelled = false;
        transport.getItem(data.work_id)
            .then(raw => {
                if (!cancelled && raw && (raw as { type?: string }).type === 'work') {
                    setWork(raw as unknown as WorkDetailData);
                }
            })
            .catch(() => { /* 作品拉不到不影响本页其余部分 */ });
        return () => { cancelled = true; };
    }, [transport, data.work_id]);

    // ── 收入丛编 ──
    useEffect(() => {
        const entries = data.contained_in || [];
        if (!transport || entries.length === 0) { setCollections(new Map()); return; }
        let cancelled = false;
        Promise.all(entries.map(e => {
            const cid = typeof e === 'string' ? e : e.id;
            return transport.getItem(cid)
                .then(raw => [cid, raw as unknown as CollectionDetailData] as const)
                .catch(() => [cid, null] as const);
        })).then(pairs => {
            if (cancelled) return;
            const m = new Map<string, CollectionDetailData>();
            for (const [id, c] of pairs) if (c) m.set(id, c);
            setCollections(m);
        });
        return () => { cancelled = true; };
    }, [transport, data.contained_in]);

    // ── 同作品其他版本：只取前 cap 条做导航入口 ──
    const siblingIds = useMemo(() => {
        const ids = new Set<string>([...(work?.books || []), ...(data.related_books || [])]);
        ids.delete(data.id);
        return [...ids];
    }, [work?.books, data.related_books, data.id]);

    useEffect(() => {
        if (!transport || siblingIds.length === 0) { setSiblings([]); return; }
        const wanted = showAllSiblings ? siblingIds : siblingIds.slice(0, CAP_SIBLINGS);
        let cancelled = false;
        Promise.all(wanted.map(id =>
            transport.getItem(id)
                .then(raw => ({
                    id,
                    title: (raw as { title?: string } | null)?.title,
                    edition: (raw as { edition?: string } | null)?.edition,
                }))
                .catch(() => ({ id })),
        )).then(list => { if (!cancelled) setSiblings(list); });
        return () => { cancelled = true; };
    }, [transport, siblingIds, showAllSiblings]);

    // ── 资源 ──
    const resources = useMemo(() => {
        const b = bucketResources(data.resources, data.resource_groups);
        return [
            ...b.mirrors.flatMap(g => g.items.map(r => ({ r, kind: convert(g.label), all: g.items }))),
            ...b.buckets.flatMap(k => k.items.map(r => ({ r, kind: convert(resourceKindLabel(k.key)), all: k.items }))),
        ];
    }, [data.resources, data.resource_groups, convert]);

    const era = deriveEra(data);
    const editionType = deriveEditionType(data);

    /*
     * 「收入叢編」已把册号列出来时，资源行不再给「展开 N 册」——
     * 展开出来的还是同一串数字。
     */
    const listedVolumeCounts = new Set((data.contained_in || []).map(e =>
        typeof e === 'string' ? 0 : normalizeVolumeIndex(e.volume_index).length).filter(n => n > 0));

    // ── 提要卡 ──
    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        if (editionType) {
            out.push({
                label: '版本類型',
                value: convert(editionType),
                title: data.lineage?.category ? undefined : convert('據版本題名推斷'),
            });
        }
        if (era.era || era.reign) {
            out.push({
                label: '刊寫年代',
                value: convert([era.era, era.reign].filter(Boolean).join(' ')),
                title: era.source === 'edition' ? convert('據版本題名推斷') : undefined,
            });
        }
        const measure = measureText(data, t.unit.juan);
        if (measure) out.push({ label: '卷帙', value: convert(measure) });

        const volumes = (data.contained_in || []).flatMap(e =>
            typeof e === 'string' ? [] : normalizeVolumeIndex(e.volume_index));
        if (volumes.length) {
            out.push({
                label: '冊次',
                value: convert(`第 ${formatVolumeRange(volumes, t.unit.volume)} ${t.unit.volume}（${volumes.length} ${t.unit.volume}）`),
            });
        }

        // 存藏：physical 资源优先于 current_location
        const physical = (data.resources || []).filter(r =>
            (r.types || (r.type ? [r.type] : [])).includes('physical'));
        if (physical.length) {
            out.push({
                label: '存藏',
                value: physical.slice(0, 2).map(r => convert(r.name)).join('、')
                    + (physical.length > 2 ? convert(` 等 ${physical.length} 處`) : ''),
            });
        } else if (data.current_location?.name) {
            out.push({ label: '存藏', value: convert(data.current_location.name) });
        }
        if (data.page_count?.description) {
            out.push({ label: t.label.pageCount, value: convert(data.page_count.description) });
        }
        if (data.publication_info?.details) {
            out.push({ label: '刊印', value: convert(data.publication_info.details) });
        }
        const aliases = [...flattenTitles(data.additional_titles), ...flattenTitles(data.attached_texts)];
        if (aliases.length) out.push({ label: '又名', value: aliases.map(convert).join('、') });
        return out;
    }, [data, convert, t, era, editionType]);

    /* 标题：大标题是书名，版本名作副题（与旧版一致，也免得长版本名撑成三行） */
    const heading = convert(data.title);
    const subtitle = data.edition ? convert(data.edition) : undefined;

    const card = (
        <SummaryCard
            title={heading}
            subtitle={subtitle}
            byline={<AuthorByline authors={data.authors ?? work?.authors} onNavigate={onNavigate} renderLink={renderLink} />}
            meta={<MetaLine items={[convert('版本'), editionType ? convert(editionType) : '', era.era ? convert(era.era) : '']} />}
            description={data.description?.text
                ? <MarkdownText text={data.description.text} style={{ fontSize: 15, lineHeight: 1.85 }} />
                : undefined}
            facts={facts}
            readAction={readAction}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        />
    );

    const containedIn = data.contained_in || [];

    const nav: RailNavItem[] = [];
    if (resources.length) nav.push({ id: 'resources', label: '影印與全文', count: resources.length });
    if (containedIn.length) nav.push({ id: 'collections', label: '收入叢編', count: containedIn.length });
    if (data.location_history?.length) nav.push({ id: 'provenance', label: '流轉歷史' });
    if (work) nav.push({ id: 'work', label: '所屬作品' });
    if (siblingIds.length) nav.push({ id: 'siblings', label: '其他版本', count: siblingIds.length });

    const main = (
        <>
            {resources.length > 0 && (
                <Sec id="resources" title="影印與全文" meta={convert(`${resources.length} 處`)}>
                    <table className="bim-d-zt">
                        <tbody>
                            {resources.map(({ r, kind, all }, i) => (
                                <ResourceRowView
                                    key={`${r.id || r.url || r.name}-${i}`}
                                    item={r}
                                    kind={kind}
                                    siblings={all}
                                    listedVolumeCounts={listedVolumeCounts}
                                />
                            ))}
                        </tbody>
                    </table>
                </Sec>
            )}

            {containedIn.length > 0 && (
                <Sec id="collections" title="收入叢編">
                    <table className="bim-d-zt">
                        <tbody>
                            {containedIn.map((entry, i) => {
                                const cid = typeof entry === 'string' ? entry : entry.id;
                                const vols = typeof entry === 'string' ? [] : normalizeVolumeIndex(entry.volume_index);
                                const coll = collections.get(cid);
                                const total = coll?._member_count || coll?.books?.length || coll?.contained_works?.length || 0;
                                return (
                                    <tr key={`${cid}-${i}`}>
                                        <td className="bim-d-zt-main">
                                            <BidLink id={cid} label={coll ? convert(coll.title) : cid}
                                                onNavigate={onNavigate} renderLink={renderLink} dense />
                                            {vols.length > 0 && <VolumeList volumes={vols} unit={t.unit.volume} />}
                                        </td>
                                        <td className={`bim-d-zt-sub bim-d-zt-nowrap${total ? '' : ' bim-d-zt-blank'}`} style={{ textAlign: 'right' }}>
                                            {total > 0 && convert(`全 ${total} ${t.unit.bu}`)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Sec>
            )}

            {data.location_history?.length ? (
                <Sec id="provenance" title="流轉歷史">
                    <table className="bim-d-zt">
                        <tbody>
                            {data.location_history.map((loc, i) => (
                                <tr key={i}>
                                    <td className="bim-d-zt-main">
                                        <span className="bim-d-zt-name">{convert(loc.name)}</span>
                                    </td>
                                    <td className={`bim-d-zt-sub${loc.description || loc.start_date ? '' : ' bim-d-zt-blank'}`}>
                                        <MetaLine items={[
                                            [loc.start_date, loc.end_date].filter(Boolean).join('—'),
                                            loc.description ? convert(loc.description) : '',
                                        ]} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Sec>
            ) : null}

            {resources.length === 0 && containedIn.length === 0 && !data.location_history?.length && (
                <Sec title="影印與全文">
                    <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>
                        {convert('尚未著錄該版本的影印、全文與收藏信息。')}
                    </p>
                </Sec>
            )}
        </>
    );

    const side = (
        <>
            {work && (
                <div id="work" className="bim-d-side" style={{ scrollMarginTop: 16 }}>
                    <h3 className="bim-d-ui">{convert(t.section.belongsToWork)}</h3>
                    <div style={{ fontSize: 17, fontWeight: 500 }}>
                        <BidLink id={work.id} label={convert(work.title)} onNavigate={onNavigate} renderLink={renderLink} />
                    </div>
                    <MetaLine
                        className="bim-d-ui"
                        style={{ display: 'block', marginTop: 2 }}
                        items={[
                            convert(measureText(work, t.unit.juan)),
                            ...(work.authors || []).slice(0, 2).map(a =>
                                `${a.dynasty ? `〔${convert(a.dynasty)}〕` : ''}${convert(a.name)}`),
                            work._edition_count ? convert(`${work._edition_count} 種版本`) : '',
                        ]}
                    />
                    {work.description?.text && (
                        <p style={{
                            margin: '8px 0 0', fontSize: 14, lineHeight: 1.8,
                            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }} className="bim-d-card-desc">
                            {convert(work.description.text.replace(/[#*_>`[\]]/g, ''))}
                        </p>
                    )}
                </div>
            )}
            {siblingIds.length > 0 && (
                <div>
                    <SideList
                        id="siblings"
                        title={t.relation.siblingVersions}
                        meta={convert(`${siblingIds.length} 種`)}
                        cap={showAllSiblings ? siblings.length : CAP_SIBLINGS}
                        items={siblings.map(s => (
                            <BidLink id={s.id} label={convert(s.edition || s.title || s.id)}
                                onNavigate={onNavigate} renderLink={renderLink} dense />
                        ))}
                    />
                    {!showAllSiblings && siblingIds.length > siblings.length && siblings.length > 0 && (
                        <MoreLink
                            label={`顯示更多（${siblingIds.length - siblings.length}）`}
                            onClick={() => setShowAllSiblings(true)}
                        />
                    )}
                </div>
            )}
        </>
    );

    return <DetailGrid railTop={railTop} back={back} nav={nav} main={main} card={card} side={side} />;
};

// ══════════════════════════════════════════════════════════════

/** 资源一行：名称 ↗（下附说明小字）｜类别｜「展开 N 册」 */
function ResourceRowView({ item, kind, siblings, listedVolumeCounts }: {
    item: ResourceEntry;
    kind?: string;
    siblings: ResourceEntry[];
    /** 「收入叢編」已列出的册数；与本资源分册数相同时不再给展开（展开的是同一串册号） */
    listedVolumeCounts: Set<number>;
}) {
    const { convert } = useConvert();
    const [open, setOpen] = useState(false);
    const stats = volumeStats(item);
    const hasVolumes = !!stats && stats.expected > 0 && !listedVolumeCounts.has(stats.expected);
    const base = (item.url ? getDisplayNameFromUrl(item.url) : undefined) || item.name;
    const suffix = resourceDisambiguator(item, siblings);
    const name = convert(suffix ? `${base}（${suffix}）` : base);
    const href = resourceHref(item);
    const note = resourceNote(item) || item.details;
    return (
        <tr>
            <td className="bim-d-zt-main">
                {href
                    ? <a href={href} target="_blank" rel="noopener noreferrer">{name} <span aria-hidden="true">↗</span></a>
                    : <span className="bim-d-zt-name">{name}</span>}
                {note && <span className="bim-d-meta">{convert(note)}</span>}
                {hasVolumes && open && (
                    <div style={{ padding: '0 12px 10px' }}><VolumeLinks item={item} /></div>
                )}
            </td>
            <td className={`bim-d-zt-sub bim-d-zt-nowrap${kind ? '' : ' bim-d-zt-blank'}`}>{kind}</td>
            <td className={hasVolumes ? undefined : 'bim-d-zt-blank'} style={{ textAlign: 'right' }}>
                {hasVolumes && (
                    <button type="button" className="bim-d-more bim-d-ui" style={{ marginTop: 0 }}
                        aria-expanded={open} onClick={() => setOpen(v => !v)}>
                        {convert(open ? '收起分冊' : `展開 ${stats!.expected} 冊`)}
                    </button>
                )}
            </td>
        </tr>
    );
}

/** 册次：一行辅助字「第 243–244 冊 · 2 冊」，不再逐个画方框 */
function VolumeList({ volumes, unit }: { volumes: number[]; unit: string }) {
    const { convert } = useConvert();
    return (
        <span className="bim-d-meta bim-d-ui">
            {convert(`第 ${formatVolumeRange(volumes, unit)} ${unit}`)}
            {volumes.length > 1 && <><span className="bim-d-dot" />{convert(`${volumes.length} ${unit}`)}</>}
        </span>
    );
}
