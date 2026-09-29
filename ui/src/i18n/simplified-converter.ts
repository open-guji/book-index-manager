import { Converter } from 'opencc-js/t2cn';
import { withProtectedTerms } from './protected-terms';

let cached: ((text: string) => string) | null = null;

/**
 * 内置的繁→简转换函数（opencc-js t2cn + PROTECTED_TERMS 保护表），同步可用。
 * 模块级缓存：建词典有开销，整个应用只建一次；首次用到才建。
 * opencc-js 出错时退回原样输出，不让页面挂掉。
 */
export function getSimplifiedConverter(): (text: string) => string {
    if (cached) return cached;
    try {
        cached = withProtectedTerms(Converter({ from: 'tw', to: 'cn' }));
    } catch {
        cached = (text: string) => text;
    }
    return cached;
}
