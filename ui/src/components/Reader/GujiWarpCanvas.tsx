import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { StripWarpRenderer, StripTransform } from './StripWarpRenderer';
import { bim } from '../../styles/tokens';

export interface CharGeometry {
  id: string;
  slot: number;
  pos: number;
  char: string;
  bbox_col: [number, number, number, number]; // [x0, y0, x1, y1] in column local warped px
  sub?: string | null;
  /** char 的格字段（guji-format spec/02 §4.4），缺省＝不带 */
  lane?: 'main' | 'solo' | 'jz_r' | 'jz_l';
  lacuna?: boolean;
  /** 阙文格的推测字（char v0.2 `guess_c`，spec/02 §4.6），只在 `lacuna` 时有 */
  guess_c?: string;
  guess?: boolean;
  zi?: string;
  /** 规范层（norm.json）：人审过的通行字，恰好一个字；缺省＝该位没有逐位规范（overview#525） */
  norm?: string;
  /** 图片格（char v0.3 `fig`，spec/02 §4.7）：值是同章 fig.json 里的图 id；`char` 是 `□` */
  fig?: string;
}

export interface ColumnGeometry {
  col: number;
  /** 列类别与版式字段（spec/02 §4.3）：空列 `blank`、抬头格数、行首空格数；缺省＝正文列、0、0 */
  kind?: 'body' | 'banxin' | 'blank' | 'figure';
  /** 图列（`kind: 'figure'`，插图块）：占几列、图 id、cord 里的框 `[x0,y0,x1,y1]` */
  span?: number;
  fig?: string;
  figBox?: [number, number, number, number];
  raised?: number;
  lead_blank?: number;
  warped_w: number;
  warped_h: number;
  offset_x: number;
  strips: StripTransform[];
  chars: CharGeometry[];
}

export interface BanxinData {
  half_w: number;
  total_w: number;
  h: number;
  current_page_strips: StripTransform[];
  mate_page_strips: StripTransform[];
  mate_img_size: [number, number];
  mate_image_url: string;
}

export interface PageWarpData {
  page_id: string;
  title: string;
  image_size: [number, number]; // [width, height]
  total_warped_w: number;
  columns: ColumnGeometry[];
  banxin?: BanxinData;
  /** 本页的插图块（图列，char v0.3）：书影栏画虚线框。`box` 是 cord `marks.figure` 的框 `[x0,y0,x1,y1]`，canvas 像素 */
  figBlocks?: { id: string; box: [number, number, number, number] }[];
  /** 本章声明了规范层（norm_file，哪怕是空表）＝自校文本，「原字」档可选；缺省＝外来文本，原字档置灰（overview#540） */
  hasNorm?: boolean;
}

/**
 * 去空白时「整幅原图」页（逐字坐标新数据：没有透视 strip，整张书影铺满画布）的裁切区：
 * 所有字框的外接矩形，四周各留 3%（按短边算）。有透视 strip 的页走原来的版心裁切，这里返回 null；
 * 没有字框、框退化、或几乎没裁掉东西（≥98%）也返回 null（保持整图）。
 */
export function fullImageTrimRect(pageData: PageWarpData): { x: number; y: number; w: number; h: number } | null {
  const [W, H] = pageData.image_size || [0, 0];
  if (!(W > 0) || !(H > 0)) return null;
  if (pageData.columns.some((c) => (c.strips?.length ?? 0) > 0)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const col of pageData.columns) {
    for (const ch of col.chars) {
      const [a, b, c, d] = ch.bbox_col;
      if (![a, b, c, d].every(Number.isFinite) || !(c > a) || !(d > b)) continue;
      x0 = Math.min(x0, col.offset_x + a); y0 = Math.min(y0, b);
      x1 = Math.max(x1, col.offset_x + c); y1 = Math.max(y1, d);
    }
  }
  // 插图块（图列）的框也在内：不然只画图的区域会被裁掉
  for (const b of pageData.figBlocks ?? []) {
    const [a, c, d, e] = b.box;
    if (![a, c, d, e].every(Number.isFinite) || !(d > a) || !(e > c)) continue;
    x0 = Math.min(x0, a); y0 = Math.min(y0, c);
    x1 = Math.max(x1, d); y1 = Math.max(y1, e);
  }
  if (!(x1 > x0) || !(y1 > y0)) return null;
  const pad = Math.min(W, H) * 0.03;
  const x = Math.min(W, Math.max(0, x0 - pad)), y = Math.min(H, Math.max(0, y0 - pad));
  const w = Math.min(W, Math.max(0, x1 + pad)) - x, h = Math.min(H, Math.max(0, y1 + pad)) - y;
  if (!(w > 0) || !(h > 0)) return null;
  if (w >= W * 0.98 && h >= H * 0.98) return null;
  return { x, y, w, h };
}

