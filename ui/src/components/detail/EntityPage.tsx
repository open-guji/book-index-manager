/**
 * 人物页（孔子、歐陽修这类）—— 2026-09 N3a 三栏版。
 *
 * 中栏：著作表（职任页签 + 斑马表，只解析可见行）；
 * 右栏：提要卡（名号、时代·生卒、别名分类、简介、事实表、CBDB）。
 *
 * 设计稿另有「籍貫 / 官至」「傳記出處」「相關人物」，数据里没有对应字段
 * （2026-09-05 全量 30,120 条 Entity 实测 0%），先不做；补字段时：
 *   Entity.birthplace / Entity.office        → 提要卡事实表两行
 *   Entity.biography_sources[]              → 中栏「傳記出處」区块
 *   Entity.related_people[]                 → 右栏旁栏清单
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { EntityDetailData, AltName } from '../../types';
import type { IndexStorage } from '../../storage/types';
import { useT, useConvert } from '../../i18n';
import { MarkdownText } from '../common/MarkdownText';
import { BidLink, type RenderLink } from './primitives';
import {
    DetailGrid, Sec, MetaLine, TabFilter, MoreLink, SummaryCard, CardFoot,
    type CardFact, type RailNavItem, type RailLink,
} from './layout';
import { normalizeRole, roleFacets, type RoleClass } from '../../core/detail-model';

/** 桌面 cap，与作品页版本表同一量级 */
const CAP_WORKS = 16;

export interface EntityPageProps {
    data: EntityDetailData;
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    /** 左栏顶部（宿主的检索框等） */
    railTop?: React.ReactNode;
    /** 左栏的返回链接 */
    back?: React.ReactNode;
    /** 左栏「更多」：切到丛编目录、extraTabs 等其他页面的入口（由 layout 注入） */
    railLinks?: RailLink[];
}

/** 已解析的作品行 */
interface ResolvedWork {
    id: string;
    title?: string;
    /** 该作品的版本数（_edition_count，缺省时 books ∪ collections 的长度） */
    versionCount?: number;
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
 * 别名分类的显示顺序：字 / 號 / 諡號是正式名号排前面，別名 / 小名这类次要的排后面。
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

const SUBTYPE_LABEL: Record<string, string> = {
    people: '人物', place: '地名', dynasty: '朝代', anonymous: '佚名', collective: '群體',
};

/** 生卒：负数为公元前 */
function yr(n?: number): string {
    return n == null ? '' : (n < 0 ? `前${-n}` : String(n));
}

export const EntityPage: React.FC<EntityPageProps> = ({
    data, transport, onNavigate, renderLink, railTop, back, railLinks,
}) => {
    const t = useT();
    const { convert } = useConvert();

    const [role, setRole] = useState<RoleClass | '全部'>('全部');
    const [showAll, setShowAll] = useState(false);
    const [sort, setSort] = useState<'default' | 'versions'>('default');
    const [resolved, setResolved] = useState<Map<string, ResolvedWork>>(new Map());

    const allRows: WorkRow[] = useMemo(() => (data.works || []).map(w => {
        const r = resolved.get(w.work_id);
        return {
            id: w.work_id,
            title: r?.title ?? w.title ?? w.work_id,
            role: w.role || '',
            cls: normalizeRole(w.role),
            versionCount: r?.versionCount,
            loaded: !!r?.loaded,
        };
    }), [data.works, resolved]);

    const facets = useMemo(() => roleFacets((data.works || []).map(w => w.role)), [data.works]);

    const filtered = useMemo(() => {
        const rows = role === '全部' ? allRows : allRows.filter(r => r.cls === role);
        // 默认保持录入序；按版本数排须全量解析（见 git 历史里的长注释）
        if (sort === 'versions') {
            return [...rows].sort((a, b) => (b.versionCount ?? -1) - (a.versionCount ?? -1));
        }
        return rows;
    }, [allRows, role, sort]);

    const visible = showAll ? filtered : filtered.slice(0, CAP_WORKS);

    /* 只解析当前可见的行：歐陽修 308 部作品，全解析就是 308 次请求 */
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
                        title?: string; books?: string[]; collections?: string[]; _edition_count?: number;
                    };
                    const n = w._edition_count ?? ((w.books?.length ?? 0) + (w.collections?.length ?? 0));
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

    const life = (data.birth_year != null || data.death_year != null)
        ? `${yr(data.birth_year) || '?'}—${yr(data.death_year) || '?'}`
        : '';

