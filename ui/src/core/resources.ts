/**
 * 资源条目的纯函数工具。
 *
 * 这些逻辑原先内联在 ResourceList.tsx 里，2026-09 详情页重构时抽出来，
 * 让新的 detail/ 组件和旧的 ResourceList 共用同一套语义——否则两处
 * 各写一份「怎么算册数」「怎么合并分册」，迟早会给出不一样的数字。
 *
 * 一律无 React、无 IO，可直接单测。
 */
import type { ResourceEntry, ResourceType, ResourceTypeAtom, ResourceVolume } from '../types';
import { getResourceTypes } from '../types';

/** 域名 → 显示名称映射 */
export const DOMAIN_NAME_MAP: Record<string, string> = {
    'commons.wikimedia.org': '維基共享',
    'zh.wikisource.org': '維基文庫',
    'taiwanebook.ncl.edu.tw': '臺灣華文電子書庫',
    'ctext.org': '中國哲學書電子化計劃',
    'www.shidianguji.com': '識典古籍',
    'shidianguji.com': '識典古籍',
    'archive.org': 'Internet Archive',
};

/** 从 URL 提取域名并映射为显示名称 */
export function getDisplayNameFromUrl(url: string): string | undefined {
    try {
        return DOMAIN_NAME_MAP[new URL(url).hostname];
    } catch {
        return undefined;
    }
}

/** 用于按类型分组的 key（多类型按 text > image > physical 顺序连接） */
const ATOM_ORDER: Record<string, number> = { text: 0, image: 1, physical: 2 };

export function getTypeGroupKey(types: ResourceTypeAtom[]): string {
    if (types.length === 0) return 'physical';
    return [...types].sort((a, b) => (ATOM_ORDER[a] ?? 99) - (ATOM_ORDER[b] ?? 99)).join('+');
}

/**
 * 多类型组合的颜色 key：同时含 text 和 image 视为「文字+图片」，
 * 其余取首类型。
 */
export function getCombinedTypeKey(types: ResourceTypeAtom[]): ResourceType {
    if (types.includes('text') && types.includes('image')) return 'text+image';
    return (types[0] || 'physical') as ResourceType;
}

/**
 * 将同名模式的分册资源自动合并为一条带 volumes 的资源。
 *
 * 匹配「XXX·第N冊」与「XXX (N)」「XXX·N」两种命名；≥2 册才合并，
 * 免得把「史記 (1)」这种孤例也变成一个空壳分册组。
 *
 * 御定佩文韻府就是典型：23 条「摛藻堂四庫全書薈要·第321冊」…「第343冊」
 * 合成一条「摛藻堂四庫全書薈要」+ 23 个册号。
 */
export function mergeVolumeResources(items: ResourceEntry[]): ResourceEntry[] {
    const extractVolume = (name: string): [string, number] | null => {
        const m1 = name.match(/^(.+?)·第(\d+)[冊册]$/);
        if (m1) return [m1[1], parseInt(m1[2])];
        const m2 = name.match(/^(.+?)[·(](\d+)[)]?$/);
        if (m2) return [m2[1], parseInt(m2[2])];
        return null;
    };

    const groups = new Map<string, { base: ResourceEntry; volumes: ResourceVolume[]; indices: number[] }>();

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // 已经有 volumes 的资源不参与合并
        if (item.volumes && item.volumes.length > 0) continue;

        const parsed = extractVolume(item.name);
        if (!parsed) continue;

        const [baseName, vol] = parsed;
        const groupKey = `${baseName}|${getTypeGroupKey(getResourceTypes(item))}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                base: { ...item, name: baseName, url: '', volumes: [] },
                volumes: [],
                indices: [],
            });
        }
        const g = groups.get(groupKey)!;
        g.volumes.push({ volume: vol, url: item.url || undefined, status: 'found' });
        g.indices.push(i);
    }

    const merged: ResourceEntry[] = [];
    const consumed = new Set<number>();
    for (const group of groups.values()) {
        if (group.volumes.length < 2) continue; // 单册不合并，保持原样
        group.volumes.sort((a, b) => a.volume - b.volume);
        group.base.volumes = group.volumes;
        group.base.expected_volumes = group.volumes.length;
        merged.push(group.base);
        for (const i of group.indices) consumed.add(i);
    }

    const result: ResourceEntry[] = [...merged];
    for (let i = 0; i < items.length; i++) {
        if (!consumed.has(i)) result.push(items[i]);
    }
    return result;
}

/** 从 volume 对象中提取最佳 URL（兼容 url / tw_url / wiki_url 等字段） */
export function extractVolumeUrl(v: ResourceVolume): string | undefined {
    if (v.url) return v.url;
    for (const [k, val] of Object.entries(v)) {
        if (k.endsWith('_url') && typeof val === 'string') return val;
    }
    return undefined;
}

/** 归一化 volumes：补齐 URL */
export function normalizeVolumes(item: ResourceEntry): ResourceVolume[] | null {
    if (!Array.isArray(item.volumes) || item.volumes.length === 0) return null;
    return item.volumes.map(v => ({ ...v, url: v.url || extractVolumeUrl(v) }));
}

/** 分册统计（按册号去重——同一册可在多个 group 中出现，如跨 Work 共册） */
export interface VolumeStats {
    found: number;
    missing: number;
    expected: number;
}

export function volumeStats(item: ResourceEntry): VolumeStats | null {
    const volumes = normalizeVolumes(item);
    if (!volumes) return null;
    const found = new Set(volumes.filter(v => v.status !== 'missing').map(v => v.volume)).size;
    const missing = new Set(volumes.filter(v => v.status === 'missing').map(v => v.volume)).size;
    return { found, missing, expected: item.expected_volumes ?? found + missing };
}

/** Extract the start page number from metadata (page_range or file_page_range) */
export function getStartPage(metadata?: Record<string, unknown>): number | undefined {
    if (!metadata) return undefined;
    const range = (metadata.file_page_range || metadata.page_range) as string | undefined;
    if (!range || typeof range !== 'string') return undefined;
    const match = range.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
}

/** 构造跳到指定页的 URL（目前只有 Wikimedia Commons 支持页内导航） */
export function buildPageUrl(baseUrl: string, pageNum: number): string {
    try {
        const url = new URL(baseUrl);
        if (url.hostname.includes('wikimedia.org')) {
            const wikiFileMatch = baseUrl.match(/\/wiki\/File:(.+?)(?:#|$)/);
            if (wikiFileMatch) {
                const fileTitle = encodeURIComponent(decodeURIComponent(wikiFileMatch[1]));
                return `https://commons.wikimedia.org/w/index.php?title=File%3A${fileTitle}&page=${pageNum}`;
            }
            const u = new URL(baseUrl);
            u.searchParams.set('page', String(pageNum));
            return u.toString();
        }
        return baseUrl;
    } catch {
        return baseUrl;
    }
}

/** 资源的最终跳转地址（有页码范围时直达起始页） */
export function resourceHref(item: ResourceEntry): string | undefined {
    if (!item.url) return undefined;
    const startPage = getStartPage(item.metadata);
    return startPage ? buildPageUrl(item.url, startPage) : item.url;
}
