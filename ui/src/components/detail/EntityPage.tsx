/**
 * 人物页（朱熹、歐陽修这类）—— 2026-09 B1 新设计（overview#251）。
 *
 * 中栏：著作——「著作舉要」三块（已解析的行里版本最多的三种）＋ 著作表
 * （职任页签 + 斑马表：作品，下附部类·卷数｜职任｜版本｜有影印；只解析可见行）；
 * 右栏：提要卡（「人物」小字、名、「字某，號某」、时代·生卒·籍贯、字与號、
 * 其余别名收进「更多別名」、著作数；不放主按钮）→ 站外资料（CBDB / Wikidata / VIAF）。
 *
 * 2026-09-29 设计稿 v3（overview#286）：「著作舉要」「著作」拆成两个区块（左栏本页导航三项）；
 * 表格加「部類」列；举要的版本数放大；提要卡加生卒条（朝代起讫 + 一生几年）与著作四部分布条
 * （须全部作品都已解析才出——分布不能按部分行估）；站外资料下注「CBDB 為自動匹配」。
 *
 * 用户 09-28 在样张上定：别名折叠；「举要」排序先随意（按已解析行的版本数）。
 *
 * 设计稿另有「籍貫 / 官至」「傳記出處」「相關人物」，数据里没有对应字段
 * （2026-09-05 全量 30,120 条 Entity 实测 0%），先不做；补字段时：
 *   Entity.birthplace / Entity.office        → 提要卡事实表两行
 *   Entity.biography_sources[]              → 中栏「傳記出處」区块
 *   Entity.related_people[]                 → 右栏旁栏清单
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { EntityDetailData, AltName } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useI18n, type TFunction } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, type RenderLink } from './primitives';
import { SECTIONS, sectionKey } from './shared';
import {
    DetailGrid, Sec, MetaLine, TabFilter, CapMore, narrowCapped, SummaryCard, CardFoot, SideList, descNeedsClamp,
    type CardFact, type RailNavItem, type RailLink,
} from './layout';
import { bim } from '../../styles/tokens';
import { measureText, normalizeRole, roleFacets, type RoleClass } from '../../core/detail-model';

/** 桌面 cap，与作品页版本表同一量级 */
const CAP_WORKS = 16;

export interface EntityPageProps {
    data: EntityDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** 左栏「更多」：切到丛编目录、extraTabs 等其他页面的入口（由 layout 注入） */
    railLinks?: RailLink[];
}

/** 已解析的作品行 */
interface ResolvedWork {
    id: string;
    title?: string;
    /** 该作品的版本数（_edition_count，缺省时 books ∪ collections 的长度） */
    versionCount?: number;
    /** 部类：classification.l1 l2 */
    cls?: string;
    /** 四部一级：classification.l1 */
    l1?: string;
    measure?: string;
    hasImage?: boolean;
    loaded?: boolean;
}

interface WorkRow {
    id: string;
    title: string;
    /** 原始 role 原样显示——「等奉敕撰」与「撰」的区别对版本学有意义 */
    role: string;
    cls: RoleClass;
    versionCount?: number;
    section?: string;
    l1?: string;
    measure?: string;
    hasImage?: boolean;
    loaded: boolean;
}

/**
 * 别名分类的显示顺序：字 / 號 / 諡號是正式名号排前面，別名 / 小名这类次要的排后面。
 */
const ALT_NAME_ORDER = [
    '本名', '字', '號', '号', '諡號', '谥号', '尊號', '尊号', '廟號', '庙号',
    '法號', '法号', '道號', '道号', '年號', '年号', '常用名', '別名', '别名',
    '小名', '小字', '行第', '俗姓', '俗名', '稱號', '称号', '賜號', '赐号', '簡體', '简体',
];

function altNameRank(type?: string): number {
    if (!type) return ALT_NAME_ORDER.length;
    const i = ALT_NAME_ORDER.indexOf(type);
    return i === -1 ? ALT_NAME_ORDER.length : i;
}

/** subtype → 标签。已知查表；未知原样露出（经繁简转换），缺失不显示——不再回退成「人物」 */
export function entitySubtypeLabel(
    labels: Record<string, string> | object,
    subtype: string | undefined,
    convert: (s: string) => string,
): string | undefined {
    if (!subtype) return undefined;
    return (labels as Record<string, string>)[subtype] ?? convert(subtype);
}

