/**
 * 搜索规范化管道（构建期 Node 与浏览器 Worker 共用）。
 * 与 kaiyuanguji-web/nextjs/src/lib/search/normalize.js 保持同步。
 */

const PUNCT_RE = /[\s　\p{P}\p{S}]+/gu;
const CJK_RE = /[㐀-鿿豈-﫿]/;

function isCjk(ch: string): boolean {
    return CJK_RE.test(ch);
}

export function clean(text: string): string {
    if (!text) return '';
    return text.toLowerCase().replace(PUNCT_RE, '');
}

export function tokenize(text: string): string[] {
    if (!text) return [];
    const cleaned = clean(text);
    if (!cleaned) return [];

    const tokens: string[] = [];
    let cjkBuf: string[] = [];
    let asciiBuf = '';

    const flushCjk = () => {
        if (cjkBuf.length === 0) return;
        if (cjkBuf.length === 1) {
            tokens.push(cjkBuf[0]);
        } else {
            for (let i = 0; i < cjkBuf.length - 1; i++) {
                tokens.push(cjkBuf[i] + cjkBuf[i + 1]);
            }
        }
        cjkBuf = [];
    };
    const flushAscii = () => {
        if (asciiBuf) { tokens.push(asciiBuf); asciiBuf = ''; }
    };

    for (const ch of Array.from(cleaned)) {
        if (isCjk(ch)) { flushAscii(); cjkBuf.push(ch); }
        else { flushCjk(); asciiBuf += ch; }
    }
    flushCjk();
    flushAscii();
    return tokens;
}

export function hasCjkBigram(tokens: string[]): boolean {
    for (const t of tokens) {
        if (Array.from(t).length >= 2 && isCjk(t[0])) return true;
    }
    return false;
}
