/**
 * 人物页（歐陽修这类）。
 *
 * 区块：header → intro(别名 + 简介 + facts) → 相關作品。
 *
 * 设计稿另有「籍貫 / 官至」两条 facts、「傳記出處」与「相關人物」两个区块，
 * **数据里没有对应字段**（2026-09-05 全量 30,120 条 Entity 实测）：
 *   籍貫 / 官至          0%   —— 无此字段
 *   傳記出處             0%   —— Entity 无 sources / indexed_by；
 *                              Work.indexed_by 是「作品被书目著录」，语义不同不能借用
 *   相關人物             —    —— 只能从共同署名的作品反推，而 ≥2 个关联作者的
 *                              Work 只占 0.49%，绝大多数人物推不出任何人
 * 2026-09-05 决定：这三块先不做，等录入侧补了字段再加。补的时候需要：
 *   Entity.birthplace / Entity.office        → facts 两行
 *   Entity.biography_sources[{source, source_bid, location, summary}] → 傳記出處
 *   Entity.related_people[{entity_id, relation}]                      → 相關人物
 * 版式上已经预留：facts 是数组驱动，两个区块按 §PairGrid 并排即可。
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { EntityDetailData, AltName } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import {
    Section, SectionHead, IntroGrid, FactList, DataTable, TableHead, TableRow,
    MoreButton, FilterChip, TextButton, BidLink, Dash, EmptyNote,
    type FactItem, type RenderLink,
} from './primitives';
import { normalizeRole, roleFacets, type RoleClass } from '../../core/detail-model';

/** 桌面 cap，与作品页版本表同一量级 */
const CAP_WORKS = 16;


export interface EntityPageProps {
    data: EntityDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}

/** 已解析的作品行 */
interface ResolvedWork {
    id: string;
    title?: string;
    /** 该作品的版本数（Work.books ∪ collections 的长度） */
    versionCount?: number;
    /** 是否已解析过（未解析时版本列显示空白而非「未著錄版本」） */
    loaded?: boolean;
}

interface WorkRow {
    id: string;
    title: string;
    /** 原始 role 原样显示——「等奉敕撰」与「撰」的区别对版本学有意义 */
    role: string;
    cls: RoleClass;
    versionCount?: number;
    loaded: boolean;
}

/**
 * 别名分类的显示顺序。
 *
 * 傅山有 67 个别名（號 38 / 別名 24 / 字 5），平铺一片没有主次。
 * 字 / 號 / 諡號是正式名号，排前面；別名 / 小名 / 小字这类次要的排后面。
 */
const ALT_NAME_ORDER = [
    '本名', '字', '號', '号', '諡號', '谥号', '尊號', '尊号', '廟號', '庙号',
    '法號', '法号', '道號', '道号', '年號', '年号', '常用名', '別名', '别名',
    '小名', '小字', '行第', '俗姓', '俗名', '稱號', '称号', '賜號', '赐号', '簡體', '简体',
];

function altNameRank(type?: string): number {
    if (!type) return ALT_NAME_ORDER.length;
    const i = ALT_NAME_ORDER.indexOf(type);
    return i === -1 ? ALT_NAME_ORDER.length : i;
}

