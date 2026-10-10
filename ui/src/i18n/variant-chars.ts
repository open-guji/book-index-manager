import table from './variant-chars.json';
import { VARIANT_SUPPLEMENT } from './variant-supplement';

/**
 * 异体字 → 正字（overview#350）。简体模式下先归一，再走 opencc t2cn——t2cn 的字表只收标准繁体，
 * 「㫖」「縂」「寳」这类异体字会原样漏到简体页面上。繁体模式不用它：原文照原样显示。
 *
 * 表是生成的（ui/scripts/variant-chars/，方法与口径见那里的 README），不要手改 json：
 *   - 依据 book-text 全量正文统计简体模式下残留的非简体字，取出现 ≥1000 次的；
 *   - 正字来源：教育部异体字字典（twedu）为主，汉语大字典、日本字形表、cjkvi、Unihan kZVariant 为辅，人工复核；
 *   - 只收「本身不是 Big5 常用繁体字、也不是通用规范汉字」的纯字形异体，避免把有独立字义的字改掉；
 *   - 值是正字的繁体写法，后面照常交给 t2cn。
 * 稀见异体字（不足 1000 次、没进这张表的，如「𠮓」「𡚁」）由手工维护的 variant-supplement.ts 补进同一道 normalizeVariants。
 * 网站服务端（lib/server/simplify.ts）引 `book-index-ui/variant-chars.json`，检索边缘函数引同内容的 ESM 版
 * `book-index-ui/variant-chars`（build:lib 时由 scripts/variant-chars/emit.mjs 生成），都是同一张表。
 */
export const VARIANT_CHARS: Readonly<Record<string, string>> = table;

/** 按码位逐字替换（含扩展区的代理对字符）；没有异体字时原样返回同一个字符串 */
export function normalizeVariants(text: string): string {
    if (!text) return text;
    let changed = false;
    let out = '';
    for (const ch of text) {
        const to = VARIANT_CHARS[ch] ?? VARIANT_SUPPLEMENT[ch];
        if (to !== undefined) {
            out += to;
            changed = true;
        } else {
            out += ch;
        }
    }
    return changed ? out : text;
}
