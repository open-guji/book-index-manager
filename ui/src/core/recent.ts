/**
 * 「最近浏览」：本浏览器 localStorage 里的条目 ID 列表（新的在前），IndexBrowser 与元数据首页的最近浏览栏共用。
 * 只存 ID；显示时经 transport 取条目（取不到的给占位，notFound）。
 */
import type { IndexEntry, IndexType } from '../types';
import type { IndexStorage } from '../storage/types';

/** 「最近浏览」存 localStorage 的键（值为 ID 数组，新的在前）；宿主要读写或清空时用它 */
export const RECENT_IDS_STORAGE_KEY = 'bim-recent-ids';
const RECENT_KEY_LEGACY = 'bim-recent-entries';
const MAX_RECENT = 50;

export function loadRecentIds(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_IDS_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
        const legacy = localStorage.getItem(RECENT_KEY_LEGACY);
        if (legacy) {
            const ids = (JSON.parse(legacy) as { id: string }[]).map(e => e.id);
            localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(ids));
            localStorage.removeItem(RECENT_KEY_LEGACY);
            return ids;
        }
        return [];
    } catch {
        return [];
    }
}

export function saveRecentId(id: string) {
    try {
        const list = loadRecentIds().filter(i => i !== id);
        list.unshift(id);
        if (list.length > MAX_RECENT) list.length = MAX_RECENT;
        localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

export function removeRecentId(id: string) {
    try {
        const list = loadRecentIds().filter(i => i !== id);
        localStorage.setItem(RECENT_IDS_STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

export function clearAllRecentIds() {
    try {
        localStorage.removeItem(RECENT_IDS_STORAGE_KEY);
    } catch { /* ignore */ }
}

export type RecentEntry = IndexEntry & { notFound?: boolean };

/** 经 transport 取一条最近浏览的条目；取不到返回占位（notFound） */
export async function resolveRecentEntry(transport: Pick<IndexStorage, 'getItem' | 'getEntry'>, id: string): Promise<RecentEntry> {
    try {
        if (transport.getEntry) {
            const entry = await transport.getEntry(id);
            if (entry) return entry;
        }
        const raw = await transport.getItem(id);
        if (raw) {
            const authors = raw.authors as { name?: string; dynasty?: string; role?: string }[] | undefined;
            return {
                id,
                title: (raw.title as string) || id,
                type: (raw.type as IndexType) || 'work',
                author: authors?.[0]?.name,
                dynasty: authors?.[0]?.dynasty,
                role: authors?.[0]?.role,
                edition: (raw.edition as string) || undefined,
            } as IndexEntry;
        }
    } catch { /* ignore */ }
    // 未找到的条目，返回占位卡片
    return { id, title: id, type: 'work' as IndexType, notFound: true };
}
