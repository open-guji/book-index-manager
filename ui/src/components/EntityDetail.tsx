import React, { useState, useEffect } from 'react';
import type {
    EntityDetailData,
    AltName,
    EntityWorkRef,
    IndexEntry,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { extractStatus } from '../id';
import { useT, useConvert } from '../i18n';
import { useBidUrl } from '../core/bid-url';

export interface EntityDetailProps {
    data: EntityDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
    headerExtra?: React.ReactNode;
}

// ── 工具：判断是否为占位 Entity（信息暂缺）
function isPlaceholderEntity(d: EntityDetailData): boolean {
    return !d.dynasty && !d.birth_year && !d.death_year
        && (!d.alt_names || d.alt_names.length === 0)
        && !d.description?.text;
}

// ── 子组件：朝代+生卒年角标
function DynastyAndYears({ data }: { data: EntityDetailData }) {
    const { convert } = useConvert();
    const { dynasty, birth_year, death_year } = data;
    const parts: string[] = [];
    if (dynasty) parts.push(`〔${convert(dynasty)}〕`);
    if (birth_year !== undefined && death_year !== undefined) {
        parts.push(`${birth_year}—${death_year}`);
    } else if (birth_year !== undefined) {
        parts.push(`${birth_year}—?`);
    } else if (death_year !== undefined) {
        parts.push(`?—${death_year}`);
    }
    if (parts.length === 0) return null;
    return (
        <span style={{
            fontSize: '14px',
            color: 'var(--bim-desc-fg, #717171)',
            marginLeft: '8px',
            fontWeight: 'normal',
        }}>
            {parts.join(' ')}
        </span>
    );
}

// ── 子组件：alt_names 按 type 分组展示
function AltNamesSection({ alt_names }: { alt_names: AltName[] }) {
    const { convert } = useConvert();
    // 按 type 分组（保持稳定顺序）
    const groups = new Map<string, string[]>();
    for (const an of alt_names) {
        const t = an.type || '別名';
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t)!.push(an.name);
    }
    // 排序：常用类型在前
    const ORDER = ['字', '號', '本名', '諡號', '賜號', '常用名', '別名', '稱號', '簡體',
                   '行第', '小名', '小字', '俗姓', '俗名', '廟號', '尊號', '法號', '道號', '年號'];
    const sortedTypes = [...groups.keys()].sort((a, b) => {
        const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });

    return (
        <div style={{
            fontSize: '14px',
            color: 'var(--bim-fg, #444)',
            lineHeight: 1.9,
            margin: '8px 0 4px',
        }}>
            {sortedTypes.map(type => {
                const names = groups.get(type)!;
                return (
                    <div key={type} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                        <span style={{
                            color: 'var(--bim-desc-fg, #999)',
                            fontSize: '12px',
                            minWidth: '36px',
                            paddingTop: '2px',
                        }}>{type}</span>
                        <span>
                            {names.map((n, i) => (
                                <span key={i}>
                                    {i > 0 && <span style={{ color: 'var(--bim-desc-fg, #aaa)', margin: '0 4px' }}>·</span>}
                                    {convert(n)}
                                </span>
                            ))}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── 子组件：external_ids 外链
function ExternalIdsSection({ data }: { data: EntityDetailData }) {
    const ext = data.external_ids;
    if (!ext) return null;
    const items: React.ReactNode[] = [];
    if (ext.cbdb_id) {
        items.push(
            <a
                key="cbdb"
                href={`https://cbdb.fas.harvard.edu/cbdbapi/person.php?id=${ext.cbdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    fontSize: '12px',
                    color: 'var(--bim-link-fg, #0066cc)',
                    border: '1px solid var(--bim-link-fg, #0066cc)40',
                    borderRadius: '3px',
                    textDecoration: 'none',
                    background: 'var(--bim-link-fg, #0066cc)08',
                }}
                title="CBDB 中国历代人物传记数据库"
            >
                CBDB {ext.cbdb_id}
            </a>
        );
    }
    if (items.length === 0) return null;
    return (
        <div style={{
            display: 'flex',
            gap: '6px',
            margin: '8px 0',
            alignItems: 'center',
            flexWrap: 'wrap',
        }}>
            {items}
        </div>
    );
}

// ── 子组件：作品列表（按 role 分组）
function WorksSection({ works, transport, onNavigate, renderLink }: {
    works: EntityWorkRef[];
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    const t = useT();
    const { convert } = useConvert();
    const buildUrl = useBidUrl();
    const [titles, setTitles] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        if (!transport) return;
        let cancelled = false;
        const ids = works.map(w => w.work_id);
        // 优先用 getEntry（轻量），失败再 getItem
        Promise.all(ids.map(async wid => {
            try {
                if (transport.getEntry) {
                    const e = await transport.getEntry(wid);
                    if (e?.title) return [wid, e.title] as const;
                }
                const item = await transport.getItem(wid);
                const title = item ? ((item.title as string) || (item.primary_name as string) || wid) : wid;
                return [wid, title] as const;
            } catch {
                return [wid, wid] as const;
            }
        })).then(pairs => {
            if (cancelled) return;
            const m = new Map<string, string>();
            for (const [wid, title] of pairs) m.set(wid, title);
            setTitles(m);
        });
        return () => { cancelled = true; };
    }, [works, transport]);

    // 按 role 分组
    const groups = new Map<string, EntityWorkRef[]>();
    for (const w of works) {
        const r = w.role || '';
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r)!.push(w);
    }
    const ROLE_ORDER = ['撰', '編', '注', '輯', '集', '校', '評', '譯', '述', '作', ''];
    const sortedRoles = [...groups.keys()].sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(a), bi = ROLE_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });

    return (
        <div style={{ marginTop: '12px' }}>
            <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--bim-fg, #333)',
                margin: '0 0 8px',
                paddingBottom: '4px',
                borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
            }}>
                {t.label.relatedWorks} <span style={{
                    color: 'var(--bim-desc-fg, #999)',
                    fontWeight: 'normal',
                    fontSize: '12px',
                }}>({works.length})</span>
            </h3>
            {sortedRoles.map(role => {
                const items = groups.get(role)!;
                return (
                    <div key={role} style={{ marginBottom: '8px' }}>
                        {role && (
                            <div style={{
                                fontSize: '12px',
                                color: 'var(--bim-desc-fg, #999)',
                                marginBottom: '2px',
                            }}>
                                {convert(role)} <span style={{ color: 'var(--bim-desc-fg, #bbb)' }}>({items.length})</span>
                            </div>
                        )}
                        <ul style={{
                            margin: 0,
                            paddingLeft: role ? '16px' : '0',
                            listStyle: role ? 'disc' : 'none',
                            fontSize: '14px',
                            lineHeight: 1.8,
                        }}>
                            {items.map((w, i) => {
                                const label = convert(titles.get(w.work_id) || w.work_id);
                                if (renderLink) {
                                    return <li key={i}>{renderLink(w.work_id, label)}</li>;
                                }
                                if (onNavigate) {
                                    return (
                                        <li key={i}>
                                            <a
                                                href={buildUrl(w.work_id)}
                                                onClick={e => {
                                                    if (e.metaKey || e.ctrlKey) return;
                                                    e.preventDefault();
                                                    onNavigate(w.work_id);
                                                }}
                                                style={{
                                                    color: 'var(--bim-link-fg, #0066cc)',
                                                    textDecoration: 'underline',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {label}
                                            </a>
                                        </li>
                                    );
                                }
                                return <li key={i}>{label}</li>;
                            })}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}

// ── 主组件
export const EntityDetail: React.FC<EntityDetailProps> = ({
    data,
    transport,
    onNavigate,
    renderLink,
    headerExtra,
}) => {
    const t = useT();
    const { convert } = useConvert();

    let isDraft = false;
    try { isDraft = extractStatus(data.id) === 'draft'; } catch {}

    const placeholder = isPlaceholderEntity(data);
    const subtypeLabel = data.subtype === 'people' ? '人物'
        : data.subtype === 'place' ? '地名'
        : data.subtype === 'dynasty' ? '朝代'
        : data.subtype === 'anonymous' ? '佚名'
        : data.subtype === 'collective' ? '集体'
        : data.subtype;

    return (
        <div>
            {/* 标题行 */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '4px',
            }}>
                <h1 style={{
                    fontSize: 'clamp(18px, 4vw, 24px)',
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1.3,
                    color: 'var(--bim-fg, #222)',
                }}>
                    {convert(data.primary_name)}
                    <DynastyAndYears data={data} />
                </h1>
                {headerExtra}
            </div>

            {/* 类型 + 草稿标记 + ID */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: 'var(--bim-desc-fg, #999)',
                marginBottom: '8px',
            }}>
                <span style={{
                    display: 'inline-block',
                    padding: '1px 6px',
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '1px',
                    color: '#5b3e8e',
                    border: '1px solid #5b3e8e40',
                    borderRadius: '2px',
                    background: '#5b3e8e08',
                }}>
                    {t.indexType.entity}
                </span>
                {subtypeLabel && data.subtype !== 'people' && (
                    <span>{subtypeLabel}</span>
                )}
                {isDraft && (
                    <span style={{
                        padding: '1px 6px',
                        background: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '2px',
                        color: '#856404',
                    }}>
                        {t.status.draft}
                    </span>
                )}
                <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>{data.id}</span>
            </div>

            {/* 占位提示 */}
            {placeholder && (
                <div style={{
                    fontSize: '13px',
                    color: 'var(--bim-desc-fg, #999)',
                    fontStyle: 'italic',
                    padding: '8px 12px',
                    background: 'var(--bim-widget-bg, #f8f8f8)',
                    border: '1px dashed var(--bim-widget-border, #ddd)',
                    borderRadius: '4px',
                    margin: '8px 0',
                }}>
                    人物信息暂缺。该 Entity 仅作为作者占位，详细生平资料尚待补充。
                </div>
            )}

            {/* 别名 */}
            {data.alt_names && data.alt_names.length > 0 && (
                <AltNamesSection alt_names={data.alt_names} />
            )}

            {/* 外部 ID */}
            <ExternalIdsSection data={data} />

            {/* 简介 */}
            {data.description?.text && (
                <p style={{
                    fontSize: '14px',
                    color: 'var(--bim-fg, #444)',
                    lineHeight: 1.9,
                    margin: '8px 0',
                    textAlign: 'justify',
                }}>
                    {convert(data.description.text)}
                </p>
            )}

            {/* 作品列表 */}
            {data.works && data.works.length > 0 && (
                <WorksSection
                    works={data.works}
                    transport={transport}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                />
            )}
        </div>
    );
};
