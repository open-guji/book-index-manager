/**
 * 阅读器「版本」下拉框的数据换算（overview#235）。
 */
import type { WorkFullTextEntry } from '../../types';
import type { ReaderVersion } from './types';

/** book-text 全文清单 → 下拉框选项（顺序不变：清单已按「哪份最好」排好） */
export function readerVersionsFromFullText(entries: readonly WorkFullTextEntry[]): ReaderVersion[] {
    return entries.map(e => ({
        key: e.key,
        label: e.version_label || e.key,
        sourceName: e.source_name,
        license: e.license,
        sourceUrl: e.source_url,
        primary: e.primary,
    }));
}

/** 选项文字：`version_label · source_name`；版本说明里已含来源名时不重复 */
export function readerVersionOptionLabel(v: ReaderVersion): string {
    const label = v.label || v.key;
    if (!v.sourceName || label.includes(v.sourceName)) return label;
    return `${label} · ${v.sourceName}`;
}

/** 当前选中的一份：宿主给的 key 有效就用它，否则 primary，再否则第一份 */
export function pickReaderVersion(versions: readonly ReaderVersion[] | undefined, key?: string | null): ReaderVersion | undefined {
    if (!versions || versions.length === 0) return undefined;
    return (key != null ? versions.find(v => v.key === key) : undefined)
        ?? versions.find(v => v.primary)
        ?? versions[0];
}
