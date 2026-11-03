/**
 * 「古籍中的出處」：某实体（人物、地名、官名……，或 Work）在哪些古籍的哪些章被专名号标出（A12 专名出处反查）。
 * 数据是打包时由 book-text 的专名号派生的 `mentions/<id>.json`（transport.getMentions，schema mentions/v2），本节进入视口才取。
 * 上半是摘录（至多 20 条，带上下文，链到阅读页并高亮该处 `#起~止`）；下半按书列章，
 * 章行链到阅读页 `#e=<id>`，在那里标出本章全部并可逐处跳。热门实体的章目录按书另取（展开时才取）。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { IndexStorage, MentionBook, MentionChapter, MentionItem, MentionsIndex } from '../../storage/types';
import { useI18n } from '../../i18n';
import { Sec, MetaLine } from './layout';

/** 摘录首屏几条（其余「再看」展开，至多 20） */
const FIRST = 8;
/** 书目首屏几部；「再列」每次多 BOOK_STEP */
const BOOK_FIRST = 10;
const BOOK_STEP = 30;

const readBase = (item: string, key: string, chapter: string) =>
    `/read/${item}${key && key !== 'default' ? `/${key}` : ''}/${chapter}`;

/** 一处例子的阅读页地址（与站点 readerPath 同形）＋格位范围 */
export function mentionHref(m: MentionItem): string {
    return `${readBase(m.item, m.key, m.chapter)}#${m.start}~${m.end}`;
}

/** 一章的阅读页地址：`#e=` 带该章 entity 文件里实际写的 id（草稿、墓碑时与现行 id 不同） */
export function mentionChapterHref(entityId: string, item: string, c: MentionChapter): string {
    return `${readBase(item, c.key, c.chapter)}#e=${(c.ids?.length ? c.ids : [entityId]).join(',')}`;
}

export interface MentionsSectionProps {
    id: string;
    transport?: IndexStorage;
    /** 站内跳转（不传就用普通 <a href>） */
    renderLink?: (href: string, children: React.ReactNode, className?: string) => React.ReactNode;
    /** 数据到了之后告诉宿主（rail 计数用） */
    onTotal?: (n: number) => void;
}