export interface GujiWarpCanvasProps {
  imageUrl: string;
  pageData: PageWarpData;
  selectedCharIds: Set<string>;
  hoveredCharId?: string | null;
  preserveMargins?: boolean;
  onCharClick?: (charId: string) => void;
  onCharHover?: (charId: string | null) => void;
  /** 当前选中的插图块（图 id，点正文里的插图块选中）：实线加重显示 */
  selectedFigBlock?: string | null;
  /** 点书影栏上的插图块虚线框 */
  onFigBlockClick?: (figId: string) => void;
  /** 外层 CSS 缩放倍数（如 ZoomPanBox 的放大倍数）：放大时画布后备跟着加密，不糊；缺省 1 */
  renderScale?: number;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 外框占位图：一张按逻辑尺寸声明宽高的空 SVG，固有尺寸与原先的整幅画布相同 */
function sizerSrc(w: number, h: number): string {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"/>`)}`;
}

/** 缩放倍数取整到几档，缩放过程中不至于每一帧都重开画布 */
const SCALE_STEPS = [1, 1.5, 2, 3, 4, 6];
function stepScale(s: number): number {
  for (const v of SCALE_STEPS) if (s <= v) return v;
  return SCALE_STEPS[SCALE_STEPS.length - 1];
}

/**
 * 画布后备尺寸：按显示宽度 × 设备像素比（最多 2）× 缩放档开，不超过逻辑尺寸（原图像素）。
 * 原先直接按原图像素开（2345×3122），桌面只显示 441×587，每次重画多出约 28 倍像素，是滚动掉帧的主因（GUJI-629）。
 * `cssW` 为 null（还没量到）或 0（画布被隐藏，如手机端书影栏收起）时给 1×1，不占显存。
 */
export function backingSize(logicalW: number, logicalH: number, cssW: number | null, dpr: number, renderScale = 1): [number, number] {
  if (!(logicalW > 0) || !(logicalH > 0)) return [1, 1];
  if (cssW === null || !(cssW > 0)) return [1, 1];
  const want = Math.ceil((cssW * Math.min(Math.max(dpr || 1, 1), 2) * stepScale(renderScale)) / 64) * 64;
  const w = Math.max(1, Math.min(Math.round(logicalW), want));
  const h = Math.max(1, Math.round((w * logicalH) / logicalW));
  return [w, h];
}

/** 书影图片缓存（按 URL）：预取与正式加载共用，翻回已看过的页不再请求、不再解码 */
const IMAGE_CACHE = new Map<string, Promise<HTMLImageElement | null>>();
// 每张解码后约 8MB（1200×1600 RGBA）；24 张在手机上近 200MB，收到 8 张（GUJI-629）
const IMAGE_CACHE_MAX = 8;

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = IMAGE_CACHE.get(url);
  if (p) {
    IMAGE_CACHE.delete(url); // 刷新到最近使用
    IMAGE_CACHE.set(url, p);
    return p;
  }
  p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 提前解码，贴纹理时不用再等
      (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve(img));
    };
    img.onerror = () => { IMAGE_CACHE.delete(url); resolve(null); };
    img.src = url;
  });
  IMAGE_CACHE.set(url, p);
  while (IMAGE_CACHE.size > IMAGE_CACHE_MAX) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value as string);
  return p;
}

