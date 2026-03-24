import React, { useState, useEffect } from 'react';
import type { IndexEntry, IndexType } from '../types';
import type { IndexStorage } from '../storage/types';

export interface RecommendedItem {
    id: string;
    title: string;
    description?: string;
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
    { id: '', title: '四库全书总目', description: '清·纪昀等纂修，200卷' },
    { id: '', title: '四库全书（文渊阁本）', description: '清·乾隆敕编，1500册' },
];

export const HomePage: React.FC<HomePageProps> = ({
    transport,
    onNavigate,
    recommendedIds,
}) => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recommended, setRecommended] = useState<IndexEntry[]>([]);

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
                    if (transport.getEntry) {
                        return await transport.getEntry(r.id);
                    }
                    const raw = await transport.getItem(r.id);
                    if (raw) {
                        return {
                            id: r.id,
                            title: (raw.title as string) || r.id,
                            type: (raw.type as IndexType) || 'work',
                        } as IndexEntry;
                    }
                } catch { /* ignore */ }
                return null;
            })
        ).then(results => {
            if (cancelled) return;
            setRecommended(results.filter((e): e is IndexEntry => e !== null));
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
                <div style={{ width: '100%', maxWidth: '500px', marginBottom: '32px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--bim-desc-fg, #717171)', marginBottom: '8px' }}>
                        推荐浏览
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recommended.map(entry => (
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
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{entry.title}</div>
                                    {(entry.dynasty || entry.author) && (
                                        <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginTop: '2px' }}>
                                            {entry.dynasty && <span>〔{entry.dynasty}〕</span>}
                                            {entry.author && <span>{entry.author}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
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
