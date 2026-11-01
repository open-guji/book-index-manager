/**
 * 「古籍中的出處」：某实体（人物、地名、官名……，或 Work）在哪些古籍的哪一处被专名号标出（A12 专名出处反查）。
 * 数据是打包时由 book-text 的专名号派生的 `mentions/<id>.json`（transport.getMentions），本节进入视口才取。
 * 每行：书名·章内标题，后接原文摘录（专名加粗），整行链到阅读页并高亮该处（`#起~止`）。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { IndexStorage, MentionItem, MentionsPage } from '../../storage/types';
import { useI18n } from '../../i18n';
import { Sec, MetaLine } from './layout';

/** 首屏显示几条；「再看」每次多一页 */
const FIRST = 10;

/** 阅读页地址（与站点 readerPath 同形）＋格位范围 */
export function mentionHref(m: MentionItem): string {
    const key = m.key && m.key !== 'default' ? `/${m.key}` : '';
    return `/read/${m.item}${key}/${m.chapter}#${m.start}~${m.end}`;
}

export interface MentionsSectionProps {
    id: string;
    transport?: IndexStorage;
    /** 站内跳转（不传就用普通 <a href>） */
    renderLink?: (href: string, children: React.ReactNode, className?: string) => React.ReactNode;
    /** 页数据到了之后告诉宿主（rail 计数用） */
    onTotal?: (n: number) => void;
}

export const MentionsSection: React.FC<MentionsSectionProps> = ({ id, transport, renderLink, onTotal }) => {
    const { t, convert } = useI18n();
    const [pages, setPages] = useState<MentionsPage[]>([]);
    const [state, setState] = useState<'idle' | 'loading' | 'none' | 'ok'>('idle');
    const [shown, setShown] = useState(FIRST);
    const ref = useRef<HTMLDivElement>(null);
    const has = !!transport?.getMentions;
    const get = (eid: string, page: number) => transport!.getMentions!(eid, page);
    const onTotalRef = useRef(onTotal);
    onTotalRef.current = onTotal;

    // 换实体就重来；进入视口（或没有 IntersectionObserver）才取第 1 页
    useEffect(() => {
        setPages([]); setState('idle'); setShown(FIRST);
        if (!has) return;
        const el = ref.current;
        let cancelled = false;
        const load = () => {
            setState('loading');
            get(id, 1).then(p => {
                if (cancelled) return;
                if (!p || !p.total) { setState('none'); onTotalRef.current?.(0); return; }
                setPages([p]); setState('ok'); onTotalRef.current?.(p.total);
            }).catch(() => { if (!cancelled) setState('none'); });
        };
        if (!el || typeof IntersectionObserver === 'undefined') { load(); return () => { cancelled = true; }; }
        const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' });
        io.observe(el);
        return () => { cancelled = true; io.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, has, transport]);

    const first = pages[0];
    const items = pages.flatMap(p => p.items);
    const visible = items.slice(0, shown);
    const titleOf = new Map((first?.books ?? []).map(b => [b.item, b.title]));
    const more = first ? Math.min(first.total - shown, 50) : 0;

    const loadMore = () => {
        if (!first || !has) return;
        const need = shown + 50;
        if (items.length >= need || pages.length >= first.pages) { setShown(need); return; }
        get(id, pages.length + 1).then(p => { if (p) setPages(ps => [...ps, p]); setShown(need); });
    };

    if (state === 'none' || !has) return <div ref={ref} />;
    return (
        <div ref={ref}>
            <Sec
                id="mentions"
                title={t('mentions.title')}
                meta={first ? <MetaLine items={[t('mentions.total', { n: first.total, b: first.books?.length ?? 1 })]} /> : undefined}
            >
                {!first && <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>{t('mentions.loading')}</p>}
                {first && <p className="bim-d-sec-sub bim-d-ui">{t('mentions.hint')}</p>}
                {first && (
                    <ol className="bim-d-mentions">
                        {visible.map((m, i) => {
                            const where = [titleOf.get(m.item), m.heading].filter(Boolean).map(s => convert(s as string)).join(' · ');
                            const body = (
                                <>
                                    <span className="bim-d-mention-where bim-d-ui">{where || m.chapter}</span>
                                    <span className="bim-d-mention-ctx">
                                        {m.before ? '…' : ''}{convert(m.before)}<b>{convert(m.text)}</b>{convert(m.after)}{m.after ? '…' : ''}
                                    </span>
                                </>
                            );
                            const href = mentionHref(m);
                            return (
                                <li key={`${m.item}|${m.key}|${m.chapter}|${m.start}|${i}`}>
                                    {renderLink ? renderLink(href, body, 'bim-d-mention') : <a className="bim-d-mention" href={href}>{body}</a>}
                                </li>
                            );
                        })}
                    </ol>
                )}
                {first && more > 0 && (
                    <button type="button" className="bim-d-tab bim-d-ui" onClick={loadMore}>{t('mentions.more', { n: more })}</button>
                )}
            </Sec>
        </div>
    );
};