export const MentionsSection: React.FC<MentionsSectionProps> = ({ id, transport, renderLink, onTotal }) => {
    const { t, convert } = useI18n();
    const [data, setData] = useState<MentionsIndex | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'none' | 'ok'>('idle');
    const [shown, setShown] = useState(FIRST);
    const [bookShown, setBookShown] = useState(BOOK_FIRST);
    const ref = useRef<HTMLDivElement>(null);
    const has = !!transport?.getMentions;
    const onTotalRef = useRef(onTotal);
    onTotalRef.current = onTotal;

    // 换实体就重来；进入视口（或没有 IntersectionObserver）才取
    useEffect(() => {
        setData(null); setState('idle'); setShown(FIRST); setBookShown(BOOK_FIRST);
        if (!has) return;
        const el = ref.current;
        let cancelled = false;
        const load = () => {
            setState('loading');
            transport!.getMentions!(id).then(p => {
                if (cancelled) return;
                const d = p && 'books' in p ? p : null;
                if (!d || !d.total) { setState('none'); onTotalRef.current?.(0); return; }
                setData(d); setState('ok'); onTotalRef.current?.(d.total);
            }).catch(() => { if (!cancelled) setState('none'); });
        };
        if (!el || typeof IntersectionObserver === 'undefined') { load(); return () => { cancelled = true; }; }
        const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' });
        io.observe(el);
        return () => { cancelled = true; io.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, has, transport]);

    if (state === 'none' || !has) return <div ref={ref} />;
    const link = (href: string, body: React.ReactNode, cls: string) =>
        renderLink ? renderLink(href, body, cls) : <a className={cls} href={href}>{body}</a>;
    const titleOf = new Map((data?.books ?? []).map(b => [b.item, b.title]));
    const examples = data?.examples ?? [];
    const books = data?.books ?? [];

    return (
        <div ref={ref}>
            <Sec
                id="mentions"
                title={t('mentions.title')}
                meta={data ? <MetaLine items={[t('mentions.total', { n: data.total, b: books.length })]} /> : undefined}
            >
                {!data && <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>{t('mentions.loading')}</p>}
                {data && <p className="bim-d-sec-sub bim-d-ui">{t('mentions.hint')}</p>}
                {data && examples.length > 0 && (
                    <>
                        <h3 className="bim-d-mentions-h bim-d-ui">{t('mentions.examples')}</h3>
                        <ol className="bim-d-mentions">
                            {examples.slice(0, shown).map((m, i) => {
                                const where = [titleOf.get(m.item), m.heading].filter(Boolean).map(s => convert(s as string)).join(' · ');
                                const body = (
                                    <>
                                        <span className="bim-d-mention-where bim-d-ui">{where || m.chapter}</span>
                                        <span className="bim-d-mention-ctx">
                                            {m.before ? '…' : ''}{convert(m.before)}<b>{convert(m.text)}</b>{convert(m.after)}{m.after ? '…' : ''}
                                        </span>
                                    </>
                                );
                                return <li key={`${m.item}|${m.key}|${m.chapter}|${m.start}|${i}`}>{link(mentionHref(m), body, 'bim-d-mention')}</li>;
                            })}
                        </ol>
                        {examples.length > shown && (
                            <button type="button" className="bim-d-tab bim-d-ui" onClick={() => setShown(examples.length)}>
                                {t('mentions.more', { n: examples.length - shown })}
                            </button>
                        )}
                    </>
                )}
                {data && books.length > 0 && (
                    <>
                        <h3 className="bim-d-mentions-h bim-d-ui">{t('mentions.byBook')}</h3>
                        <ul className="bim-d-mbooks">
                            {books.slice(0, bookShown).map(b => (
                                <BookRow key={b.item} entityId={id} book={b} open={books.length === 1} transport={transport} link={link} />
                            ))}
                        </ul>
                        {books.length > bookShown && (
                            <button type="button" className="bim-d-tab bim-d-ui" onClick={() => setBookShown(n => n + BOOK_STEP)}>
                                {t('mentions.moreBooks', { n: Math.min(BOOK_STEP, books.length - bookShown) })}
                            </button>
                        )}
                    </>
                )}
            </Sec>
        </div>
    );
};

/** 一部书：摘要行是书名与「N 处 · C 章」，展开列章；章目录没内联的（热门实体）展开时才取 */
const BookRow: React.FC<{
    entityId: string;
    book: MentionBook;
    open: boolean;
    transport?: IndexStorage;
    link: (href: string, body: React.ReactNode, cls: string) => React.ReactNode;
}> = ({ entityId, book, open, transport, link }) => {
    const { t, convert } = useI18n();
    const [chapters, setChapters] = useState<MentionChapter[] | null>(book.chapters ?? null);
    const [loading, setLoading] = useState(false);
    useEffect(() => { setChapters(book.chapters ?? null); }, [book]);
    const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
        if (!e.currentTarget.open || chapters || loading || !transport?.getMentions) return;
        setLoading(true);
        transport.getMentions(entityId, book.item)
            .then(p => { if (p && 'chapters' in p && Array.isArray(p.chapters)) setChapters(p.chapters); })
            .catch(() => {})
            .finally(() => setLoading(false));
    };
    return (
        <li>
            <details className="bim-d-mbook" open={open} onToggle={onToggle}>
                <summary>
                    <span className="bim-d-mbook-t">{convert(book.title ?? book.item)}</span>
                    <span className="bim-d-mbook-n bim-d-ui">{t('mentions.bookLine', { n: book.count, c: book.chapter_count })}</span>
                </summary>
                {loading && <p className="bim-d-meta bim-d-ui" style={{ margin: '0 0 8px 40px' }}>{t('mentions.loading')}</p>}
                {chapters && (
                    <ul className="bim-d-mchaps">
                        {chapters.map(c => (
                            <li key={`${c.key}|${c.chapter}`}>
                                {link(
                                    mentionChapterHref(entityId, book.item, c),
                                    <><span>{c.heading ? `${c.chapter} · ${convert(c.heading)}` : c.chapter}</span><span className="bim-d-ui">{t('mentions.chapterLine', { n: c.count })}</span></>,
                                    'bim-d-mchap',
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </details>
        </li>
    );
};
