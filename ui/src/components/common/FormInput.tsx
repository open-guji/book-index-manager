import React from 'react';
import { bim } from '../../styles/tokens';

export interface FormInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export const FormInput: React.FC<FormInputProps> = ({ label, value, onChange, placeholder, disabled }) => (
    <div style={{ marginBottom: '16px' }}>
        <label style={{
            display: 'block',
            fontSize: '11px',
            color: bim('desc-fg'),
            marginBottom: '4px',
            fontWeight: 500,
        }}>
            {label}
        </label>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
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
