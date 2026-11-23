/**
 * 书影面板：一次显示一页，下方「‹ 3 / 12 ›」翻页。
 *
 * - 没有影像时显示占位（宿主也可以让它自动收起，见 ReaderShell 的 imagePanel）；
 * - 逐字框（`bim-charbox-v0`）画成 SVG 叠在图上，viewBox 用原图像素，随显示尺寸缩放；
 * - 其他格式的框交给 `renderOverlay`（与 CV 交付格式对齐前的扩展点）。
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReaderGap } from '../../core/gaps';
import { GapCard } from './GapCard';
import type { ReaderImageOverlay, ReaderPageImage } from './types';
import { bim } from '../../styles/tokens';
import { useI18n } from '../../i18n/use-i18n';

function CharBoxes({ page, crop }: { page: ReaderPageImage; crop?: { x: number; y: number; w: number; h: number } }) {
    if (!page.boxes?.length || !page.width || !page.height) return null;
    if (page.boxFormat && page.boxFormat !== 'bim-charbox-v0') return null;
    return (
        <svg viewBox={crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${page.width} ${page.height}`} preserveAspectRatio="none" aria-hidden="true">
            {page.boxes.map((b, i) => (
                <rect
                    key={i}
                    x={b.x} y={b.y} width={b.w} height={b.h}
                    fill="none"
                    stroke={bim('accent')}
                    strokeOpacity={0.55}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={1}
                />
            ))}
        </svg>
    );
}

/** 去空白时的裁切区：逐字框的外接矩形，四周各留 3%（比例按短边算）；没有框、没有原图尺寸、或框退化成一条线时不裁 */
export function trimRect(page: ReaderPageImage): { x: number; y: number; w: number; h: number } | null {
    const { boxes, width: W, height: H } = page;
    if (!boxes?.length || !W || !H) return null;
    if (page.boxFormat && page.boxFormat !== 'bim-charbox-v0') return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
        if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) continue;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    if (!(x1 > x0) || !(y1 > y0)) return null;
    const pad = Math.min(W, H) * 0.03;
    // 起点和远端边都夹进图内；框完全落在图外时宽高为 0 或负，不裁（否则会算出无效的宽高比）
    const x = Math.min(W, Math.max(0, x0 - pad)), y = Math.min(H, Math.max(0, y0 - pad));
    const w = Math.min(W, Math.max(0, x1 + pad)) - x, h = Math.min(H, Math.max(0, y1 + pad)) - y;
    if (!(w > 0) || !(h > 0)) return null;
    // 几乎没裁掉东西就不动（裁切反而引入取整误差）
    if (w >= W * 0.98 && h >= H * 0.98) return null;
    return { x, y, w, h };
}

