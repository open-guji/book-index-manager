import React, { useEffect, useState } from 'react';
import { useConvert } from '../i18n';
import { bim, type BimTokenName } from '../styles/tokens';
import {
    DEFAULT_THEME, THEMES, applyTheme, currentTheme, storeTheme, type ThemeName,
} from '../theme';

export interface ThemeToggleProps {
    /** 主题变了之后通知宿主（如同步 `<meta name="theme-color">`） */
    onChange?: (theme: ThemeName) => void;
    style?: React.CSSProperties;
}

const DOT: Record<ThemeName, BimTokenName> = { zhusha: 'theme-dot-zhusha', indigo: 'theme-dot-indigo' };

/**
 * 主题切换：两个色点（朱砂、靛蓝），单选语义，当前项外圈描边。
 * 首帧一律按默认渲染（与 SSR 一致），挂载后再读 <html> 上实际生效的主题
 * （宿主的首屏脚本在首帧前设好）。点选：写 <html>、写存储（失败则忽略）、通知宿主。
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ onChange, style }) => {
    const { convert } = useConvert();
    const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

    useEffect(() => { setTheme(currentTheme()); }, []);

    const choose = (t: ThemeName) => {
        setTheme(applyTheme(t));
        storeTheme(t);
        onChange?.(t);
    };

    return (
        <div role="radiogroup" aria-label={convert('主題')} style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
            {THEMES.map(t => {
                const on = theme === t.name;
                return (
                    <button
                        key={t.name}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={convert(t.label)}
                        title={convert(t.label)}
                        onClick={() => choose(t.name)}
                        style={{
                            width: 28, height: 44, padding: 0, border: 0, background: 'none', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box',
                                background: bim(DOT[t.name]),
                                boxShadow: on ? `0 0 0 2px ${bim('page-bg')}, 0 0 0 3.5px ${bim('aux-fg')}` : 'none',
                            }}
                        />
                    </button>
                );
            })}
        </div>
    );
};
