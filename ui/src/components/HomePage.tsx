import React, { useState, useEffect } from 'react';
import type { IndexEntry, IndexType, ResourceProgress, ResourceProgressItem, ResourceImportStatus, RecommendedData } from '../types';
import type { IndexStorage } from '../storage/types';
import { useT } from '../i18n';
import { formatTemplate } from '../i18n';

export interface RecommendedItem {
    id: string;
    title: string;
    description?: string;
    group?: string;
}

export interface HomePageProps {
    transport: IndexStorage;
    onNavigate?: (id: string) => void;
    /** 推荐条目 ID 列表 */
    recommendedIds?: RecommendedItem[];
    /** 受控 tab（不传则内部管理） */
    activeTab?: TabKey;
    /** tab 切换回调 */
    onTabChange?: (tab: TabKey) => void;
}

interface Stats {
    works: number;
    books: number;
    collections: number;
}

export type TabKey = 'recommend' | 'catalog' | 'site';

const DEFAULT_RECOMMENDED: RecommendedItem[] = [
    // 重要叢編
    { id: 'FCNcSJbF77V', title: '欽定四庫全書·文淵閣本', description: '清·紀昀等編，藏於臺灣國立故宮博物院', group: '重要叢編' },
    { id: 'FCPFLm7Uie3', title: '欽定四庫全書·文源閣本', description: '清·紀昀等編，已毀於英法聯軍', group: '重要叢編' },
    { id: 'FCPFLywwwNP', title: '欽定四庫全書·文溯閣本', description: '清·紀昀等編，藏於甘肅省圖書館', group: '重要叢編' },
    { id: 'FCPFMeX1suq', title: '欽定四庫全書·文津閣本', description: '清·紀昀等編，藏於中國國家圖書館', group: '重要叢編' },
    // 經典作品
    { id: 'GY4HvsY3w3u', title: '欽定四庫全書總目', description: '清·紀昀等編，200卷', group: '經典作品' },
    { id: 'GY4JLP3nDUB', title: '欽定四庫全書', description: '清乾隆38-52年，紀昀等編纂', group: '經典作品' },
    { id: 'GY3ty2LN9ro', title: '易經', description: '西周·周文王', group: '經典作品' },
    { id: 'GY4JM7j7yi7', title: '史記', description: '西漢·司馬遷', group: '經典作品' },
];

