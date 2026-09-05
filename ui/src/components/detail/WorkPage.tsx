/**
 * 作品页（史記这类）。
 *
 * 区块顺序对齐设计稿：header → intro(简介 + facts) → 相關版本 →
 * 在線數字資源 → 歷代書目收錄 ‖ 歷代考證 → 續書與評註 → 相關作品。
 *
 * 「相關版本」表的 version 数据靠 transport 逐条解析，只解析可见行
 * （cap），展开后再解析剩下的——史記 35 个版本从 35 次请求降到 12 次。
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
    WorkDetailData,
    IndexedByEntry,
    EmendatedByEntry,
    ResourceEntry,
} from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import {
    Section, SectionHead, IntroGrid, FactList, DataTable, TableHead, TableRow,
    Chip, ChipWall, MoreButton, FilterChip, TextButton, ExpandRow, Quote,
    ResourceGroup, ResourceRow, BidLink, ExtLink, Dash, EmptyNote,
    type FactItem,
    type RenderLink,
} from './primitives';
import {
    buildVersionTable, bucketResources, resourceNote, resourceDisambiguator, groupRelatedWorks,
    measureText, deriveEra,
    type ResolvedVersion, type VersionRow,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref, volumeStats } from '../../core/resources';

/** 桌面 cap；窄屏由 CSS 控制不了行数，故统一用桌面值，窄屏靠展开按钮 */
const CAP = { versions: 12, catalogs: 8, chips: 12 };

export interface WorkPageProps {
    data: WorkDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 版本传承入口（由 layout 注入，渲染在版本区块头右侧） */
    lineageAction?: React.ReactNode;
}