    const facts: CardFact[] = useMemo(() => {
        const out: CardFact[] = [];
        for (const g of nameGroups) {
            out.push({ label: g.label, value: g.names.map(n => convert(n)).join('、') });
        }
        if (data.dynasty) out.push({ label: '時代', value: convert(data.dynasty) });
        if (life) out.push({ label: '生卒', value: life });
        const n = (data.works || []).length;
        if (n) out.push({ label: '著作', value: `${n} ${convert('種')}` });
        const cbdb = data.external_ids?.cbdb_id;
        if (cbdb != null) {
            out.push({
                label: 'CBDB',
                value: <>{cbdb}{data.external_ids?.cbdb_match === 'auto' && (
                    <span className="bim-d-meta" title={convert('由姓名、朝代與著作重合度自動匹配，未經人工複核')}>
                        　{convert('自動匹配')}
                    </span>
                )}</>,
            });
        }
        return out;
    }, [data, nameGroups, life, convert]);

    const card = (
        <SummaryCard
            title={convert(data.primary_name || data.title)}
            meta={<MetaLine items={[
                convert(SUBTYPE_LABEL[data.subtype] ?? ''),
                life,
            ]} />}
            description={data.description?.text
                ? <MarkdownText text={data.description.text} style={{ fontSize: 15, lineHeight: 1.85 }} />
                : undefined}
            facts={facts}
            foot={<CardFoot revision={data.revision} revisedAt={data.revised_at} review={data.review} todo={data.todo} />}
        />
    );

    const roleTabs = facets.map(f => ({ key: f.cls as RoleClass | '全部', label: `${f.label} ${f.count}` }));

    const nav: RailNavItem[] = allRows.length
        ? [{ id: 'works', label: '著作', count: allRows.length }]
        : [];

    const main = allRows.length === 0 ? (
        <Sec title="著作">
            <p className="bim-d-meta bim-d-ui" style={{ margin: 0 }}>{convert('尚未著錄該人物的關聯作品。')}</p>
        </Sec>
    ) : (
        <Sec
            id="works"
            title="著作"
            meta={<MetaLine items={[
                convert(`共 ${allRows.length} 種`),
                filtered.length !== allRows.length ? convert(`當前 ${filtered.length} 種`) : '',
            ]} />}
        >
            <div className="bim-d-filters bim-d-ui">
                {roleTabs.length > 1 && (
                    <TabFilter items={roleTabs} value={role}
                        onChange={k => { setRole(k); setShowAll(false); }} />
                )}
                <span className="bim-d-spacer" />
                <button
                    type="button"
                    className="bim-d-tab"
                    aria-pressed={sort === 'versions'}
                    onClick={() => {
                        // 按版本数排必须全量解析，否则未解析的行排不进来
                        if (sort === 'default') setShowAll(true);
                        setSort(s => (s === 'default' ? 'versions' : 'default'));
                    }}
                >
                    {convert(sort === 'default' ? '按版本數排列' : '按著錄順序')}
                </button>
            </div>
            <table className="bim-d-zt">
                <thead className="bim-d-ui">
                    <tr>
                        <th>{convert('作品')}</th>
                        <th>{convert('職任')}</th>
                        <th>{convert('存世版本')}</th>
                    </tr>
                </thead>
                <tbody>
                    {visible.map(row => (
                        <tr key={row.id}>
                            <td className="bim-d-zt-main">
                                <BidLink id={row.id} label={convert(row.title)} onNavigate={onNavigate} renderLink={renderLink} dense />
                            </td>
                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${row.role ? '' : ' bim-d-zt-blank'}`}>
                                {row.role ? convert(row.role) : <span className="bim-d-zt-empty">—</span>}
                            </td>
                            <td className={`bim-d-zt-sub bim-d-zt-nowrap${row.loaded ? '' : ' bim-d-zt-blank'}`}>
                                {!row.loaded ? '' : row.versionCount
                                    ? convert(`${row.versionCount} 種`)
                                    : <span className="bim-d-zt-empty">{convert('未著錄')}</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {visible.length === 0 && (
                <p className="bim-d-meta bim-d-ui" style={{ margin: '12px 12px 0' }}>{convert('該職任下的著作尚未著錄。')}</p>
            )}
            {filtered.length > visible.length && (
                <MoreLink label={`展開其餘 ${filtered.length - visible.length} 種著作`} onClick={() => setShowAll(true)} />
            )}
        </Sec>
    );

    return <DetailGrid railTop={railTop} back={back} nav={nav} railLinks={railLinks} main={main} card={card} />;
};
