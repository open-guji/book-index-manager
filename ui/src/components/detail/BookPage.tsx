/**
 * 版本页（御定佩文韻府这类）。
 *
 * 与作品页最大的不同：Book 的 description 只有 2.5% 有，
 * 所以 intro 多数时候只剩 facts —— IntroGrid 会自动切成横排铺满，
 * 不留一大片空白。
 *
 * 区块：header → intro → 收入叢編 → 所屬作品 ‖ 影印與全文 → 同作品其他版本。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type {
    BookDetailData,
    WorkDetailData,
    CollectionDetailData,
} from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import {
    Section, SectionHead, IntroGrid, FactList, Chip, ChipWall, MoreButton,
    VolumeChips, ResourceLine, TagRow, flattenTitles, BidLink,
    type FactItem, type RenderLink,
} from './primitives';
import {
    bucketResources, deriveEra, deriveEditionType,
    normalizeVolumeIndex, formatVolumeRange, measureText,
} from '../../core/detail-model';

const CAP_SIBLINGS = 8;

export interface BookPageProps {
    data: BookDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}

interface ResolvedRef {
    id: string;
    title?: string;
    edition?: string;
}

export const BookPage: React.FC<BookPageProps> = ({
    data, transport, onNavigate, renderLink,
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

    // ── 同作品其他版本 ──
    // 作品页有完整列表，这里只取前 cap 条做导航入口，不解析全部
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
    const resources = useMemo(
        () => bucketResources(data.resources, data.resource_groups),
        [data.resources, data.resource_groups],
    );

    // ── facts ──
    const facts: FactItem[] = useMemo(() => {
        const out: FactItem[] = [];
        const era = deriveEra(data);
        const editionType = deriveEditionType(data);

        if (editionType) {
            out.push({
                label: '版本類型',
                value: editionType,
                title: data.lineage?.category ? undefined : '據版本題名推斷',
            });
        }
        if (era.era || era.reign) {
            out.push({
                label: '刊寫年代',
                value: [era.era, era.reign].filter(Boolean).join(' '),
                title: era.source === 'edition' ? '據版本題名推斷' : undefined,
            });
        }

        // 册次：contained_in[].volume_index（int / list / str 三种形态）
        const volumes = (data.contained_in || []).flatMap(e =>
            typeof e === 'string' ? [] : normalizeVolumeIndex(e.volume_index));
        if (volumes.length) {
            out.push({ label: '冊數', value: `${volumes.length} ${t.unit.volume}` });
            out.push({ label: '冊次', value: `第 ${formatVolumeRange(volumes, t.unit.volume)} ${t.unit.volume}` });
        }

        const measure = measureText(data, t.unit.juan);
        if (measure) out.push({ label: '卷帙', value: convert(measure) });

        // 存藏：physical 资源（73% 有）优先于 current_location（0.5% 有）
        const physical = (data.resources || []).filter(r =>
            (r.types || (r.type ? [r.type] : [])).includes('physical'));
        if (physical.length) {
            out.push({
                label: '存藏',
                value: physical.slice(0, 2).map(r => convert(r.name)).join('、')
                    + (physical.length > 2 ? ` 等 ${physical.length} 處` : ''),
            });
        } else if (data.current_location?.name) {
            out.push({ label: '存藏', value: convert(data.current_location.name) });
        }

        if (data.page_count?.description) {
            out.push({ label: t.label.pageCount, value: data.page_count.description });
        }
        return out;
    }, [data, convert, t]);

    const hasIntroText = !!data.description?.text;

    /*
     * 「收入叢編」区块已经把册号一个个列成方块（321…343）。
     * 资源行若再给一个「展開 23 冊」，展开出来的还是同一串数字，
     * 纯属重复——故这种情况下资源行不再提供分册展开。
     */
    const hasVolumeChips = (data.contained_in || []).some(e =>
        typeof e !== 'string' && normalizeVolumeIndex(e.volume_index).length > 0);

    return (
        <>
            <IntroGrid facts={facts.length ? <FactList items={facts} horizontal={!hasIntroText} /> : undefined}>
                {hasIntroText ? (
                    <MarkdownText
                        text={data.description!.text}
                        style={{
                            fontSize: 15, lineHeight: 2.05,
                            color: 'var(--bim-body-fg, #3b3228)', textAlign: 'justify',
                        }}
                    />
                ) : undefined}
            </IntroGrid>

            {/* ── 收入叢編 ── */}
            {(data.contained_in || []).length > 0 && (
                <Section>
                    <SectionHead glyph="收" title={t.section.containedIn} />
                    <div style={{
                        borderTop: '1px solid var(--bim-rule-strong, #2a231c)',
                        borderBottom: '1px solid var(--bim-rule, #eae2d0)',
                        padding: '14px 4px',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                        {(data.contained_in || []).map((entry, i) => {
                            const cid = typeof entry === 'string' ? entry : entry.id;
                            const vols = typeof entry === 'string'
                                ? [] : normalizeVolumeIndex(entry.volume_index);
                            const coll = collections.get(cid);
                            const total = coll?.books?.length || coll?.contained_works?.length || 0;
                            return (
                                <div key={`${cid}-${i}`}>
                                    <div style={{
                                        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
                                        justifyContent: 'space-between', gap: '8px 16px', marginBottom: 12,
                                    }}>
                                        <span style={{ fontSize: 16 }}>
                                            <BidLink id={cid} label={coll ? convert(coll.title) : cid}
                                                onNavigate={onNavigate} renderLink={renderLink} />
                                        </span>
                                        <span className="bim-d-ui" style={{
                                            fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                                        }}>
                                            {total > 0 && `全 ${total} ${t.unit.bu}`}
                                            {total > 0 && vols.length > 0 && ' · '}
                                            {vols.length > 0 && `本書佔 ${vols.length} ${t.unit.volume}`}
                                        </span>
                                    </div>
                                    {vols.length > 0 && <VolumeChips volumes={vols} unit={t.unit.volume} />}
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* ── 所屬作品 ‖ 影印與全文 ── */}
            <div className="bim-d-pair">
                {work && (
                    <section>
                        <SectionHead glyph="作" tone="ink" title={t.section.belongsToWork} />
                        <div style={{
                            borderTop: '1px solid var(--bim-rule-strong, #2a231c)',
                            padding: '12px 4px 0',
                        }}>
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
                                gap: '6px 12px', marginBottom: 10,
                            }}>
                                <span style={{ fontSize: 16 }}>
                                    <BidLink id={work.id} label={convert(work.title)}
                                        onNavigate={onNavigate} renderLink={renderLink} />
                                </span>
                                <span style={{ fontSize: 12.5, color: 'var(--bim-meta-fg, #7b6a54)' }}>
                                    {[
                                        convert(measureText(work, t.unit.juan)),
                                        work.authors?.map(a =>
                                            `${a.dynasty ? `〔${convert(a.dynasty)}〕` : ''}${convert(a.name)}${a.role ? ' ' + convert(a.role) : ''}`,
                                        ).join(' · '),
                                    ].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                            {work.description?.text && (
                                <MarkdownText
                                    text={work.description.text}
                                    style={{
                                        fontSize: 13.5, lineHeight: 2,
                                        color: 'var(--bim-quiet-fg, #5b4f40)', textAlign: 'justify',
                                    }}
                                />
                            )}
                            <div style={{ marginTop: 14 }}>
                                <TagRow
                                    label={t.section.aliases}
                                    items={[
                                        ...flattenTitles(data.additional_titles),
                                        ...flattenTitles(data.attached_texts),
                                    ]}
                                />
                            </div>
                        </div>
                    </section>
                )}

                {(resources.buckets.length > 0 || resources.mirrors.length > 0) && (
                    <section>
                        <SectionHead glyph="源" tone="ink" title="影印與全文" />
                        <div style={{ borderTop: '1px solid var(--bim-rule-strong, #2a231c)' }}>
                            {resources.mirrors.map(g => (
                                <div key={g.key} style={{ marginBottom: 8 }}>
                                    <div className="bim-d-ui" style={{
                                        padding: '8px 4px 4px', fontSize: 11.5,
                                        color: 'var(--bim-label-fg, #a3937b)',
                                    }}>
                                        {convert(g.label)}
                                    </div>
                                    {g.items.map((r, i) => (
                                        <ResourceLine key={`${r.id || r.url || r.name}-${i}`}
                                            item={r} showVolumes={!hasVolumeChips} />
                                    ))}
                                </div>
                            ))}
                            {resources.buckets.flatMap(b => b.items).map((r, i) => (
                                <ResourceLine key={`${r.id || r.url || r.name}-${i}`}
                                    item={r} showVolumes={!hasVolumeChips} />
                            ))}
                        </div>
                    </section>
                )}
            </div>

            {/* ── 流轉歷史 ── */}
            {data.location_history?.length ? (
                <Section>
                    <SectionHead glyph="藏" tone="ink" title={t.section.locationHistory} />
                    <div style={{ borderTop: '1px solid var(--bim-rule-strong, #2a231c)' }}>
                        {data.location_history.map((loc, i) => (
                            <div key={i} style={{
                                display: 'flex', flexWrap: 'wrap', gap: '4px 12px',
                                padding: '9px 4px', fontSize: 14,
                                borderBottom: '1px solid var(--bim-rule, #eae2d0)',
                            }}>
                                <span>{convert(loc.name)}</span>
                                {loc.description && (
                                    <span className="bim-d-ui" style={{
                                        fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                                    }}>
                                        {convert(loc.description)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            ) : null}

            {/* ── 同作品其他版本 ── */}
            {siblingIds.length > 0 && (
                <Section style={{ marginBottom: 0 }}>
                    <SectionHead
                        glyph="版"
                        tone="ink"
                        title={t.relation.siblingVersions}
                        count={`${siblingIds.length} 種`}
                        actions={work ? (
                            <BidLink
                                id={work.id}
                                label="在作品頁查看全部 →"
                                onNavigate={onNavigate}
                                renderLink={renderLink}
                                style={{ color: 'var(--bim-meta-fg, #7b6a54)', fontSize: 11.5 }}
                            />
                        ) : undefined}
                    />
                    <ChipWall>
                        {siblings.map(s => (
                            <Chip key={s.id}>
                                <BidLink id={s.id}
                                    label={convert(s.edition || s.title || s.id)}
                                    onNavigate={onNavigate} renderLink={renderLink} dense
                                    style={{ color: 'inherit' }} />
                            </Chip>
                        ))}
                        {siblingIds.length > siblings.length && (
                            <MoreButton inline
                                label={`更多 ${siblingIds.length - siblings.length} 種`}
                                onClick={() => setShowAllSiblings(true)} />
                        )}
                    </ChipWall>
                </Section>
            )}
        </>
    );
};
