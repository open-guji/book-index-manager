import React from 'react';
import { bim } from '../../styles/tokens';

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
        background: color || bim('primary-soft'),
        color: color ? bim('on-color-fg') : bim('fg'),
        ...style,
    }}>
        {children}
    </span>
);
