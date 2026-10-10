/**
 * 书影面板：一次显示一页，下方「‹ 3 / 12 ›」翻页。
 *
 * - 没有影像时显示占位（宿主也可以让它自动收起，见 ReaderShell 的 imagePanel）；
 * - 逐字框（`bim-charbox-v0`）画成 SVG 叠在图上，viewBox 用原图像素，随显示尺寸缩放；
 * - 其他格式的框交给 `renderOverlay`（与 CV 交付格式对齐前的扩展点）。
 */
import { useEffect, useState } from 'react';
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

export function ImagePanel({ pages, loading, page: pageProp, onPageChange, renderOverlay, preserveMargins = true }: {
    pages: ReaderPageImage[] | null;
    loading?: boolean;
    /** 受控页码（0 起）；不传则内部管理 */
    page?: number;
    onPageChange?: (page: number) => void;
    renderOverlay?: ReaderImageOverlay;
    /** true＝显示整张书影含四周空白（默认）；false＝按逐字框裁到版心，裁不了的图（无框、带自定义叠加层）保持原样 */
    preserveMargins?: boolean;
}) {
    const { t } = useI18n();
    const [inner, setInner] = useState(0);
    const page = pageProp ?? inner;
    const setPage = (p: number) => { if (onPageChange) onPageChange(p); else setInner(p); };
    // 换了一卷（pages 变了）回到第一页
    useEffect(() => { if (pageProp === undefined) setInner(0); }, [pages, pageProp]);

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
    return (
        <>
            <div className="bim-rd-img-box">
                {trim ? (
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
            {pages.length > 1 && (
                <div className="bim-rd-img-pager">
                    <button type="button" className="bim-rd-t" aria-label={t('reader.prevImage')} disabled={i === 0} onClick={() => setPage(i - 1)}>‹</button>
                    <span aria-live="polite">{cur.label ?? `${i + 1} / ${pages.length}`}</span>
                    <button type="button" className="bim-rd-t" aria-label={t('reader.nextImage')} disabled={i === pages.length - 1} onClick={() => setPage(i + 1)}>›</button>
                </div>
            )}
        </>
    );
}
