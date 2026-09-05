/**
 * 丛编页（武英殿聚珍版叢書这类）。
 *
 * 「收錄書籍」表的数据有三个来源，按信息量降序：目录档 → contained_works
 * → books[]。武英殿的 144 条走 contained_works（自带标题与册次），
 * **零额外请求**——旧版对 books[] 逐条 getItem 发了 144 次请求只为拿标题。
 *
 * 区块：header → intro → 收錄書籍 → 影印與全文 ‖ 包含作品。
 */
import React, { useState, useMemo } from 'react';
import type { CollectionDetailData, ResourceEntry, VolumeBookMapping } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import {
    Section, SectionHead, IntroGrid, FactList, DataTable, TableHead, TableRow,
    Chip, ChipWall, MoreButton, FilterChip, ResourceRow, BidLink, Dash, EmptyNote,
    type FactItem,
    type RenderLink,
} from './primitives';
import {
    buildCollectionTable, bucketResources, resourceNote,
    formatVolumeRange, measureText,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref } from '../../core/resources';

const CAP = { titles: 16, works: 16 };

export interface CollectionPageProps {
    data: CollectionDetailData;
    /** 丛编目录档（由 layout 预加载，生产仓只有 7 部丛编有） */
    catalog?: VolumeBookMapping | null;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 完整目录 tab 的入口（由 layout 注入） */
    catalogAction?: React.ReactNode;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
    data, catalog, onNavigate, renderLink, catalogAction,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [section, setSection] = useState('');
    const [showAllTitles, setShowAllTitles] = useState(false);
    const [showAllWorks, setShowAllWorks] = useState(false);

    const table = useMemo(
        () => buildCollectionTable(data, catalog),
        [data, catalog],
    );

    const filtered = useMemo(
        () => (section ? table.rows.filter(r => r.section === section) : table.rows),
        [table.rows, section],
    );
    const visibleTitles = showAllTitles ? filtered : filtered.slice(0, CAP.titles);

    const resources = useMemo(
        () => bucketResources(data.resources, data.resource_groups),
        [data.resources, data.resource_groups],
    );

    /*
     * 「包含作品」：表格列的就是同一批条目时不再重复一遍。
     * 目录档模式下表格已把每部书连同册次列全，chip 墙只是同样的书名再抄一次。
     */
    const works = data.contained_works || [];
    const tableIds = new Set(table.rows.map(r => r.id).filter(Boolean));
    const showWorksChips = works.length > 0
        && !works.every(w => tableIds.has(w.id));

    /** 所有行的 edition 都一样 → 逐行标注没有信息量 */
    const uniformEdition = (() => {
        const eds = table.rows.map(r => r.edition).filter(Boolean);
        return eds.length > 1 && new Set(eds).size === 1;
    })();
    const visibleWorks = showAllWorks ? works : works.slice(0, CAP.works);

    const hasSectionColumn = table.sections.length > 0;

    // ── facts ──
    const facts: FactItem[] = useMemo(() => {
        const out: FactItem[] = [];
        if (data.subtype) {
            out.push({
                label: t.label.type,
                value: data.subtype === 'work_collection' ? '叢編 · 作品集' : '叢編',
            });
        }
        if (data.publication_info?.details) {
            out.push({ label: '刊印', value: convert(data.publication_info.details) });
        }
        if (data.publication_info?.year) {
            out.push({ label: '年代', value: data.publication_info.year });
        }

        const kinds = data.books?.length || works.length;
        const measure = measureText(data, t.unit.juan);
        if (kinds || measure) {
            out.push({
                label: '種數 / 卷數',
                value: [
                    kinds ? `${kinds} ${t.unit.bu}` : '',
                    convert(measure),
                ].filter(Boolean).join(' · '),
                title: data.juan_count?.description ? convert(data.juan_count.description) : undefined,
            });
        }

        if (table.totalVolumes) {
            out.push({ label: '全帙冊數', value: `${table.totalVolumes} ${t.unit.volume}` });
        }
        return out;
    }, [data, works.length, table.totalVolumes, convert, t]);

