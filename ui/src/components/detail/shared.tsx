/**
 * 四张详情页共用的小件：署名行、关系名、存佚名、资源类别名、资源分组。
 */
import React, { useState } from 'react';
import type { AuthorInfo, ResourceEntry, ResourceGroupInfo } from '../../types';
import { useConvert } from '../../i18n';
import {
    displayAuthorRole, bucketResources, resourceNote, resourceDisambiguator,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref, volumeStats } from '../../core/resources';
import { BidLink, VolumeLinks, type RenderLink } from './primitives';

/** related_works.relation → 小一号的浅色文字 */
const RELATION_LABEL: Record<string, string> = {
    part_of: '所屬',
    has_part: '包含',
    contains_text_of: '收錄',
    collected_in: '叢編',
    text_carried_by: '載錄',
    studied_by: '研究',
    studies: '所考',
    preceded_by: '前承',
    followed_by: '後繼',
    derived_from: '衍生',
    has_adaptation: '改編',
    related: '相關',
};

export function relationLabel(r?: string): string {
    if (!r) return RELATION_LABEL.related;
    return RELATION_LABEL[r] ?? r;
}

const LOSS_STATUS: Record<string, string> = {
    extant: '今存',
    fragment: '殘存',
    partial: '殘存',
    lost: '已佚',
    unknown: '未詳',
};

export function lossStatusLabel(s: string): string {
    return LOSS_STATUS[s] ?? s;
}

const KIND: Record<string, string> = {
    text: '全文',
    image: '影印',
    textImage: '圖文',
    physical: '館藏',
};

export function resourceKindLabel(k: string): string {
    return KIND[k] ?? '';
}

/**
 * 署名：〔朝代〕人名 职任，多位作者用全角空格隔开。
 * 朝代用辅助字；有 entity_id 的人名可点到人物页。
 */
