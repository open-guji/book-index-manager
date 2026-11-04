/**
 * 整理本章 json 的新旧写法两认（schema 审查第 11 组，2026-11）。
 *
 * book-text 迁移后：
 *   - section 只写 `work_ids: string[]`（原 `work_id: null` 即「明确未链」→ `[]`）；
 *   - 下划线证据字段收进 section 的 `evidence`；
 *   - 章顶层只留 `title`、`sections`、`meta`，`page_title`／`source_url` 等进 `meta`。
 * 阅读器仍按旧字段读（`work_id` 单链、`work_ids` 多链、顶层 `page_title`／`source_url`），
 * 这里在取数后补齐，新旧两种数据都能显示。迁移收紧后，组件可改为直接读新字段。
 */
import type { CollatedJuan, CollatedSection } from '../types';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function normalizeCollatedSection(s: CollatedSection): CollatedSection {
    if (!s || typeof s !== 'object') return s;
    const ids: string[] = [];
    const add = (v: unknown) => { const x = str(v); if (x && !ids.includes(x)) ids.push(x); };
    add(s.work_id);
    if (Array.isArray(s.work_ids)) s.work_ids.forEach(add);
    const hasKey = 'work_id' in s || 'work_ids' in s;
    if (!hasKey) return s;
    return { ...s, work_ids: ids, work_id: ids[0] ?? null };
}

export function normalizeCollatedJuan(juan: CollatedJuan | null | undefined): CollatedJuan | null {
    if (!juan || typeof juan !== 'object') return juan ?? null;
    const meta = (juan as { meta?: Record<string, unknown> }).meta;
    const out: CollatedJuan = { ...juan };
    if (meta && typeof meta === 'object') {
        if (out.page_title === undefined && str(meta.page_title)) out.page_title = str(meta.page_title);
        if (out.source_url === undefined && str(meta.source_url)) out.source_url = str(meta.source_url);
    }
    if (Array.isArray(juan.sections)) out.sections = juan.sections.map(normalizeCollatedSection);
    return out;
}