export const EntityPage: React.FC<EntityPageProps> = ({
    data, transport, onNavigate, renderLink,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [role, setRole] = useState<RoleClass | '全部'>('全部');
    const [showAll, setShowAll] = useState(false);
    const [sort, setSort] = useState<'default' | 'versions'>('default');
    const [resolved, setResolved] = useState<Map<string, ResolvedWork>>(new Map());

    // ── 作品行（先不解析，标题/版本数按需补） ──
    const allRows: WorkRow[] = useMemo(() => {
        const refs = data.works || [];
        return refs.map(w => {
            const r = resolved.get(w.work_id);
            return {
                id: w.work_id,
                title: r?.title ?? w.work_id,
                role: w.role || '',
                cls: normalizeRole(w.role),
                versionCount: r?.versionCount,
                loaded: !!r?.loaded,
            };
        });
    }, [data.works, resolved]);

    const facets = useMemo(
        () => roleFacets((data.works || []).map(w => w.role)),
        [data.works],
    );

    const filtered = useMemo(() => {
        const rows = role === '全部' ? allRows : allRows.filter(r => r.cls === role);
        /*
         * 默认保持录入序。
         *
         * 设计稿的「排序：重要程度」背后是一个 rank 字段，那是设计时编的
         * 示例数据——真实数据里没有权重字段。曾试过用「版本数」近似，
         * 但版本数要逐条发请求才知道，而我们只解析可见的 16 行；
         * 为了排序去预解析 60 条（请求 17 → 61）换来的收益极小：
         * 实测欧阳修 308 部作品的版本数全在 0–6 之间，排出来的顺序与
         * 录入序差别不大（他名下并无《新唐書》条目，只有第 79 位的
         * 《新唐書·藝文志》，1 个版本）。不值这个请求量。
         *
         * 想按版本数看的读者，点「排序：版本數量」即可——那时展开全部、
         * 全量解析是明确的用户意图。
         */
        if (sort === 'versions') {
            // 未解析的（undefined）排最后，避免解析过程中乱跳
            return [...rows].sort((a, b) => (b.versionCount ?? -1) - (a.versionCount ?? -1));
        }
        return rows;
    }, [allRows, role, sort]);

    const visible = showAll ? filtered : filtered.slice(0, CAP_WORKS);

    /*
     * 只解析当前可见的行。
     *
     * 歐陽修有 308 部作品，全解析就是 308 次请求（旧版人物页正是这样，
     * 页面高 9364px、一次性挂 309 个链接）。这里与作品页的版本表同策略：
     * 只取 cap 内的行，展开或切换筛选时再补。
     */
    const idsToResolve = useMemo(
        () => visible.filter(r => !resolved.has(r.id)).map(r => r.id),
        [visible, resolved],
    );

    useEffect(() => {
        if (!transport || idsToResolve.length === 0) return;
        let cancelled = false;
        Promise.all(idsToResolve.map(id =>
            transport.getItem(id)
                .then(raw => {
                    const w = (raw ?? {}) as {
                        title?: string;
                        books?: string[];
                        collections?: string[];
                    };
                    const n = (w.books?.length ?? 0) + (w.collections?.length ?? 0);
                    return [id, { id, title: w.title, versionCount: n, loaded: true }] as const;
                })
                .catch(() => [id, { id, loaded: true }] as const),
        )).then(entries => {
            if (cancelled) return;
            setResolved(prev => {
                const next = new Map(prev);
                for (const [id, v] of entries) next.set(id, v);
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [transport, idsToResolve]);

    // ── 别名（按类分组，正式名号在前） ──
    const nameGroups = useMemo(() => {
        const byType = new Map<string, string[]>();
        for (const a of (data.alt_names || []) as AltName[]) {
            const k = a.type || t.section.aliases;
            if (!byType.has(k)) byType.set(k, []);
            byType.get(k)!.push(a.name);
        }
        return [...byType.entries()]
            .sort((a, b) => altNameRank(a[0]) - altNameRank(b[0]))
            .map(([k, names]) => ({ label: k, names }));
    }, [data.alt_names, t]);

    // ── facts ──
    const facts: FactItem[] = useMemo(() => {
        const out: FactItem[] = [];
        if (data.dynasty) out.push({ label: '時代', value: convert(data.dynasty) });

        // 生卒：负数为公元前
        const yr = (n?: number) => n == null ? '' : (n < 0 ? `前${-n}` : String(n));
        if (data.birth_year != null || data.death_year != null) {
            out.push({
                label: '生卒',
                value: `${yr(data.birth_year) || '?'}—${yr(data.death_year) || '?'}`,
            });
        }

        const n = (data.works || []).length;
        if (n) out.push({ label: '著作數', value: `${n} 種` });

        return out;
    }, [data, convert]);

    const cbdb = data.external_ids?.cbdb_id;
    const hasIntroText = !!data.description?.text;

    return (
        <>
            <IntroGrid facts={facts.length ? <FactList items={facts} /> : undefined}>
                {(nameGroups.length > 0 || hasIntroText) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {nameGroups.length > 0 && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '8px 26px', fontSize: 14,
                            }}>
                                {nameGroups.map(g => (
                                    <span key={g.label} style={{
                                        display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0,
                                    }}>
                                        <span className="bim-d-ui" style={{
                                            fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                                            letterSpacing: '.1em', flex: 'none',
                                        }}>
                                            {convert(g.label)}
                                        </span>
                                        <span style={{ color: 'var(--bim-ink, #2a231c)' }}>
                                            {g.names.map(n => convert(n)).join(' · ')}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}
                        {hasIntroText && (
                            <MarkdownText
                                text={data.description!.text}
                                style={{
                                    fontSize: 14, lineHeight: 2,
                                    color: 'var(--bim-body-fg, #3b3228)', textAlign: 'justify',
                                }}
                            />
                        )}
                    </div>
                )}
            </IntroGrid>

            {/* ── 相關作品 ── */}
            {allRows.length > 0 && (
                <Section style={{ marginBottom: 0 }}>
                    <SectionHead
                        glyph="著"
                        title={t.label.relatedWorks}
                        count={
                            filtered.length === allRows.length
                                ? `${allRows.length} 種`
                                : `${allRows.length} 種 · 當前 ${filtered.length} 種`
                        }
                        actions={
                            <TextButton
                                label={sort === 'default' ? '排序：著錄順序' : '排序：版本數量'}
                                onClick={() => {
                                    // 按版本数排必须全量解析，否则未解析的行排不进来
                                    setSort(s => {
                                        if (s === 'default') setShowAll(true);
                                        return s === 'default' ? 'versions' : 'default';
                                    });
                                }}
                            />
                        }
                    />

                    {facets.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                            {facets.map(f => (
                                <FilterChip
                                    key={f.cls}
                                    label={`${f.label} ${f.count}`}
                                    active={role === f.cls}
                                    onClick={() => {
                                        setRole(f.cls as RoleClass | '全部');
                                        setShowAll(false);
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    <DataTable>
                        <TableHead
                            leadWidth={26}
                            metaWidth={300}
                            mainLabel="作品名稱"
                            metaColumns={[
                                { label: '職任', width: '72px' },
                                { label: '存世版本', width: '1fr' },
                            ]}
                        />
                        {visible.map((row, i) => (
                            <TableRow
                                key={row.id}
                                no={String(i + 1).padStart(2, '0')}
                                leadWidth={26}
                                metaWidth={300}
                                metaColumns={['72px', '1fr']}
                                main={
                                    <BidLink
                                        id={row.id}
                                        label={convert(row.title)}
                                        onNavigate={onNavigate}
                                        renderLink={renderLink}
                                        dense
                                    />
                                }
                                meta={
                                    <>
                                        <span style={{ color: 'var(--bim-meta-fg, #7b6a54)' }}>
                                            {row.role ? convert(row.role) : <Dash />}
                                        </span>
                                        <span className="bim-d-ui" style={{
                                            color: 'var(--bim-label-fg, #a3937b)',
                                        }}>
                                            {!row.loaded
                                                ? ''
                                                : row.versionCount
                                                    ? `${row.versionCount} 種版本`
                                                    : <span style={{ color: 'var(--bim-hint-fg, #cbbda0)' }}>
                                                        未著錄版本
                                                    </span>}
                                        </span>
                                    </>
                                }
                            />
                        ))}
                        {visible.length === 0 && (
                            <EmptyNote>該職任下的著作尚未著錄。</EmptyNote>
                        )}
                    </DataTable>

                    {filtered.length > visible.length && (
                        <MoreButton
                            label={`展開其餘 ${filtered.length - visible.length} 條著作`}
                            onClick={() => setShowAll(true)}
                        />
                    )}

                    {cbdb != null && (
                        <div className="bim-d-ui" style={{
                            marginTop: 14, fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                        }}>
                            人物編號 CBDB {cbdb}
                            {data.external_ids?.cbdb_match === 'auto' && (
                                <span title="由姓名、朝代与著作重合度自动匹配，未经人工复核">
                                    {' '}· 自動匹配
                                </span>
                            )}
                        </div>
                    )}
                </Section>
            )}
        </>
    );
};
