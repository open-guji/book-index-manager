/**
 * 阅读器「版本」下拉框的数据换算（overview#235）。
 */
import type { ReaderVersion } from './types';

/** 选项文字：`version_label · source_name`；版本说明里已含来源名时不重复 */
export function readerVersionOptionLabel(v: ReaderVersion): string {
    if (v.optionLabel) return v.optionLabel;
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
