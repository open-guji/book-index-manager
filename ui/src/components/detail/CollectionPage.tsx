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
 * 用户 09-28 在样张上定：长说明留在提要卡里截断；主按钮不放；四部分类先不放
 * （子目表不出部类页签、部类列）。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { AuthorInfo, CollectionDetailData, VolumeBookMapping } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, MoreLink, SummaryCard, SideList, CardFoot, RailUp, descNeedsClamp,
    type CardFact, type RailNavItem, type RailLink,
} from './layout';
import { buildCollectionTable, formatVolumeRange, measureText } from '../../core/detail-model';
import { AuthorByline, ResourceGroupList, ResourceRow, splitResources } from './shared';

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
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
    data, catalog, transport, onNavigate, renderLink, catalogAction, railTop, back, railLinks,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [query, setQuery] = useState('');
    const [showAllTitles, setShowAllTitles] = useState(false);
    const [parent, setParent] = useState<{ id: string; title?: string } | null>(null);

    const table = useMemo(() => buildCollectionTable(data, catalog), [data, catalog]);

    /* 子目行补取：书名（只有 ID 的）、撰人、卷数、版本数。只取可见行 */
    const [info, setInfo] = useState<Map<string, RowInfo>>(new Map());

    const filtered = useMemo(() => {
        const q = query.trim();
        if (!q) return table.rows;
        // 繁简都能搜：比对两边都转成当前显示字形
        const needle = convert(q);
        return table.rows.filter(r => {
            const title = (r.id && info.get(r.id)?.title) || r.title;
            return convert(title).includes(needle) || (r.subItems || []).some(s => convert(s).includes(needle));
        });
    }, [table.rows, query, info, convert]);
    const visibleTitles = showAllTitles ? filtered : filtered.slice(0, CAP_TITLES);

    const idsToResolve = useMemo(
        () => visibleTitles.filter(r => r.id && !info.has(r.id)).map(r => r.id!),
        [visibleTitles, info],
    );
    useEffect(() => {
        if (!transport || idsToResolve.length === 0) return;
        let cancelled = false;
        Promise.all(idsToResolve.map(id =>
            transport.getItem(id)
                .then(raw => {
                    const d = (raw ?? {}) as {
                        title?: string; edition?: string; authors?: AuthorInfo[]; measure_info?: string;
                        juan_count?: { number?: number; description?: string };
                        _edition_count?: number; books?: string[];
                    };
                    const v: RowInfo = {
                        title: d.title,
                        edition: d.edition,
                        authors: d.authors,
                        measure: raw ? measureText(raw as never, t.unit.juan) : undefined,
                        versionCount: d._edition_count ?? d.books?.length,
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
    }, [transport, idsToResolve, t.unit.juan]);

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

    const res = useMemo(() => splitResources(data.resources, data.resource_groups), [data.resources, data.resource_groups]);
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
    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        if (table.rows.length) {
            out.push({ label: '子目', value: `${table.rows.length} ${convert(t.unit.items)}` });
        }
        if (members && members !== table.rows.length) {
            const memberLabel = data._member_type === 'Book' ? '所收版本'
                : data._member_type === 'Work' ? '所收作品' : '成員';
            out.push({ label: convert(memberLabel), value: `${members} ${convert(t.unit.bu)}`, title: convert('子目與其各版本合計') });
        }
        const measure = measureText(data, t.unit.juan);
        // 應收總數：count 各項互不隱含、可為 null；已有「卷帙」時不重複出卷
        const cnt = data.count;
        if (cnt) {
            const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
            const parts = [
                num(cnt.zhong) != null ? `${cnt.zhong} 種` : '',
                num(cnt.ce) != null ? `${cnt.ce} ${t.unit.volume}` : '',
                num(cnt.han) != null ? `${cnt.han} 函` : '',
                !measure && num(cnt.juan) != null ? `${cnt.juan} ${t.unit.juan}` : '',
            ].filter(Boolean);
            if (parts.length) out.push({ label: '應收', value: convert(parts.join('　')) });
        }
        const volumes = table.totalVolumes ? `${table.totalVolumes} ${convert(t.unit.volume)}` : '';
        if (measure || volumes) {
            out.push({
                label: '卷帙',
                value: [measure ? convert(measure) : '', volumes].filter(Boolean).join('　'),
                title: data.juan_count?.description ? convert(data.juan_count.description) : undefined,
            });
        }
        if (data.publication_info?.details) out.push({ label: '刊印', value: convert(data.publication_info.details) });
        if (data.publication_info?.year) out.push({ label: '年代', value: convert(data.publication_info.year) });
        return out;
    }, [data, members, table.rows.length, table.totalVolumes, convert, t]);

    const descText = data.description?.text;
    const card = (
        <SummaryCard
            kind="叢編"
            title={convert(data.title)}
            byline={<AuthorByline authors={data.authors} onNavigate={onNavigate} renderLink={renderLink} />}
            meta={<MetaLine items={[
                data.subtype === 'work_collection' ? convert('作品集') : '',
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
            facts={facts}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        />
    );

    const nav: RailNavItem[] = [];
    if (table.rows.length) nav.push({ id: 'titles', label: '子目', count: table.rows.length });
    if (resCount) nav.push({ id: 'resources', label: '影印與全文', count: resCount });
    if (showWorks) nav.push({ id: 'works', label: t.section.containedWorks, count: works.length });

    const main = (
        <>
            {table.rows.length > 0 && (
                <Sec
                    id="titles"
                    title="子目"
                    meta={<MetaLine items={[
                        convert(`${table.rows.length} ${t.unit.items}`),
                        table.totalVolumes ? convert(`全帙 ${table.totalVolumes} ${t.unit.volume}`) : '',
                        filtered.length !== table.rows.length ? convert(`當前 ${filtered.length} ${t.unit.items}`) : '',
                    ]} />}
                    action={catalogAction}
                >
                    {table.rows.length > CAP_TITLES && (
                        <div className="bim-d-filters bim-d-ui">
                            <input
                                type="search"
                                className="bim-d-find"
                                value={query}
                                placeholder={convert('在本叢編中檢索')}
                                aria-label={convert('在本叢編中檢索')}
                                onChange={e => { setQuery(e.target.value); setShowAllTitles(false); }}
                            />
                        </div>
                    )}
                    <table className="bim-d-zt">
                        <thead className="bim-d-ui">
                            <tr>
                                {hasVolumeColumn && <th style={{ width: '8.5em' }}>{convert('冊次')}</th>}
                                <th>{convert('書名')}</th>
                                <th style={{ textAlign: 'right' }}>{convert('版本')}</th>
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
                                const vol = row.volumes.length > 0
                                    ? convert(`第 ${formatVolumeRange(row.volumes, t.unit.volume)} ${t.unit.volume}`)
                                    : row.expected != null
                                        ? convert(`${row.found ?? 0}/${row.expected} ${t.unit.volume}`)
                                        : '';
                                return (
                                    <tr key={`${row.id ?? row.title}-${i}`}>
                                        {hasVolumeColumn && (
                                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${vol ? '' : ' bim-d-zt-blank'}`}>
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
                                            {got?.versionCount ? convert(`${got.versionCount} 種`) : ''}
                                        </td>
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

            {resCount > 0 && (
                <Sec id="resources" title="影印與全文" meta={convert(`${resCount} 處`)}>
                    {res.text.length > 0 && (
                        <div className="bim-d-rg">
                            {res.groups.length > 0 && <h3 className="bim-d-rg-h bim-d-ui">{convert('全文')}</h3>}
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
                <Sec title="子目">
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

    const up = parent ? (
        <RailUp caption="上級叢編">
            <BidLink id={parent.id} label={convert(parent.title || parent.id)} onNavigate={onNavigate} renderLink={renderLink} dense />
        </RailUp>
    ) : undefined;

    return <DetailGrid railTop={railTop} back={back} up={up} nav={nav} railLinks={railLinks} main={main} card={card} side={side} />;
};
