/**
 * EntityText：给一段正文和它的实体区间，画专名线 / 书名号，悬停出摘要卡，点击进条目页（overview#389 E1）。
 *
 * - 区间用 `core/entity-annotations` 的 `EntitySpan`；entity.json 先过 `adaptEntityJson()`。
 * - 已收录（有 targetId）的实体是 `<a href="/item/<id>">`：Tab 可达，聚焦即出卡，Esc 收起，回车进条目页。
 *   未收录的只画线，不进 Tab 序。
 * - 摘要取法同详情页：`transport.getItem(id)`；也可由宿主给 `loadSummary` 自取。
 * - 不碰阅读器现有文件；接进 Reader 由宿主 / 后续接线完成。
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import {
    remapPlainOffsets,
    segmentEntities,
    type EntityKind,
    type EntitySpan,
} from '../../core/entity-annotations';
import { ENTITY_TEXT_CSS } from './entity-text-css';
import {
    cachedSummary,
    transportSummaryLoader,
    type EntitySummary,
    type EntitySummaryLoader,
    type EntitySummaryTransport,
} from './summary';

export const defaultEntityHref = (id: string) => `/item/${encodeURIComponent(id)}`;

/** 卡片上的类别名（繁体原文，简体模式经 convert 转换） */
const KIND_LABEL: Record<EntityKind, string> = {
    work: '書名',
    people: '人名',
    place: '地名',
    office: '官職',
    dynasty: '朝代',
    reign: '年號',
    other: '專名',
};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 摘要取数器：给了 `loadSummary` 用它，否则用 transport；都没有则卡片只显示规范名 */
export function useEntitySummaryLoader(
    transport?: EntitySummaryTransport,
    loadSummary?: EntitySummaryLoader,
): { owner: object; load: EntitySummaryLoader } | null {
    return useMemo(() => {
        if (loadSummary) return { owner: loadSummary, load: loadSummary };
        if (transport) return { owner: transport, load: transportSummaryLoader(transport) };
        return null;
    }, [loadSummary, transport]);
}

export interface EntityTextProps {
    /** 正文 */
    text: string;
    /** 实体区间（`adaptEntityJson(entityJson)` 的结果） */
    entities: readonly EntitySpan[];
    /**
     * 区间偏移的基准：`text` = `text` 的下标（默认）；
     * `plain` = 纯字下标（entity.json 原样的 span，不计标点空白），组件自行换算。
     */
    offsets?: 'text' | 'plain';
    /** `offsets="plain"` 且本段只是整卷的一部分时，本段首个计数字在整卷纯字序中的位置 */
    plainBase?: number;
    /** 取摘要用的数据源（同详情页的 transport） */
    transport?: EntitySummaryTransport;
    /** 自定义摘要取数；给了就不用 transport */
    loadSummary?: EntitySummaryLoader;
    /** 条目链接；默认 `/item/<id>` */
    buildHref?: (id: string) => string;
    /** 点击实体；宿主做站内路由时在这里 `e.preventDefault()` 再跳 */
    onNavigate?: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
    /** 普通文字的渲染（高亮、繁简等）；实体文字也走它 */
    renderText?: (s: string) => React.ReactNode;
    /** 悬停多久出卡（毫秒） */
    hoverDelayMs?: number;
    /** 移出词或卡片后多久收卡（毫秒），默认 280 */
    closeDelayMs?: number;
    /** 是否随组件输出 `<style>`；一页里铺很多段时可关掉，由宿主放一次 `ENTITY_TEXT_CSS` */
    injectStyles?: boolean;
    className?: string;
}

const identity = (s: string): React.ReactNode => s;

