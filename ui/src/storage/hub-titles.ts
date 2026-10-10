import type { HubMap, IndexStorage } from './types';

/**
 * 给条目里的枢纽引用补上名称。
 *
 * build 产物里，入度 > 200 的记录（史記、二十四史这类）在引用它的卡片里只写 `{id, h: 1}`，不带 title，
 * 名称集中在 `_hubs.json`（`transport.getHubs()`）。页面按 `title` 渲染，所以 `getItem` 返回的条目要先补名。
 * 这里**只补 title、不改任何字段的形状**（页面直接读 `_related`／`_collections`／`_members` 等）。
 *
 * 宿主预取（SSR）直接传 `initialDetail` 时不经这里：枢纽卡片没有名称，页面显示为空（与此前一致）。
 */

type Obj = Record<string, unknown>;

/** 可能含枢纽卡片的派生数组 */
const HUB_ARRAYS = ['_related', '_catalogs', '_collections', '_members', '_children'] as const;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** 枢纽引用：`{id, h:1}`（志书著录 `_catalogs` 里是 `{bid, h:1}`），无 title */
const isHubRef = (c: unknown): c is Obj => isObj(c) && !!c.h;

/** 条目是否含需要名称的枢纽引用（决定要不要去取 `_hubs.json`） */
export function needsHubs(raw: Obj | null | undefined): boolean {
    if (!raw) return false;
    return HUB_ARRAYS.some(k => {
        const v = raw[k];
        return Array.isArray(v) && v.some(isHubRef);
    });
}

/** 返回补好枢纽名称的浅拷贝（不改入参）；没有名称可补的卡片原样保留 */
export function fillHubTitles<T extends Obj>(raw: T, hubs: HubMap | null | undefined): T {
    const out: Obj = { ...raw };
    if (!hubs) return out as T;
    for (const k of HUB_ARRAYS) {
        const list = raw[k];
        if (!Array.isArray(list) || !list.some(isHubRef)) continue;
        out[k] = list.map(c => {
            if (!isHubRef(c) || (typeof c.title === 'string' && c.title)) return c;
            const key = (c.id ?? c.bid) as string | undefined;
            const title = key ? hubs[key]?.title : undefined;
            return title ? { ...c, title } : c;
        });
    }
    return out as T;
}

/**
 * 包一层 transport：`getItem` 返回的条目补上枢纽名称。
 * 条目里有枢纽引用时才去取 `transport.getHubs()`（缓存一次）；transport 没有 `getHubs` 时枢纽引用没有名称。
 */
export function withHubTitles(transport: IndexStorage): IndexStorage {
    let hubs: Promise<HubMap | null> | null = null;
    const loadHubs = () => {
        if (!transport.getHubs) return Promise.resolve(null);
        hubs ??= transport.getHubs().catch(() => null);
        return hubs;
    };

    return new Proxy(transport, {
        get(target, prop) {
            if (prop === 'getItem') {
                return async (id: string) => {
                    const raw = await target.getItem(id);
                    return raw ? fillHubTitles(raw, needsHubs(raw) ? await loadHubs() : null) : raw;
                };
            }
            const v = Reflect.get(target, prop, target);
            return typeof v === 'function' ? v.bind(target) : v;
        },
    });
}