    return (
        <>
            <IntroGrid facts={facts.length ? <FactList items={facts} /> : undefined}>
                {data.description?.text && (
                    <MarkdownText
                        text={data.description.text}
                        style={{
                            fontSize: 15, lineHeight: 2.05,
                            color: 'var(--bim-body-fg, #3b3228)', textAlign: 'justify',
                        }}
                    />
                )}
                {data.history?.length ? (
                    <div style={{ marginTop: 14 }}>
                        {data.history.map((h, i) => (
                            <div key={i} style={{
                                fontSize: 13.5, lineHeight: 2,
                                color: 'var(--bim-quiet-fg, #5b4f40)',
                            }}>
                                · {convert(h)}
                            </div>
                        ))}
                    </div>
                ) : null}
            </IntroGrid>

            {/* ── 收錄書籍 ── */}
            {table.rows.length > 0 && (
                <Section>
                    <SectionHead
                        glyph="目"
                        title={t.section.containedBooks}
                        count={
                            filtered.length === table.rows.length
                                ? `${t.catalog.contains} ${table.rows.length} ${t.unit.items}`
                                : `${table.rows.length} ${t.unit.items} · 當前 ${filtered.length} ${t.unit.items}`
                        }
                        actions={
                            <>
                                {catalogAction}
                                {hasSectionColumn && (
                                    <>
                                        <FilterChip label={t.catalog.all} active={!section}
                                            onClick={() => { setSection(''); setShowAllTitles(false); }} />
                                        {table.sections.map(s => (
                                            <FilterChip key={s} label={s} active={section === s}
                                                onClick={() => { setSection(s); setShowAllTitles(false); }} />
                                        ))}
                                    </>
                                )}
                            </>
                        }
                    />
                    <DataTable>
                        <TableHead
                            leadWidth={26}
                            metaWidth={300}
                            mainLabel="書名"
                            metaColumns={[
                                ...(hasSectionColumn ? [{ label: '部類', width: '64px' }] : []),
                                { label: '全帙冊次', width: '1fr' },
                            ]}
                        />
                        {visibleTitles.map((row, i) => (
                            <TableRow
                                key={`${row.id ?? row.title}-${i}`}
                                no={String(i + 1).padStart(2, '0')}
                                leadWidth={26}
                                metaWidth={300}
                                metaColumns={hasSectionColumn ? ['64px', '1fr'] : ['1fr']}
                                main={
                                    <>
                                        {row.id ? (
                                            <BidLink id={row.id} label={convert(row.title)}
                                                onNavigate={onNavigate} renderLink={renderLink} dense />
                                        ) : (
                                            <span>{convert(row.title)}</span>
                                        )}
                                        {row.subItems?.length ? (
                                            <span className="bim-d-ui" style={{
                                                marginLeft: 6, fontSize: 11.5,
                                                color: 'var(--bim-hint-fg, #b3a385)',
                                            }}>
                                                （{row.subItems.map(s => convert(s)).join('、')}）
                                            </span>
                                        ) : null}
                                        {/*
                                          * edition 只在各行不同时才有信息量。整套丛编
                                          * 同一版本时（武英殿 144 行全是「武英殿聚珍版」），
                                          * 逐行标注是纯噪音，已在 uniformEdition 里判掉。
                                          */}
                                        {row.edition && !uniformEdition && (
                                            <span className="bim-d-ui" style={{
                                                marginLeft: 8, fontSize: 11,
                                                color: 'var(--bim-hint-fg, #b3a385)',
                                            }}>
                                                {convert(row.edition)}
                                            </span>
                                        )}
                                    </>
                                }
                                meta={
                                    <>
                                        {hasSectionColumn && (
                                            <span style={{ color: 'var(--bim-meta-fg, #7b6a54)' }}>
                                                {/* section 可能已自带「部」字，别再拼一个出来 */}
                                                {row.section
                                                    ? (row.section.endsWith('部') ? row.section : `${row.section}部`)
                                                    : <Dash />}
                                            </span>
                                        )}
                                        <span className="bim-d-ui" style={{
                                            color: 'var(--bim-label-fg, #a3937b)',
                                        }}>
                                            {row.volumes.length > 0
                                                ? `第 ${formatVolumeRange(row.volumes, t.unit.volume)} ${t.unit.volume}`
                                                : (row.expected != null
                                                    ? `${row.found ?? 0}/${row.expected} ${t.unit.volume}`
                                                    : <Dash />)}
                                        </span>
                                    </>
                                }
                            />
                        ))}
                        {visibleTitles.length === 0 && (
                            <EmptyNote>{t.catalog.noMatch}</EmptyNote>
                        )}
                    </DataTable>
                    {filtered.length > visibleTitles.length && (
                        <MoreButton
                            label={`展開其餘 ${filtered.length - visibleTitles.length} ${t.unit.items}子目`}
                            onClick={() => setShowAllTitles(true)}
                        />
                    )}
                </Section>
            )}

            {/* ── 影印與全文 ‖ 包含作品 ── */}
            {(resources.buckets.length > 0 || showWorksChips) && (
                <div className="bim-d-pair bim-d-pair-wide">
                    {(resources.buckets.length > 0 || resources.mirrors.length > 0) && (
                        <section>
                            <SectionHead glyph="源" tone="ink" title="影印與全文" />
                            <div style={{ borderTop: '1px solid var(--bim-rule-strong, #2a231c)' }}>
                                {[...resources.mirrors.flatMap(g => g.items),
                                  ...resources.buckets.flatMap(b => b.items)].map((r, i) => (
                                    <CollectionResourceLine key={r.id || i} item={r} convert={convert} />
                                ))}
                            </div>
                        </section>
                    )}

                    {showWorksChips && (
                        <section>
                            <SectionHead glyph="叢" tone="ink" title={t.section.containedWorks}
                                count={`${works.length} 種`} />
                            <ChipWall>
                                {visibleWorks.map(w => (
                                    <Chip key={w.id}>
                                        <BidLink id={w.id} label={convert(w.title)}
                                            onNavigate={onNavigate} renderLink={renderLink} dense
                                            style={{ color: 'inherit' }} />
                                    </Chip>
                                ))}
                                {works.length > visibleWorks.length && (
                                    <MoreButton inline
                                        label={`更多 ${works.length - visibleWorks.length} 種`}
                                        onClick={() => setShowAllWorks(true)} />
                                )}
                            </ChipWall>
                        </section>
                    )}
                </div>
            )}
        </>
    );
};

function CollectionResourceLine({ item, convert }: {
    item: ResourceEntry;
    convert: (s: string) => string;
}) {
    const name = (item.url ? getDisplayNameFromUrl(item.url) : undefined) || convert(item.name);
    return (
        <ResourceRow
            name={name}
            note={resourceNote(item) || (item.details ? convert(item.details) : undefined)}
            href={resourceHref(item)}
        />
    );
}
