/**
 * 阅读首页（overview#308）各分区组件：推荐题签卡、史志书架、专题分组、名著版本卡、四部方块、年代带、单篇诗文，
 * 以及把它们排在一起的 ReadHomeView。
 *
 * 组件只收 props、不取数（数据见 ./model 的 ReadSections）；链接地址由宿主经 `links` 给。
 * 文案按繁体写、经 useConvert() 转，跟总目组件一样。页面上不写「整理本」「全文」，一律只说「本」或不写（用户 10-01）。
 * 每块没有数据就整块不渲染（策展文件还没交时推荐、专题、名著三块为空）。
 */
import React, { useState } from 'react';
import { useConvert } from '../../i18n';
import { READ_HOME_CSS } from './read-home-css';
import {
    PERIOD_NARROW_SHARE, READ_PERIOD_LABELS, authorsLine, firstAuthorText, fmtCount, periodLevel, shelfColumns, spineHeight, withDefaultLinks,
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
    const { convert } = useConvert();
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
    const { convert } = useConvert();
    return (
        <p className="bim-rh-stats bim-rh-num">
            <span><b>{fmtCount(counts.readable)}</b>{convert('部可讀')}</span>
            {counts.pieces > 0 && <span><b>{fmtCount(counts.pieces)}</b>{convert('篇單篇詩文')}</span>}
        </p>
    );
}

/** 推荐阅读：题签卡（手机上横滑） */
export function ReadPicks({ picks, links }: { picks: ReadPick[]; links?: Partial<ReadHomeLinks> }) {
    const { convert } = useConvert();
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
                                <span className="bim-rh-go" aria-hidden="true">{convert('開始閱讀 →')}</span>
                            </span>
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

/** 「N本」：站内同一作品有几个本子（>1 才标） */
function countLabel(n: number | undefined): string | null {
    return n && n > 1 ? `${n}本` : null;
}

/** 史志书架：按所志朝代分栏，一脊一部；实色＝正史原志 */
export function ReadShelf({ topic, links }: { topic: ReadTopic; links?: Partial<ReadHomeLinks> }) {
    const { convert } = useConvert();
    const l = withDefaultLinks(links);
    if (!topic.items.length) return null;
    const cols = shelfColumns(topic.items);
    const spine = (b: ReadTopicItem) => {
        const n = countLabel(b.text_count);
        const by = firstAuthorText(b);
        const name = [b.title, b.orig ? '正史原志' : '', by ? `${by} 撰` : '', n ? `站內 ${n}` : ''].filter(Boolean).join('，');
        return (
            <li key={b.id}>
                <a
                    className="bim-rh-spine"
                    href={l.read(b.id)}
                    data-orig={b.orig ? '' : undefined}
                    aria-label={convert(name)}
                    title={convert(name)}
                    style={{ height: spineHeight(b.title) }}
                >
                    <Vertical text={convert(b.title)} />
                    {n && <span className="bim-rh-n bim-rh-num">{convert(n)}</span>}
                </a>
            </li>
        );
    };
    return (
        <div className="bim-rh-shelf-box">
            <h3 className="bim-rh-gt">{convert(topic.label)}<small>{convert('按所志朝代排列，一脊一部')}</small></h3>
            {/* 窄屏可横向滚动：容器可聚焦，键盘也能滚（axe scrollable-region-focusable） */}
            <div className="bim-rh-shelf-wrap" tabIndex={0} role="region" aria-label={convert(`${topic.label}書架，可橫向滾動`)}>
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
                <span><i data-orig="" aria-hidden="true" />{convert('正史原志')}</span>
                <span><i aria-hidden="true" />{convert('後人補撰、續補')}</span>
                <span>{convert('脊下「2本」＝站內有幾個本子')}</span>
            </p>
        </div>
    );
}

/** 专题的一组：书名＋作者，手机上只露前 6 条，可展开 */
export function ReadTopicGroup({ topic, links }: { topic: ReadTopic; links?: Partial<ReadHomeLinks> }) {
    const { convert } = useConvert();
    const l = withDefaultLinks(links);
    const [open, setOpen] = useState(false);
    if (!topic.items.length) return null;
    const hid = `bim-rh-g-${topic.key}`;
    return (
        <div className="bim-rh-grp" data-open={open ? '' : undefined}>
            <h3 className="bim-rh-gt" id={hid}>{convert(topic.label)}<small className="bim-rh-num">{convert(`${fmtCount(topic.items.length)} 部`)}</small></h3>
            <ul className="bim-rh-rows" aria-labelledby={hid}>
                {topic.items.map((b) => {
                    const n = countLabel(b.text_count);
                    const by = firstAuthorText(b);
                    return (
                        <li key={b.id}>
                            <a href={l.read(b.id)}>
                                <span className="bim-rh-t">{convert(b.title)}</span>
                                {n && <em className="bim-rh-cnt bim-rh-num">{convert(n)}</em>}
                                {by && <small>{convert(by)}</small>}
                            </a>
                        </li>
                    );
                })}
            </ul>
            {topic.items.length > 6 && (
                <button type="button" className="bim-rh-expand" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                    {convert(open ? '收起' : `全部 ${topic.items.length} 部`)}
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
    const { convert } = useConvert();
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
                            <span className="bim-rh-c bim-rh-num">{convert(`${w.text_count} 個本子`)}</span>
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
                            <div className="bim-rh-wk-f"><a href={l.work(w.work_id)}>{convert(`作品頁：${w.title}的源流與全部版本 →`)}</a></div>
                        )}
                    </article>
                </li>
            ))}
        </ul>
    );
}

