/**
 * 四张详情页共用的小件：署名行、关系名、存佚名、资源类别名、资源分组。
 */
import React, { useState } from 'react';
import type { AuthorInfo, ResourceEntry, ResourceGroupInfo } from '../../types';
import { useI18n, getT } from '../../i18n';
import type { MessageKey, TFunction } from '../../i18n';
import { detail } from '../../i18n/messages/detail';
import {
    displayAuthorRole, bucketResources, resourceNote, resourceDisambiguator,
} from '../../core/detail-model';
import { getDisplayNameFromUrl, resourceHref, volumeStats } from '../../core/resources';
import type { BimTokenName } from '../../styles/tokens';
import { BidLink, VolumeLinks, type RenderLink } from './primitives';

/*
 * 关系名、存佚名、资源类别名的字面都在字典 detail.relation / detail.lossStatus / detail.resourceKind。
 * t 不传时按繁体（与改前一致）；组件里请传 useI18n().t，简体模式才有简体字。
 */
const RELATION_KEYS = detail['zh-Hant'].relation;
const LOSS_STATUS_KEYS = detail['zh-Hant'].lossStatus;
const KIND_KEYS = detail['zh-Hant'].resourceKind;
const hantT = getT('zh-Hant');
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** related_works.relation → 小一号的浅色文字；未知值原样返回（数据原文，调用方 convert） */
export function relationLabel(r?: string, t: TFunction = hantT): string {
    if (!r) return t('detail.relation.related');
    return has(RELATION_KEYS, r) ? t(`detail.relation.${r}` as MessageKey) : r;
}

export function lossStatusLabel(s: string, t: TFunction = hantT): string {
    return has(LOSS_STATUS_KEYS, s) ? t(`detail.lossStatus.${s}` as MessageKey) : s;
}

export function resourceKindLabel(k: string, t: TFunction = hantT): string {
    return has(KIND_KEYS, k) ? t(`detail.resourceKind.${k}` as MessageKey) : '';
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
    const { convert } = useI18n();
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
    /** 组名「其他影印」「館藏」的字典；不传按繁体 */
    t: TFunction = hantT,
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
        out.push({ key: '_images', label: out.length ? t('detail.otherImages') : undefined, rows: loose, mirrors: [] });
    }
    const physical = b.buckets.find(k => k.key === 'physical')?.items ?? [];
    if (physical.length) out.push({ key: '_physical', label: t('detail.resourceKind.physical'), rows: physical, mirrors: [] });
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
    const { t, convert } = useI18n();
    const [open, setOpen] = useState(false);
    const stats = volumeStats(item);
    const hasVolumes = !!stats && stats.expected > 0 && !listedVolumeCounts?.has(stats.expected);
    const name = convert(resourceName(item, siblings));
    const href = resourceHref(item);
    const note = resourceNote(item, t) || item.details;
    return (
        <tr>
            <td className="bim-d-zt-main">
                {/* 结构化标记才出标签：metadata.fragment（殘片）、color_mode（彩色／黑白）；说明文字里写的不拆。标签放在名称同一行内 */}
                {(() => {
                    const tags = (item.metadata?.fragment || item.color_mode) ? (
                        <span className="bim-d-tags bim-d-ui" style={{ display: 'inline-flex', margin: '0 0 0 8px', verticalAlign: 'middle' }}>
                            {item.metadata?.fragment && <span className="bim-d-tag">{t('detail.fragmentTag')}</span>}
                            {item.color_mode && <span className="bim-d-tag">{item.color_mode === 'color' ? t('colorMode.color') : t('colorMode.bw')}</span>}
                        </span>
                    ) : null;
                    return href
                        ? <a href={href} target="_blank" rel="noopener noreferrer">{name} <span aria-hidden="true">↗</span>{tags}</a>
                        : <span className="bim-d-zt-name">{name}{tags}</span>;
                })()}
                {note && <span className="bim-d-meta">{convert(note)}</span>}
                {hasVolumes && open && (
                    <div style={{ padding: '0 12px 10px' }}><VolumeLinks item={item} /></div>
                )}
            </td>
            <td className={hasVolumes ? undefined : 'bim-d-zt-blank'} style={{ textAlign: 'right' }}>
                {hasVolumes && (
                    <button type="button" className="bim-d-more bim-d-ui" style={{ marginTop: 0 }}
                        aria-expanded={open} onClick={() => setOpen(v => !v)}>
                        {open ? t('detail.collapseVolumes') : t('detail.expandVolumes', { n: stats!.expected })}
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
    const { t, convert } = useI18n();
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
                            {g.rows.length > 0 && <span className="bim-d-meta" style={{ marginRight: 10 }}>{t('detail.mirror')}</span>}
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

// ══════════════════════════════════════════════════════════════

/** 四部分布条的顺序与色（色取 --bim-sect-*） */
export const SECTIONS: { key: string; label: string; token: BimTokenName }[] = [
    { key: '經部', label: '經部', token: 'sect-jing' },
    { key: '史部', label: '史部', token: 'sect-shi' },
    { key: '子部', label: '子部', token: 'sect-zi' },
    { key: '集部', label: '集部', token: 'sect-ji' },
];

/** 分类里的「经部」「经」等简繁统一到 SECTIONS.key */
export function sectionKey(l1?: string): string | undefined {
    if (!l1) return undefined;
    const t = l1.replace(/经/g, '經').replace(/史/g, '史').replace(/集/g, '集');
    return SECTIONS.find(x => t.startsWith(x.key[0]))?.key;
}
