import React, { useContext, useMemo } from 'react';
import { LocaleContext } from './context';
import type { LocaleContextValue } from './context';
import { getSimplifiedConverter } from './simplified-converter';
import { normalizeVariants } from './variant-chars';
import type { Locale } from './types';

/** 阅读器内的字形偏好：原字（不转换，保留异体字）／通行繁体（异体字归一）／简体 */
export type ScriptMode = 'orig' | 'hant' | 'hans';

type Converter = (text: string) => string;

/**
 * 按字形偏好决定数据文字的转换函数（overview#514）。`null` 表示不转换。
 *
 * - `mode` 为空（用户没选过）：照站点繁简——简体站点走站点的简体转换，繁体站点不转（与改动前一致）；
 * - `orig`：一律不转，所见即底本；
 * - 站点是简体：一律简体（站点语言优先——阅读器外的开关把站点切到简体后，旧存档里的 hant 不该把简体站点显示成繁体）；
 * - 站点是繁体：`hant` 做异体字归一，其余（含旧存档里的 hans）不转。
 */
export function scriptConverter(mode: ScriptMode | null | undefined, locale: Locale, site: Converter | null): Converter | null {
    if (!mode) return site;
    if (mode === 'orig') return null;
    if (locale === 'zh-Hans') return site ?? getSimplifiedConverter();
    return mode === 'hant' ? normalizeVariants : site;
}

/**
 * 在子树内按字形偏好覆盖数据文字的转换函数；界面文字（t）、站点 locale 与切换函数都不动。
 * 阅读器里取数据文字的地方（useI18n／useConvert 的 convert）自动跟着变，不用逐处改。
 */
export const ScriptModeScope: React.FC<{ mode: ScriptMode | null | undefined; children: React.ReactNode }> = ({ mode, children }) => {
    const ctx = useContext(LocaleContext);
    const value = useMemo<LocaleContextValue | null>(() => {
        if (!ctx || !mode) return ctx;
        return { ...ctx, converter: scriptConverter(mode, ctx.locale, ctx.converter) };
    }, [ctx, mode]);
    // 始终包一层 Provider：mode 在 null 与具体值之间切换时子树形状不变，阅读器不会被整个卸载重挂（会丢掉设置面板与阅读位置）
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};