export function AuthorByline({ authors, onNavigate, renderLink }: {
    authors?: AuthorInfo[];
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const { convert } = useConvert();
    const list = (authors || []).filter(a => a && a.name);
    if (!list.length) return null;
    return (
        <>
            {list.map((a, i) => {
                const role = displayAuthorRole(a.role);
                return (
                    <React.Fragment key={i}>
                        {i > 0 && '　'}
                        {a.dynasty && <span className="bim-d-meta" style={{ fontSize: 'inherit', marginRight: 2 }}>〔{convert(a.dynasty)}〕</span>}
                        {a.entity_id
                            ? <BidLink id={a.entity_id} label={convert(a.name)} onNavigate={onNavigate} renderLink={renderLink} dense />
                            : convert(a.name)}
                        {role && <span style={{ marginLeft: 4 }}>{convert(role)}</span>}
                    </React.Fragment>
                );
            })}
        </>
    );
}

// ══════════════════════════════════════════════════════════════
// 资源分组（B1：版本页、丛编页共用）
// ══════════════════════════════════════════════════════════════

/** 一组资源：组名（可空）+ 一句说明 + 若干行 + 一行镜像链接 */
export interface ResourceGroupView {
    key: string;
    label?: string;
    description?: string;
    rows: ResourceEntry[];
    mirrors: ResourceEntry[];
}

/**
 * 把资源拆成「站外全文」与「影印 / 馆藏分组」两份。
 *
 * - resource_groups 的每组成一组：origin 和未标 role 的逐行列，mirror 收成一行链接
 *   （程甲本 7 行 → 3 行：旧版逐行在第二列重复写同一个组名）；
 * - 不属于任何组的图像、图文资源并成一组；有带名字的组时它叫「其他影印」，否则不写组名；
 * - 馆藏（physical）单成「館藏」一组，排最后；
 * - 纯文字资源（维基文库这类）不进分组，交给调用方放到「全文」区块。
 */
export function splitResources(
    items: ResourceEntry[] | undefined,
    groups?: Record<string, ResourceGroupInfo>,
): { text: ResourceEntry[]; groups: ResourceGroupView[] } {
    const b = bucketResources(items, groups);
    const out: ResourceGroupView[] = b.mirrors.map(g => ({
        key: g.key,
        label: g.label,
        description: g.description,
        rows: g.items.filter(r => r.group_role !== 'mirror'),
        mirrors: g.items.filter(r => r.group_role === 'mirror'),
    }));
    const loose = b.buckets
        .filter(k => k.key === 'image' || k.key === 'textImage')
        .flatMap(k => k.items);
    if (loose.length) {
        out.push({ key: '_images', label: out.length ? '其他影印' : undefined, rows: loose, mirrors: [] });
    }
    const physical = b.buckets.find(k => k.key === 'physical')?.items ?? [];
    if (physical.length) out.push({ key: '_physical', label: '館藏', rows: physical, mirrors: [] });
    const text = b.buckets.find(k => k.key === 'text')?.items ?? [];
    return { text, groups: out };
}

/** 资源显示名：URL 能认出站点的用站点名，同名的加区分语 */
export function resourceName(item: ResourceEntry, siblings: ResourceEntry[]): string {
    const base = (item.url ? getDisplayNameFromUrl(item.url) : undefined) || item.name;
    const suffix = resourceDisambiguator(item, siblings);
    return suffix ? `${base}（${suffix}）` : base;
}

/** 资源一行：名称 ↗（下附说明小字）｜「展开 N 册」 */
export function ResourceRow({ item, siblings, listedVolumeCounts }: {
    item: ResourceEntry;
    siblings: ResourceEntry[];
    /** 「收入叢編」已列出的册数；与本资源分册数相同时不再给展开（展开的是同一串册号） */
    listedVolumeCounts?: Set<number>;
}) {
    const { convert } = useConvert();
    const [open, setOpen] = useState(false);
    const stats = volumeStats(item);
    const hasVolumes = !!stats && stats.expected > 0 && !listedVolumeCounts?.has(stats.expected);
    const name = convert(resourceName(item, siblings));
    const href = resourceHref(item);
    const note = resourceNote(item) || item.details;
    return (
        <tr>
            <td className="bim-d-zt-main">
                {href
                    ? <a href={href} target="_blank" rel="noopener noreferrer">{name} <span aria-hidden="true">↗</span></a>
                    : <span className="bim-d-zt-name">{name}</span>}
                {note && <span className="bim-d-meta">{convert(note)}</span>}
                {hasVolumes && open && (
                    <div style={{ padding: '0 12px 10px' }}><VolumeLinks item={item} /></div>
                )}
            </td>
            <td className={hasVolumes ? undefined : 'bim-d-zt-blank'} style={{ textAlign: 'right' }}>
                {hasVolumes && (
                    <button type="button" className="bim-d-more bim-d-ui" style={{ marginTop: 0 }}
                        aria-expanded={open} onClick={() => setOpen(v => !v)}>
                        {convert(open ? '收起分冊' : `展開 ${stats!.expected} 冊`)}
                    </button>
                )}
            </td>
        </tr>
    );
}

/** 资源分组列表：组名 → 一句说明 → 斑马行 → 「鏡像」一行 */
export function ResourceGroupList({ groups, listedVolumeCounts }: {
    groups: ResourceGroupView[];
    listedVolumeCounts?: Set<number>;
}) {
    const { convert } = useConvert();
    return (
        <>
            {groups.map(g => (
                <div key={g.key} className="bim-d-rg">
                    {g.label && <h3 className="bim-d-rg-h bim-d-ui">{convert(g.label)}</h3>}
                    {g.description && <p className="bim-d-rg-d">{convert(g.description)}</p>}
                    {g.rows.length > 0 && (
                        <table className="bim-d-zt">
                            <tbody>
                                {g.rows.map((r, i) => (
                                    <ResourceRow key={`${r.id || r.url || r.name}-${i}`} item={r} siblings={g.rows}
                                        listedVolumeCounts={listedVolumeCounts} />
                                ))}
                            </tbody>
                        </table>
                    )}
                    {g.mirrors.length > 0 && (
                        <div className="bim-d-rg-mir bim-d-ui">
                            {g.rows.length > 0 && <span className="bim-d-meta" style={{ marginRight: 10 }}>{convert('鏡像')}</span>}
                            {g.mirrors.map((m, i) => {
                                const href = resourceHref(m);
                                const name = convert(resourceName(m, g.mirrors));
                                return href
                                    ? <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                                        title={m.details ? convert(m.details) : undefined}>{name} <span aria-hidden="true">↗</span></a>
                                    : <span key={i} style={{ marginRight: 14 }}>{name}</span>;
                            })}
                        </div>
                    )}
                </div>
            ))}
        </>
    );
}
