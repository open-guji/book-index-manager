import React, { useSyncExternalStore } from 'react';

/**
 * 悬停中的字（格位 key）：书影与正文两边联动用。
 * 不放进阅读器顶层 state——鼠标每划过一个字就会重渲染整个阅读器（工具条、目录、书影、正文外壳）；
 * 放在这个小 store 里，只有订阅它的书影画布和正文重渲染（GUJI-630）。
 */
export interface HoverStore {
    get: () => string | null;
    set: (id: string | null) => void;
    subscribe: (cb: () => void) => () => void;
}

export function createHoverStore(): HoverStore {
    let cur: string | null = null;
    const subs = new Set<() => void>();
    return {
        get: () => cur,
        set: (id) => {
            if (id === cur) return;
            cur = id;
            subs.forEach((cb) => cb());
        },
        subscribe: (cb) => {
            subs.add(cb);
            return () => { subs.delete(cb); };
        },
    };
}

export function useHovered(store: HoverStore): string | null {
    return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** 只让 children 跟着悬停重渲染 */
export function HoverBound({ store, children }: { store: HoverStore; children: (hovered: string | null) => React.ReactNode }) {
    const hovered = useHovered(store);
    return React.createElement(React.Fragment, null, children(hovered));
}
