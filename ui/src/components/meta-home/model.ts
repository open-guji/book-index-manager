/**
 * 元数据首页（/book-index 无检索词时，overview#322）的数据契约。
 *
 * 数据由网站构建期生成（kaiyuanguji-web `nextjs/scripts/build-meta-home.mjs` → `current/meta-home/sections.json`），
 * 组件只收 props、不取数（「最近浏览」例外：读本浏览器 localStorage，条目信息经 transport 取）。
 * 字段要改先在 overview#322 上通知网站一侧。
 */
import type { ReadBu, ReadTopicItem } from '../read-home/model';

export interface MetaCatalogProgress {
    id: string;
    name: string;
    edition?: string;
    total: number;
    imported: number;
    /** done／in_progress／todo… */
    status: string;
    /** 只在索引里查得到时才有（旧式 id 不给） */
    work_id?: string;
    collection_id?: string;
}

export interface MetaSite {
    id: string;
    name: string;
    url?: string;
    total: number;
    imported: number;
    status: string;
}

export interface MetaBibliographer {
    id: string;
    name: string;
    dynasty?: string;
    birth_year?: number;
    death_year?: number;
}

export interface MetaWorkRef {
    id: string;
    title: string;
    authors?: { name: string; dynasty?: string }[];
}

/** current/meta-home/sections.json */
export interface MetaHomeSections {
    counts: { works: number; books: number; collections: number; entities: number };
    shelf: { label: string; items: ReadTopicItem[] } | null;
    related_catalogs: MetaWorkRef[];
    catalog_progress: MetaCatalogProgress[];
    bu: ReadBu[];
    unclassified: number;
    collection_groups: { key: string; label: string; items: { id: string; title: string }[] }[];
    bibliographers: MetaBibliographer[];
    lineage: MetaWorkRef[];
    sites: MetaSite[];
    stats: {
        works: number; books: number; collections: number; entities: number;
        has_image: number; has_text: number; article: number; poem: number;
        loss: { extant: number; partially_extant: number; lost: number; unknown: number };
    };
}

/** 元数据首页各处链接，宿主定 */
export interface MetaHomeLinks {
    /** 条目页（作品、版本、丛编、人物同一套） */
    item: (id: string) => string;
    /** 总目分类节点页 */
    node?: (nodeId: string) => string;
    /** 按类型检索（全部／作品／版本／丛编／人物） */
    type?: (type: 'all' | 'work' | 'book' | 'collection' | 'entity') => string;
    /** 按存佚检索 */
    loss?: (key: 'extant' | 'partially_extant' | 'lost' | 'unknown') => string;
}

export const DEFAULT_META_HOME_LINKS: Required<Omit<MetaHomeLinks, 'type' | 'loss'>> & Pick<MetaHomeLinks, 'type' | 'loss'> = {
    item: (id) => `/item/${encodeURIComponent(id)}`,
    node: (id) => `/catalog?node=${encodeURIComponent(id)}`,
};

export function withMetaLinks(links?: Partial<MetaHomeLinks>) {
    return { ...DEFAULT_META_HOME_LINKS, ...(links ?? {}) } as typeof DEFAULT_META_HOME_LINKS;
}

/** 百分比（0–100，整数）；分母为 0 时 0 */
export function pct(part: number, total: number): number {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

/**
 * 时间轴：有生卒年的人按年份成比例放在轴上；只有一端的，用另一端±50 年补一个大致区间（只用于画，不显示）；
 * 都没有的不上轴，返回在 missing 里（页面在轴下注明）。
 */
export function timelineLayout(people: MetaBibliographer[]): {
    min: number; max: number;
    placed: { p: MetaBibliographer; from: number; to: number; left: number; width: number }[];
    missing: MetaBibliographer[];
} {
    const withYears = people.filter((p) => Number.isFinite(p.birth_year) || Number.isFinite(p.death_year));
    const missing = people.filter((p) => !withYears.includes(p));
    if (!withYears.length) return { min: 0, max: 0, placed: [], missing };
    const span = (p: MetaBibliographer) => {
        const b = Number.isFinite(p.birth_year) ? p.birth_year! : p.death_year! - 50;
        const d = Number.isFinite(p.death_year) ? p.death_year! : p.birth_year! + 50;
        return [Math.min(b, d), Math.max(b, d)] as const;
    };
    const spans = withYears.map(span);
    const min = Math.min(...spans.map((s) => s[0]));
    const max = Math.max(...spans.map((s) => s[1]));
    const range = Math.max(1, max - min);
    const placed = withYears
        .map((p, i) => ({ p, from: spans[i][0], to: spans[i][1] }))
        .sort((a, b) => a.from - b.from)
        .map((x) => ({ ...x, left: ((x.from - min) / range) * 100, width: Math.max(0.8, ((x.to - x.from) / range) * 100) }));
    return { min, max, placed, missing };
}

/** 公元年份的显示：负数写「前N」 */
export function yearText(y: number): string {
    return y < 0 ? `前${-y}` : String(y);
}
