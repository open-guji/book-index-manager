/**
 * schema-v2 派生字段兼容层（overview#458）。
 *
 * schema-v2 起，源档里的 `Work.books`、`Collection.books`／`contained_works`、`Entity.works`、
 * `Work.classification` 等反查／派生字段不再落盘，改由 build 产物 `_build/entry/<id>.json`
 * 带 `_books`、`_members`、`_works`、`_related`、`_classifications`、`_collections`、`_catalogs` 等
 * 下划线字段（契约见 book-index SCHEMA.md 附一·乙）。
 *
 * 读者端的页面仍按旧形状读，故在数据入口把新字段归一成旧形状：
 *   - 旧字段已有值时一律不动（旧格式数据下行为不变）；
 *   - 只在旧字段缺失时，用新字段补；
 *   - 卡片里 `{id, h:1}` 的枢纽引用没有 title，名称从 `_hubs.json` 取（`hubs` 参数）。
 */

/** `_hubs.json`：`{id: {t: 'w'|'c'|'e', title, dyn?}}` */
export type HubMap = Record<string, { t?: string; title?: string; dyn?: string }>;

type Obj = Record<string, unknown>;
type Card = Obj & { id?: string; title?: string; h?: number | boolean };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** 枢纽引用：`{id, h:1}`，无 title */
export const isHubRef = (c: unknown): boolean => isObj(c) && !!c.h;

/** 条目是否含需要枢纽名称的引用（决定要不要去取 `_hubs.json`） */
export function needsHubs(raw: Obj | null | undefined): boolean {
    if (!raw) return false;
    for (const k of ['_related', '_catalogs', '_collections', '_works', '_members', '_children']) {
        const v = raw[k];
        if (isArr(v) && v.some(isHubRef)) return true;
    }
    return false;
}

function titleOf(card: Card, hubs?: HubMap | null): string {
    if (typeof card.title === 'string' && card.title) return card.title;
    const key = (card.id ?? card.bid) as string | undefined;
    if (card.h && key && hubs?.[key]?.title) return hubs[key].title!;
    return '';
}

/** 取一个分类：优先总目（zongmu） */
function pickClassification(list: unknown[]): Obj | null {
    const items = list.filter(isObj);
    return items.find(c => c.scheme === 'zongmu') ?? items[0] ?? null;
}

const asVolume = (vol: unknown): number | undefined =>
    typeof vol === 'number' ? vol : isArr(vol) && typeof vol[0] === 'number' ? vol[0] : undefined;

/**
 * 把一条 schema-v2 条目的派生字段补成旧形状。返回新对象（不改入参）；
 * 没有任何新字段、或旧字段齐全时，返回的内容与入参相同。
 */
export function adaptEntry<T extends Obj>(raw: T, hubs?: HubMap | null): T {
    if (!isObj(raw)) return raw;
    const out: Obj = { ...raw };
    const type = raw.type;

    if (type === 'work') {
        if (!isArr(raw.books) && isArr(raw._books)) {
            out.books = raw._books.filter(isObj).map(b => b.id).filter((id): id is string => typeof id === 'string');
        }
        if (!isObj(raw.classification) && isArr(raw._classifications)) {
            const c = pickClassification(raw._classifications);
            if (c) {
                out.classification = {
                    l1: c.l1 ?? '', l2: c.l2 ?? '', l3: c.l3 ?? '', l4: c.l4 ?? '',
                    ...(c.source ? { source: c.source } : {}),
                };
            }
        }
        // `_related` 已按本条视角取词、带对方现行题名；源档的 related_works 不再带 title
        if (isArr(raw._related)) {
            out.related_works = raw._related.filter(isObj).map(r => {
                const card = r as Card;
                return {
                    id: card.id,
                    title: titleOf(card, hubs),
                    ...(card.relation ? { relation: card.relation } : {}),
                    ...(card.note ? { note: card.note } : {}),
                };
            });
        }
        if (!isArr(raw.indexed_by) && isArr(raw._catalogs) && raw._catalogs.length) {
            out.indexed_by = raw._catalogs.filter(isObj).map(c => {
                const card = c as Card & { bid?: string; section?: string; title_info?: string };
                return {
                    source: titleOf(card, hubs) || String(card.bid ?? ''),
                    ...(card.bid ? { source_bid: card.bid } : {}),
                    ...(card.section ? { section: card.section } : {}),
                };
            });
        }
    }

    if (type === 'work' || type === 'book') {
        // 旧 Book.contained_in 是 [{id, volume_index, sub_items?}]；新 `_collections` 是 [{id, title?, vol?, sub?, h?}]
        if (!isArr(raw.contained_in) && isArr(raw._collections) && raw._collections.length) {
            out.contained_in = raw._collections.filter(isObj).map(c => {
                const card = c as Card & { vol?: unknown; sub?: unknown };
                return {
                    id: card.id,
                    ...(card.vol != null ? { volume_index: card.vol } : {}),
                    ...(card.sub != null ? { sub_items: card.sub } : {}),
                };
            });
        }
    }

    if (type === 'collection') {
        if (isArr(raw._members)) {
            const cards = raw._members.filter(isObj) as Card[];
            const total = typeof raw._member_count === 'number' ? raw._member_count : cards.length;
            const isWork = (c: Card) => c.t === 'work';
            if (!isArr(raw.books)) {
                const ids = cards.filter(c => !isWork(c)).map(c => c.id).filter((id): id is string => typeof id === 'string');
                if (ids.length) out.books = ids;
            }
            if (!isArr(raw.contained_works)) {
                const works = cards.filter(isWork).map(c => {
                    const v = asVolume(c.vol);
                    return { id: c.id as string, title: titleOf(c, hubs), ...(v != null ? { volume_index: v } : {}) };
                });
                if (works.length) out.contained_works = works;
            }
            // 分页没打进站点包时只有前 20 项：标出「截断」，页面按总数显示
            if (total > cards.length) out._members_truncated = true;
        }
    }

    if (type === 'entity') {
        if (!isArr(raw.works) && isArr(raw._works)) {
            out.works = raw._works.filter(isObj).map(w => {
                const card = w as Card & { work_id?: string };
                const title = titleOf({ ...card, id: card.work_id }, hubs);
                return { ...card, work_id: card.work_id, ...(title ? { title } : {}) };
            });
        }
    }

    return out as T;
}