/** 生卒：负数为公元前 */
function fmtYear(n: number | undefined, t: TFunction): string {
    return n == null ? '' : (n < 0 ? t('entityPage.bce', { n: -n }) : String(n));
}

/** 朝代起讫（公元，负为前）：只收常用断代；查不到的人不画生卒条 */
const DYNASTY_SPAN: Record<string, [number, number]> = {
    '秦': [-221, -207], '西漢': [-202, 8], '西汉': [-202, 8], '東漢': [25, 220], '东汉': [25, 220],
    '漢': [-202, 220], '汉': [-202, 220], '三國': [220, 280], '三国': [220, 280],
    '西晉': [265, 316], '西晋': [265, 316], '東晉': [317, 420], '东晋': [317, 420],
    '隋': [581, 618], '唐': [618, 907], '五代': [907, 960],
    '北宋': [960, 1127], '南宋': [1127, 1279], '宋': [960, 1279],
    '遼': [916, 1125], '辽': [916, 1125], '金': [1115, 1234], '元': [1271, 1368],
    '明': [1368, 1644], '清': [1636, 1912],
};

export const EntityPage: React.FC<EntityPageProps> = ({
    data, transport, onNavigate, renderLink, railTop, back, railLinks,
}) => {
    const { t, convert, messages: m } = useI18n();
    const yr = (n?: number) => fmtYear(n, t);

    const [role, setRole] = useState<RoleClass | '全部'>('全部');
    const [showAll, setShowAll] = useState(false);
    const [sort, setSort] = useState<'default' | 'versions'>('default');
    const [resolved, setResolved] = useState<Map<string, ResolvedWork>>(new Map());

    const allRows: WorkRow[] = useMemo(() => (data.works || []).map(w => {
        const r = resolved.get(w.work_id);
        return {
            id: w.work_id,
            title: r?.title ?? w.title ?? w.work_id,
            role: w.role || '',
            cls: normalizeRole(w.role),
            versionCount: r?.versionCount,
            section: r?.cls,
            l1: r?.l1,
            measure: r?.measure,
            hasImage: r?.hasImage,
            loaded: !!r?.loaded,
        };
    }), [data.works, resolved]);

    const facets = useMemo(() => roleFacets((data.works || []).map(w => w.role), t('detail.roleAll')), [data.works, t]);

    const filtered = useMemo(() => {
        const rows = role === '全部' ? allRows : allRows.filter(r => r.cls === role);
        // 默认保持录入序；按版本数排须全量解析（见 git 历史里的长注释）
        if (sort === 'versions') {
            return [...rows].sort((a, b) => (b.versionCount ?? -1) - (a.versionCount ?? -1));
        }
        return rows;
    }, [allRows, role, sort]);

    const visible = showAll ? filtered : filtered.slice(0, CAP_WORKS);

    /* 只解析当前可见的行：歐陽修 308 部作品，全解析就是 308 次请求 */
    const idsToResolve = useMemo(
        () => visible.filter(r => !resolved.has(r.id)).map(r => r.id),
        [visible, resolved],
    );

    useEffect(() => {
        if (!transport || idsToResolve.length === 0) return;
        let cancelled = false;
        Promise.all(idsToResolve.map(id =>
            transport.getItem(id)
                .then(raw => {
                    const w = (raw ?? {}) as {
                        title?: string; books?: string[]; collections?: string[]; _edition_count?: number;
                        classification?: { l1?: string; l2?: string };
                        has_image?: boolean; _has_image?: boolean;
                    };
                    const n = w._edition_count ?? ((w.books?.length ?? 0) + (w.collections?.length ?? 0));
                    const cls = [w.classification?.l1, w.classification?.l2].filter(Boolean).join(' ');
                    return [id, {
                        id, title: w.title, versionCount: n, loaded: true,
                        cls: cls || undefined,
                        l1: w.classification?.l1 || undefined,
                        measure: raw ? measureText(raw as never, m.unit.juan) || undefined : undefined,
                        hasImage: !!(w.has_image ?? w._has_image),
                    }] as const;
                })
                .catch(() => [id, { id, loaded: true }] as const),
        )).then(entries => {
            if (cancelled) return;
            setResolved(prev => {
                const next = new Map(prev);
                for (const [id, v] of entries) next.set(id, v);
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [transport, idsToResolve, m.unit.juan]);

    // ── 别名（按类分组，正式名号在前） ──
    const nameGroups = useMemo(() => {
        const byType = new Map<string, string[]>();
        for (const a of (data.alt_names || []) as AltName[]) {
            const k = a.type || m.section.aliases;
            if (!byType.has(k)) byType.set(k, []);
            byType.get(k)!.push(a.name);
        }
        return [...byType.entries()]
            .sort((a, b) => altNameRank(a[0]) - altNameRank(b[0]))
            .map(([k, names]) => ({ label: k, names }));
    }, [data.alt_names, m]);

    // 生卒：birth_year／death_year 优先，缺时回退 dates.birth／death；都缺才用 dates.floruit
    const birth = data.birth_year ?? data.dates?.birth ?? undefined;
    const death = data.death_year ?? data.dates?.death ?? undefined;
    const fl = data.dates?.floruit;
    const life = (birth != null || death != null)
        ? `${yr(birth) || '?'}—${yr(death) || '?'}`
        : (Array.isArray(fl) && fl.length === 2 && fl.every(n => Number.isFinite(n)))
            ? t('entityPage.floruit', { from: yr(fl[0]), to: yr(fl[1]) })
            : '';

    /** 提要卡常露的只有字、號；其余（諡號、小字、小名、別名…）收进「更多別名」 */
    const MAIN_NAME_TYPES = new Set(['本名', '字', '號', '号']);
    const mainNames = nameGroups.filter(g => MAIN_NAME_TYPES.has(g.label));
    const moreNames = nameGroups.filter(g => !MAIN_NAME_TYPES.has(g.label));
    const moreCount = moreNames.reduce((n, g) => n + g.names.length, 0);

    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        for (const g of mainNames) {
            out.push({ label: g.label, value: g.names.map(n => convert(n)).join('、') });
        }
        const n = (data.works || []).length;
        if (n) out.push({ label: t('entityPage.fact.works'), value: t('entityPage.nZhong', { n }) });
        return out;
    }, [data.works, mainNames, convert, t]); // eslint-disable-line react-hooks/exhaustive-deps

    /** 副题「字元晦，號晦庵」：各取第一个 */
    const firstOf = (types: string[]) => nameGroups.find(g => types.includes(g.label))?.names[0];
    const zi = firstOf(['字']);
    const hao = firstOf(['號', '号']);
    const subtitle = [zi ? t('entityPage.zi', { name: convert(zi) }) : '', hao ? t('entityPage.hao', { name: convert(hao) }) : ''].filter(Boolean).join('，');
    const nativePlace = data.native_place;

    // 生卒条：须生卒都有、朝代有起讫，且与朝代区间有交集；否则整块不出
    const span = data.dynasty ? DYNASTY_SPAN[data.dynasty] : undefined;
    const lifeBar = (() => {
        if (!span || birth == null || death == null || death < birth) return null;
        const [from, to] = span;
        const a = Math.max(birth, from), b = Math.min(death, to);
        if (b <= a) return null;
        const total = to - from;
        return (
            <div className="bim-d-life bim-d-ui">
                <div className="bim-d-life-bar" role="img"
                    aria-label={t('entityPage.lifeAria', { birth: yr(birth), death: yr(death), years: death - birth + 1 })}>
                    <i style={{ left: `${((a - from) / total) * 100}%`, width: `${((b - a) / total) * 100}%` }} />
                </div>
                <div className="bim-d-life-lab">
                    <span>{`${yr(from)} ${convert(data.dynasty)}`}</span>
                    <span>{t('entityPage.lifeYears', { years: death - birth + 1 })}</span>
                    <span>{yr(to)}</span>
                </div>
            </div>
        );
    })();

    // 著作四部分布：全部作品都已解析才算，否则会把「已解析的前 16 部」当成全貌
    const dist = useMemo(() => {
        if (!transport || allRows.length === 0 || allRows.some(r => !r.loaded)) return null;
        const counts = new Map<string, number>();
        for (const r of allRows) {
            const k = sectionKey(r.l1);
            if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const parts = SECTIONS.map(x => ({ ...x, n: counts.get(x.key) ?? 0 })).filter(x => x.n > 0);
        return parts.length ? parts : null;
    }, [allRows, transport]);

    const card = (
        <SummaryCard
            kind={entitySubtypeLabel(m.entityPage.subtype, data.subtype, convert)}
            title={convert(data.primary_name || data.title)}
            subtitle={subtitle || undefined}
            meta={<>
                <MetaLine items={[
                    data.dynasty ? convert(data.dynasty) : '',
                    life,
                    nativePlace ? t('entityPage.nativePlace', { place: convert(nativePlace) }) : '',
                ]} />
                {lifeBar}
            </>}
            description={data.description?.text
                ? <MarkdownText text={data.description.text} style={{ fontSize: 15, lineHeight: 1.85 }} />
                : undefined}
            clampDescription={descNeedsClamp(data.description?.text) ? 6 : undefined}
            facts={facts}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        >
            {moreCount > 0 && (
                <details className="bim-d-more-names bim-d-ui">
                    <summary>{t('entityPage.moreNames', { n: moreCount })}</summary>
                    <dl>
                        {moreNames.map(g => (
                            <React.Fragment key={g.label}>
                                <dt>{convert(g.label)}</dt>
                                <dd>{g.names.map(n => convert(n)).join('、')}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                </details>
            )}
            {dist && (
                <div className="bim-d-dist bim-d-ui">
                    <div className="bim-d-dist-head"><span>{t('entityPage.dist')}</span></div>
                    <div className="bim-d-dist-bar" aria-hidden="true">
                        {dist.map(x => (
                            <i key={x.key} style={{ flexGrow: x.n, background: bim(x.token) }} />
                        ))}
                    </div>
                    <div className="bim-d-dist-key">
                        {dist.map(x => (
                            <span key={x.key}>
                                <i style={{ background: bim(x.token) }} />{convert(x.label)} {x.n}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </SummaryCard>
    );

    // ── 著作举要：已解析的行里版本最多的三种（全部解析太贵：歐陽修 306 部） ──
    const picks = useMemo(() => allRows
        .filter(r => r.loaded && (r.versionCount ?? 0) > 0)
        .sort((a, b) => (b.versionCount ?? 0) - (a.versionCount ?? 0))
        .slice(0, 3), [allRows]);

    /*
     * 举要要等可见行解析完才知道。三部以上著作时先占好三块的位置（INT Q3 的 CLS），
     * 解析完不足两部有版本的才收起。
     */
    const picksPending = !!transport && allRows.length >= 3 && visible.some(r => !r.loaded);
    const showPicks = role === '全部' && (picksPending || picks.length >= 2);

    // ── 站外资料 ──
    const ext = data.external_ids || {};
    const extLinks: { label: string; id: string; href: string; note?: string }[] = [];
    if (ext.cbdb_id != null) {
        extLinks.push({
            label: 'CBDB', id: String(ext.cbdb_id),
            href: `https://cbdb.fas.harvard.edu/cbdbapi/person.php?id=${ext.cbdb_id}`,
            note: ext.cbdb_match === 'auto' ? t('entityPage.autoMatch') : undefined,
        });
    }
    const wikidata = ext.wikidata_id;
    if (wikidata) extLinks.push({ label: 'Wikidata', id: wikidata, href: `https://www.wikidata.org/wiki/${wikidata}` });
    const viaf = ext.viaf_id;
    if (viaf) extLinks.push({ label: 'VIAF', id: viaf, href: `https://viaf.org/viaf/${viaf}` });

    const roleTabs = facets.map(f => ({ key: f.cls as RoleClass | '全部', label: `${f.label} ${f.count}` }));

    const nav: RailNavItem[] = [
        ...(showPicks && !picksPending ? [{ id: 'featured', label: t('entityPage.sec.featured'), count: picks.length }] : []),
        ...(allRows.length ? [{ id: 'works', label: t('entityPage.sec.allWorks'), count: allRows.length }] : []),
        ...(extLinks.length ? [{ id: 'external', label: t('entityPage.sec.external'), count: extLinks.length }] : []),
    ];

    const picksSec = showPicks ? (
        <Sec id="featured" title={t('entityPage.sec.featured')}>
            <p className="bim-d-sec-sub bim-d-ui">{t('entityPage.featuredSub')}</p>
            <div className="bim-d-picks" aria-busy={picksPending || undefined}>
                {picksPending && [0, 1, 2].map(i => (
                    <div key={i} className="bim-d-pick" aria-hidden="true">
                        <span className="bim-d-pick-t">&nbsp;</span>
                        <span className="bim-d-meta">&nbsp;</span>
                        <div className="bim-d-pick-n">&nbsp;</div>
                    </div>
                ))}
                {!picksPending && picks.map(p => (
                    <div key={p.id} className="bim-d-pick">
                        <span className="bim-d-pick-t">
                            <BidLink id={p.id} label={convert(p.title)} onNavigate={onNavigate} renderLink={renderLink} dense />
                        </span>
                        <MetaLine items={[p.section ? convert(p.section) : '', p.measure ? convert(p.measure) : '']} />
                        <div className="bim-d-pick-n bim-d-ui">
                            <span className="bim-d-pick-num">{p.versionCount}</span>
                            <span>{t('entityPage.versionsUnit')}</span>
                            {p.hasImage && <span className="bim-d-flag">{t('entityPage.hasImage')}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </Sec>
    ) : null;

    const main = allRows.length === 0 ? (
        <Sec title={t('entityPage.sec.works')}>
            <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>{t('entityPage.empty')}</p>
        </Sec>
    ) : (<>
        {picksSec}
        <Sec
            id="works"
            title={t('entityPage.sec.works')}
            meta={<MetaLine items={[
                t('entityPage.total', { n: allRows.length }),
                filtered.length !== allRows.length ? t('entityPage.current', { n: filtered.length }) : '',
            ]} />}
        >
            <div className="bim-d-filters bim-d-ui">
                {roleTabs.length > 1 && (
                    <TabFilter items={roleTabs} value={role}
                        onChange={k => { setRole(k); setShowAll(false); }} />
                )}
                <span className="bim-d-spacer" />
                <button
                    type="button"
                    className="bim-d-tab"
                    aria-pressed={sort === 'versions'}
                    onClick={() => {
                        // 按版本数排必须全量解析，否则未解析的行排不进来
                        if (sort === 'default') setShowAll(true);
                        setSort(s => (s === 'default' ? 'versions' : 'default'));
                    }}
                >
                    {sort === 'default' ? t('entityPage.sortByVersions') : t('entityPage.sortByCatalog')}
                </button>
            </div>
            <table className="bim-d-zt" data-ncap={!showAll && narrowCapped(filtered.length) ? '' : undefined}>
                <thead className="bim-d-ui">
                    <tr>
                        <th>{t('entityPage.col.work')}</th>
                        <th>{t('entityPage.col.section')}</th>
                        <th>{t('entityPage.col.role')}</th>
                        <th>{t('entityPage.col.versions')}</th>
                        <th aria-label={t('entityPage.col.image')} />
                    </tr>
                </thead>
                <tbody>
                    {visible.map(row => (
                        <tr key={row.id}>
                            <td className="bim-d-zt-main">
                                <BidLink id={row.id} label={convert(row.title)} onNavigate={onNavigate} renderLink={renderLink} dense />
                                {row.measure
                                    ? <MetaLine items={[convert(row.measure)]} />
                                    : !row.loaded && transport ? <span className="bim-d-meta" aria-hidden="true">&nbsp;</span> : null}
                            </td>
                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${row.section || row.loaded ? '' : ' bim-d-zt-blank'}`}>
                                {row.section ? convert(row.section) : null}
                            </td>
                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${row.role ? '' : ' bim-d-zt-blank'}`}>
                                {row.role ? convert(row.role) : <span className="bim-d-zt-empty">—</span>}
                            </td>
                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${row.loaded ? '' : ' bim-d-zt-blank'}`}>
                                {!row.loaded ? '' : row.versionCount
                                    ? t('entityPage.nZhong', { n: row.versionCount })
                                    : <span className="bim-d-zt-empty">{t('entityPage.notRecorded')}</span>}
                            </td>
                            <td className={row.hasImage ? undefined : 'bim-d-zt-blank'} style={{ textAlign: 'right' }}>
                                {row.hasImage && <span className="bim-d-flag bim-d-ui">{t('entityPage.hasImage')}</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {visible.length === 0 && (
                <p className="bim-d-meta bim-d-ui" style={{ margin: '12px 12px 0' }}>{t('entityPage.emptyRole')}</p>
            )}
            {!showAll && (
                <CapMore total={filtered.length} shown={visible.length} unit={t('entityPage.moreUnit')} onClick={() => setShowAll(true)} />
            )}
        </Sec>
    </>);

    const side = extLinks.length > 0 ? (
        <SideList
            id="external"
            title={t('entityPage.sec.external')}
            items={extLinks.map(l => (
                <a href={l.href} target="_blank" rel="noopener noreferrer">{l.label} <span aria-hidden="true">↗</span></a>
            ))}
            metas={extLinks.map(l => l.id)}
            foot={ext.cbdb_id != null && ext.cbdb_match === 'auto' ? t('entityPage.cbdbAuto') : undefined}
        />
    ) : null;

    return <DetailGrid railTop={railTop} back={back} nav={nav} railLinks={railLinks} main={main} card={card} side={side} />;
};
