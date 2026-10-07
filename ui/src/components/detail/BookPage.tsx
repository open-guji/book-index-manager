/**
 * 版本页（程甲本、御定佩文韻府这类）—— 2026-09 B1 新设计（overview#251）。
 *
 * 中栏：全文（本站全文的阅读入口 + 回目，站外全文）→ 影印（按资源组分，镜像收成一行）
 * → 版本源流（底本 / 參校 / 本版 / 附记里的翻刻，一条竖线）→ 收入丛编 → 流转历史；
 * 右栏：提要卡（「版本」小字、书名、版本名、署名、版本类型·年代·卷帙、简介截 6 行、
 * 事实表、唯一主按钮「阅读全文」+ 文字链接「看原书影印」）→ 所属作品 → 同作品版本（按年代，本页高亮）。
 * 左栏：检索 →「所屬作品」→ 本页导航。
 *
 * 顺序「全文 → 影印 → 源流」是用户 09-28 在样张上定的：能读的放最前。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type {
    BookDetailData,
    WorkDetailData,
    CollectionDetailData,
    LineageConfidence,
} from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, flattenTitles, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, SummaryCard, SideList, CardFoot, MoreLink, RailUp, descNeedsClamp,
    type CardFact, type RailNavItem, type RailLink,
} from './layout';
import {
    deriveEra, deriveEditionType, sortYear,
    normalizeVolumeIndex, formatVolumeRange, measureText,
} from '../../core/detail-model';
import { AuthorByline, ResourceGroupList, ResourceRow, splitResources } from './shared';
import { VersionLineageView } from '../VersionLineageView';
import type { LineageGraph } from '../../core/lineage-graph';

/** 同作品版本：全部解析后按年代排的上限（再多就只取前几条，不排） */
const SIBLINGS_SORT_MAX = 40;
/** 同作品版本：本页前后各露几条 */
const SIBLINGS_WINDOW = 2;
/** 回目网格先露几回 */
const CAP_CHAPTERS = 9;

/** 回目链接：有 href 走宿主的阅读页，否则 onClick 切到本组件内的全文 tab */
/** 版本页回目网格要的章目录（layout 由 manifest＋<key>/index.json 换出；file 是章 key，如「001」） */
export interface BookChapterList {
    source?: { name?: string; license?: string };
    chapters: Array<{ n: number; title: string; file: string }>;
}

export interface ChapterLink {
    href?: string;
    onClick?: () => void;
}

export interface BookPageProps {
    data: BookDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 右栏提要卡里的「阅读全文」主按钮（由 layout 注入） */
    readAction?: React.ReactNode;
    /** 本站全文目录（由 layout 预加载；没有全文时为空） */
    fullText?: BookChapterList | null;
    /** 数据标了有全文、目录还没取回：先按一块阅读入口 + 三行回目占位（CLS） */
    fullTextPending?: boolean;
    /** 某一回的阅读链接（file 为章节文件名）；不给则回目不可点 */
    chapterLink?: (file: string) => ChapterLink | null | undefined;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** 左栏「更多」：切到丛编目录、extraTabs 等其他页面的入口（由 layout 注入） */
    railLinks?: RailLink[];
    /** @deprecated 2026-09 N3a 起全文入口统一为 readAction，此 prop 不再渲染 */
    fullTextSection?: React.ReactNode;
}

interface ResolvedRef {
    id: string;
    title?: string;
    edition?: string;
    year?: number;
}

/** 源流可信度：字典 bookPage.confidence.* */
const CONFIDENCE_KEYS: ReadonlySet<string> = new Set<LineageConfidence>(['certain', 'consensus', 'probable', 'disputed']);

/** 章名「第一回　甄士隱夢幻識通靈　賈雨村風塵懷閨秀」→ ['第一回', '甄士隱夢幻識通靈'] */
function splitChapterTitle(title: string | undefined): [string, string] {
    if (!title) return ['', ''];
    const parts = title.split(/[　 ]+/).filter(Boolean);
    if (parts.length >= 2 && /^第.+[回章卷篇節节]$/.test(parts[0])) return [parts[0], parts[1]];
    return ['', title];
}

