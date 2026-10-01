/**
 * 阅读首页（overview#308）各分区组件：推荐题签卡、史志书架、专题分组、名著版本卡、四部方块、年代带、单篇诗文，
 * 以及把它们排在一起的 ReadHomeView。
 *
 * 组件只收 props、不取数（数据见 ./model 的 ReadSections）；链接地址由宿主经 `links` 给。
 * 界面文字走 t('readHome.*')（字典 i18n/messages/read-home.ts），sections.json 来的书名、分区名、年代名等数据走 convert。页面上不写「整理本」「全文」，一律只说「本」或不写（用户 10-01）。
 * 每块没有数据就整块不渲染（策展文件还没交时推荐、专题、名著三块为空）。
 */
import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import type { TFunction } from '../../i18n';
import { READ_HOME_CSS } from './read-home-css';
import {
    PERIOD_NARROW_SHARE, authorsLine, firstAuthorText, fmtCount, periodLevel, shelfColumns, spineHeight, withDefaultLinks,
} from './model';
import type {
    ReadBu, ReadFamous, ReadHomeLinks, ReadPeriod, ReadPick, ReadPieceAuthor, ReadSections, ReadTopic, ReadTopicItem,
} from './model';

type Links = ReturnType<typeof withDefaultLinks>;

/** 逐字竖排：每字一行，不依赖字体的竖排度量（设计稿同法） */
function Vertical({ text }: { text: string }) {
    return <>{Array.from(text).map((c, i) => <span key={i}>{c}</span>)}</>;
}

/** 分区外壳：h2 标题＋可选副题与「更多」链接；疏朗／界栏由 --bim-fr-* 令牌决定 */
export function ReadSection({ id, title, sub, more, children }: {
    id: string;
    title: string;
    sub?: React.ReactNode;
    more?: React.ReactNode;
    children: React.ReactNode;
}) {
    // title 由调用方给（本包内传 t() 结果）；仍过一道 convert，兼容宿主直接传繁体字面量
    const { convert } = useI18n();
    const hid = `${id}-h`;
    return (
        <section className="bim-rh-sec" id={id} aria-labelledby={hid}>
            <div className="bim-rh-hd">
                <h2 id={hid}>{convert(title)}</h2>
                {sub && <span className="bim-rh-sub">{sub}</span>}
                {more}
            </div>
            <div className="bim-rh-bd">{children}</div>
        </section>
    );
}

/** 页首统计：可读部数、单篇篇数 */
export function ReadStats({ counts }: { counts: ReadSections['counts'] }) {
    const { t } = useI18n();
    return (
        <p className="bim-rh-stats bim-rh-num">
            <span><b>{fmtCount(counts.readable)}</b>{t('readHome.readable')}</span>
            {counts.pieces > 0 && <span><b>{fmtCount(counts.pieces)}</b>{t('readHome.pieces')}</span>}
        </p>
    );
}