export const WorkPage: React.FC<WorkPageProps> = ({
    data, transport, onNavigate, renderLink, lineageAction,
}) => {
    const t = useT();
    const { convert } = useConvert();

    // ── 版本解析 ──
    const versionIds = useMemo(
        () => [...(data.books || []), ...(data.collections || [])],
        [data.books, data.collections],
    );

    const [resolved, setResolved] = useState<Map<string, ResolvedVersion>>(new Map());
    const [showAllVersions, setShowAllVersions] = useState(false);
    const [era, setEra] = useState('');
    const [scanOnly, setScanOnly] = useState(false);
    const [sort, setSort] = useState<'default' | 'year'>('default');

    // 只解析「需要显示的」那批：默认 cap 条，展开后全量。
    // 筛选/排序需要全量数据才准确，所以一旦用户动了筛选就解析全部。
    const needAll = showAllVersions || !!era || scanOnly || sort === 'year';
    const idsToResolve = useMemo(
        () => (needAll ? versionIds : versionIds.slice(0, CAP.versions)),
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
                    // getItem 返回 Record<string, unknown>，这里只挑版本表用得到的字段
                    const b = (raw ?? {}) as Partial<ResolvedVersion>;
                    return [id, {
                        id,
                        title: b.title,
                        edition: b.edition,
                        resources: b.resources,
                        publication_info: b.publication_info,
                        current_location: b.current_location,
                        lineage: b.lineage,
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

    // 未解析的先用 ID 占位，避免表格闪烁抖动
    const versions: ResolvedVersion[] = useMemo(
        () => versionIds.map(id => resolved.get(id) ?? { id }),
        [versionIds, resolved],
    );

    const table = useMemo(
        () => buildVersionTable(versions, data.version_graph, { era, scanOnly, sort }),
        [versions, data.version_graph, era, scanOnly, sort],
    );

    const visibleRows = showAllVersions ? table.rows : table.rows.slice(0, CAP.versions);

    // ── 资源 ──
    const resources = useMemo(
        () => bucketResources(data.resources, data.resource_groups),
        [data.resources, data.resource_groups],
    );

    // ── 关联作品 ──
    const relatedGroups = useMemo(
        () => groupRelatedWorks(
            (data.related_works || []).map(r => ({ id: r.id, title: r.title, relation: r.relation })),
        ),
        [data.related_works],
    );

    // ── facts ──
    const facts: FactItem[] = useMemo(() => {
        const out: FactItem[] = [];
        const dynasty = data.authors?.[0]?.dynasty;
        if (dynasty) out.push({ label: '成書', value: convert(dynasty) });

        const measure = measureText(data, t.unit.juan);
        if (measure) {
            const desc = data.juan_count?.description;
            out.push({
                label: '卷帙',
                value: convert(measure),
                title: desc ? convert(desc) : undefined,
            });
        }

        // 最早存世刻本：从版本年份推。只在解析了足够多版本时才显示，
        // 否则「最早」会随着解析进度跳变。
        if (needAll || versionIds.length <= CAP.versions) {
            const years = table.allRows.map(r => r.year).filter((y): y is number => y != null);
            if (years.length > 0) {
                const min = Math.min(...years);
                const earliest = table.allRows.find(r => r.year === min);
                if (earliest?.era.era) {
                    out.push({
                        label: '最早存世刻本',
                        value: `${earliest.era.era}${earliest.era.reign ? ' ' + earliest.era.reign : ''}`,
                        title: earliest.era.source === 'edition' ? '據版本題名推斷' : undefined,
                    });
                }
            }
        }

        if (data.indexed_by?.length) {
            out.push({
                label: '著錄',
                value: `${data.indexed_by.length} ${t.unit.bu}`,
            });
        }
        return out;
    }, [data, convert, t, table.allRows, needAll, versionIds.length]);

    return (
        <>
            {/* ── intro ── */}
            <IntroGrid facts={facts.length ? <FactList items={facts} /> : undefined}>
                {data.description?.text && (
                    <>
                        <MarkdownText
                            text={data.description.text}
                            style={{
                                fontSize: 15, lineHeight: 2.05,
                                color: 'var(--bim-body-fg, #3b3228)', textAlign: 'justify',
                            }}
                        />
                        {data.description.sources?.length ? (
                            <div className="bim-d-ui" style={{
                                marginTop: 8, fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                            }}>
                                {data.description.sources.map(s => convert(s)).join(' · ')}
                            </div>
                        ) : null}
                    </>
                )}
                {data.appendix?.map((entry, i) => (
                    <details key={i} style={{ marginTop: 12 }}>
                        <summary className="bim-d-ui" style={{
                            cursor: 'pointer', fontSize: 12,
                            color: 'var(--bim-accent, #9c3a2c)',
                            borderBottom: '1px solid var(--bim-rule, #e0d6c0)',
                            display: 'inline-block',
                        }}>
                            {convert(entry.title)}
                        </summary>
                        <MarkdownText
                            text={entry.text}
                            plainStrong
                            style={{
                                marginTop: 10, fontSize: 13.5, lineHeight: 2,
                                color: 'var(--bim-quiet-fg, #5b4f40)',
                            }}
                        />
                    </details>
                ))}
                <TagRows data={data} convert={convert} t={t} />
            </IntroGrid>

            {/* ── 相關版本 ── */}
            {versionIds.length > 0 && (
                <Section>
                    <SectionHead
                        glyph="版"
                        title={t.section.relatedVersions}
                        count={
                            table.rows.length === table.allRows.length
                                ? `${table.allRows.length} 種`
                                : `${table.allRows.length} 種 · 當前 ${table.rows.length} 種`
                        }
                        actions={
                            <>
                                {lineageAction}
                                <FilterChip
                                    label="僅看有影印"
                                    active={scanOnly}
                                    dashed
                                    onClick={() => { setScanOnly(v => !v); setShowAllVersions(false); }}
                                />
                                <TextButton
                                    label={sort === 'default' ? '排序：預設順序' : '排序：年代先後'}
                                    onClick={() => setSort(s => (s === 'default' ? 'year' : 'default'))}
                                />
                            </>
                        }
                    />

                    {/* 朝代筛选：≥6 个版本且推出 ≥2 个朝代才值得出现 */}
                    {table.allRows.length >= 6 && table.eras.length >= 2 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                            <FilterChip label={t.catalog.all} active={!era}
                                onClick={() => { setEra(''); setShowAllVersions(false); }} />
                            {table.eras.map(e => (
                                <FilterChip key={e} label={e} active={era === e}
                                    onClick={() => { setEra(e); setShowAllVersions(false); }} />
                            ))}
                        </div>
                    )}

                    <DataTable>
                        <TableHead
                            leadWidth={22}
                            metaWidth={424}
                            mainLabel="版本名稱"
                            metaColumns={[
                                { label: '刊刻年代', width: '118px' },
                                { label: '影印圖源', width: '156px' },
                                { label: '收藏機構', width: '138px' },
                            ]}
                        />
                        {visibleRows.map((row, i) => (
                            <VersionTableRow
                                key={row.id}
                                row={row}
                                no={i + 1}
                                onNavigate={onNavigate}
                                renderLink={renderLink}
                            />
                        ))}
                        {visibleRows.length === 0 && (
                            <EmptyNote>
                                {era || scanOnly ? '當前篩選下沒有版本' : '暫無版本著錄'}
                            </EmptyNote>
                        )}
                    </DataTable>

                    {table.rows.length > visibleRows.length && (
                        <MoreButton
                            label={`展開其餘 ${table.rows.length - visibleRows.length} 種版本`}
                            onClick={() => setShowAllVersions(true)}
                        />
                    )}

                    {table.hasInferredEra && (
                        <div className="bim-d-ui" style={{
                            marginTop: 10, fontSize: 11,
                            color: 'var(--bim-hint-fg, #b3a385)',
                        }}>
                            部分刊刻年代據版本題名推斷，非著錄原文
                        </div>
                    )}
                </Section>
            )}

            {/* ── 在線數字資源 ── */}
            {(resources.buckets.length > 0 || resources.mirrors.length > 0) && (
                <Section>
                    <SectionHead glyph="源" title="在線數字資源" />
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: 26,
                    }}>
                        {resources.mirrors.map(g => (
                            <ResourceGroup key={g.key} title={convert(g.label)} tag={g.description ? convert(g.description) : undefined}>
                                {g.items.map((r, i) => (
                                    <ResourceLine key={`${r.id || r.url || r.name}-${i}`}
                                        item={r} siblings={g.items} convert={convert} />
                                ))}
                            </ResourceGroup>
                        ))}
                        {resources.buckets.map(b => (
                            <ResourceGroup
                                key={b.key}
                                title={BUCKET_TITLES[b.key]}
                                tag={BUCKET_TAGS[b.key]}
                            >
                                {b.items.map((r, i) => (
                                    <ResourceLine key={`${r.id || r.url || r.name}-${i}`}
                                        item={r} siblings={b.items} convert={convert} />
                                ))}
                            </ResourceGroup>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── 歷代書目收錄 ‖ 歷代考證 ── */}
            {(data.indexed_by?.length || data.emendated_by?.length) ? (
                <div className={data.emendated_by?.length ? 'bim-d-pair' : undefined}
                    style={data.emendated_by?.length ? undefined : { marginBottom: 48 }}>
                    {data.indexed_by?.length ? (
                        <AnnotationBlock
                            id="catalogs"
                            glyph="目"
                            title={t.section.indexed}
                            items={data.indexed_by}
                            unit={t.unit.bu}
                            cap={CAP.catalogs}
                            showMeta
                            t={t}
                            convert={convert}
                            onNavigate={onNavigate}
                            renderLink={renderLink}
                        />
                    ) : null}
                    {data.emendated_by?.length ? (
                        <AnnotationBlock
                            id="studies"
                            glyph="考"
                            title={t.section.emendated}
                            items={data.emendated_by}
                            unit={t.unit.bu}
                            cap={CAP.catalogs}
                            t={t}
                            convert={convert}
                            onNavigate={onNavigate}
                            renderLink={renderLink}
                        />
                    ) : null}
                </div>
            ) : null}

            {/* ── 關聯作品分组 chip 牆 ── */}
            {relatedGroups.map(g => (
                <RelatedBlock
                    key={g.key}
                    glyph={g.key === 'derivative' ? '續' : '叢'}
                    title={t.section[g.labelKey] ?? t.section.relatedWorks}
                    items={g.items}
                    convert={convert}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                />
            ))}
        </>
    );
};

// ══════════════════════════════════════════════════════════════

const BUCKET_TITLES: Record<string, string> = {
    text: '文字全文庫',
    image: '影印資源',
    textImage: '圖文對照',
    physical: '館藏',
};

const BUCKET_TAGS: Record<string, string> = {
    text: '純文本',
    image: '原卷掃描',
    textImage: '圖文對照',
    physical: '實體',
};

/** 资源行 + 分册展开 */
function ResourceLine({ item, siblings, convert }: {
    item: ResourceEntry;
    /** 同组资源，用于给重名条目加区分后缀 */
    siblings: ResourceEntry[];
    convert: (s: string) => string;
}) {
    const [open, setOpen] = useState(false);
    const stats = volumeStats(item);
    const hasVolumes = !!stats && stats.expected > 0;
    const baseName = (item.url ? getDisplayNameFromUrl(item.url) : undefined) || convert(item.name);
    const suffix = resourceDisambiguator(item, siblings);
    const name = suffix ? `${baseName}（${suffix}）` : baseName;

    return (
        <ResourceRow
            name={name}
            note={resourceNote(item)}
            href={resourceHref(item)}
            extra={hasVolumes ? (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(v => !v)}
                        className="bim-d-ui"
                        style={{
                            alignSelf: 'flex-start', padding: '2px 0', background: 'none',
                            border: 'none', cursor: 'pointer', fontSize: 11,
                            color: 'var(--bim-meta-fg, #7b6a54)',
                            borderBottom: '1px solid var(--bim-rule, #e0d6c0)',
                            marginTop: 4,
                        }}
                    >
                        {open ? '收起分冊' : `展開 ${stats!.expected} 冊`}
                    </button>
                    {open && <VolumeLinks item={item} />}
                </>
            ) : undefined}
        />
    );
}

/** 分册链接网格（缺册划线） */
function VolumeLinks({ item }: { item: ResourceEntry }) {
    const volumes = item.volumes || [];
    return (
        <div className="bim-d-ui" style={{
            display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 0 10px', fontSize: 11,
        }}>
            {volumes.map((v, i) => {
                const missing = v.status === 'missing';
                const url = v.url;
                if (url && !missing) {
                    return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                            style={{
                                padding: '1px 5px',
                                border: '1px solid var(--bim-rule, #e0d6c0)',
                            }}>
                            {v.volume}
                        </a>
                    );
                }
                return (
                    <span key={i} style={{
                        padding: '1px 5px',
                        color: missing
                            ? 'var(--bim-missing-fg, #e67e22)'
                            : 'var(--bim-hint-fg, #b3a385)',
                        textDecoration: missing ? 'line-through' : undefined,
                    }}>
                        {v.volume}
                    </span>
                );
            })}
        </div>
    );
}

/** 版本表的一行 */
function VersionTableRow({ row, no, onNavigate, renderLink }: {
    row: VersionRow;
    no: number;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const { convert } = useConvert();
    const eraLabel = [row.era.era, row.era.reign].filter(Boolean).join(' · ');
    const inferred = row.era.source === 'edition';

    return (
        <TableRow
            no={String(no).padStart(2, '0')}
            leadWidth={22}
            metaWidth={424}
            metaColumns={['118px', '156px', '138px']}
            main={
                <BidLink
                    id={row.id}
                    label={convert(row.name)}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                    dense
                    style={{ fontWeight: row.important ? 600 : 400 }}
                />
            }
            meta={
                <>
                    {/*
                      * 推断出的年代不加视觉标记——曾经在这里缀一个「?」，
                      * 整列望过去全是「清?」「明?」，像数据坏了。
                      * 改为只在 hover 提示，区块底部另有一行统一说明。
                      */}
                    <span
                        style={{ color: 'var(--bim-meta-fg, #7b6a54)', letterSpacing: '.04em' }}
                        title={inferred ? '據版本題名推斷' : undefined}
                    >
                        {eraLabel || <Dash />}
                    </span>
                    <ResourceCell items={row.images} convert={convert} />
                    <ResourceCell items={row.holders} convert={convert} fallback={row.locationName} />
                </>
            }
        />
    );
}

/** 版本行里的资源单元格：1 条直接显示，多条显示「n 源」 */
function ResourceCell({ items, convert, fallback }: {
    items: ResourceEntry[];
    convert: (s: string) => string;
    fallback?: string;
}) {
    if (items.length === 0) {
        return fallback ? <span style={{ minWidth: 0 }}>{convert(fallback)}</span> : <Dash />;
    }
    if (items.length === 1) {
        const it = items[0];
        const name = (it.url ? getDisplayNameFromUrl(it.url) : undefined) || convert(it.name);
        const href = resourceHref(it);
        return (
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {href ? <ExtLink href={href}>{name}</ExtLink> : name}
            </span>
        );
    }
    // 多条：显示首条 + 计数，避免撑爆列宽
    const first = items[0];
    const name = (first.url ? getDisplayNameFromUrl(first.url) : undefined) || convert(first.name);
    const href = resourceHref(first);
    return (
        <span style={{ minWidth: 0 }}>
            {href ? <ExtLink href={href}>{name}</ExtLink> : name}
            <span className="bim-d-ui" style={{
                marginLeft: 4, fontSize: 11, color: 'var(--bim-hint-fg, #b3a385)',
            }}>
                +{items.length - 1}
            </span>
        </span>
    );
}

/** 书目收录 / 考证：可展开行列表 */
function AnnotationBlock({
    id, glyph, title, items, unit, cap, showMeta, t, convert, onNavigate, renderLink,
}: {
    id: string;
    glyph: string;
    title: string;
    items: (IndexedByEntry | EmendatedByEntry)[];
    unit: string;
    cap: number;
    showMeta?: boolean;
    t: ReturnType<typeof useT>;
    convert: (s: string) => string;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const [open, setOpen] = useState<Record<number, boolean>>({});
    const [showAll, setShowAll] = useState(false);
    const allOpen = items.length > 0 && items.every((_, i) => open[i]);

    const toggleAll = useCallback(() => {
        setOpen(allOpen ? {} : Object.fromEntries(items.map((_, i) => [i, true])));
    }, [allOpen, items]);

    const visible = showAll ? items : items.slice(0, cap);

    return (
        <section id={id} style={{ scrollMarginTop: 16 }}>
            <SectionHead
                glyph={glyph}
                tone="ink"
                title={title}
                count={`${items.length} ${unit}`}
                actions={
                    <TextButton label={allOpen ? '收起全部' : '＋ 展開提要'} onClick={toggleAll} />
                }
            />
            <DataTable>
                {visible.map((entry, i) => {
                    const e = entry as IndexedByEntry;
                    return (
                        <ExpandRow
                            key={i}
                            open={!!open[i]}
                            onToggle={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
                            main={
                                <>
                                    {e.source_bid ? (
                                        <BidLink id={e.source_bid} label={convert(e.source)}
                                            onNavigate={onNavigate} renderLink={renderLink} dense />
                                    ) : convert(e.source)}
                                    {showMeta && e.section && (
                                        <span className="bim-d-ui" style={{
                                            marginLeft: 8, fontSize: 11,
                                            color: 'var(--bim-hint-fg, #b3a385)',
                                        }}>
                                            {convert(e.section)}
                                        </span>
                                    )}
                                </>
                            }
                            action={
                                e.source_bid ? (
                                    <BidLink
                                        id={e.source_bid}
                                        label={t.action.view}
                                        onNavigate={onNavigate}
                                        renderLink={renderLink}
                                        dense
                                        style={{
                                            fontFamily: 'var(--bim-font-ui, system-ui, sans-serif)',
                                            fontSize: 11.5,
                                            color: 'var(--bim-meta-fg, #7b6a54)',
                                        }}
                                    />
                                ) : undefined
                            }
                        >
                            {showMeta && (e.title_info || e.author_info || e.edition) && (
                                <div className="bim-d-ui" style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
                                    marginBottom: 8, fontSize: 12,
                                    color: 'var(--bim-meta-fg, #7b6a54)',
                                }}>
                                    {e.title_info && <span>{t.label.titleInfo} {convert(e.title_info)}</span>}
                                    {e.author_info && <span>{t.label.authorInfo} {convert(e.author_info)}</span>}
                                    {e.edition && <span>{t.label.edition} {convert(e.edition)}</span>}
                                </div>
                            )}
                            {e.summary && <Quote>{convert(e.summary)}</Quote>}
                            {e.comment && <Quote label={t.section.comment}>{convert(e.comment)}</Quote>}
                            {e.additional_comment && (
                                <Quote label={t.section.additionalComment}>{convert(e.additional_comment)}</Quote>
                            )}
                            {showMeta && e.page && (
                                <div className="bim-d-ui" style={{
                                    fontSize: 11, color: 'var(--bim-hint-fg, #b3a385)',
                                }}>
                                    {e.page}
                                </div>
                            )}
                        </ExpandRow>
                    );
                })}
            </DataTable>
            {items.length > visible.length && (
                <MoreButton
                    label={`展開其餘 ${items.length - visible.length} ${unit}`}
                    onClick={() => setShowAll(true)}
                />
            )}
        </section>
    );
}

/** 关联作品 chip 牆 */
function RelatedBlock({ glyph, title, items, convert, onNavigate, renderLink }: {
    glyph: string;
    title: string;
    items: { id: string; title: string }[];
    convert: (s: string) => string;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? items : items.slice(0, CAP.chips);

    return (
        <Section style={{ marginBottom: 44 }}>
            <SectionHead glyph={glyph} tone="ink" title={title} count={`${items.length} 種`} />
            <ChipWall>
                {visible.map(it => (
                    <Chip key={it.id}>
                        <BidLink id={it.id} label={convert(it.title)}
                            onNavigate={onNavigate} renderLink={renderLink} dense
                            style={{ color: 'inherit' }} />
                    </Chip>
                ))}
                {items.length > visible.length && (
                    <MoreButton inline
                        label={`更多 ${items.length - visible.length} 種`}
                        onClick={() => setShowAll(true)} />
                )}
            </ChipWall>
        </Section>
    );
}

/** intro 下的别名 / 附录 / 附载篇目 chip 行 */
function TagRows({ data, convert, t }: {
    data: WorkDetailData;
    convert: (s: string) => string;
    t: ReturnType<typeof useT>;
}) {
    const rows: { label: string; items: string[] }[] = [];

    const titles = (data.additional_titles || [])
        .map(x => (typeof x === 'string' ? x : x.book_title))
        .filter(Boolean);
    if (titles.length) rows.push({ label: t.section.aliases, items: titles });

    const attached = (data.attached_texts || [])
        .map(x => (typeof x === 'string' ? x : x.book_title))
        .filter(Boolean);
    if (attached.length) rows.push({ label: t.section.attachedTexts, items: attached });

    const additional = (data.additional_works || [])
        .map(w => w.book_title + (w.n_juan != null ? ` ${w.n_juan}${t.unit.juan}` : ''));
    if (additional.length) rows.push({ label: t.section.appendix, items: additional });

    if (!rows.length) return null;

    return (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(row => (
                <div key={row.label} style={{
                    display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                }}>
                    <span className="bim-d-ui" style={{
                        fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)', letterSpacing: '.08em',
                    }}>
                        {row.label}
                    </span>
                    {row.items.map((s, i) => <Chip key={i}>{convert(s)}</Chip>)}
                </div>
            ))}
        </div>
    );
}