export const HomePage: React.FC<HomePageProps> = ({
    transport,
    onNavigate,
    recommendedIds,
    activeTab: controlledTab,
    onTabChange,
}) => {
    const t = useT();
    const [stats, setStats] = useState<Stats | null>(null);
    const [recommended, setRecommended] = useState<(IndexEntry & { group?: string; fallbackDescription?: string })[]>([]);
    const [internalTab, setInternalTab] = useState<TabKey>('recommend');
    const activeTab = controlledTab ?? internalTab;
    const setActiveTab = (tab: TabKey) => {
        setInternalTab(tab);
        onTabChange?.(tab);
    };
    const [catalogProgress, setCatalogProgress] = useState<ResourceProgress | null>(null);
    const [siteProgress, setSiteProgress] = useState<ResourceProgress | null>(null);

    // 加载统计数据
    useEffect(() => {
        if (!transport.getAllEntries) return;
        let cancelled = false;
        transport.getAllEntries().then(entries => {
            if (cancelled) return;
            const works = entries.filter(e => e.type === 'work').length;
            const books = entries.filter(e => e.type === 'book').length;
            const collections = entries.filter(e => e.type === 'collection').length;
            setStats({ works, books, collections });
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [transport]);

    // 加载推荐条目：优先从 transport 加载 recommended.json，其次用 props，最后用默认值
    useEffect(() => {
        let cancelled = false;

        const resolveIds = async (): Promise<RecommendedItem[]> => {
            if (recommendedIds) return recommendedIds;
            if (transport.getRecommended) {
                try {
                    const data = await transport.getRecommended();
                    if (data?.groups) {
                        return data.groups.flatMap(g =>
                            g.items.map(item => ({ ...item, group: g.name }))
                        );
                    }
                } catch { /* fallback */ }
            }
            return DEFAULT_RECOMMENDED;
        };

        resolveIds().then(async ids => {
            if (cancelled) return;
            const validIds = ids.filter(r => r.id);
            if (validIds.length === 0) return;

            const results = await Promise.all(
                validIds.map(async r => {
                    try {
                        let entry: IndexEntry | null = null;
                        if (transport.getEntry) {
                            entry = await transport.getEntry(r.id);
                        } else {
                            const raw = await transport.getItem(r.id);
                            if (raw) {
                                entry = {
                                    id: r.id,
                                    title: (raw.title as string) || r.id,
                                    type: (raw.type as IndexType) || 'work',
                                } as IndexEntry;
                            }
                        }
                        if (entry) {
                            return { ...entry, group: r.group, fallbackDescription: r.description };
                        }
                    } catch { /* ignore */ }
                    return {
                        id: r.id,
                        title: r.title,
                        type: r.id.startsWith('FC') ? 'collection' as IndexType : 'work' as IndexType,
                        group: r.group,
                        fallbackDescription: r.description,
                    };
                })
            );
            if (!cancelled) {
                setRecommended(results.filter((e): e is NonNullable<typeof e> => e !== null));
            }
        });
        return () => { cancelled = true; };
    }, [transport, recommendedIds]);

    // 加载叢書目錄進度
    useEffect(() => {
        if (!transport.getResourceProgress) return;
        let cancelled = false;
        transport.getResourceProgress().then(data => {
            if (cancelled) return;
            setCatalogProgress(data);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [transport]);

    // 加载在線資源進度
    useEffect(() => {
        if (!transport.getSiteProgress) return;
        let cancelled = false;
        transport.getSiteProgress().then(data => {
            if (cancelled) return;
            setSiteProgress(data);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [transport]);

    const getIcon = (type: IndexType) => {
        switch (type) {
            case 'work': return '✍️';
            case 'book': return '📖';
            case 'collection': return '📚';
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            height: '100%',
            padding: '20px',
            color: 'var(--bim-fg, #333)',
        }}>
            {/* Tabs */}
            <div style={{ width: '100%', maxWidth: '600px', marginBottom: '24px' }}>
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                    marginBottom: '16px',
                }}>
                    <TabButton
                        label={t.home.recommendTab}
                        active={activeTab === 'recommend'}
                        onClick={() => setActiveTab('recommend')}
                    />
                    <TabButton
                        label={t.home.catalogTab}
                        active={activeTab === 'catalog'}
                        onClick={() => setActiveTab('catalog')}
                    />
                    <TabButton
                        label={t.home.siteTab}
                        active={activeTab === 'site'}
                        onClick={() => setActiveTab('site')}
                    />
                </div>

                {activeTab === 'recommend' && (
                    <RecommendContent
                        recommended={recommended}
                        onNavigate={onNavigate}
                        getIcon={getIcon}
                        t={t}
                    />
                )}

                {activeTab === 'catalog' && (
                    <ProgressContent progress={catalogProgress} t={t} onNavigate={onNavigate} />
                )}

                {activeTab === 'site' && (
                    <SiteProgressContent progress={siteProgress} t={t} totalWorks={stats?.works ?? 0} />
                )}
            </div>

            {/* Stats */}
            {stats && (
                <div style={{
                    display: 'flex',
                    gap: '32px',
                    padding: '16px 0',
                    borderTop: '1px solid var(--bim-widget-border, #e0e0e0)',
                }}>
                    <StatItem icon="✍️" label={t.indexType.work} count={stats.works} />
                    <StatItem icon="📖" label={t.indexType.book} count={stats.books} />
                    <StatItem icon="📚" label={t.indexType.collection} count={stats.collections} />
                </div>
            )}
        </div>
    );
};

// ── 子组件 ──

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: active ? 600 : 400,
            color: active ? 'var(--bim-primary, #2563eb)' : 'var(--bim-desc-fg, #717171)',
            background: 'none',
            border: 'none',
            borderBottom: active ? '2px solid var(--bim-primary, #2563eb)' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: '-1px',
        }}
    >
        {label}
    </button>
);

const RecommendContent: React.FC<{
    recommended: (IndexEntry & { group?: string; fallbackDescription?: string })[];
    onNavigate?: (id: string) => void;
    getIcon: (type: IndexType) => string;
    t: ReturnType<typeof useT>;
}> = ({ recommended, onNavigate, getIcon, t }) => {
    if (recommended.length === 0) return null;

    const groups = new Map<string, typeof recommended>();
    for (const entry of recommended) {
        const group = entry.group || t.home.recommendedBrowse;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(entry);
    }

    return (
        <>
            {Array.from(groups.entries()).map(([groupName, entries]) => (
                <div key={groupName} style={{ marginBottom: '20px' }}>
                    <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--bim-desc-fg, #717171)',
                        marginBottom: '8px',
                    }}>
                        {groupName}
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '8px',
                    }}>
                        {entries.map(entry => {
                            const desc = entry.dynasty || entry.author
                                ? `${entry.dynasty ? `〔${entry.dynasty}〕` : ''}${entry.author || ''}`
                                : entry.fallbackDescription;
                            return (
                                <a
                                    key={entry.id}
                                    href={`/${entry.id}`}
                                    onClick={e => { e.preventDefault(); onNavigate?.(entry.id); }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                        cursor: 'pointer',
                                        background: 'var(--bim-input-bg, #fff)',
                                        textDecoration: 'none',
                                        color: 'inherit',
                                    }}
                                >
                                    <span style={{ fontSize: '20px' }}>{getIcon(entry.type)}</span>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {entry.title}
                                        </div>
                                        {desc && (
                                            <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {desc}
                                            </div>
                                        )}
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>
            ))}
        </>
    );
};

const ProgressContent: React.FC<{
    progress: ResourceProgress | null;
    t: ReturnType<typeof useT>;
    onNavigate?: (id: string) => void;
}> = ({ progress, t, onNavigate }) => {
    if (!progress) {
        return (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>
                ...
            </div>
        );
    }

    const sorted = [...progress.resources].sort((a, b) => a.priority - b.priority);

    const statusOrder: ResourceImportStatus[] = ['in_progress', 'done', 'todo'];
    const statusLabels: Record<ResourceImportStatus, string> = {
        in_progress: t.home.statusInProgress,
        done: t.home.statusDone,
        todo: t.home.statusTodo,
    };
    const statusColors: Record<ResourceImportStatus, string> = {
        in_progress: '#f59e0b',
        done: '#10b981',
        todo: '#9ca3af',
    };

    return (
        <div>
            {statusOrder.map(status => {
                const items = sorted.filter(r => r.status === status);
                if (items.length === 0) return null;
                return (
                    <div key={status} style={{ marginBottom: '20px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--bim-desc-fg, #717171)',
                            marginBottom: '8px',
                        }}>
                            <span style={{
                                display: 'inline-block',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: statusColors[status],
                            }} />
                            {statusLabels[status]} ({items.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {items.map(item => (
                                <ProgressItem key={item.id} item={item} t={t} statusColor={statusColors[status]} onNavigate={onNavigate} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const ProgressItem: React.FC<{
    item: ResourceProgressItem;
    t: ReturnType<typeof useT>;
    statusColor: string;
    onNavigate?: (id: string) => void;
}> = ({ item, t, statusColor, onNavigate }) => {
    const percent = item.total > 0 ? Math.round((item.imported / item.total) * 100) : 0;
    const typeLabel = item.type === 'catalog' ? t.home.typeCatalog : t.home.typeCollection;

    return (
        <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            background: 'var(--bim-input-bg, #fff)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {/* 书名（带链接） */}
                    <span style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(() => {
                            const displayName = item.edition ? `${item.name}·${item.edition}` : item.name;
                            const linkId = item.collection_id || item.work_id;
                            if (linkId && onNavigate) {
                                return (
                                    <a
                                        href={`/${linkId}`}
                                        onClick={e => { e.preventDefault(); onNavigate(linkId); }}
                                        style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed var(--bim-link-fg, #0066cc)' }}
                                        onMouseEnter={e => (e.currentTarget.style.borderBottomStyle = 'solid')}
                                        onMouseLeave={e => (e.currentTarget.style.borderBottomStyle = 'dashed')}
                                    >
                                        {displayName}
                                    </a>
                                );
                            }
                            if (item.url) {
                                return <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{displayName}</a>;
                            }
                            return displayName;
                        })()}
                    </span>
                    {/* 类型 badge */}
                    <span style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'var(--bim-widget-border, #e0e0e0)',
                        color: 'var(--bim-desc-fg, #717171)',
                        whiteSpace: 'nowrap',
                    }}>
                        {item.collection_id ? t.indexType.collection : item.work_id ? t.indexType.work : typeLabel}
                    </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {item.total > 0
                        ? formatTemplate(t.home.progressFormat, { imported: String(item.imported), total: String(item.total) })
                        : t.home.totalPending
                    }
                </span>
            </div>

            {/* Progress bar */}
            {item.total > 0 && (
                <div style={{
                    height: '4px',
                    borderRadius: '2px',
                    background: 'var(--bim-widget-border, #e0e0e0)',
                    overflow: 'hidden',
                    marginBottom: '4px',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${percent}%`,
                        borderRadius: '2px',
                        background: statusColor,
                        transition: 'width 0.3s ease',
                    }} />
                </div>
            )}

            {item.description && (
                <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '4px' }}>
                    {item.description}
                </div>
            )}
        </div>
    );
};

const SiteProgressContent: React.FC<{
    progress: ResourceProgress | null;
    t: ReturnType<typeof useT>;
    totalWorks: number;
}> = ({ progress, t, totalWorks }) => {
    if (!progress) {
        return (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>
                ...
            </div>
        );
    }

    const sorted = [...progress.resources].sort((a, b) => a.priority - b.priority);
    const active = sorted.filter(r => r.status !== 'todo');
    const todo = sorted.filter(r => r.status === 'todo');

    // 总覆盖统计：所有站点的 imported 去重后的覆盖数（简化用最大值近似）
    const totalCovered = active.reduce((max, r) => Math.max(max, r.imported), 0);
    const coveragePct = totalWorks > 0 ? Math.round((totalCovered / totalWorks) * 100) : 0;

    return (
        <div>
            {/* 覆盖率摘要 */}
            {totalWorks > 0 && (
                <div style={{
                    padding: '12px 16px',
                    marginBottom: '16px',
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, var(--bim-primary, #2563eb) 6%, transparent)',
                    fontSize: '13px',
                    color: 'var(--bim-fg, #333)',
                }}>
                    {t.home.siteCoverage}: <strong>{totalCovered.toLocaleString()}</strong> / {totalWorks.toLocaleString()} {t.indexType.work} ({coveragePct}%)
                </div>
            )}

            {/* 进行中 */}
            {active.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '13px', fontWeight: 500, color: 'var(--bim-desc-fg, #717171)', marginBottom: '8px',
                    }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                        {t.home.statusInProgress} ({active.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {active.map(item => (
                            <SiteItem key={item.id} item={item} t={t} totalWorks={totalWorks} />
                        ))}
                    </div>
                </div>
            )}

            {/* 未开始 */}
            {todo.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '13px', fontWeight: 500, color: 'var(--bim-desc-fg, #717171)', marginBottom: '8px',
                    }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#9ca3af' }} />
                        {t.home.statusTodo} ({todo.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {todo.map(item => (
                            <SiteItem key={item.id} item={item} t={t} totalWorks={totalWorks} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const SiteItem: React.FC<{
    item: ResourceProgressItem;
    t: ReturnType<typeof useT>;
    totalWorks: number;
}> = ({ item, t, totalWorks }) => {
    const coverPct = totalWorks > 0 ? Math.round((item.imported / totalWorks) * 100) : 0;

    return (
        <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            background: 'var(--bim-input-bg, #fff)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                        {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                {item.name}
                            </a>
                        ) : item.name}
                    </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {item.imported > 0
                        ? `${item.imported.toLocaleString()} ${t.indexType.work} (${coverPct}%)`
                        : t.home.statusTodo
                    }
                </span>
            </div>

            {/* 覆盖进度条 */}
            {item.imported > 0 && totalWorks > 0 && (
                <div style={{
                    height: '4px', borderRadius: '2px',
                    background: 'var(--bim-widget-border, #e0e0e0)',
                    overflow: 'hidden', marginBottom: '4px',
                }}>
                    <div style={{
                        height: '100%', width: `${coverPct}%`,
                        borderRadius: '2px', background: '#10b981',
                        transition: 'width 0.3s ease',
                    }} />
                </div>
            )}

            {item.description && (
                <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '4px' }}>
                    {item.description}
                </div>
            )}
        </div>
    );
};

const StatItem: React.FC<{ icon: string; label: string; count: number }> = ({ icon, label, count }) => (
    <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{icon}</div>
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--bim-fg, #333)' }}>
            {count.toLocaleString()}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>{label}</div>
    </div>
);