/** 推荐阅读：题签卡（手机上横滑） */
export function ReadPicks({ picks, links }: { picks: ReadPick[]; links?: Partial<ReadHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withDefaultLinks(links);
    if (!picks.length) return null;
    return (
        <ul className="bim-rh-picks">
            {picks.map((p) => {
                const by = authorsLine(p);
                const badge = [p.type_label, p.edition].filter(Boolean).join(' · ');
                return (
                    <li key={p.id}>
                        <a className="bim-rh-pk" href={l.read(p.id)}>
                            <span className="bim-rh-slip" aria-hidden="true"><Vertical text={convert(p.slip || p.title)} /></span>
                            <span className="bim-rh-pk-body">
                                {badge && <span className="bim-rh-badge">{convert(badge)}</span>}
                                <h3>{convert(p.title)}</h3>
                                {by && <span className="bim-rh-by">{convert(by)}</span>}
                                {p.blurb && <p>{convert(p.blurb)}</p>}
                                <span className="bim-rh-go" aria-hidden="true">{t('readHome.startReading')}</span>
                            </span>
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

/** 「N本」：站内同一作品有几个本子（>1 才标） */
function countLabel(n: number | undefined, t: TFunction): string | null {
    return n && n > 1 ? t('readHome.nCopies', { n }) : null;
}

/** 史志书架：按所志朝代分栏，一脊一部；实色＝正史原志 */
export function ReadShelf({ topic, links, hint, legendCount, showTitle = true, legendExtra }: {
    topic: ReadTopic;
    /** 书脊的链接走 links.read（元数据首页传作品页地址） */
    links?: Partial<ReadHomeLinks>;
    /** 标题旁的小字，默认「按所志朝代排列，一脊一部」 */
    hint?: string;
    /** 图例里解释书脊下数字的一句，默认 t('readHome.shelfLegendCount')；传 null 不出 */
    legendCount?: string | null;
    /** 出不出组标题（元数据首页的书架就是整个分区，不再重复标题） */
    showTitle?: boolean;
    /** 图例末尾再加的几句 */
    legendExtra?: string[];
}) {
    const { t, convert } = useI18n();
    const l = withDefaultLinks(links);
    if (!topic.items.length) return null;
    const legend = legendCount === undefined ? t('readHome.shelfLegendCount') : legendCount;
    const cols = shelfColumns(topic.items, t('readHome.shelfOther'));
    const spine = (b: ReadTopicItem) => {
        // 元数据首页的书架标著录条目数；阅读首页标站内本数
        const n = b.records ? fmtCount(b.records) : countLabel(b.text_count, t);
        const by = firstAuthorText(b);
        const name = [
            convert(b.title),
            b.orig ? t('readHome.origZhi') : '',
            by ? t('readHome.spineBy', { name: convert(by) }) : '',
            b.records ? t('readHome.spineRecords', { n: n! }) : n ? t('readHome.spineOnSite', { n }) : '',
        ].filter(Boolean).join('，');
        return (
            <li key={b.id}>
                <a
                    className="bim-rh-spine"
                    href={l.read(b.id)}
                    data-orig={b.orig ? '' : undefined}
                    aria-label={name}
                    title={name}
                    style={{ height: spineHeight(b.title) }}
                >
                    <Vertical text={convert(b.title)} />
                    {n && <span className="bim-rh-n bim-rh-num" data-records={b.records ? '' : undefined}>{n}</span>}
                </a>
            </li>
        );
    };
    return (
        <div className="bim-rh-shelf-box">
            {showTitle && <h3 className="bim-rh-gt">{convert(topic.label)}<small>{hint ? convert(hint) : t('readHome.shelfHint')}</small></h3>}
            {/* 窄屏可横向滚动：容器可聚焦，键盘也能滚（axe scrollable-region-focusable） */}
            <div className="bim-rh-shelf-wrap" tabIndex={0} role="region" aria-label={t('readHome.shelfRegion', { label: convert(topic.label) })}>
                <ul className="bim-rh-shelf">
                    {cols.map((c) => (
                        <li className="bim-rh-era" key={c.label}>
                            <ul className="bim-rh-spines" aria-label={convert(c.label)}>{c.items.map(spine)}</ul>
                            <span aria-hidden="true">{convert(c.label)}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <p className="bim-rh-legend">
                <span><i data-orig="" aria-hidden="true" />{t('readHome.origZhi')}</span>
                <span><i aria-hidden="true" />{t('readHome.laterZhi')}</span>
                {legend && <span>{convert(legend)}</span>}
                {legendExtra?.map((t) => <span key={t}>{convert(t)}</span>)}
            </p>
        </div>
    );
}

/** 手机端专题、丛编分组只露前几条（read-home-css 窄屏段的 nth-child 要跟着改） */
export const GROUP_NARROW_CAP = 4;
/** 只多一条就不收（为一条出个「全部 N 部」不划算）；收的组带 data-cap */
export const groupCapped = (n: number) => n > GROUP_NARROW_CAP + 1;

/** 专题的一组：书名＋作者，手机上只露前 GROUP_NARROW_CAP 条，可展开 */
export function ReadTopicGroup({ topic, links }: { topic: ReadTopic; links?: Partial<ReadHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withDefaultLinks(links);
    const [open, setOpen] = useState(false);
    if (!topic.items.length) return null;
    const hid = `bim-rh-g-${topic.key}`;
    return (
        <div className="bim-rh-grp" data-cap={groupCapped(topic.items.length) ? '' : undefined} data-open={open ? '' : undefined}>
            <h3 className="bim-rh-gt" id={hid}>{convert(topic.label)}<small className="bim-rh-num">{t('readHome.nWorks', { n: fmtCount(topic.items.length) })}</small></h3>
            <ul className="bim-rh-rows" aria-labelledby={hid}>
                {topic.items.map((b) => {
                    const n = countLabel(b.text_count, t);
                    const by = firstAuthorText(b);
                    return (
                        <li key={b.id}>
                            <a href={l.read(b.id)}>
                                <span className="bim-rh-t">{convert(b.title)}</span>
                                {n && <em className="bim-rh-cnt bim-rh-num">{n}</em>}
                                {by && <small>{convert(by)}</small>}
                            </a>
                        </li>
                    );
                })}
            </ul>
            {groupCapped(topic.items.length) && (
                <button type="button" className="bim-rh-expand" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                    {open ? t('action.collapse') : t('readHome.allNWorks', { n: topic.items.length })}
                </button>
            )}
        </div>
    );
}

/** 专题：书脊架（shelf 组）在上，其余各组分栏排在下面 */
export function ReadTopics({ topics, links }: { topics: ReadTopic[]; links?: Partial<ReadHomeLinks> }) {
    const shelves = topics.filter((t) => t.shelf && t.items.length);
    const groups = topics.filter((t) => !t.shelf && t.items.length);
    if (!shelves.length && !groups.length) return null;
    return (
        <>
            {shelves.map((t) => <ReadShelf key={t.key} topic={t} links={links} />)}
            {groups.length > 0 && (
                <div className="bim-rh-groups">
                    {groups.map((t) => <ReadTopicGroup key={t.key} topic={t} links={links} />)}
                </div>
            )}
        </>
    );
}

/** 名著与版本：一部作品一张卡，版本按系统分行 */
export function ReadFamousWorks({ famous, links }: { famous: ReadFamous[]; links?: Partial<ReadHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withDefaultLinks(links);
    if (!famous.length) return null;
    return (
        <ul className="bim-rh-works">
            {famous.map((w) => (
                <li key={w.work_id ?? w.title}>
                    <article className="bim-rh-wk">
                        <div className="bim-rh-wk-h">
                            <h3>{convert(w.title)}</h3>
                            {w.authors && <span className="bim-rh-by">{convert(w.authors)}</span>}
                            <span className="bim-rh-c bim-rh-num">{t('readHome.nCopiesCard', { n: w.text_count })}</span>
                        </div>
                        {w.systems.map((s, i) => (
                            <div className="bim-rh-lin" key={i} role="group" aria-label={s.label ? convert(s.label) : undefined}>
                                {s.label && <small aria-hidden="true">{convert(s.label)}</small>}
                                {s.items.map((v) => (
                                    <a
                                        key={v.id}
                                        className="bim-rh-chip"
                                        href={l.read(v.id)}
                                        title={convert([v.title, v.edition].filter(Boolean).join(' · '))}
                                    >{convert(v.short)}</a>
                                ))}
                            </div>
                        ))}
                        {w.work_id && (
                            <div className="bim-rh-wk-f"><a href={l.work(w.work_id)}>{t('readHome.workPageLink', { title: convert(w.title) })}</a></div>
                        )}
                    </article>
                </li>
            ))}
        </ul>
    );
}

/** 四部方块：每部总数、前几个子类（比例条），未分類单列弱化 */
export function ReadSibu({ bu, unclassified, links, unclassifiedNote }: {
    bu: ReadBu[];
    unclassified?: number;
    links?: Partial<ReadHomeLinks>;
    /** 「未分類」一行的说明（元数据首页另写），默认 t('readHome.sibuUnclassifiedNote') */
    unclassifiedNote?: string;
}) {
    const { t, convert } = useI18n();
    const l = withDefaultLinks(links);
    if (!bu.length && !unclassified) return null;
    return (
        <>
            <ul className="bim-rh-bu">
                {bu.map((b) => {
                    const max = b.top[0]?.count || 1;
                    return (
                        <li className="bim-rh-bu-c" key={b.id}>
                            <a className="bim-rh-bu-h" href={l.node(b.id)}>
                                <b>{convert(b.label)}</b>
                                <span className="bim-rh-num">{t('readHome.nWorks', { n: fmtCount(b.count) })}</span>
                            </a>
                            {b.top.length > 0 && (
                                <ul className="bim-rh-bu-l" aria-label={t('readHome.subClasses', { label: convert(b.label) })}>
                                    {b.top.map((k) => (
                                        <li key={k.id}>
                                            <a href={l.node(k.id)}>
                                                <span>{convert(k.label)}</span>
                                                <small className="bim-rh-num">{fmtCount(k.count)}</small>
                                                <span className="bim-rh-bar" aria-hidden="true" style={{ ['--bimrh-w' as string]: `${Math.round((k.count / max) * 100)}%` }} />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {b.children_total > b.top.length && (
                                <a className="bim-rh-bu-more" href={l.node(b.id)}>{t('readHome.allNClasses', { label: convert(b.label), n: b.children_total })}</a>
                            )}
                        </li>
                    );
                })}
            </ul>
            {!!unclassified && (
                <p className="bim-rh-uncl bim-rh-num">
                    <b>{t('readHome.unclassified')}</b>
                    <span>{t('readHome.nWorks', { n: fmtCount(unclassified) })}</span>
                    <span>{unclassifiedNote ? convert(unclassifiedNote) : t('readHome.sibuUnclassifiedNote')}</span>
                    <a href={l.node('unclassified')}>{t('readHome.viewUnclassified')}</a>
                </p>
            )}
        </>
    );
}

/** 按年代：9 段比例横带，段宽与部数成比例、深浅按部数分档；手机改 3 列格子 */
export function ReadPeriodBand({ periods, unknown, links }: { periods: ReadPeriod[]; unknown?: number; links?: Partial<ReadHomeLinks> }) {
    const { t, convert, messages } = useI18n();
    const periodLabels: Record<string, string> = messages.readHome.period;
    const l = withDefaultLinks(links);
    const shown = periods.filter((p) => p.count > 0);
    if (!shown.length) return null;
    const total = shown.reduce((s, p) => s + p.count, 0);
    const max = Math.max(...shown.map((p) => p.count));
    return (
        <>
            <ul className="bim-rh-band">
                {shown.map((p) => {
                    // sections.json 给了 label 就用（数据），没给按 key 取字典
                    const label = p.label ? convert(p.label) : periodLabels[p.key] ?? convert(p.key);
                    const share = p.count / total;
                    const name = t('readHome.periodItem', { label, n: fmtCount(p.count) });
                    return (
                        <li key={p.key} style={{ flex: `0 0 ${(share * 100).toFixed(3)}%` }}>
                            <a
                                href={l.period(p.key)}
                                data-k={periodLevel(p.count, max)}
                                data-narrow={share < PERIOD_NARROW_SHARE ? '' : undefined}
                                aria-label={name}
                                title={name}
                            >
                                <span className="bim-rh-pl">{label}</span>
                                <span className="bim-rh-pl-s" aria-hidden="true">{Array.from(label)[0]}</span>
                                <small className="bim-rh-num">{fmtCount(p.count)}</small>
                            </a>
                        </li>
                    );
                })}
            </ul>
            <p className="bim-rh-pfoot bim-rh-num">
                {!!unknown && <span>{t('readHome.periodUnknown', { n: fmtCount(unknown) })}</span>}
                <span className="bim-rh-hover-hint">{t('readHome.hoverHint')}</span>
            </p>
        </>
    );
}

/** 单篇诗文：按作者分组 */
export function ReadPieces({ authors, links }: { authors: ReadPieceAuthor[]; links?: Partial<ReadHomeLinks> }) {
    const { t, convert } = useI18n();
    const l = withDefaultLinks(links);
    if (!authors.length) return null;
    return (
        <ul className="bim-rh-authors">
            {authors.map((a) => (
                <li className="bim-rh-au" key={a.name}>
                    <h3 className="bim-rh-au-h">
                        {convert(a.name)}
                        {a.dynasty && <span>{convert(a.dynasty)}</span>}
                        <small className="bim-rh-num">{t('readHome.nPieces', { n: fmtCount(a.count) })}</small>
                    </h3>
                    <ul>
                        {a.items.map((p) => (
                            <li key={p.id}><a href={l.read(p.id)}>{convert(p.title)}</a></li>
                        ))}
                    </ul>
                    {l.author && <a className="bim-rh-more" href={l.author(a.name)}>{t('readHome.authorAll', { name: convert(a.name), n: a.count })}</a>}
                </li>
            ))}
        </ul>
    );
}

export interface ReadHomeViewProps {
    sections: ReadSections;
    links?: Partial<ReadHomeLinks>;
    /** 页首（宿主的「在可读书中搜索」框等），放在统计左边 */
    head?: React.ReactNode;
    /** 「单篇诗文」标题行右侧的「按作者浏览全部」链接地址；不给不出 */
    piecesMoreHref?: string;
    className?: string;
}

/** 分区 id（也是分区导航的锚点） */
export const READ_HOME_SECTION_IDS = {
    picks: 'picks', topics: 'topics', famous: 'classics', sibu: 'sibu', period: 'period', pieces: 'pieces',
} as const;

/**
 * 阅读首页整页：页首（插槽＋统计）→ 分区导航 → 推荐阅读 → 专题 → 名著与版本 → 四部 → 按年代 → 单篇诗文。
 * 没有数据的分区整块不出，分区导航也跟着不列。不出大小标题和导语（用户 10-01）。
 * 史志书架（shelf 组）不在阅读首页出，挪到元数据页（用户 10-01，overview#322）；那边直接用 ReadShelf。
 */
export function ReadHomeView({ sections, links, head, piecesMoreHref, className }: ReadHomeViewProps) {
    const { t } = useI18n();
    const s = sections;
    const ids = READ_HOME_SECTION_IDS;
    const topics = s.topics.filter((t) => !t.shelf);
    const has = {
        picks: s.picks.length > 0,
        topics: topics.some((t) => t.items.length > 0),
        famous: s.famous.length > 0,
        sibu: s.bu.length > 0 || s.unclassified > 0,
        period: s.periods.some((p) => p.count > 0),
        pieces: s.pieces.authors.length > 0,
    };
    const nav = (Object.keys(ids) as (keyof typeof ids)[]).filter((k) => has[k]);
    const navText = (k: keyof typeof ids) => t(`readHome.nav.${k}`);
    return (
        <div className={className ? `bim-rh ${className}` : 'bim-rh'}>
            <style>{READ_HOME_CSS}</style>
            <div className="bim-rh-head">
                {head}
                <ReadStats counts={s.counts} />
            </div>
            {nav.length > 1 && (
                <nav className="bim-rh-secnav" aria-label={t('readHome.navLabel')}>
                    <ul>{nav.map((k) => <li key={k}><a href={`#${ids[k]}`}>{navText(k)}</a></li>)}</ul>
                </nav>
            )}
            <div className="bim-rh-main">
                {has.picks && (
                    <ReadSection id={ids.picks} title={navText('picks')} sub={t('readHome.picksSub')}>
                        <ReadPicks picks={s.picks} links={links} />
                    </ReadSection>
                )}
                {has.topics && (
                    <ReadSection id={ids.topics} title={navText('topics')} sub={t('readHome.topicsSub')}>
                        <ReadTopics topics={topics} links={links} />
                    </ReadSection>
                )}
                {has.famous && (
                    <ReadSection id={ids.famous} title={navText('famous')} sub={t('readHome.famousSub')}>
                        <ReadFamousWorks famous={s.famous} links={links} />
                    </ReadSection>
                )}
                {has.sibu && (
                    <ReadSection id={ids.sibu} title={navText('sibu')} sub={t('readHome.sibuSub')}>
                        <ReadSibu bu={s.bu} unclassified={s.unclassified} links={links} />
                    </ReadSection>
                )}
                {has.period && (
                    <ReadSection id={ids.period} title={navText('period')} sub={t('readHome.periodSub')}>
                        <ReadPeriodBand periods={s.periods} unknown={s.period_unknown} links={links} />
                    </ReadSection>
                )}
                {has.pieces && (
                    <ReadSection
                        id={ids.pieces}
                        title={navText('pieces')}
                        sub={t('readHome.piecesSub')}
                        more={piecesMoreHref ? <a className="bim-rh-more" href={piecesMoreHref}>{t('readHome.piecesMore')}</a> : undefined}
                    >
                        <ReadPieces authors={s.pieces.authors} links={links} />
                    </ReadSection>
                )}
            </div>
        </div>
    );
}