/** 四部方块：每部总数、前几个子类（比例条），未分類单列弱化 */
export function ReadSibu({ bu, unclassified, links }: { bu: ReadBu[]; unclassified?: number; links?: Partial<ReadHomeLinks> }) {
    const { convert } = useConvert();
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
                                <span className="bim-rh-num">{convert(`${fmtCount(b.count)} 部`)}</span>
                            </a>
                            {b.top.length > 0 && (
                                <ul className="bim-rh-bu-l" aria-label={convert(`${b.label}子類`)}>
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
                                <a className="bim-rh-bu-more" href={l.node(b.id)}>{convert(`${b.label}全部 ${b.children_total} 類 →`)}</a>
                            )}
                        </li>
                    );
                })}
            </ul>
            {!!unclassified && (
                <p className="bim-rh-uncl bim-rh-num">
                    <b>{convert('未分類')}</b>
                    <span>{convert(`${fmtCount(unclassified)} 部`)}</span>
                    <span>{convert('書目分類還沒補齊，其中多數是單篇詩文，已單列在下方。')}</span>
                    <a href={l.node('unclassified')}>{convert('查看未分類 →')}</a>
                </p>
            )}
        </>
    );
}

/** 按年代：9 段比例横带，段宽与部数成比例、深浅按部数分档；手机改 3 列格子 */
export function ReadPeriodBand({ periods, unknown, links }: { periods: ReadPeriod[]; unknown?: number; links?: Partial<ReadHomeLinks> }) {
    const { convert } = useConvert();
    const l = withDefaultLinks(links);
    const shown = periods.filter((p) => p.count > 0);
    if (!shown.length) return null;
    const total = shown.reduce((s, p) => s + p.count, 0);
    const max = Math.max(...shown.map((p) => p.count));
    return (
        <>
            <ul className="bim-rh-band">
                {shown.map((p) => {
                    const label = convert(p.label || READ_PERIOD_LABELS[p.key] || p.key);
                    const share = p.count / total;
                    const name = `${label}，${fmtCount(p.count)} ${convert('部')}`;
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
                {!!unknown && <span>{convert(`另有 ${fmtCount(unknown)} 部作者無朝代，在「四部」和搜索裏能找到`)}</span>}
                <span>{convert('窄段懸停看全名')}</span>
            </p>
        </>
    );
}

/** 单篇诗文：按作者分组 */
export function ReadPieces({ authors, links }: { authors: ReadPieceAuthor[]; links?: Partial<ReadHomeLinks> }) {
    const { convert } = useConvert();
    const l = withDefaultLinks(links);
    if (!authors.length) return null;
    return (
        <ul className="bim-rh-authors">
            {authors.map((a) => (
                <li className="bim-rh-au" key={a.name}>
                    <h3 className="bim-rh-au-h">
                        {convert(a.name)}
                        {a.dynasty && <span>{convert(a.dynasty)}</span>}
                        <small className="bim-rh-num">{convert(`${fmtCount(a.count)} 篇`)}</small>
                    </h3>
                    <ul>
                        {a.items.map((p) => (
                            <li key={p.id}><a href={l.read(p.id)}>{convert(p.title)}</a></li>
                        ))}
                    </ul>
                    {l.author && <a className="bim-rh-more" href={l.author(a.name)}>{convert(`${a.name}全部 ${a.count} 篇 →`)}</a>}
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
    const { convert } = useConvert();
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
    const nav: [keyof typeof ids, string][] = ([
        ['picks', '推薦閱讀'], ['topics', '專題'], ['famous', '名著與版本'], ['sibu', '四部'], ['period', '按年代'], ['pieces', '單篇詩文'],
    ] as [keyof typeof ids, string][]).filter(([k]) => has[k]);
    return (
        <div className={className ? `bim-rh ${className}` : 'bim-rh'}>
            <style>{READ_HOME_CSS}</style>
            <div className="bim-rh-head">
                {head}
                <ReadStats counts={s.counts} />
            </div>
            {nav.length > 1 && (
                <nav className="bim-rh-secnav" aria-label={convert('閱讀首頁分區')}>
                    <ul>{nav.map(([k, t]) => <li key={k}><a href={`#${ids[k]}`}>{convert(t)}</a></li>)}</ul>
                </nav>
            )}
            <div className="bim-rh-main">
                {has.picks && (
                    <ReadSection id={ids.picks} title="推薦閱讀" sub={convert('編輯挑選，定期輪換')}>
                        <ReadPicks picks={s.picks} links={links} />
                    </ReadSection>
                )}
                {has.topics && (
                    <ReadSection id={ids.topics} title="專題" sub={convert('按作品類型歸組；小說見下方「名著與版本」')}>
                        <ReadTopics topics={topics} links={links} />
                    </ReadSection>
                )}
                {has.famous && (
                    <ReadSection id={ids.famous} title="名著與版本" sub={convert('一部作品一張卡，卡上列出站內能讀的各個本子')}>
                        <ReadFamousWorks famous={s.famous} links={links} />
                    </ReadSection>
                )}
                {has.sibu && (
                    <ReadSection id={ids.sibu} title="四部" sub={convert('按古籍總目的分類樹，只計站內可讀的作品')}>
                        <ReadSibu bu={s.bu} unclassified={s.unclassified} links={links} />
                    </ReadSection>
                )}
                {has.period && (
                    <ReadSection id={ids.period} title="按年代" sub={convert('按作者朝代歸段，寬度與部數成比例')}>
                        <ReadPeriodBand periods={s.periods} unknown={s.period_unknown} links={links} />
                    </ReadSection>
                )}
                {has.pieces && (
                    <ReadSection
                        id={ids.pieces}
                        title="單篇詩文"
                        sub={convert('單篇的詩、文、賦、表，按作者歸組')}
                        more={piecesMoreHref ? <a className="bim-rh-more" href={piecesMoreHref}>{convert('按作者瀏覽全部 →')}</a> : undefined}
                    >
                        <ReadPieces authors={s.pieces.authors} links={links} />
                    </ReadSection>
                )}
            </div>
        </div>
    );
}
