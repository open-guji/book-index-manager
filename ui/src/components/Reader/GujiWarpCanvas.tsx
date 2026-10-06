import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { StripWarpRenderer, StripTransform } from './StripWarpRenderer';
import { bim } from '../../styles/tokens';

export interface CharGeometry {
  id: string;
  slot: number;
  pos: number;
  char: string;
  bbox_col: [number, number, number, number]; // [x0, y0, x1, y1] in column local warped px
  sub?: string | null;
}

export interface ColumnGeometry {
  col: number;
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
}

export interface GujiWarpCanvasProps {
  imageUrl: string;
  pageData: PageWarpData;
  selectedCharIds: Set<string>;
  hoveredCharId?: string | null;
  preserveMargins?: boolean;
  onCharClick?: (charId: string) => void;
  onCharHover?: (charId: string | null) => void;
}

/** 书影图片缓存（按 URL）：预取与正式加载共用，翻回已看过的页不再请求、不再解码 */
const IMAGE_CACHE = new Map<string, Promise<HTMLImageElement | null>>();
const IMAGE_CACHE_MAX = 24;

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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const contentW = totalWarpedW + (banxin ? banxin.total_w : 0);
  const totalDisplayW = contentW + margins.left + margins.right;
  const totalDisplayH = maxWarpedH + margins.top + margins.bottom;

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
                srcQuad: [
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
  }, [imageUrl, pageData, banxin, totalDisplayW, totalDisplayH, totalWarpedW, maxWarpedH, contentW, margins, preserveMargins]);

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
    if (!imageUrl) return;
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
  }, [imageUrl]);

  // 加载对偶页图（版心互补）
  const mateUrl = banxin?.mate_image_url;
  useEffect(() => {
    if (!mateUrl) return;
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
  }, [mateUrl]);

  // 依赖变化时重新绘制
  useEffect(() => {
    draw();
  }, [draw, mainLoaded, mateLoaded]);

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
          x: margins.left + col.offset_x + x0,
          y: margins.top + y0,
          w: Math.max(x1 - x0, 1),
          h: Math.max(y1 - y0, 1),
        });
      }
    }
    return list;
  }, [pageData, margins]);

  return (
    <div
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
      <canvas
        ref={canvasRef}
        width={totalDisplayW}
        height={totalDisplayH}
        style={{
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
