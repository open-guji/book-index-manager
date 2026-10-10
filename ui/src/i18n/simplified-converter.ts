import { Converter } from 'opencc-js/t2cn';
import { withProtectedTerms } from './protected-terms';
import { normalizeVariants } from './variant-chars';

let cached: ((text: string) => string) | null = null;

/**
 * 内置的繁→简转换函数（异体字归一 + opencc-js t2cn + PROTECTED_TERMS 保护表），同步可用。
 * 异体字（㫖、縂、寳……）t2cn 不认，先按 VARIANT_CHARS 归成正字再转（overview#350）；
 * 稀见异体字（𠮓、𡚁……）由 variant-supplement.ts 补进同一道归一（overview#514）。
 * 模块级缓存：建词典有开销，整个应用只建一次；首次用到才建。
 * opencc-js 出错时退回原样输出，不让页面挂掉。
 */
export function getSimplifiedConverter(): (text: string) => string {
    if (cached) return cached;
    try {
        const t2cn = Converter({ from: 't', to: 'cn' });
        cached = withProtectedTerms((text: string) => t2cn(normalizeVariants(text)));
    } catch {
        cached = (text: string) => text;
    }
    return cached;
}