export const EntityText: React.FC<EntityTextProps> = ({
    text, entities, offsets = 'text', plainBase = 0, transport, loadSummary,
    buildHref = defaultEntityHref, onNavigate, renderText = identity, hoverDelayMs = 250,
    closeDelayMs,
    injectStyles = true, className,
}) => {
    const segments = useMemo(() => {
        const spans = offsets === 'plain' ? remapPlainOffsets(text, entities, plainBase) : entities;
        return segmentEntities(text, spans);
    }, [text, entities, offsets, plainBase]);

    const loader = useEntitySummaryLoader(transport, loadSummary);

    return (
        <span className={className ? `bim-et-root ${className}` : 'bim-et-root'}>
            {injectStyles && <style>{ENTITY_TEXT_CSS}</style>}
            {segments.map(seg => seg.type === 'text'
                ? <React.Fragment key={`t${seg.start}`}>{renderText(seg.text)}</React.Fragment>
                : (
                    <EntityMark
                        key={`${seg.span.key}@${seg.start}`}
                        span={seg.span}
                        label={seg.text}
                        hasBrackets={text[seg.start - 1] === '《' && text[seg.start + seg.text.length] === '》'}
                        loader={loader}
                        buildHref={buildHref}
                        onNavigate={onNavigate}
                        renderText={renderText}
                        hoverDelayMs={hoverDelayMs}
                        closeDelayMs={closeDelayMs}
                    />
                ))}
        </span>
    );
};

export interface EntityMarkProps {
    span: EntitySpan;
    label: string;
    /** 正文本身已带书名号，就不再补隐藏的《》 */
    hasBrackets: boolean;
    /** 不画专名线（书名用书名号标法时：线与号二选一）；缺省画线 */
    plain?: boolean;
    loader: { owner: object; load: EntitySummaryLoader } | null;
    buildHref: (id: string) => string;
    onNavigate?: EntityTextProps['onNavigate'];
    renderText: (s: string) => React.ReactNode;
    hoverDelayMs: number;
    /** 移出词或卡片后多久收卡（毫秒）；期间移回词或卡片则不收 */
    closeDelayMs?: number;
}

/** 同一时刻只开一张卡：新卡打开时立刻收掉上一张 */
let openCardCloser: (() => void) | null = null;

export const EntityMark: React.FC<EntityMarkProps> = ({
    span, label, hasBrackets, plain, loader, buildHref, onNavigate, renderText, hoverDelayMs,
    closeDelayMs = 280,
}) => {
    const cardId = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(false);
    const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cls = `bim-et bim-et-${span.kind}${plain ? ' bim-et-nu' : ''}`;
    const brackets = span.kind === 'work' && !hasBrackets;
    const inner = (
        <>
            {brackets && <span className="bim-et-sr">《</span>}
            {renderText(label)}
            {brackets && <span className="bim-et-sr">》</span>}
        </>
    );

    const clearOpen = () => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } };
    const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };

    const closeNow = useCallback(() => {
        clearOpen(); clearClose();
        setOpen(false); setActive(false);
        if (openCardCloser === closeNow) openCardCloser = null;
    }, []);
    useEffect(() => () => { clearOpen(); clearClose(); if (openCardCloser === closeNow) openCardCloser = null; }, [closeNow]);

    const openCard = useCallback(() => {
        if (openCardCloser && openCardCloser !== closeNow) openCardCloser();
        openCardCloser = closeNow;
        setOpen(true);
    }, [closeNow]);

    /** 进入词或卡片：整词高亮；已开则取消待收，未开则按延迟出卡 */
    const enter = useCallback((delay: number) => {
        clearClose();
        setActive(true);
        if (open) return;
        clearOpen();
        if (delay <= 0) openCard();
        else openTimer.current = setTimeout(openCard, delay);
    }, [open, openCard]);
    /** 移出：延迟收卡 */
    const leave = useCallback(() => {
        clearOpen(); clearClose();
        closeTimer.current = setTimeout(closeNow, closeDelayMs);
    }, [closeNow, closeDelayMs]);

    const hasLink = !!span.targetId;
    const id = span.targetId;
    // 未收录的实体也出卡（只写类别），但不可聚焦
    const wrapProps = {
        className: 'bim-et-w',
        'data-active': active ? '' : undefined,
        onMouseEnter: () => enter(hoverDelayMs),
        onMouseLeave: leave,
        // 焦点移到卡内的详情链接不算离开；移出整个词+卡才收
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeNow();
        },
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); closeNow(); } },
    };

    if (!hasLink || !id) {
        return (
            <span {...wrapProps}>
                <span className={cls}>{inner}</span>
                {open && <EntityCard id={cardId} entityId={null} span={span} loader={null} buildHref={buildHref} onNavigate={onNavigate} />}
            </span>
        );
    }

    return (
        <span {...wrapProps}>
            <a
                className={cls}
                href={buildHref(id)}
                data-entity-id={id}
                aria-describedby={open ? cardId : undefined}
                onFocus={() => enter(0)}
                onClick={onNavigate ? e => onNavigate(id, e) : undefined}
            >
                {inner}
            </a>
            {open && <EntityCard id={cardId} entityId={id} span={span} loader={loader} buildHref={buildHref} onNavigate={onNavigate} />}
        </span>
    );
};

