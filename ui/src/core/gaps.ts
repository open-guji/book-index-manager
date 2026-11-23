/**
 * 缺页（`guji-gaps/0.1`，章条目的 `gaps_file`，如 `006.gaps.json`）：原书缺页或没拍到的页，只按图片页号记，不占页号。
 * 一条＝「第 after_page 张图之后缺了什么」；after_page 为 0 表示在第一张图之前。
 * 文字版在那页文字之后单起一行 note；书影在那张图之后插一张占位卡。
 */
export interface ReaderGap {
    /** 缺在这张图（图片页号）之后；0＝第一张图之前 */
    afterPage: number;
    /** 照书上写缺了什么，如「卷九叶九、叶十」 */
    what: string;
    kind: '原书缺' | '未拍';
    /** 估计缺多少字 */
    estChars?: number;
    /** 文字版注记的现成写法，如「〔原书此处缺卷九叶九、叶十，约 830 字〕」 */
    note: string;
}

/** 注记的兜底写法（文件里没有 note 时用）；与导出端 `gap_note` 同形 */
export function gapNoteOf(g: Pick<ReaderGap, 'what' | 'kind' | 'estChars'>): string {
    const est = g.estChars && g.estChars > 0 ? `，约 ${g.estChars} 字` : '';
    return g.kind === '未拍' ? `〔此处未拍${g.what}${est}〕` : `〔原书此处缺${g.what}${est}〕`;
}

/** `NNN.gaps.json` → 按 afterPage 升序的缺页列表；形状不对的条目丢掉，整体不对返回空数组（不抛错） */
export function adaptGaps(raw: unknown): ReaderGap[] {
    const list = raw && typeof raw === 'object' ? (raw as { gaps?: unknown }).gaps : undefined;
    if (!Array.isArray(list)) return [];
    const out: ReaderGap[] = [];
    const seen = new Set<number>();
    for (const g of list) {
        if (!g || typeof g !== 'object') continue;
        const r = g as Record<string, unknown>;
        const after = r.after_page;
        if (typeof after !== 'number' || !Number.isInteger(after) || after < 0 || seen.has(after)) continue;
        const what = typeof r.what === 'string' ? r.what.trim() : '';
        if (!what) continue;
        const kind = r.kind === '未拍' ? '未拍' : '原书缺';
        const est = typeof r.est_chars === 'number' && Number.isFinite(r.est_chars) && r.est_chars > 0 ? Math.round(r.est_chars) : undefined;
        const gap = { afterPage: after, what, kind, ...(est ? { estChars: est } : {}) } as Omit<ReaderGap, 'note'>;
        const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim() : gapNoteOf(gap);
        seen.add(after);
        out.push({ ...gap, note });
    }
    return out.sort((a, b) => a.afterPage - b.afterPage);
}
