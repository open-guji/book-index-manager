import React, { useState, useEffect, useMemo } from 'react';
import type { VolumeBookMapping, VolumeBookEntry, VolumeSection } from '../types';
import type { IndexStorage } from '../storage/types';

export interface CollectionCatalogProps {
    /** 直接传入数据 */
    data?: VolumeBookMapping;
    /** 丛编 ID，配合 transport 自动加载 */
    collectionId?: string;
    /** 数据传输层 */
    transport?: IndexStorage;
    /** 点击关联条目时回调 */
    onNavigate?: (id: string) => void;
    /** 自定义链接渲染 */
    renderLink?: (id: string, label?: string) => React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

// ── 内部子组件 ──

function CatalogHeader({ data }: { data: VolumeBookMapping }) {
    const { stats } = data;
    const progressPct = data.total_volumes > 0
        ? Math.round((stats.processed_volumes / data.total_volumes) * 100)
        : 0;

    return (
        <div style={{ marginBottom: '24px' }}>
            <h2 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--bim-fg, #1a1a1a)',
                margin: '0 0 8px',
            }}>
                {data.title}
            </h2>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                fontSize: '13px',
                color: 'var(--bim-desc-fg, #717171)',
            }}>
                <span>共 <strong style={{ color: 'var(--bim-fg, #333)' }}>{data.total_volumes}</strong> 册</span>
                <span>已处理 <strong style={{ color: 'var(--bim-fg, #333)' }}>{stats.processed_volumes}</strong> 册 ({progressPct}%)</span>
                <span>收录 <strong style={{ color: 'var(--bim-fg, #333)' }}>{stats.total_books}</strong> 部</span>
                <span>已匹配 <strong style={{ color: 'var(--bim-fg, #333)' }}>{stats.matched_works}</strong> 部</span>
                {stats.unmatched_works > 0 && (
                    <span>待匹配 <strong style={{ color: '#e67e22' }}>{stats.unmatched_works}</strong> 部</span>
                )}
            </div>
            {data.source && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--bim-desc-fg, #999)' }}>
                    来源: {data.source}
                </div>
            )}
        </div>
    );
}

function SectionNav({
    sections,
    activeSection,
    onSelect,
}: {
    sections: VolumeSection[];
    activeSection: string | null;
    onSelect: (name: string | null) => void;
}) {
    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '16px',
        }}>
            <button
                onClick={() => onSelect(null)}
                style={navBtnStyle(activeSection === null)}
            >
                全部
            </button>
            {sections.map(s => (
                <button
                    key={s.name}
                    onClick={() => onSelect(s.name)}
                    style={navBtnStyle(activeSection === s.name)}
                >
                    {s.name}
                    <span style={{
                        fontSize: '11px',
                        opacity: 0.6,
                        marginLeft: '4px',
                    }}>
                        {s.volume_range[0]}–{s.volume_range[1]}
                    </span>
                </button>
            ))}
        </div>
    );
}

function navBtnStyle(active: boolean): React.CSSProperties {
    return {
        padding: '4px 12px',
        border: active ? '1px solid var(--bim-primary, #2471a3)' : '1px solid var(--bim-widget-border, #e0e0e0)',
        borderRadius: '4px',
        background: active ? 'color-mix(in srgb, var(--bim-primary, #2471a3) 8%, transparent)' : 'transparent',
        color: active ? 'var(--bim-primary, #2471a3)' : 'var(--bim-fg, #333)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
    };
}

function BidLink({ id, label, onNavigate, renderLink }: {
    id: string;
    label?: string;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    if (renderLink) return <>{renderLink(id, label)}</>;
    if (onNavigate) {
        return (
            <span
                onClick={() => onNavigate(id)}
                style={{
                    color: 'var(--bim-link-fg, #0066cc)',
                    cursor: 'pointer',
                    borderBottom: '1px dashed var(--bim-link-fg, #0066cc)',
                    paddingBottom: '1px',
                    fontSize: '12px',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderBottomStyle = 'solid')}
                onMouseLeave={e => (e.currentTarget.style.borderBottomStyle = 'dashed')}
            >
                {label || id}
            </span>
        );
    }
    return <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #999)' }}>{label || id}</span>;
}

function BookRow({ book, onNavigate, renderLink }: {
    book: VolumeBookEntry;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    const linkId = book.book_id || book.work_id;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            padding: '6px 12px',
            borderBottom: '1px solid var(--bim-widget-border, #f0f0f0)',
            fontSize: '14px',
            lineHeight: 1.8,
        }}>
            {/* 册号 */}
            <span style={{
                flexShrink: 0,
                width: '48px',
                fontSize: '12px',
                color: 'var(--bim-desc-fg, #999)',
                textAlign: 'right',
            }}>
                {book.volumes.length === 1
                    ? `第${book.volumes[0]}册`
                    : `${book.volumes[0]}–${book.volumes[book.volumes.length - 1]}册`}
            </span>

            {/* 书名 */}
            <span style={{
                flex: 1,
                fontWeight: 500,
                color: 'var(--bim-fg, #1a1a1a)',
            }}>
                {book.title}
                {book.sub_items && book.sub_items.length > 0 && (
                    <span style={{
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #999)',
                        fontWeight: 400,
                        marginLeft: '6px',
                    }}>
                        ({book.sub_items.join('、')})
                    </span>
                )}
            </span>

            {/* 链接 */}
            {linkId && (
                <BidLink
                    id={linkId}
                    label={book.book_id ? '书籍' : '作品'}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                />
            )}
            {!linkId && (
                <span style={{
                    fontSize: '11px',
                    color: 'var(--bim-desc-fg, #ccc)',
                    flexShrink: 0,
                }}>
                    未匹配
                </span>
            )}
        </div>
    );
}

