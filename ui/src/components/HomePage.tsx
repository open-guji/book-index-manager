import React, { useState, useEffect } from 'react';
import type { IndexEntry, IndexType } from '../types';
import type { IndexStorage } from '../storage/types';

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
}

interface Stats {
    works: number;
    books: number;
    collections: number;
}

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
}) => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recommended, setRecommended] = useState<(IndexEntry & { group?: string; fallbackDescription?: string })[]>([]);

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

    // 加载推荐条目
    useEffect(() => {
        const ids = recommendedIds ?? DEFAULT_RECOMMENDED;
        const validIds = ids.filter(r => r.id);
        if (validIds.length === 0) return;

        let cancelled = false;
        Promise.all(
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
                // fallback：即使 transport 无法获取，也显示静态信息
                return {
                    id: r.id,
                    title: r.title,
                    type: r.id.startsWith('FC') ? 'collection' as IndexType : 'work' as IndexType,
                    group: r.group,
                    fallbackDescription: r.description,
                };
            })
        ).then(results => {
            if (cancelled) return;
            setRecommended(results.filter((e): e is NonNullable<typeof e> => e !== null));
        });
        return () => { cancelled = true; };
    }, [transport, recommendedIds]);

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
            justifyContent: 'center',
            height: '100%',
            padding: '40px 20px',
            color: 'var(--bim-fg, #333)',
        }}>
            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📚</div>
                <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>
                    古籍索引
                </h1>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--bim-desc-fg, #717171)' }}>
                    从左侧搜索框输入关键词，查找作品、书籍或丛编
                </p>
            </div>

            {/* Recommended */}
            {recommended.length > 0 && (
                <div style={{ width: '100%', maxWidth: '600px', marginBottom: '32px' }}>
                    {(() => {
                        const groups = new Map<string, typeof recommended>();
                        for (const entry of recommended) {
                            const group = entry.group || '推薦瀏覽';
                            if (!groups.has(group)) groups.set(group, []);
                            groups.get(group)!.push(entry);
                        }
                        return Array.from(groups.entries()).map(([groupName, entries]) => (
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
                                            <div
                                                key={entry.id}
                                                onClick={() => onNavigate?.(entry.id)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    padding: '12px 16px',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                                    cursor: 'pointer',
                                                    background: 'var(--bim-input-bg, #fff)',
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
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            )}

            {/* Stats */}
            {stats && (
                <div style={{
                    display: 'flex',
                    gap: '32px',
                    padding: '16px 0',
                    borderTop: '1px solid var(--bim-widget-border, #e0e0e0)',
                }}>
                    <StatItem icon="✍️" label="作品" count={stats.works} />
                    <StatItem icon="📖" label="书籍" count={stats.books} />
                    <StatItem icon="📚" label="丛编" count={stats.collections} />
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