export const BookPage: React.FC<BookPageProps> = ({
    data, transport, onNavigate, renderLink, readAction, fullText, fullTextPending, chapterLink, railTop, back, railLinks,
}) => {
    const t = useT();
    /** tr：字典键取词（界面文字）；t 是旧的整本字典对象 */
    const { t: tr, convert } = useI18n();

    const [work, setWork] = useState<WorkDetailData | null>(null);
    const [collections, setCollections] = useState<Map<string, CollectionDetailData>>(new Map());
    const [siblings, setSiblings] = useState<ResolvedRef[]>([]);
    const [lineageRefs, setLineageRefs] = useState<Map<string, ResolvedRef>>(new Map());
    const [showAllChapters, setShowAllChapters] = useState(false);
    /** 版本源流：'flow' = 设计稿卡片流，'graph' = 现有关系图（整部作品的版本图，本版高亮） */
    const [lineageMode, setLineageMode] = useState<'flow' | 'graph'>('flow');
    const [workGraph, setWorkGraph] = useState<LineageGraph | null>(null);

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

    // ── 作品的版本图（有才给「关系图」切换；取不到就只有卡片流） ──
    useEffect(() => {
        if (!transport?.getLineageGraph || !data.work_id) { setWorkGraph(null); return; }
        let cancelled = false;
        transport.getLineageGraph(data.work_id)
            .then(g => { if (!cancelled) setWorkGraph(g && g.nodes.length > 1 ? g : null); })
            .catch(() => { if (!cancelled) setWorkGraph(null); });
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

    // ── 同作品版本：不多于 40 种时全解析、按年代排；本页也在列里（高亮） ──
    const siblingIds = useMemo(() => {
        const ids = new Set<string>([...(work?.books || []), ...(data.related_books || [])]);
        ids.add(data.id);
        return [...ids];
    }, [work?.books, data.related_books, data.id]);
    const otherCount = siblingIds.length - 1;

    useEffect(() => {
        if (!transport || otherCount <= 0) { setSiblings([]); return; }
        const sortable = siblingIds.length <= SIBLINGS_SORT_MAX;
        const wanted = sortable ? siblingIds : siblingIds.slice(0, 8);
        let cancelled = false;
        Promise.all(wanted.map(id => {
            if (id === data.id) return Promise.resolve({ id, title: data.title, edition: data.edition, year: sortYear(data) });
            return transport.getItem(id)
                .then(raw => {
                    const b = (raw ?? {}) as unknown as BookDetailData;
                    return { id, title: b.title, edition: b.edition, year: raw ? sortYear(b) : undefined };
                })
                .catch(() => ({ id }) as ResolvedRef);
        })).then(list => {
            if (cancelled) return;
            // 解析不到的（已删、墓碑）不列；有年代的按年代排，没有的排后面、保持原序
            const ok = list.filter(s => s.id === data.id || s.title || s.edition);
            if (sortable) {
                ok.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
            }
            setSiblings(ok);
        });
        return () => { cancelled = true; };
    }, [transport, siblingIds, otherCount, data]);

    // ── 源流里引到的其他版本：取版本名 ──
    const lineage = data.lineage;
    const lineageBookIds = useMemo(() => [
        ...(lineage?.derived_from || []).filter(d => d.ref_type === 'book').map(d => d.ref),
        ...(lineage?.related_to || []).map(r => r.book_id),
    ].filter(Boolean), [lineage]);
    useEffect(() => {
        if (!transport || lineageBookIds.length === 0) { setLineageRefs(new Map()); return; }
        let cancelled = false;
        Promise.all(lineageBookIds.map(id =>
            transport.getItem(id)
                .then(raw => [id, {
                    id,
                    title: (raw as { title?: string } | null)?.title,
                    edition: (raw as { edition?: string } | null)?.edition,
                }] as const)
                .catch(() => [id, { id }] as const),
        )).then(pairs => { if (!cancelled) setLineageRefs(new Map(pairs)); });
        return () => { cancelled = true; };
    }, [transport, lineageBookIds]);

    // ── 资源 ──
    const res = useMemo(() => splitResources(data.resources, data.resource_groups, tr), [data.resources, data.resource_groups, tr]);
    const imageCount = res.groups.reduce((n, g) => n + g.rows.length + g.mirrors.length, 0);
    const hasPhysicalOnly = res.groups.length > 0 && res.groups.every(g => g.key === '_physical');

    const era = deriveEra(data);
    const editionType = deriveEditionType(data);
    const measure = measureText(data, t.unit.juan);

    /*
     * 「收入叢編」已把册号列出来时，资源行不再给「展开 N 册」——
     * 展开出来的还是同一串数字。
     */
    const listedVolumeCounts = new Set((data.contained_in || []).map(e =>
        typeof e === 'string' ? 0 : normalizeVolumeIndex(e.volume_index).length).filter(n => n > 0));

    /** 底本名：base_edition 有名字的优先，其次解析到的版本名 */
    const refName = (id: string): string => {
        const be = (data as { base_edition?: { book_id?: string; name?: string }[] }).base_edition
            ?.find(x => x.book_id === id && x.name);
        if (be?.name) return be.name;
        const r = lineageRefs.get(id);
        return r?.edition || r?.title || '';
    };

    // ── 提要卡 ──
    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        if (editionType) {
            out.push({
                label: tr('bookPage.fact.editionType'),
                value: convert(editionType),
                title: (data.edition_type || data.lineage?.category) ? undefined : tr('bookPage.inferredFromEdition'),
            });
        }
        if (data.publication_info?.details) {
            out.push({ label: tr('bookPage.fact.publication'), value: convert(data.publication_info.details) });
        } else if (era.era || era.reign) {
            out.push({
                label: tr('bookPage.fact.era'),
                value: convert([era.era, era.reign].filter(Boolean).join(' ')),
                title: era.source === 'edition' ? tr('bookPage.inferredFromEdition') : undefined,
            });
        }
        if (measure) out.push({ label: tr('bookPage.fact.measure'), value: convert(measure) });

        const volumes = (data.contained_in || []).flatMap(e =>
            typeof e === 'string' ? [] : normalizeVolumeIndex(e.volume_index));
        if (volumes.length) {
            out.push({
                label: tr('bookPage.fact.volumes'),
                value: tr('bookPage.volumesValue', { range: formatVolumeRange(volumes, t.unit.volume), unit: t.unit.volume, n: volumes.length }),
            });
        }
        const base = (data.lineage?.derived_from || []).find(d => d.relation === '底本' && d.ref_type === 'book');
        if (base && refName(base.ref)) {
            out.push({
                label: tr('bookPage.fact.baseEdition'),
                value: <BidLink id={base.ref} label={convert(refName(base.ref))} onNavigate={onNavigate} renderLink={renderLink} dense />,
            });
        }
        // base_edition[]：lineage 已给出底本时跳过 role=底本，避免重复；配補／參校 逐 role 一行
        const baseEditions = (data.base_edition || []).filter(b => b && b.name);
        for (const role of ['底本', '配補', '參校']) {
            if (role === '底本' && base && refName(base.ref)) continue;
            const items = baseEditions.filter(b => b.role === role);
            if (!items.length) continue;
            out.push({
                // role 是数据里的取值（底本／配補／參校），按数据文字转换
                label: convert(role),
                value: items.map((b, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && '、'}
                        {b.book_id
                            ? <BidLink id={b.book_id} label={convert(b.name as string)} onNavigate={onNavigate} renderLink={renderLink} dense />
                            : convert(b.name as string)}
                    </React.Fragment>
                )),
            });
        }

        // 存藏：provenance（机构＋索书號）优先，其次 physical 资源，最后 current_location
        const prov = (data.provenance || []).filter(p => p && p.institution);
        const physical = (data.resources || []).filter(r =>
            (r.types || (r.type ? [r.type] : [])).includes('physical'));
        if (prov.length) {
            out.push({
                label: tr('bookPage.fact.holdings'),
                value: prov.slice(0, 2).map(p => convert(p.institution)).join('、')
                    + (prov.length > 2 ? tr('bookPage.andMorePlaces', { n: prov.length }) : ''),
            });
            const calls = prov.filter(p => p.call_number).slice(0, 2)
                .map(p => `${convert(p.institution)} ${p.call_number}`);
            if (calls.length) {
                out.push({
                    label: tr('bookPage.fact.callNumber'),
                    value: calls.join('；') + (prov.filter(p => p.call_number).length > 2 ? '…' : ''),
                });
            }
            const seals = prov.flatMap(p => p.seals || []).filter(Boolean);
            if (seals.length) out.push({ label: tr('bookPage.fact.seals'), value: convert(seals.join('、')) });
        } else if (physical.length) {
            out.push({
                label: tr('bookPage.fact.holdings'),
                value: physical.slice(0, 2).map(r => convert(r.name)).join('、')
                    + (physical.length > 2 ? tr('bookPage.andMorePlaces', { n: physical.length }) : ''),
            });
        } else if (data.current_location?.name) {
            out.push({ label: tr('bookPage.fact.holdings'), value: convert(data.current_location.name) });
        }
        // 行款／裝幀／尺寸／品相：空串不显示
        const pd = data.physical_description;
        if (pd) {
            const rows: [string, string | undefined][] = [
                [tr('bookPage.fact.leafStyle'), pd.leaf_style], [tr('bookPage.fact.binding'), pd.binding],
                [tr('bookPage.fact.dimensions'), pd.dimensions], [tr('bookPage.fact.condition'), pd.condition],
            ];
            for (const [label, v] of rows) {
                if (v && v.trim()) out.push({ label, value: convert(v) });
            }
        }
        if (data.page_count?.description) {
            out.push({ label: t.label.pageCount, value: convert(data.page_count.description) });
        }
        const aliases = [...flattenTitles(data.additional_titles), ...flattenTitles(data.attached_texts)];
        if (aliases.length) out.push({ label: tr('bookPage.fact.aliases'), value: aliases.map(convert).join('、') });
        return out;
        // refName 读 lineageRefs
    }, [data, convert, t, tr, era, editionType, measure, lineageRefs, onNavigate, renderLink]); // eslint-disable-line react-hooks/exhaustive-deps

    /* 标题：大标题是书名，版本名作副题（也免得长版本名撑成三行） */
    const heading = convert(data.title);
    const subtitle = data.edition ? convert(data.edition) : undefined;
    const yearText = data.lineage?.year_text || '';

    const card = (
        <SummaryCard
            kind={tr('bookPage.kind')}
            title={heading}
            subtitle={subtitle}
            byline={<AuthorByline authors={data.authors ?? work?.authors} onNavigate={onNavigate} renderLink={renderLink} />}
            meta={(() => {
                const tags = [
                    editionType ? convert(editionType) : '',
                    era.era ? convert([era.era, era.reign].filter(Boolean).join('')) : '',
                    measure ? convert(measure) : '',
                ].filter(Boolean);
                return tags.length ? (
                    <span className="bim-d-tags">
                        {tags.map((x, i) => <span key={i} className={`bim-d-tag bim-d-tag-${Math.min(i, 2)}`}>{x}</span>)}
                    </span>
                ) : null;
            })()}
            description={data.description?.text
                ? <MarkdownText text={data.description.text} style={{ fontSize: 15, lineHeight: 1.85 }} />
                : undefined}
            clampDescription={descNeedsClamp(data.description?.text) ? 6 : undefined}
            facts={facts}
            readAction={readAction}
            secondaryAction={readAction && imageCount > 0 && !hasPhysicalOnly
                ? <a className="bim-d-card-alt bim-d-ui" href="#images">{tr('bookPage.viewImages')}</a>
                : undefined}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        />
    );

    const containedIn = data.contained_in || [];
    const chapters = fullText?.chapters || [];
    /** 章节单位：小说「回」，其余「章」「卷」——取第一章章名的末字 */
    const chapUnit = convert((chapters[0] && splitChapterTitle(chapters[0].title)[0].slice(-1)) || '') || tr('bookPage.chapterUnit');
    const chapterCountText = tr('bookPage.chapterCount', { n: chapters.length, unit: chapUnit });
    const hasLineage = !!(lineage?.derived_from?.length || lineage?.related_to?.length || data.appendix?.length);

    const nav: RailNavItem[] = [];
    const imagesTitle = hasPhysicalOnly ? tr('bookPage.sec.physical') : tr('bookPage.sec.images');
    if (chapters.length || res.text.length || fullTextPending) nav.push({ id: 'fulltext', label: tr('bookPage.sec.fulltext'), count: chapters.length ? chapterCountText : undefined });
    if (res.groups.length) nav.push({ id: 'images', label: imagesTitle, count: imageCount });
    if (hasLineage) nav.push({ id: 'lineage', label: tr('bookPage.sec.lineage') });
    if (containedIn.length) nav.push({ id: 'collections', label: tr('section.containedIn'), count: containedIn.length });
    if (data.location_history?.length) nav.push({ id: 'provenance', label: tr('section.locationHistory') });

    const openChapter = (file: string) => chapterLink?.(file) ?? null;
    const first = chapters[0];
    const firstLink = first ? openChapter(first.file) : null;
    const visibleChapters = showAllChapters ? chapters : chapters.slice(0, CAP_CHAPTERS);

    const renderChapterAnchor = (link: ChapterLink | null, children: React.ReactNode, className?: string) => (
        link
            ? (
                <a
                    className={className}
                    href={link.href ?? '#'}
                    onClick={link.onClick ? (e) => {
                        if (e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        link.onClick!();
                    } : undefined}
                >
                    {children}
                </a>
            )
            : <span className={className}>{children}</span>
    );

    const main = (
        <>
            {(chapters.length > 0 || res.text.length > 0 || fullTextPending) && (
                <Sec
                    id="fulltext"
                    title={tr('bookPage.sec.fulltext')}
                    meta={chapters.length > 0 ? (
                        <MetaLine items={[
                            chapterCountText,
                            fullText?.source?.name
                                ? tr('bookPage.sourceBy', { src: convert(`${fullText.source.name}${fullText.source.license ? ` ${fullText.source.license}` : ''}`) })
                                : '',
                        ]} />
                    ) : undefined}
                >
                    {fullTextPending && !first && (
                        <>
                            <div className="bim-d-ft" aria-busy="true">
                                <span className="bim-d-ft-h">&nbsp;</span>
                                <span className="bim-d-meta">&nbsp;</span>
                            </div>
                            <div className="bim-d-chap-pending" aria-hidden="true" />
                        </>
                    )}
                    {first && (
                        <div className="bim-d-ft">
                            <h3 className="bim-d-ft-h">
                                {tr('bookPage.readFrom', { ch: convert(splitChapterTitle(first.title)[0]) || tr('bookPage.firstChapter') })}
                            </h3>
                            <span className="bim-d-meta">{convert((first.title || '').replace(/^第.+?[回章卷篇節节][　 ]*/, ''))}</span>
                            {renderChapterAnchor(firstLink, <>{tr('bookPage.enterReader')} <span aria-hidden="true">→</span></>, 'bim-d-ft-go bim-d-ui')}
                        </div>
                    )}
                    {chapters.length > 1 && (
                        <ul className="bim-d-chap">
                            {visibleChapters.map(ch => {
                                const [head, rest] = splitChapterTitle(ch.title);
                                return (
                                    <li key={ch.file}>
                                        {renderChapterAnchor(openChapter(ch.file), (
                                            <>{head && <b>{convert(head)}</b>}{convert(rest || ch.file)}</>
                                        ))}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {chapters.length > visibleChapters.length && (
                        <MoreLink
                            label={tr('detail.expandRest', { n: chapters.length - visibleChapters.length, unit: chapUnit })}
                            onClick={() => setShowAllChapters(true)}
                        />
                    )}
                    {res.text.length > 0 && (
                        <>
                            {(chapters.length > 0 || fullTextPending) && (
                                <p className="bim-d-meta bim-d-ui" style={{ margin: '14px 0 4px' }}>{tr('bookPage.externalText')}</p>
                            )}
                            <table className="bim-d-zt">
                                <tbody>
                                    {res.text.map((r, i) => (
                                        <ResourceRow key={`${r.id || r.url || r.name}-${i}`} item={r} siblings={res.text}
                                            listedVolumeCounts={listedVolumeCounts} />
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </Sec>
            )}

            {res.groups.length > 0 && (
                <Sec
                    id="images"
                    title={imagesTitle}
                    meta={<MetaLine items={[
                        res.groups.length > 1 ? tr('bookPage.groupCount', { n: res.groups.length }) : '',
                        tr('bookPage.placeCount', { n: imageCount }),
                    ]} />}
                >
                    <ResourceGroupList groups={res.groups} listedVolumeCounts={listedVolumeCounts} />
                </Sec>
            )}

            {hasLineage && (
                <Sec
                    id="lineage"
                    title={tr('bookPage.sec.lineage')}
                    meta={lineage?.derived_from?.length ? tr('bookPage.lineageMeta') : undefined}
                    action={workGraph ? (
                        <span className="bim-d-seg bim-d-ui" role="group" aria-label={tr('bookPage.lineageView')}>
                            <button type="button" aria-pressed={lineageMode === 'flow'} onClick={() => setLineageMode('flow')}>{tr('bookPage.viewCards')}</button>
                            <button type="button" aria-pressed={lineageMode === 'graph'} onClick={() => setLineageMode('graph')}>{tr('bookPage.viewGraph')}</button>
                        </span>
                    ) : undefined}
                >
                    {lineageMode === 'graph' && workGraph ? (
                        <VersionLineageView
                            graph={workGraph}
                            defaultMode="graph"
                            selectedNodeId={data.id}
                            graphHeight={480}
                            renderLink={(id, label) => (
                                <BidLink id={id} label={convert(label)} onNavigate={onNavigate} renderLink={renderLink} dense />
                            )}
                        />
                    ) : (
                        <LineageFlow
                            data={data}
                            heading={subtitle || heading}
                            yearText={yearText}
                            refName={refName}
                            onNavigate={onNavigate}
                            renderLink={renderLink}
                        />
                    )}
                </Sec>
            )}

            {containedIn.length > 0 && (
                <Sec id="collections" title={tr('section.containedIn')}>
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
                                            {total > 0 && tr('bookPage.totalOf', { n: total, unit: t.unit.bu })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Sec>
            )}

            {data.location_history?.length ? (
                <Sec id="provenance" title={tr('section.locationHistory')}>
                    <ul className="bim-d-tl">
                        {data.location_history.map((loc, i) => (
                            <li key={i}>
                                <span className="bim-d-tl-t">{convert(loc.name)}</span>
                                {([loc.start_date, loc.end_date].filter(Boolean).join('—') || loc.description) && (
                                    <span className="bim-d-tl-ev" style={{ marginLeft: 0 }}>
                                        <MetaLine items={[
                                            [loc.start_date, loc.end_date].filter(Boolean).join('—'),
                                            loc.description ? convert(loc.description) : '',
                                        ]} />
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </Sec>
            ) : null}

            {nav.length === 0 && (
                <Sec title={tr('bookPage.sec.empty')}>
                    <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>
                        {tr('bookPage.emptyText')}
                    </p>
                </Sec>
            )}
        </>
    );

    // 同作品版本：本页前后各 2 条；列表不全（>40 种未排序）时只列前几条
    const curIdx = siblings.findIndex(s => s.id === data.id);
    const sortable = siblingIds.length <= SIBLINGS_SORT_MAX;
    const windowed = sortable && curIdx >= 0
        ? siblings.slice(Math.max(0, curIdx - SIBLINGS_WINDOW), curIdx + SIBLINGS_WINDOW + 1)
        : siblings.filter(s => s.id !== data.id);

    const side = (
        <>
            {work && (
                <div id="work" className="bim-d-side" style={{ scrollMarginTop: 16 }}>
                    <h2 className="bim-d-ui bim-d-side-h">{convert(t.section.belongsToWork)}</h2>
                    <div style={{ fontSize: 17, fontWeight: 500 }}>
                        <BidLink id={work.id} label={convert(work.title)} onNavigate={onNavigate} renderLink={renderLink} />
                    </div>
                    <MetaLine
                        className="bim-d-ui"
                        style={{ display: 'block', marginTop: 2 }}
                        items={[
                            ...(work.authors || []).slice(0, 2).map(a =>
                                `${a.dynasty ? `〔${convert(a.dynasty)}〕` : ''}${convert(a.name)}`),
                            convert(measureText(work, t.unit.juan)),
                            work._edition_count ? tr('bookPage.editionCount', { n: work._edition_count }) : '',
                        ]}
                    />
                    {work.description?.text && (
                        <p style={{
                            fontSize: 14, lineHeight: 1.8,
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }} className="bim-d-card-desc bim-d-side-desc">
                            {convert(work.description.text.replace(/[#*_>`[\]]/g, ''))}
                        </p>
                    )}
                </div>
            )}
            {otherCount > 0 && windowed.length > 0 && (
                <div>
                    <SideList
                        id="siblings"
                        timeline
                        title={sortable ? tr('bookPage.siblings') : t.relation.siblingVersions}
                        meta={sortable ? tr('bookPage.byEra') : tr('bookPage.kindCount', { n: otherCount })}
                        cap={windowed.length}
                        items={windowed.map(s => (s.id === data.id
                            ? <span className="bim-d-side-cur-mark" data-current="true">{convert(s.edition || s.title || s.id)}</span>
                            : <BidLink id={s.id} label={convert(s.edition || s.title || s.id)}
                                onNavigate={onNavigate} renderLink={renderLink} dense />
                        ))}
                        metas={windowed.map(s => [
                            s.year != null ? (s.year < 0 ? tr('detail.bce', { n: -s.year }) : String(s.year)) : '',
                            s.id === data.id ? tr('detail.thisPage') : '',
                        ].filter(Boolean).join(' '))}
                        currentIndex={windowed.findIndex(s => s.id === data.id)}
                    />
                    {work && (
                        <div className="bim-d-ui bim-d-side-all" style={{ marginTop: 4, fontSize: 13 }}>
                            <BidLink id={work.id} label={tr('bookPage.viewAllInWork', { n: siblingIds.length })}
                                onNavigate={onNavigate} renderLink={renderLink} dense />
                        </div>
                    )}
                </div>
            )}
        </>
    );

    /* work_id 一开始就知道：先出块、书名晚到，免得左栏（手机上在最顶）晚到把整页顶下去 */
    const up = data.work_id ? (
        <RailUp caption={t.section.belongsToWork}>
            <BidLink id={data.work_id} label={work ? convert(work.title) : '\u3000'} onNavigate={onNavigate} renderLink={renderLink} dense />
        </RailUp>
    ) : undefined;

    return <DetailGrid railTop={railTop} back={back} up={up} nav={nav} railLinks={railLinks} main={main} card={card} side={side} />;
};

// ══════════════════════════════════════════════════════════════

/** 册次：一行辅助字「第 243–244 冊 · 2 冊」，不再逐个画方框 */
function VolumeList({ volumes, unit }: { volumes: number[]; unit: string }) {
    const { t } = useI18n();
    return (
        <span className="bim-d-meta bim-d-ui">
            {t('bookPage.volumeRange', { range: formatVolumeRange(volumes, unit), unit })}
            {volumes.length > 1 && <><span className="bim-d-dot" />{t('bookPage.volumeCount', { n: volumes.length, unit })}</>}
        </span>
    );
}

// ══════════════════════════════════════════════════════════════

/**
 * 版本源流·卡片流（设计稿 v3）：一条竖线穿起——
 * 擬構祖本（虚线框）→ 底本（卡片）→ 本版（深色条）＋ 參校等（虚线卡，在本版右侧）→ 翻刻／衍生（一行标签）→ 附记 → 说明。
 * 只画数据里有的：没有底本就没有底本卡，没有 related_to 就没有翻刻行；不造年代、不造「祖本」。
 */
function LineageFlow({ data, heading, yearText, refName, onNavigate, renderLink }: {
    data: BookDetailData;
    heading: string;
    yearText: string;
    refName: (id: string) => string;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const { t, convert } = useI18n();
    const lineage = data.lineage;
    const derived = lineage?.derived_from || [];
    const ancestors = derived.filter(d => d.ref_type !== 'book');
    const bases = derived.filter(d => d.ref_type === 'book' && d.relation === '底本');
    const others = derived.filter(d => d.ref_type === 'book' && d.relation !== '底本');
    const related = lineage?.related_to || [];
    const hasFlow = derived.length > 0 || related.length > 0;

    const conf = (c?: LineageConfidence) => (c && CONFIDENCE_KEYS.has(c)
        ? t('bookPage.confidenceNote', { c: t(`bookPage.confidence.${c}` as MessageKey) })
        : '');
    const link = (id: string, label: string) => (
        <BidLink id={id} label={convert(label || id)} onNavigate={onNavigate} renderLink={renderLink} dense />
    );

    return (
        <div className="bim-d-lf">
            {hasFlow && (
                <ol className="bim-d-lf-list">
                    {ancestors.map((d, i) => (
                        <li key={`a-${i}`} className="bim-d-lf-node">
                            <div className="bim-d-lf-dash">
                                <span className="bim-d-lf-tag bim-d-ui">{d.relation ? convert(d.relation) : t('bookPage.lineage.ancestor')}</span>
                                <span className="bim-d-lf-name">{t('bookPage.lineage.reconstructed')}</span>
                                {d.evidence && <span className="bim-d-meta">{convert(d.evidence)}{conf(d.confidence)}</span>}
                            </div>
                        </li>
                    ))}
                    {bases.map((d, i) => (
                        <li key={`b-${i}`} className="bim-d-lf-node">
                            <div className="bim-d-lf-card">
                                <span className="bim-d-lf-tag bim-d-ui">{convert(d.relation)}</span>
                                <span className="bim-d-lf-name">{link(d.ref, refName(d.ref))}</span>
                                {d.evidence && <p className="bim-d-lf-ev">{convert(d.evidence)}{conf(d.confidence)}</p>}
                            </div>
                        </li>
                    ))}
                    <li className="bim-d-lf-node bim-d-lf-cur">
                        <div className="bim-d-lf-here">
                            <span className="bim-d-lf-tag bim-d-ui">{t('bookPage.lineage.thisEdition')}</span>
                            <span className="bim-d-lf-name">{heading}</span>
                            {yearText && <span className="bim-d-lf-yr">{convert(yearText)}</span>}
                        </div>
                        {others.length > 0 && (
                            <div className="bim-d-lf-side">
                                {others.map((d, i) => (
                                    <div key={i} className="bim-d-lf-dash">
                                        <span className="bim-d-lf-tag bim-d-ui">{convert(d.relation)}</span>
                                        <span className="bim-d-lf-name">{link(d.ref, refName(d.ref))}</span>
                                        {d.evidence && <p className="bim-d-lf-ev">{convert(d.evidence)}{conf(d.confidence)}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </li>
                    {related.length > 0 && (
                        <li className="bim-d-lf-node bim-d-lf-out">
                            <span className="bim-d-lf-out-h bim-d-ui">{t('bookPage.lineage.derivatives')}</span>
                            <span className="bim-d-lf-chips">
                                {related.map((r, i) => (
                                    <span key={i} className="bim-d-lf-chip" title={r.evidence ? convert(r.evidence) : undefined}>
                                        {link(r.book_id, refName(r.book_id))}
                                        <span className="bim-d-meta">{convert(r.relation)}</span>
                                    </span>
                                ))}
                            </span>
                        </li>
                    )}
                </ol>
            )}
            {data.appendix?.map((entry, i) => (
                <details key={`x-${i}`} className="bim-d-lf-app">
                    <summary className="bim-d-ui"><span className="bim-d-meta">{t('bookPage.lineage.appendix')}</span> {convert(entry.title)}</summary>
                    <MarkdownText text={entry.text} plainStrong style={{ marginTop: 6, fontSize: 14, lineHeight: 1.9 }} />
                </details>
            ))}
            {lineage?.note && (
                <p className="bim-d-meta" style={{ margin: '12px 0 0', maxWidth: '46em' }}>{convert(lineage.note)}</p>
            )}
        </div>
    );
}
