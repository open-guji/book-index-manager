import React, { useContext } from 'react';
import { LocaleContext } from '../i18n/context';
import { bim } from '../styles/tokens';

export interface LocaleToggleProps {
    /** 自定义样式 */
    style?: React.CSSProperties;
}

/**
 * 繁简切换按钮。
 * 需要包裹在 LocaleProvider 内使用。
 */
export const LocaleToggle: React.FC<LocaleToggleProps> = ({ style }) => {
    const ctx = useContext(LocaleContext);
    if (!ctx) return null;

    const { locale, setLocale } = ctx;
    const isHant = locale === 'zh-Hant';

    const toggle = () => setLocale(isHant ? 'zh-Hans' : 'zh-Hant');

    return (
        <button
            type="button"
            onClick={toggle}
            title={isHant ? '切换为简体' : '切換為繁體'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '4px 10px',
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: 1,
                border: `1px solid ${bim('border')}`,
                borderRadius: '4px',
                background: bim('bg'),
                color: bim('fg'),
                cursor: 'pointer',
                userSelect: 'none',
                ...style,
            }}
        >
            <span style={{
                color: isHant ? bim('primary') : undefined,
                fontWeight: isHant ? 700 : 400,
            }}>繁</span>
            <span style={{ opacity: 0.3 }}>/</span>
            <span style={{
                color: !isHant ? bim('primary') : undefined,
                fontWeight: !isHant ? 700 : 400,
            }}>简</span>
        </button>
    );
};
