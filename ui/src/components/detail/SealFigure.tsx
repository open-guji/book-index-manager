/**
 * 实体页印影图（GUJI-544）。图本体在 book-index-asset，经 `assetBase`（资源根）取：URL＝assetBase＋images[].file。
 *
 * - 没传 assetBase、没有 images、或 credit／license 缺失 → 不出图（宁缺勿滥；署名必须与图同显）
 * - `file` 含 `..`、以 `/` 开头或带协议 → 丢弃，防数据误填
 * - 加载中靠 aspect-ratio 占位（有 width/height 用真实比例，否则 1/1），SSR 直接出 <img>
 * - 首图 eager，其余缩略图 lazy；首图加载失败 → 整个 figure（含署名）卸载
 */
import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import type { EntityImage } from '../../types';

const THUMB_MAX = 8;

function safeFile(file: unknown): string | null {
    if (typeof file !== 'string' || !file) return null;
    if (file.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(file)) return null;
    if (file.split('/').some(seg => seg === '..')) return null;
    return file;
}

function usable(images: EntityImage[] | undefined): EntityImage[] {
    return (images || [])
        .filter(im => safeFile(im?.file) && im.credit?.trim() && im.license?.trim())
        .slice(0, THUMB_MAX);
}

export function SealFigure({ images, assetBase, name }: {
    images?: EntityImage[];
    assetBase?: string;
    name: string;
}) {
    const { t, convert } = useI18n();
    const [active, setActive] = useState(0);
    const [failed, setFailed] = useState(false);
    const list = assetBase ? usable(images) : [];
    if (!assetBase || failed || list.length === 0) return null;

    const base = assetBase.endsWith('/') ? assetBase : assetBase + '/';
    const cur = list[Math.min(active, list.length - 1)];
    const ar = cur.width && cur.height && cur.width > 0 && cur.height > 0
        ? `${cur.width} / ${cur.height}` : undefined;
    const src = (im: EntityImage) => base + safeFile(im.file)!.split('/').map(encodeURIComponent).join('/');

    return (
        <figure className="bim-d-seal bim-d-ui">
            <img
                key={cur.file}
                className="bim-d-seal-main"
                src={src(cur)}
                alt={t('entityPage.sealAlt', { name }) + (list.length > 1 ? ` ${active + 1}` : '')}
                style={ar ? { ['--seal-ar' as string]: ar } as React.CSSProperties : undefined}
                width={cur.width}
                height={cur.height}
                decoding="async"
                fetchPriority="high"
                onError={() => setFailed(true)}
            />
            {list.length > 1 && (
                <div className="bim-d-seal-thumbs">
                    {list.map((im, i) => (
                        <button key={im.file} type="button" aria-pressed={i === active}
                            aria-label={`${t('entityPage.sealAlt', { name })} ${i + 1}`}
                            onClick={() => setActive(i)}>
                            <img src={src(im)} alt="" loading="lazy" decoding="async" />
                        </button>
                    ))}
                </div>
            )}
            <figcaption>
                {t('entityPage.imgCredit', { credit: convert(cur.credit!) })}
                {' · '}{t('entityPage.imgLicense', { license: convert(cur.license!) })}
                {cur.source_url && /^https?:\/\//i.test(cur.source_url) && (
                    <>{' · '}<a href={cur.source_url} target="_blank" rel="noopener noreferrer nofollow">{t('entityPage.imgSource')}</a></>
                )}
                {cur.note && <>{' · '}{convert(cur.note)}</>}
            </figcaption>
        </figure>
    );
}
