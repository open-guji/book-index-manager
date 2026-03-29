/**
 * 丛编目录数据归一化
 *
 * 将各种来源的 volume_book_mapping.json 格式统一为 VolumeBookMapping 类型。
 * 核心约定：归一化后 book.volumes 始终为 number[]，
 * 原始册级详细信息（URL、状态等）保留在 book.volume_details 中。
 */
import type { VolumeBookMapping, VolumeBookEntry, VolumeBookStats, VolumeDetail } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawData = Record<string, any>;

/**
 * 归一化单个 book 条目的 volumes 字段。
 * - number[] → 原样保留
 * - {volume, ...}[] → 提取 volume 数字，详细信息存入 volume_details
 */
function normalizeBookEntry(raw: RawData): VolumeBookEntry {
    const rawVolumes: unknown[] = raw.volumes ?? [];
    let volumes: number[];
    let volumeDetails: VolumeDetail[] | undefined;

    if (rawVolumes.length === 0) {
        volumes = [];
    } else if (typeof rawVolumes[0] === 'number') {
        volumes = rawVolumes as number[];
    } else {
        // 对象数组格式: {volume, status, url/wiki_url/tw_url, file, ...}
        volumeDetails = [];
        volumes = [];
        for (const v of rawVolumes as RawData[]) {
            const vol = v.volume as number;
            volumes.push(vol);

            // 收集所有 URL 字段，统一放入 urls Record
            const urls: Record<string, string> = {};
            for (const [k, val] of Object.entries(v)) {
                if (k === 'volume' || k === 'status' || k === 'file') continue;
                if (typeof val === 'string' && (k.includes('url') || k.includes('id'))) {
                    urls[k] = val;
                }
            }

            volumeDetails.push({
                volume: vol,
                status: v.status as string | undefined,
                urls: Object.keys(urls).length > 0 ? urls : undefined,
                file: v.file as string | undefined,
            });
        }
    }

    const entry: VolumeBookEntry = {
        title: raw.title ?? '',
        book_id: raw.book_id ?? null,
        work_id: raw.work_id ?? null,
        volumes,
        section: raw.section,
        sub_items: raw.sub_items,
        edition: raw.edition,
        expected_volumes: raw.expected_volumes,
        found_volumes: raw.found_volumes,
        missing_volumes: raw.missing_vols ?? raw.missing_volumes,
    };

    if (volumeDetails) {
        entry.volume_details = volumeDetails;
    }

    // 清理 undefined 字段
    for (const k of Object.keys(entry) as (keyof VolumeBookEntry)[]) {
        if (entry[k] === undefined) delete entry[k];
    }

    return entry;
}

/**
 * 归一化 stats 字段，兼容多种字段命名。
 */
function normalizeStats(raw: RawData): VolumeBookStats {
    const stats: VolumeBookStats = {
        total_books: raw.total_books ?? 0,
    };
    if (raw.processed_volumes != null) stats.processed_volumes = raw.processed_volumes;
    if (raw.matched_works != null) stats.matched_works = raw.matched_works;
    if (raw.unmatched_works != null) stats.unmatched_works = raw.unmatched_works;
    if (raw.total_found_volumes != null) stats.total_found_volumes = raw.total_found_volumes;
    return stats;
}

/**
 * 将任意格式的 volume_book_mapping.json 归一化为统一的 VolumeBookMapping。
 */
export function normalizeCatalog(raw: unknown): VolumeBookMapping {
    const d = raw as RawData;
    const books: VolumeBookEntry[] = ((d.books ?? []) as RawData[]).map(normalizeBookEntry);

    const result: VolumeBookMapping = {
        collection_id: d.collection_id ?? '',
        title: d.title ?? '',
        total_volumes: d.total_volumes ?? 0,
        stats: normalizeStats(d.stats ?? {}),
        books,
    };

    if (d.source) result.source = d.source;
    if (d.resource_id) result.resource_id = d.resource_id;
    if (d.resource_name) result.resource_name = d.resource_name;
    if (d.sections?.length) result.sections = d.sections;
    if (d.volume_index && Object.keys(d.volume_index).length > 0) {
        result.volume_index = d.volume_index;
    }

    return result;
}
