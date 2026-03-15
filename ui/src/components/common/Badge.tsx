import React from 'react';

export interface BadgeProps {
    children: React.ReactNode;
    color?: string;
    style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({ children, color, style }) => (
    <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 500,
        borderRadius: '4px',
        background: color || 'var(--bim-primary-soft, rgba(0,120,212,0.15))',
        color: color ? '#fff' : 'var(--bim-fg, #333)',
        ...style,
    }}>
        {children}
    </span>
);
