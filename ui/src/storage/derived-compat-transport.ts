import type { IndexStorage } from './types';
import { adaptEntry, needsHubs, type HubMap } from '../core/derived-compat';

/**
 * 包一层 transport：`getItem` 返回的条目先过 `adaptEntry`（schema-v2 派生字段 → 旧形状，overview#458）。
 * 条目里有 `{id, h:1}` 枢纽引用时，才去取 `transport.getHubs()`（`_hubs.json`，缓存一次）。
 * transport 没有 `getHubs` 时枢纽引用没有名称，页面回退显示 ID。
 */
export function withDerivedCompat(transport: IndexStorage): IndexStorage {
    let hubs: Promise<HubMap | null> | null = null;
    const loadHubs = () => {
        if (!transport.getHubs) return Promise.resolve(null);
        hubs ??= transport.getHubs().catch(() => null);
        return hubs;
    };
    const adapt = async (raw: Record<string, unknown> | null) =>
        raw ? adaptEntry(raw, needsHubs(raw) ? await loadHubs() : null) : raw;

    return new Proxy(transport, {
        get(target, prop, receiver) {
            if (prop === 'getItem') return async (id: string) => adapt(await target.getItem(id));
            const v = Reflect.get(target, prop, target);
            return typeof v === 'function' ? v.bind(target) : v;
        },
    });
}

/** 供宿主预取的数据（SSR seed）用：同一套归一，枢纽名称由调用方传入 */
export { adaptEntry };