type CardState =
    | { status: 'loading' }
    | { status: 'ready'; summary: EntitySummary | null }
    | { status: 'error' };

const EntityCard: React.FC<{
    id: string;
    /** null = 未收录：只写类别 */
    entityId: string | null;
    span: EntitySpan;
    loader: { owner: object; load: EntitySummaryLoader } | null;
    buildHref: (id: string) => string;
    onNavigate?: EntityTextProps['onNavigate'];
}> = ({ id, entityId, span, loader, buildHref, onNavigate }) => {
    const { convert, t } = useI18n();
    const ref = useRef<HTMLSpanElement | null>(null);
    const [align, setAlign] = useState<'start' | 'end'>('start');
    const [state, setState] = useState<CardState>(loader && entityId ? { status: 'loading' } : { status: 'ready', summary: null });

    useEffect(() => {
        if (!loader || !entityId) return;
        let cancelled = false;
        setState({ status: 'loading' });
        cachedSummary(loader.owner, loader.load, entityId)
            .then(summary => { if (!cancelled) setState({ status: 'ready', summary }); })
            .catch(() => { if (!cancelled) setState({ status: 'error' }); });
        return () => { cancelled = true; };
    }, [loader, entityId]);

    // 右侧放不下就改为右对齐
    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof window === 'undefined') return;
        const r = el.getBoundingClientRect();
        const vw = document.documentElement.clientWidth || window.innerWidth;
        if (r.right > vw - 8 && align === 'start') setAlign('end');
    }, [state, align]);

    const summary = state.status === 'ready' ? state.summary : null;
    const title = summary?.title ?? span.canonicalName ?? span.text;

    if (!entityId) {
        return (
            <span ref={ref} id={id} role="tooltip" className="bim-et-card" data-align={align}>
                <span className="bim-et-card-k">{convert(KIND_LABEL[span.kind])}</span>
            </span>
        );
    }

    return (
        <span ref={ref} id={id} role="tooltip" className="bim-et-card" data-align={align}>
            <span className="bim-et-card-k">{convert(KIND_LABEL[span.kind])}</span>
            {title && <span className="bim-et-card-t">{convert(title)}</span>}
            {summary?.meta && <span className="bim-et-card-m">{convert(summary.meta)}</span>}
            {summary?.description && <span className="bim-et-card-d">{convert(summary.description)}</span>}
            {state.status === 'loading' && <span className="bim-et-card-s">{convert('載入中…')}</span>}
            {state.status === 'error' && <span className="bim-et-card-s">{convert('摘要載入失敗')}</span>}
            <a
                className="bim-et-card-a"
                href={buildHref(entityId)}
                onClick={onNavigate ? e => onNavigate(entityId, e) : undefined}
            >{t('reader.entityDetail')}</a>
        </span>
    );
};