export function ImagePanel({ pages, loading, page: pageProp, onPageChange, renderOverlay, preserveMargins = true, gaps, convert }: {
    pages: ReaderPageImage[] | null;
    loading?: boolean;
    /** 受控页码（0 起）；不传则内部管理 */
    page?: number;
    onPageChange?: (page: number) => void;
    renderOverlay?: ReaderImageOverlay;
    /** true＝显示整张书影含四周空白（默认）；false＝按逐字框裁到版心，裁不了的图（无框、带自定义叠加层）保持原样 */
    preserveMargins?: boolean;
    /** 缺页（`adaptGaps` 的结果）：缺在第 afterPage 张图（按 `pageNo`，没有就按序号）之后，翻页时多一步灰底占位卡，不占页号 */
    gaps?: readonly ReaderGap[];
    /** 繁简转换（显示用），只作用于占位卡文字 */
    convert?: (s: string) => string;
}) {
    const { t } = useI18n();
    const [inner, setInner] = useState(0);
    const page = pageProp ?? inner;
    const setPage = (p: number) => { if (onPageChange) onPageChange(p); else setInner(p); };
    // 换了一卷（pages 变了）回到第一页
    useEffect(() => { if (pageProp === undefined) setInner(0); }, [pages, pageProp]);
    // 缺页：挂在「页号 ≤ afterPage 的最后一张图」之后；没有这样的图（afterPage 在第一张之前）的挂在第一张之前
    const { gapAfter, gapBefore } = useMemo(() => {
        const after = new Map<number, ReaderGap>();
        let before: ReaderGap | null = null;
        for (const g of gaps ?? []) {
            let idx = -1;
            (pages ?? []).forEach((p, j) => { if ((p.pageNo ?? j + 1) <= g.afterPage) idx = j; });
            if (idx < 0) before = before ?? g;
            else if (!after.has(idx)) after.set(idx, g);
        }
        return { gapAfter: after, gapBefore: before };
    }, [gaps, pages]);
    const [gv, setGv] = useState<{ idx: number; pos: 'before' | 'after' } | null>(null);

    if (loading) {
        return <div className="bim-rd-img-box"><div className="bim-rd-img-empty">{t('reader.imagesLoading')}</div></div>;
    }
    if (!pages || pages.length === 0) {
        return (
            <div className="bim-rd-img-box">
                <div className="bim-rd-img-empty">
                    <div className="bim-rd-img-frame" aria-hidden="true" />
                    <b>{t('reader.noImages')}</b>
                    <span>{t('reader.noImagesHint')}</span>
                </div>
            </div>
        );
    }
    const i = Math.max(0, Math.min(pages.length - 1, page));
    const cur = pages[i];
    const label = cur.label ?? `${i + 1}`;
    const trim = !preserveMargins && !renderOverlay ? trimRect(cur) : null;
    const shownGap = gv && gv.idx === i ? (gv.pos === 'before' ? gapBefore : gapAfter.get(i) ?? null) : null;
    const hasGaps = gapAfter.size > 0 || !!gapBefore;
    const flip = (d: number) => {
        if (shownGap) {
            if (d > 0) { setGv(null); if (gv!.pos === 'after' && i < pages.length - 1) setPage(i + 1); }
            else if (gv!.pos === 'after') setGv(null);
            return;
        }
        if (d > 0) { if (gapAfter.has(i)) setGv({ idx: i, pos: 'after' }); else setPage(i + 1); return; }
        if (i === 0) { if (gapBefore) setGv({ idx: 0, pos: 'before' }); return; }
        setPage(i - 1);
        if (gapAfter.has(i - 1)) setGv({ idx: i - 1, pos: 'after' });
    };
    const canPrev = shownGap ? gv!.pos === 'after' : i > 0 || !!gapBefore;
    const canNext = shownGap ? (gv!.pos === 'before' || i < pages.length - 1) : i < pages.length - 1 || gapAfter.has(i);
    return (
        <>
            <div className="bim-rd-img-box">
                {shownGap ? <GapCard gap={shownGap} convert={convert} /> : trim ? (
                    <figure className="bim-rd-img-fig bim-rd-img-trimmed" data-trim={`${Math.round(trim.x)},${Math.round(trim.y)},${Math.round(trim.w)},${Math.round(trim.h)}`}
                        style={{ aspectRatio: `${trim.w} / ${trim.h}`, overflow: 'hidden', width: '100%', maxWidth: `calc((100vh - 200px) * ${trim.w / trim.h})` }}>
                        <img
                            src={cur.url}
                            alt={cur.alt ?? t('reader.imageAlt', { label })}
                            decoding="async"
                            style={{ position: 'absolute', maxWidth: 'none', maxHeight: 'none', width: `${(cur.width! / trim.w) * 100}%`, left: `${(-trim.x / trim.w) * 100}%`, top: `${(-trim.y / trim.h) * 100}%` }}
                        />
                        <CharBoxes page={cur} crop={trim} />
                    </figure>
                ) : (
                <figure className="bim-rd-img-fig">
                    <img
                        src={cur.url}
                        alt={cur.alt ?? t('reader.imageAlt', { label })}
                        width={cur.width}
                        height={cur.height}
                        loading="lazy"
                        decoding="async"
                    />
                    <CharBoxes page={cur} />
                    {renderOverlay?.(cur, i)}
                </figure>
                )}
            </div>
            {(pages.length > 1 || hasGaps) && (
                <div className="bim-rd-img-pager">
                    <button type="button" className="bim-rd-t" aria-label={t('reader.prevImage')} disabled={!canPrev} onClick={() => flip(-1)}>‹</button>
                    <span aria-live="polite">{cur.label ?? `${i + 1} / ${pages.length}`}{shownGap ? (convert ?? ((x: string) => x))(gv!.pos === 'before' ? '　之前缺頁' : '　之後缺頁') : ''}</span>
                    <button type="button" className="bim-rd-t" aria-label={t('reader.nextImage')} disabled={!canNext} onClick={() => flip(1)}>›</button>
                </div>
            )}
        </>
    );
}
