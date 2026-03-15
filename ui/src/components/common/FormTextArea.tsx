import React, { useEffect, useRef } from 'react';

export interface FormTextAreaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export const FormTextArea: React.FC<FormTextAreaProps> = ({ value, onChange, placeholder }) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = `${ref.current.scrollHeight}px`;
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
                width: '100%',
                minHeight: '40px',
                resize: 'none',
                overflow: 'hidden',
                background: 'var(--bim-input-bg, #fff)',
                color: 'var(--bim-input-fg, #333)',
                border: '1px solid var(--bim-input-border, #ccc)',
                borderRadius: '2px',
                padding: '8px',
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: '1.4',
                outline: 'none',
                boxSizing: 'border-box',
                display: 'block',
            }}
        />
    );
};
