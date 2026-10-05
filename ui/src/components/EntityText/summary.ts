/**
 * 悬停卡片的条目摘要：取数与缓存。
 *
 * 取法同详情页（BookPage / EntityPage）：`transport.getItem(id)` 取整条元数据；
 * 宿主没给 getItem 时退到 `getEntry(id)`（索引条目，没有提要）。
 * 同一个 transport（或 loadSummary）下按 id 缓存 Promise，悬停多次只取一次。
 */
import type { IndexStorage } from '../../storage/types';
import type { IndexEntry } from '../../types';

export interface EntitySummary {
    id: string;
    /** 条目类型：work / book / collection / entity */
    type?: string;
    title: string;
    /** 一行附注：朝代、作者、生卒、版本等，已用「·」拼好 */
    meta?: string;
    /** 提要（截断后） */
    description?: string;
}

export type EntitySummaryLoader = (id: string) => Promise<EntitySummary | null>;

export type EntitySummaryTransport = Pick<IndexStorage, 'getItem'> & Partial<Pick<IndexStorage, 'getEntry'>>;

const DESC_MAX = 120;

function s(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function truncate(text: string | undefined, max = DESC_MAX): string | undefined {
    if (!text) return undefined;
    const plain = text.replace(/\s+/g, ' ').trim();
    const chars = Array.from(plain);
    return chars.length > max ? chars.slice(0, max).join('') + '…' : plain;
}

function years(raw: Record<string, unknown>): string | undefined {
    const b = typeof raw.birth_year === 'number' ? raw.birth_year : undefined;
    const d = typeof raw.death_year === 'number' ? raw.death_year : undefined;
    if (b === undefined && d === undefined) return undefined;
    return `${b ?? '?'}–${d ?? '?'}`;
}

function authorsLine(raw: Record<string, unknown>): string | undefined {
    if (!Array.isArray(raw.authors)) return undefined;
    const parts = (raw.authors as unknown[])
        .map(a => {
            if (!a || typeof a !== 'object') return '';
            const x = a as Record<string, unknown>;
            const name = s(x.name);
            if (!name) return '';
            return [s(x.dynasty) && `〔${s(x.dynasty)}〕`, name, s(x.role)].filter(Boolean).join('');
        })
        .filter(Boolean);
    return parts.length ? parts.slice(0, 3).join('、') : undefined;
}

/** `getItem` 返回的元数据 → 摘要 */
export function summaryFromItem(id: string, raw: Record<string, unknown>): EntitySummary {
    const type = s(raw.type);
    const title = s(raw.primary_name) ?? s(raw.title) ?? id;
    const meta = type === 'entity'
        ? [s(raw.dynasty), years(raw), s(raw.native_place)].filter(Boolean).join(' · ')
        : [authorsLine(raw), s(raw.edition), s(raw.measure_info)].filter(Boolean).join(' · ');
    const desc = raw.description && typeof raw.description === 'object'
        ? s((raw.description as Record<string, unknown>).text)
        : s(raw.description);
    return { id, type, title, meta: meta || undefined, description: truncate(desc) };
}

/** `getEntry` 返回的索引条目 → 摘要 */
export function summaryFromEntry(entry: IndexEntry): EntitySummary {
    const meta = [entry.dynasty, entry.author, entry.edition].filter(Boolean).join(' · ');
    return { id: entry.id, type: entry.type, title: entry.title, meta: meta || undefined };
}

/** transport → 摘要取数函数 */
export function transportSummaryLoader(transport: EntitySummaryTransport): EntitySummaryLoader {
    return async (id) => {
        const raw = await transport.getItem(id);
        if (raw) return summaryFromItem(id, raw);
        if (transport.getEntry) {
            const entry = await transport.getEntry(id);
            if (entry) return summaryFromEntry(entry);
        }
        return null;
    };
}

const caches = new WeakMap<object, Map<string, Promise<EntitySummary | null>>>();

/** 按来源对象（transport 或 loader）缓存；失败的结果不缓存，下次悬停重试 */
export function cachedSummary(owner: object, loader: EntitySummaryLoader, id: string): Promise<EntitySummary | null> {
    let m = caches.get(owner);
    if (!m) { m = new Map(); caches.set(owner, m); }
    const hit = m.get(id);
    if (hit) return hit;
    const p = loader(id);
    m.set(id, p);
    p.catch(() => m!.delete(id));
    return p;
}
