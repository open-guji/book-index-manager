/**
 * 图片格与插图块的显示零件（char v0.3 `fig`／`kind: figure`，spec/02 §4.7、spec/09；设计见 book-text docs/design/2026-10-图片格与插图设计.md §6.1）。
 *
 * - 图片格：一字宽（连占 n 格的图宽 n 字）的内嵌图，按图比例缩到一字高内、居中；原字 □ 留在 DOM 里但透明，
 *   选区、悬停、点击仍按格位 id 工作；`title`／`aria-label` 写「图形符号：说明」；复制得到 `〔图：说明〕`（见 {@link copyTextWithFigures}）。
 * - 插图块：占满正文栏，下附说明，可点（宿主翻书影）。
 * - 取不到图（没传 figures／figUrl，或文件加载失败）：显示 `〔图：说明〕` 小标签，不显示裸 □。
 * - 夜间：像素图 `filter: invert(1)`，SVG 用 mask＋currentColor（样式见 reader-css 的 `.guji-fig-*`）。
 */
import React, { useState } from 'react';
import type { GujiFigure } from '../../core/guji-pages';
import { useI18n } from '../../i18n';

/** 复制出去的文字 */
export const figCopyLabel = (alt: string): string => `〔图：${alt}〕`;

interface FigCommon {
    fig: string;
    info?: GujiFigure;
    figUrl?: (file: string) => string;
}

const figSrc = (info: GujiFigure | undefined, figUrl?: (file: string) => string): string | null => (info && figUrl ? figUrl(info.file) : null);

/** 图片的显示：取得到就是 <img>（SVG 是 mask 的 span），加载失败或取不到就是 `〔图：说明〕` 标签 */
function FigVisual({ fig, info, figUrl, block, failed, onFail }: FigCommon & { block?: boolean; failed: boolean; onFail: () => void }) {
    const alt = info?.alt ?? '图形符号';
    const src = figSrc(info, figUrl);
    if (!src || failed) return <span className="guji-fig-missing" data-fig-missing={fig}>{figCopyLabel(alt)}</span>;
    const ratio = info!.width > 0 && info!.height > 0 ? `${info!.width} / ${info!.height}` : undefined;
    if (info!.mime === 'image/svg+xml') {
        // SVG 当 <img> 用不了 currentColor；改成 mask，颜色跟正文（夜间也跟着变）。mask 加载失败没有事件，靠 <img> 探一下
        return (
            <>
                <span className="guji-fig-img is-svg" role="img" aria-label={alt} data-fig={fig}
                    style={{ ['--guji-fig-src' as string]: `url("${src}")`, aspectRatio: ratio } as React.CSSProperties} />
                <img src={src} alt="" hidden onError={onFail} />
            </>
        );
    }
    return (
        <img className={`guji-fig-img${block ? ' is-block' : ''}`} src={src} alt={block ? alt : ''} data-fig={fig} data-raster="1"
            loading={block ? 'lazy' : undefined} decoding="async" draggable={false}
            style={ratio ? { aspectRatio: ratio } : undefined} onError={onFail} />
    );
}

/**
 * 一个图片格的 span（带 `data-char-id`，与普通格一样参与选区、悬停、点击）。
 * `cells`：本图连占几格（连续同 id 的格合成一张图，由首格画图、宽 `cells` 字）；`cont`：连占格里的后续格，不画图、不占宽。
 */
export function FigCell({ id, fig, info, figUrl, cells, cont, className, pageStart, children }: FigCommon & {
    id: string; cells: number; cont: boolean; className: string; pageStart?: number;
    /** 原字 □（透明保留） */
    children: React.ReactNode;
}) {
    const { t } = useI18n();
    const alt = info?.alt ?? '';
    const label = alt && alt !== t('reader.figPlain') ? t('reader.figLabel', { alt }) : t('reader.figPlain');
    const [failed, setFailed] = useState(false);
    const missing = failed || !figSrc(info, figUrl);
    return (
        <span
            data-char-id={id}
            data-page-start={pageStart}
            data-fig-copy={cont ? '' : figCopyLabel(info?.alt ?? '图形符号')}
            className={`${className} is-fig${cont ? ' is-fig-cont' : ''}${missing && !cont ? ' is-fig-missing' : ''}`}
            style={cont ? undefined : ({ ['--guji-fig-n' as string]: cells } as React.CSSProperties)}
            title={label}
            aria-label={label}
            role="img"
        >
            <span className="guji-fig-glyph">{children}</span>
            {!cont && <FigVisual fig={fig} info={info} figUrl={figUrl} failed={failed} onFail={() => setFailed(true)} />}
        </span>
    );
}

/** 插图块：占满正文栏，下附说明；点一下由宿主翻书影、标原框 */
export function FigBlock({ fig, info, figUrl, onClick }: FigCommon & { onClick?: () => void }) {
    const { t } = useI18n();
    const alt = info?.alt ?? '图形符号';
    const label = alt !== t('reader.figPlain') ? t('reader.figLabel', { alt }) : t('reader.figPlain');
    const [failed, setFailed] = useState(false);
    return (
        <figure className="guji-fig-block" data-fig-block={fig} data-fig-copy={figCopyLabel(alt)} title={label}
            onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
            <FigVisual fig={fig} info={info} figUrl={figUrl} block failed={failed} onFail={() => setFailed(true)} />
            <figcaption className="guji-fig-caption">{alt}</figcaption>
        </figure>
    );
}

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGURE', 'SECTION', 'DIV', 'LI']);

/**
 * 选区含图时的复制文字：把图（`[data-fig-copy]`）换成 `〔图：说明〕`，其余同浏览器原生（段间换行，`user-select: none` 的分叶线不带）。
 * 选区不含图返回 null，由浏览器照原样复制。
 */
export function copyTextWithFigures(range: Range): string | null {
    const frag = range.cloneContents();
    if (!frag.querySelector('[data-fig-copy]')) return null;
    let out = '';
    const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const walk = (n: Node) => {
        if (n.nodeType === 3) { out += n.nodeValue ?? ''; return; }
        if (n.nodeType !== 1 && n.nodeType !== 11) return;
        if (n.nodeType === 1) {
            const el = n as HTMLElement;
            if (el.classList.contains('guji-page-divider') || el.style.userSelect === 'none') return;
            const copy = el.getAttribute('data-fig-copy');
            if (copy !== null) {
                if (el.tagName === 'FIGURE') { nl(); out += copy; nl(); } else out += copy;
                return;
            }
            const block = BLOCK_TAGS.has(el.tagName);
            if (block) nl();
            el.childNodes.forEach(walk);
            if (block) nl();
            return;
        }
        n.childNodes.forEach(walk);
    };
    walk(frag);
    return out.replace(/\n+$/, '');
}
