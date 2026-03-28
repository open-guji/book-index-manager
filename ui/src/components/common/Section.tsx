import React from 'react';
import { useT } from '../../i18n';

export interface SectionProps {
    title: string;
    /** 保存按钮回调 */
    onSave?: () => void;
    /** AI 按钮回调（不传则不显示） */
    onAskAI?: () => void;
    /** 额外的操作按钮 */
    extraButtons?: React.ReactNode;
    children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, onSave, onAskAI, extraButtons, children }) => {
    const t = useT();

    return (
        <div style={{
            background: 'var(--bim-bg, #fff)',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '12px',
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
            }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--bim-fg, #333)' }}>{title}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {extraButtons}
                    {onAskAI && (
                        <button onClick={onAskAI} style={secondaryBtnStyle}>AI</button>
                    )}
                    {onSave && (
                        <button onClick={onSave} style={primaryBtnStyle}>{t.action.save}</button>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
};

const primaryBtnStyle: React.CSSProperties = {
    padding: '4px 12px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '4px',
    background: 'var(--bim-primary, #0078d4)',
    color: 'var(--bim-primary-fg, #fff)',
    cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
    padding: '4px 12px',
    fontSize: '12px',
    border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--bim-fg, #333)',
    cursor: 'pointer',
};
