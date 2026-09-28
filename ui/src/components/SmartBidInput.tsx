import React, { useState, useRef, useEffect } from 'react';
import { Badge } from './common/Badge';
import { bim } from '../styles/tokens';

export interface SmartBidInputProps {
    /** 值格式: "[Name](bid:ID)" 或普通文本 */
    value: string;
    onChange: (value: string) => void;
    label: string;
}

/** 解析 [Name](bid:ID) 格式 */
function parseBidValue(value: string): { name: string; id: string } | null {
    const match = value.match(/^\[(.+?)\]\(bid:(.+?)\)$/);
    if (match) {
        return { name: match[1], id: match[2] };
    }
    return null;
}

export const SmartBidInput: React.FC<SmartBidInputProps> = ({ value, onChange, label }) => {
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const parsed = parseBidValue(value || '');

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    if (!isEditing && parsed) {
        return (
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{label}</label>
                <div
                    onClick={() => setIsEditing(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        border: `1px solid ${bim('input-border')}`,
                        borderRadius: '2px',
                        background: bim('input-bg'),
                        cursor: 'pointer',
                        minHeight: '30px',
                    }}
                >
                    <span style={{ fontWeight: 500, fontSize: '13px', color: bim('fg') }}>
                        {parsed.name}
                    </span>
                    <Badge>{parsed.id}</Badge>
                </div>
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>{label}</label>
            <input
                ref={inputRef}
                type="text"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onBlur={() => setIsEditing(false)}
                style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: bim('input-bg'),
                    color: bim('input-fg'),
                    border: `1px solid ${bim('input-border')}`,
                    borderRadius: '2px',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                }}
            />
        </div>
    );
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: bim('desc-fg'),
    marginBottom: '4px',
    fontWeight: 500,
};
