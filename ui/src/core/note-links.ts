/**
 * 来源说明里的链接（overview#359 P2-5）：文本仓的 source_note 等是一行自由文本，
 * 常写成 Markdown 式的「《书名》(https://…)」「[文字](https://…)」或裸网址。
 * 原样显示时网址很长、不折行，手机上把页面撑出横向滚动。
 *
 * 切成文字段与链接段，交给组件渲染：
 *   - 「《书名》(网址)」→ 链接文字是《书名》；
 *   - 「[文字](网址)」→ 链接文字是「文字」（方括号去掉）；
 *   - 裸网址 → 链接文字是域名。
 * 只认 http(s) 网址（数据来自文本仓，仍不把任意 scheme 放进 href）。
 */
export type NotePart = { text: string; url?: string };

const URL_RE = String.raw`https?:\/\/[^\s()（）<>"]+`;
// 依次：[文字](网址)｜《书名》(网址)｜裸网址；括号认半角与全角
const PATTERN = new RegExp(
    String.raw`\[([^\]\n]+)\]\((${URL_RE})\)` +
    String.raw`|(《[^》\n]+》)\s?[(（](${URL_RE})[)）]` +
    `|(${URL_RE})`,
    'g',
);

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

export function splitNoteLinks(note: string): NotePart[] {
    const parts: NotePart[] = [];
    let last = 0;
    for (const m of note.matchAll(PATTERN)) {
        const at = m.index ?? 0;
        if (at > last) parts.push({ text: note.slice(last, at) });
        if (m[1] !== undefined) parts.push({ text: m[1], url: m[2] });
        else if (m[3] !== undefined) parts.push({ text: m[3], url: m[4] });
        else parts.push({ text: hostOf(m[5]), url: m[5] });
        last = at + m[0].length;
    }
    if (last < note.length) parts.push({ text: note.slice(last) });
    return parts;
}
