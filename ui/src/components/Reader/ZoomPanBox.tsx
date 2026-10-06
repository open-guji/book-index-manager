import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ZOOM_IDENTITY, ZoomView, clampView, panBy, wheelFactor, zoomAt } from './zoom-pan';

export interface ZoomPanHandle {
    zoomBy(factor: number): void;
    reset(): void;
}

export interface ZoomPanBoxProps {
    children: React.ReactNode;
    /** 倍数变化（1＝原样）；宿主用来显示百分比、放大后换原图档 */
    onScaleChange?: (s: number) => void;
    /** 换了这个值就复位（如翻页） */
    resetKey?: string | number;
    style?: React.CSSProperties;
}

/** 超过这个距离（容器像素）才算拖动，不算点击 */
const DRAG_THRESHOLD = 4;

/**
 * 书影缩放平移容器：滚轮以指针为锚缩放（1–6 倍）、触控板捏合（ctrl＋wheel）、双指捏合、放大后拖动平移、双击复位。
 * 变换施加在内层一个 div 上，canvas 与叠在上面的字框 SVG 同在其中，所以高亮层自动同步；
 * 拖动结束时的那一下 click 在捕获阶段吞掉，不会触发「点字框选字」。
 */
export const ZoomPanBox = forwardRef<ZoomPanHandle, ZoomPanBoxProps>(function ZoomPanBox({ children, onScaleChange, resetKey, style }, ref) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [view, setViewState] = useState<ZoomView>(ZOOM_IDENTITY);
    const viewRef = useRef(view);
    const cbRef = useRef(onScaleChange);
    cbRef.current = onScaleChange;

    const setView = (v: ZoomView) => {
        const prev = viewRef.current;
        viewRef.current = v;
        setViewState(v);
        if (v.s !== prev.s) cbRef.current?.(v.s);
    };
    const size = () => {
        const r = boxRef.current?.getBoundingClientRect();
        return { w: r?.width ?? 0, h: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0 };
    };

    useImperativeHandle(ref, () => ({
        zoomBy(factor) {
            const { w, h } = size();
            setView(zoomAt(viewRef.current, w / 2, h / 2, factor, w, h));
        },
        reset() { setView(ZOOM_IDENTITY); },
    }));

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setView(ZOOM_IDENTITY); }, [resetKey]);

    // 容器尺寸变了（窗口缩放）时重新夹一次，免得内容漏边
    useEffect(() => {
        const el = boxRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            const { w, h } = size();
            const c = clampView(viewRef.current, w, h);
            if (c.x !== viewRef.current.x || c.y !== viewRef.current.y) setView(c);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 滚轮要 preventDefault，React 的 onWheel 是被动监听，只能挂原生的
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const factor = wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey);
            // 已是 1 倍还往缩小方向滚：不拦，让页面照常滚动
            if (viewRef.current.s <= 1 && factor < 1) return;
            e.preventDefault();
            const { w, h, left, top } = size();
            setView(zoomAt(viewRef.current, e.clientX - left, e.clientY - top, factor, w, h));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef({ dragging: false, moved: 0, pinchDist: 0, swallowClick: false });

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current;
        g.swallowClick = false;
        if (pointers.current.size === 1) { g.moved = 0; g.dragging = false; }
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
            g.moved = DRAG_THRESHOLD + 1;
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, cur);
        const g = gesture.current;
        const { w, h, left, top } = size();
        if (pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (g.pinchDist > 0 && dist > 0) {
                const mx = (a.x + b.x) / 2 - left, my = (a.y + b.y) / 2 - top;
                setView(zoomAt(viewRef.current, mx, my, dist / g.pinchDist, w, h));
            }
            g.pinchDist = dist;
            g.swallowClick = true;
            return;
        }
        const dx = cur.x - prev.x, dy = cur.y - prev.y;
        g.moved += Math.abs(dx) + Math.abs(dy);
        if (g.moved <= DRAG_THRESHOLD) return;
        if (!g.dragging) {
            g.dragging = true;
            try { boxRef.current?.setPointerCapture(e.pointerId); } catch { /* 合成事件没有活动指针 */ }
        }
        g.swallowClick = true;
        if (viewRef.current.s > 1) setView(panBy(viewRef.current, dx, dy, w, h));
    };

    const onPointerEnd = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        const g = gesture.current;
        g.pinchDist = 0;
        if (pointers.current.size === 0) g.dragging = false;
    };

    return (
        <div
            ref={boxRef}
            className="bim-zp"
            data-zoom={view.s.toFixed(2)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClickCapture={e => {
                if (gesture.current.swallowClick) {
                    gesture.current.swallowClick = false;
                    e.stopPropagation();
                    e.preventDefault();
                }
            }}
            onDoubleClick={() => setView(ZOOM_IDENTITY)}
            style={{
                position: 'relative', overflow: 'hidden', touchAction: 'none',
                cursor: view.s > 1 ? 'grab' : undefined,
                ...style,
            }}
        >
            <div
                className="bim-zp-inner"
                style={{
                    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transformOrigin: '0 0',
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
                    willChange: view.s > 1 ? 'transform' : undefined,
                }}
            >
                {children}
            </div>
        </div>
    );
});
