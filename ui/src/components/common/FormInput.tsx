import React from 'react';

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
            color: 'var(--bim-desc-fg, #717171)',
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
                background: 'var(--bim-input-bg, #fff)',
                color: 'var(--bim-input-fg, #333)',
                border: '1px solid var(--bim-input-border, #ccc)',
                borderRadius: '2px',
                fontSize: '13px',
                boxSizing: 'border-box',
                outline: 'none',
            }}
        />
    </div>
);
