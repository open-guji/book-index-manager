import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { bim } from '../../styles/tokens';

export interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    placement?: 'top' | 'bottom';
    delayMs?: number;
    maxWidth?: number;
    /** Inline-block wrapper style overrides */
    wrapperStyle?: React.CSSProperties;
}

const ARROW_SIZE = 6;
const GAP = 7;

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    placement = 'top',
    delayMs = 100,
    maxWidth = 280,
    wrapperStyle,
}) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number; placement: 'top' | 'bottom' } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const tipRef = useRef<HTMLDivElement | null>(null);

    const computePosition = useCallback(() => {
        const anchor = wrapperRef.current;
        const tip = tipRef.current;
        if (!anchor || !tip) return;
        const a = anchor.getBoundingClientRect();
        const tRect = tip.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const viewportW = document.documentElement.clientWidth;
        let chosen: 'top' | 'bottom' = placement;
        if (placement === 'top' && a.top - tRect.height - GAP < 8) chosen = 'bottom';
        if (placement === 'bottom' && a.bottom + tRect.height + GAP > viewportH - 8) chosen = 'top';
        const top = chosen === 'top' ? a.top - tRect.height - GAP : a.bottom + GAP;
        let left = a.left + a.width / 2 - tRect.width / 2;
        left = Math.max(8, Math.min(left, viewportW - tRect.width - 8));
        setPos({ left, top, placement: chosen });
    }, [placement]);

    const show = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setVisible(true), delayMs);
    }, [delayMs]);

    const hide = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
        setPos(null);
    }, []);

    useEffect(() => {
        if (!visible) return;
        const raf = requestAnimationFrame(computePosition);
        return () => cancelAnimationFrame(raf);
    }, [visible, computePosition]);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    return (
        <>
            <span
                ref={wrapperRef}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                style={{ display: 'inline-block', ...wrapperStyle }}
            >
                {children}
            </span>
            {visible && createPortal(
                <div
                    ref={tipRef}
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: pos?.left ?? -9999,
                        top: pos?.top ?? -9999,
                        maxWidth,
                        padding: '6px 10px',
                        fontSize: '12px',
                        lineHeight: 1.5,
                        color: bim('fg'),
                        background: bim('input-bg'),
                        border: `1px solid ${bim('widget-border')}`,
                        borderRadius: '4px',
                        boxShadow: bim('shadow-tooltip'),
                        pointerEvents: 'none',
                        zIndex: 9999,
                        opacity: pos ? 1 : 0,
                        transition: 'opacity 80ms ease-out',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                    }}
                >
                    {content}
                    {pos && (
                        <>
                            {/* Border triangle (outer) */}
                            <span
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    marginLeft: -ARROW_SIZE,
                                    width: 0,
                                    height: 0,
                                    ...(pos.placement === 'top'
                                        ? {
                                            bottom: -ARROW_SIZE,
                                            borderTop: `${ARROW_SIZE}px solid ${bim('widget-border')}`,
                                            borderLeft: `${ARROW_SIZE}px solid transparent`,
                                            borderRight: `${ARROW_SIZE}px solid transparent`,
                                        }
                                        : {
                                            top: -ARROW_SIZE,
                                            borderBottom: `${ARROW_SIZE}px solid ${bim('widget-border')}`,
                                            borderLeft: `${ARROW_SIZE}px solid transparent`,
                                            borderRight: `${ARROW_SIZE}px solid transparent`,
                                        }),
                                }}
                            />
                            {/* Fill triangle (inner, 1px inset) */}
                            <span
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    marginLeft: -(ARROW_SIZE - 1),
                                    width: 0,
                                    height: 0,
                                    ...(pos.placement === 'top'
                                        ? {
                                            bottom: -(ARROW_SIZE - 1),
                                            borderTop: `${ARROW_SIZE - 1}px solid ${bim('input-bg')}`,
                                            borderLeft: `${ARROW_SIZE - 1}px solid transparent`,
                                            borderRight: `${ARROW_SIZE - 1}px solid transparent`,
                                        }
                                        : {
                                            top: -(ARROW_SIZE - 1),
                                            borderBottom: `${ARROW_SIZE - 1}px solid ${bim('input-bg')}`,
                                            borderLeft: `${ARROW_SIZE - 1}px solid transparent`,
                                            borderRight: `${ARROW_SIZE - 1}px solid transparent`,
                                        }),
                                }}
                            />
                        </>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
};