export const GujiWarpCanvas: React.FC<GujiWarpCanvasProps> = ({
  imageUrl,
  pageData,
  selectedCharIds,
  hoveredCharId,
  preserveMargins = false,
  onCharClick,
  onCharHover,
  selectedFigBlock,
  onFigBlockClick,
  renderScale = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // 画布外框的显示宽度：null＝还没量到；0＝被隐藏。没有 ResizeObserver 的环境（jsdom）按「可见、满尺寸」走旧行为
  const hasRO = typeof ResizeObserver !== 'undefined';
  const [cssW, setCssW] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1]?.contentRect.width ?? 0;
      setCssW((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 不可见时不下图、不建纹理、不画；变可见再补
  const visible = !hasRO || (cssW !== null && cssW > 0);
  const rendererRef = useRef<StripWarpRenderer | null>(null);

  // 纹理缓存
  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const mateImgRef = useRef<HTMLImageElement | null>(null);
  const mainTextureRef = useRef<WebGLTexture | null>(null);
  const mateTextureRef = useRef<WebGLTexture | null>(null);

  const [mainLoaded, setMainLoaded] = useState(0);
  const [mateLoaded, setMateLoaded] = useState(0);
  // 当前主纹理对应哪张图；图换了而新纹理还没到时 draw() 不动画布
  const loadedMainUrl = useRef('');

  const maxWarpedH = useMemo(() => {
    return Math.max(...pageData.columns.map((c) => c.warped_h), 2440);
  }, [pageData]);

  const totalWarpedW = pageData.total_warped_w;
  const banxin = pageData.banxin;

  // 边距计算（支持去空白模式 vs 保留空白模式）
  const margins = useMemo(() => {
    if (!preserveMargins) {
      return { top: 0, bottom: 0, left: 0, right: 0 };
    }
    const [imgW, imgH] = pageData.image_size || [2386, 3082];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const col of pageData.columns) {
      for (const strip of (col.strips || [])) {
        for (const pt of strip.srcQuad) {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
      }
    }

    if (pageData.banxin?.current_page_strips) {
      for (const strip of pageData.banxin.current_page_strips) {
        for (const pt of strip.srcQuad) {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
      }
    }

    if (!isFinite(minX)) minX = 0;
    if (!isFinite(maxX)) maxX = imgW;
    if (!isFinite(minY)) minY = 0;
    if (!isFinite(maxY)) maxY = imgH;

    return {
      top: Math.max(0, Math.round(minY)),
      bottom: Math.max(0, Math.round(imgH - maxY)),
      left: Math.max(0, Math.round(minX)),
      right: Math.max(0, Math.round(imgW - maxX)),
      rawMinX: minX,
      rawMaxX: maxX,
      rawMinY: minY,
      rawMaxY: maxY,
      imgW,
      imgH,
    };
  }, [pageData, preserveMargins]);

  // 整幅原图页（无透视 strip）去空白：画布只取版心那一块（保留空白时整图）
  const crop = useMemo(() => (preserveMargins ? null : fullImageTrimRect(pageData)), [pageData, preserveMargins]);

  const contentW = totalWarpedW + (banxin ? banxin.total_w : 0);
  const totalDisplayW = crop ? crop.w : contentW + margins.left + margins.right;
  const totalDisplayH = crop ? crop.h : maxWarpedH + margins.top + margins.bottom;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const [backingW, backingH] = hasRO
    ? backingSize(totalDisplayW, totalDisplayH, cssW, dpr, renderScale)
    : [Math.round(totalDisplayW), Math.round(totalDisplayH)];

  // 统一绘制函数 (单 Context 纯净渲染，杜绝多 Context 驱动冲突与黑屏)
  const draw = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !canvasRef.current) return;
    if (imageUrl && loadedMainUrl.current !== imageUrl) return;

    // 清屏，暖纸底色
    renderer.clear(totalDisplayW, totalDisplayH);

    // 1. 若保留空白，绘制四周真实纸张留白（天头、地脚、切口、右边）
    if (preserveMargins && margins.rawMinX !== undefined && mainTextureRef.current && mainImgRef.current) {
      const { rawMinX, rawMaxX, rawMinY, rawMaxY, imgW, imgH, top, bottom, left, right } = margins;
      const marginStrips: { colOffsetX: number; colOffsetY?: number; strip: StripTransform }[] = [];

      // 左侧空白 (切口/书叶外缘)
      if (left > 0) {
        marginStrips.push({
          colOffsetX: 0,
          colOffsetY: 0,
          strip: {
            srcQuad: [
              [0, 0],
              [rawMinX, 0],
              [rawMinX, imgH],
              [0, imgH],
            ],
            dstRect: [0, 0, left, totalDisplayH],
          },
        });
      }

      // 天头 (上栏线上方天头及眉批)
      if (top > 0) {
        marginStrips.push({
          colOffsetX: left,
          colOffsetY: 0,
          strip: {
            srcQuad: [
              [rawMinX, 0],
              [rawMaxX, 0],
              [rawMaxX, rawMinY],
              [rawMinX, rawMinY],
            ],
            dstRect: [0, 0, contentW, top],
          },
        });
      }

      // 地脚 (下栏线下方空白)
      if (bottom > 0) {
        marginStrips.push({
          colOffsetX: left,
          colOffsetY: top + maxWarpedH,
          strip: {
            srcQuad: [
              [rawMinX, rawMaxY],
              [rawMaxX, rawMaxY],
              [rawMaxX, imgH],
              [rawMinX, imgH],
            ],
            dstRect: [0, 0, contentW, bottom],
          },
        });
      }

      // 右侧空白 (版心右侧/对偶叶边缘)
      if (right > 0) {
        marginStrips.push({
          colOffsetX: left + contentW,
          colOffsetY: 0,
          strip: {
            srcQuad: [
              [rawMaxX, 0],
              [imgW, 0],
              [imgW, imgH],
              [rawMaxX, imgH],
            ],
            dstRect: [0, 0, right, totalDisplayH],
          },
        });
      }

      renderer.renderStripsWithTexture(
        mainTextureRef.current,
        totalDisplayW,
        totalDisplayH,
        pageData.image_size[0],
        pageData.image_size[1],
        marginStrips,
        1.0
      );
    }

    // 2. 绘制正文 9 列 (若主图就绪)
    if (mainTextureRef.current && mainImgRef.current) {
      const colStrips = pageData.columns.flatMap((col) =>
        (col.strips || []).map((s) => ({
          colOffsetX: margins.left + col.offset_x,
          colOffsetY: margins.top,
          strip: s,
        }))
      );
      if (colStrips.length > 0) {
        renderer.renderStripsWithTexture(
          mainTextureRef.current,
          totalDisplayW,
          totalDisplayH,
          pageData.image_size[0],
          pageData.image_size[1],
          colStrips,
          1.0
        );
      } else {
        // 无细分透视 strip 时，整幅原图自适应完整投影绘制
        renderer.renderStripsWithTexture(
          mainTextureRef.current,
          totalDisplayW,
          totalDisplayH,
          pageData.image_size[0],
          pageData.image_size[1],
          [
            {
              colOffsetX: 0,
              colOffsetY: 0,
              strip: {
                srcQuad: crop
                  ? [
                    [crop.x, crop.y],
                    [crop.x + crop.w, crop.y],
                    [crop.x + crop.w, crop.y + crop.h],
                    [crop.x, crop.y + crop.h],
                  ]
                  : [
                  [0, 0],
                  [pageData.image_size[0], 0],
                  [pageData.image_size[0], pageData.image_size[1]],
                  [0, pageData.image_size[1]],
                ],
                dstRect: [0, 0, totalDisplayW, totalDisplayH],
              },
            },
          ],
          1.0
        );
      }

      // 3. 绘制本文（第10页）半版心：位于第1列右侧 (offset = totalWarpedW)，100% 不透明
      if (banxin && banxin.current_page_strips.length > 0) {
        const curBanxinStrips = banxin.current_page_strips.map((s) => ({
          colOffsetX: margins.left + totalWarpedW,
          colOffsetY: margins.top,
          strip: s,
        }));
        renderer.renderStripsWithTexture(
          mainTextureRef.current,
          totalDisplayW,
          totalDisplayH,
          pageData.image_size[0],
          pageData.image_size[1],
          curBanxinStrips,
          1.0
        );
      }
    }

    // 4. 绘制对偶页（第9页）半版心：紧邻本文版心右侧 (offset = totalWarpedW + half_w)，65% 半透明互补
    if (banxin && mateTextureRef.current && mateImgRef.current && banxin.mate_page_strips.length > 0) {
      const mateBanxinStrips = banxin.mate_page_strips.map((s) => ({
        colOffsetX: margins.left + totalWarpedW + banxin.half_w,
        colOffsetY: margins.top,
        strip: s,
      }));
      renderer.renderStripsWithTexture(
        mateTextureRef.current,
        totalDisplayW,
        totalDisplayH,
        banxin.mate_img_size[0],
        banxin.mate_img_size[1],
        mateBanxinStrips,
        0.65
      );
    }
  }, [imageUrl, pageData, banxin, totalDisplayW, totalDisplayH, totalWarpedW, maxWarpedH, contentW, margins, preserveMargins, crop]);

  // 初始化单一 WebGL 渲染器：只在挂载时建一次。翻页时只换纹理、重画，不销毁 context（原先每翻一页重建一次，是卡顿主因之一）
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setup = (r: StripWarpRenderer) => {
      mainTextureRef.current = mainImgRef.current ? r.createTexture(mainImgRef.current) : null;
      mateTextureRef.current = mateImgRef.current ? r.createTexture(mateImgRef.current) : null;
      drawRef.current();
    };

    try {
      const renderer = new StripWarpRenderer(canvas);
      rendererRef.current = renderer;
      setup(renderer);
    } catch (e) {
      console.error('Failed to init WebGL renderer:', e);
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL context lost');
    };
    const handleContextRestored = () => {
      console.info('WebGL context restored, re-initializing...');
      if (canvasRef.current) {
        rendererRef.current = new StripWarpRenderer(canvasRef.current);
        setup(rendererRef.current);
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      if (rendererRef.current) {
        rendererRef.current.deleteTexture(mainTextureRef.current);
        rendererRef.current.deleteTexture(mateTextureRef.current);
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []);

  // 加载主图（本文）：走共用的图片缓存；新图没到之前不重画，继续显示上一页，免得闪空白
  useEffect(() => {
    if (!imageUrl || !visible) return;
    let active = true;
    loadImage(imageUrl).then((img) => {
      if (!active || !img) return;
      mainImgRef.current = img;
      loadedMainUrl.current = imageUrl;
      const r = rendererRef.current;
      if (r) {
        r.deleteTexture(mainTextureRef.current);
        mainTextureRef.current = r.createTexture(img);
      }
      setMainLoaded((n) => n + 1);
    });
    return () => { active = false; };
  }, [imageUrl, visible]);

  // 加载对偶页图（版心互补）
  const mateUrl = banxin?.mate_image_url;
  useEffect(() => {
    if (!mateUrl || !visible) return;
    let active = true;
    loadImage(mateUrl).then((img) => {
      if (!active || !img) return;
      mateImgRef.current = img;
      const r = rendererRef.current;
      if (r) {
        r.deleteTexture(mateTextureRef.current);
        mateTextureRef.current = r.createTexture(img);
      }
      setMateLoaded((n) => n + 1);
    });
    return () => { active = false; };
  }, [mateUrl, visible]);

  // 依赖变化时重新绘制。后备尺寸一变画布就被清空，要在同一帧里补画（layout effect），免得闪一下底色
  useIsoLayoutEffect(() => {
    if (visible) draw();
  }, [draw, mainLoaded, mateLoaded, backingW, backingH, visible]);

  // 插图块虚线框（canvas 像素 → 与字格同一坐标系）
  const figBlockRects = useMemo(() => (pageData.figBlocks ?? []).map((b) => {
    const [x0, y0, x1, y1] = b.box;
    return { id: b.id, x: margins.left + x0 - (crop?.x ?? 0), y: margins.top + y0 - (crop?.y ?? 0), w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1) };
  }), [pageData, margins, crop]);

  // 扁平字格列表
  const flatChars = useMemo(() => {
    const list: {
      id: string;
      char: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];

    for (const col of pageData.columns) {
      for (const ch of col.chars) {
        const [x0, y0, x1, y1] = ch.bbox_col;
        list.push({
          id: ch.id,
          char: ch.char,
          x: margins.left + col.offset_x + x0 - (crop?.x ?? 0),
          y: margins.top + y0 - (crop?.y ?? 0),
          w: Math.max(x1 - x0, 1),
          h: Math.max(y1 - y0, 1),
        });
      }
    }
    return list;
  }, [pageData, margins, crop]);

  return (
    <div
      ref={wrapperRef}
      className="guji-warp-wrapper"
      style={{
        position: 'relative',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: `${totalDisplayW} / ${totalDisplayH}`,
        backgroundColor: bim('warp-bg'),
        boxShadow: bim('warp-box-shadow'),
        borderRadius: '3px',
        overflow: 'hidden',
        margin: '0 auto',
      }}
    >
      {/* 唯一的全功能 WebGL 画布 (覆盖四周留白 + 正文 9 列 + 本文版心 + 对偶页半透明版心) */}
      {/* 占位：按逻辑尺寸（原图像素）撑开外框，排版与原先「画布按原图像素开」时一致；
          画布后备改按显示尺寸开以后，不能再让画布自己的像素尺寸决定外框大小（否则外框跟着缩成后备那么小） */}
      <img
        alt=""
        aria-hidden="true"
        data-warp-sizer=""
        src={sizerSrc(totalDisplayW, totalDisplayH)}
        style={{ display: 'block', width: '100%', height: '100%', visibility: 'hidden' }}
      />
      <canvas
        ref={canvasRef}
        width={backingW}
        height={backingH}
        data-logical-size={`${Math.floor(totalDisplayW)}x${Math.floor(totalDisplayH)}`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          backgroundColor: bim('warp-bg'),
        }}
      />

      {/* 覆盖高亮与古籍规制标线层 (与 Canvas 共享 100% 相同坐标系) */}
      <svg
        viewBox={`0 0 ${totalDisplayW} ${totalDisplayH}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {/* 1. 字格高亮与点击响应 */}
        {flatChars.map((item) => {
          const isSelected = selectedCharIds.has(item.id);
          const isHovered = hoveredCharId === item.id;

          return (
            <rect
              key={item.id}
              data-selected={isSelected ? 'true' : undefined}
              x={item.x}
              y={item.y}
              width={item.w}
              height={item.h}
              fill={
                isSelected
                  ? bim('warp-sel-bg')
                  : isHovered
                  ? bim('warp-hover-bg')
                  : 'transparent'
              }
              stroke={
                isSelected
                  ? bim('warp-sel-stroke')
                  : isHovered
                  ? bim('warp-hover-stroke')
                  : 'transparent'
              }
              strokeWidth={isSelected ? 3.5 : isHovered ? 2 : 0}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => onCharClick?.(item.id)}
              onMouseEnter={() => onCharHover?.(item.id)}
              onMouseLeave={() => onCharHover?.(null)}
            >
              <title>{item.char}</title>
            </rect>
          );
        })}

        {/* 1b. 插图块：虚线框，点一下选中（正文里对应的插图块不滚动，只在书影上标出） */}
        {figBlockRects.map((b) => {
          const on = selectedFigBlock === b.id;
          return (
            <rect
              key={`fig-${b.id}`}
              data-fig-block={b.id}
              data-selected={on ? 'true' : undefined}
              x={b.x} y={b.y} width={b.w} height={b.h}
              fill={on ? bim('warp-sel-bg') : 'transparent'}
              stroke={on ? bim('warp-sel-stroke') : bim('warp-hover-stroke')}
              strokeWidth={on ? 3.5 : 2}
              strokeDasharray={on ? undefined : '10 8'}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => onFigBlockClick?.(b.id)}
            >
              <title>{b.id}</title>
            </rect>
          );
        })}

        {/* 2. 版心分界线与中缝标示 */}
        {banxin && (
          <g>
            {/* 正文第1列与本文版心界栏 */}
            <line
              x1={margins.left + totalWarpedW}
              y1={margins.top}
              x2={margins.left + totalWarpedW}
              y2={margins.top + maxWarpedH}
              stroke={bim('warp-banxin-border')}
              strokeWidth={1.5}
            />
            {/* 中缝对折线 (鱼尾交汇处) */}
            <line
              x1={margins.left + totalWarpedW + banxin.half_w}
              y1={margins.top}
              x2={margins.left + totalWarpedW + banxin.half_w}
              y2={margins.top + maxWarpedH}
              stroke={bim('warp-banxin-fold')}
              strokeWidth={1.5}
              strokeDasharray="8 6"
            />
            {/* 对偶版心最右侧外界 */}
            <line
              x1={margins.left + contentW}
              y1={margins.top}
              x2={margins.left + contentW}
              y2={margins.top + maxWarpedH}
              stroke={bim('warp-banxin-outer')}
              strokeWidth={1}
            />
          </g>
        )}
      </svg>
    </div>
  );
};