// ── 主组件 ──

export const CollectionCatalog: React.FC<CollectionCatalogProps> = ({
    data: dataProp,
    collectionId,
    transport,
    onNavigate,
    renderLink,
    className,
    style,
}) => {
    const [loaded, setLoaded] = useState<VolumeBookMapping | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const data = dataProp || loaded;

    useEffect(() => {
        if (dataProp || !collectionId || !transport?.getCollectionCatalog) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        transport.getCollectionCatalog(collectionId).then(result => {
            if (cancelled) return;
            if (!result) {
                setError('未找到丛编目录数据');
            } else {
                setLoaded(result);
            }
        }).catch(err => {
            if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [dataProp, collectionId, transport]);

    // 过滤书目
    const filteredBooks = useMemo(() => {
        if (!data) return [];
        let books = data.books;
        if (activeSection) {
            books = books.filter(b => b.section === activeSection);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            books = books.filter(b =>
                b.title.toLowerCase().includes(q) ||
                (b.sub_items && b.sub_items.some(s => s.toLowerCase().includes(q)))
            );
        }
        return books;
    }, [data, activeSection, searchQuery]);

    // 按册号分组
    const groupedByVolume = useMemo(() => {
        const groups: { volume: number; books: VolumeBookEntry[] }[] = [];
        let currentVolume = -1;
        let currentGroup: VolumeBookEntry[] = [];

        for (const book of filteredBooks) {
            if (!book.volumes || book.volumes.length === 0) continue;
            const firstVolume = book.volumes[0];
            if (firstVolume !== currentVolume) {
                if (currentGroup.length > 0) {
                    groups.push({ volume: currentVolume, books: currentGroup });
                }
                currentVolume = firstVolume;
                currentGroup = [book];
            } else {
                currentGroup.push(book);
            }
        }
        if (currentGroup.length > 0) {
            groups.push({ volume: currentVolume, books: currentGroup });
        }

        return groups;
    }, [filteredBooks]);

    if (loading) {
        return (
            <div className={className} style={{ ...style, padding: '24px' }}>
                <div style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>
                    加载丛编目录...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={className} style={{
                ...style,
                padding: '24px',
                textAlign: 'center',
                color: 'var(--bim-desc-fg, #717171)',
                fontSize: '13px',
            }}>
                {error}
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className={className} style={style}>
            <CatalogHeader data={data} />

            <SectionNav
                sections={data.sections}
                activeSection={activeSection}
                onSelect={setActiveSection}
            />

            {/* 搜索 */}
            <div style={{ marginBottom: '12px' }}>
                <input
                    type="text"
                    placeholder="搜索书名..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        maxWidth: '320px',
                        padding: '6px 10px',
                        border: '1px solid var(--bim-input-border, #ccc)',
                        borderRadius: '4px',
                        background: 'var(--bim-input-bg, #fff)',
                        color: 'var(--bim-input-fg, #333)',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                    }}
                />
                <span style={{
                    marginLeft: '12px',
                    fontSize: '12px',
                    color: 'var(--bim-desc-fg, #999)',
                }}>
                    {filteredBooks.length} 部
                </span>
            </div>

            {/* 目录列表 */}
            <div style={{
                border: '1px solid var(--bim-widget-border, #e0e0e0)',
                borderRadius: '6px',
                overflow: 'hidden',
            }}>
                {groupedByVolume.map(group => (
                    <div key={group.volume}>
                        {/* 册号标题 */}
                        <div style={{
                            padding: '4px 12px',
                            background: 'var(--bim-bg, #f8f8f8)',
                            borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--bim-desc-fg, #717171)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                        }}>
                            第 {group.volume} 册
                        </div>
                        {group.books.map((book, i) => (
                            <BookRow
                                key={`${group.volume}-${i}`}
                                book={book}
                                onNavigate={onNavigate}
                                renderLink={renderLink}
                            />
                        ))}
                    </div>
                ))}
                {groupedByVolume.length === 0 && (
                    <div style={{
                        padding: '32px',
                        textAlign: 'center',
                        color: 'var(--bim-desc-fg, #999)',
                        fontSize: '13px',
                    }}>
                        无匹配结果
                    </div>
                )}
            </div>
        </div>
    );
};
