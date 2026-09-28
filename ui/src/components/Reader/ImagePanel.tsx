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

function CharBoxes({ page }: { page: ReaderPageImage }) {
    if (!page.boxes?.length || !page.width || !page.height) return null;
    if (page.boxFormat && page.boxFormat !== 'bim-charbox-v0') return null;
    return (
        <svg viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="none" aria-hidden="true">
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

export function ImagePanel({ pages, loading, page: pageProp, onPageChange, renderOverlay }: {
    pages: ReaderPageImage[] | null;
    loading?: boolean;
    /** 受控页码（0 起）；不传则内部管理 */
    page?: number;
    onPageChange?: (page: number) => void;
    renderOverlay?: ReaderImageOverlay;
}) {
    const [inner, setInner] = useState(0);
    const page = pageProp ?? inner;
    const setPage = (p: number) => { if (onPageChange) onPageChange(p); else setInner(p); };
    // 换了一卷（pages 变了）回到第一页
    useEffect(() => { if (pageProp === undefined) setInner(0); }, [pages, pageProp]);

    if (loading) {
        return <div className="bim-rd-img-box"><div className="bim-rd-img-empty">加载书影…</div></div>;
    }
    if (!pages || pages.length === 0) {
        return (
            <div className="bim-rd-img-box">
                <div className="bim-rd-img-empty">
                    <div className="bim-rd-img-frame" aria-hidden="true" />
                    <b>暂无书影</b>
                    <span>这一卷还没有配上影像；接入后在此与正文逐页对看</span>
                </div>
            </div>
        );
    }
    const i = Math.max(0, Math.min(pages.length - 1, page));
    const cur = pages[i];
    const label = cur.label ?? `${i + 1}`;
    return (
        <>
            <div className="bim-rd-img-box">
                <figure className="bim-rd-img-fig">
                    <img
                        src={cur.url}
                        alt={cur.alt ?? `书影 第 ${label} 页`}
                        width={cur.width}
                        height={cur.height}
                        loading="lazy"
                        decoding="async"
                    />
                    <CharBoxes page={cur} />
                    {renderOverlay?.(cur, i)}
                </figure>
            </div>
            {pages.length > 1 && (
                <div className="bim-rd-img-pager">
                    <button type="button" className="bim-rd-t" aria-label="上一页书影" disabled={i === 0} onClick={() => setPage(i - 1)}>‹</button>
                    <span aria-live="polite">{cur.label ?? `${i + 1} / ${pages.length}`}</span>
                    <button type="button" className="bim-rd-t" aria-label="下一页书影" disabled={i === pages.length - 1} onClick={() => setPage(i + 1)}>›</button>
                </div>
            )}
        </>
    );
}
