import React, { useState, useEffect, useMemo } from 'react';
import type { VolumeBookMapping, VolumeBookEntry, VolumeSection } from '../types';
import type { IndexStorage } from '../storage/types';
import { useT, useConvert, formatTemplate } from '../i18n';

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
    const t = useT();
    const { convert } = useConvert();
    const { stats } = data;

    // 进度百分比：优先用 processed_volumes，其次 total_found_volumes
    const processed = stats.processed_volumes ?? stats.total_found_volumes;
    const progressPct = processed != null && data.total_volumes > 0
        ? Math.round((processed / data.total_volumes) * 100)
        : null;

    return (
        <div style={{ marginBottom: '24px' }}>
            <h2 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--bim-fg, #1a1a1a)',
                margin: '0 0 8px',
            }}>
                {convert(data.title)}
            </h2>
            {data.resource_name && (
                <div style={{ fontSize: '13px', color: 'var(--bim-desc-fg, #717171)', marginBottom: '6px' }}>
                    {convert(data.resource_name)}
                </div>
            )}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                fontSize: '13px',
                color: 'var(--bim-desc-fg, #717171)',
            }}>
                <span>{t.catalog.totalVolumes} <strong style={{ color: 'var(--bim-fg, #333)' }}>{data.total_volumes}</strong> {t.unit.volume}</span>
                {progressPct != null && (
                    <span>{t.catalog.processed} <strong style={{ color: 'var(--bim-fg, #333)' }}>{processed}</strong> {t.unit.volume} ({progressPct}%)</span>
                )}
                <span>{t.catalog.contains} <strong style={{ color: 'var(--bim-fg, #333)' }}>{stats.total_books}</strong> {t.unit.bu}</span>
                {stats.matched_works != null && stats.matched_works > 0 && (
                    <span>{t.catalog.matched} <strong style={{ color: 'var(--bim-fg, #333)' }}>{stats.matched_works}</strong> {t.unit.bu}</span>
                )}
                {stats.unmatched_works != null && stats.unmatched_works > 0 && (
                    <span>{t.catalog.unmatched} <strong style={{ color: '#e67e22' }}>{stats.unmatched_works}</strong> {t.unit.bu}</span>
                )}
            </div>
            {data.source && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--bim-desc-fg, #999)' }}>
                    {t.catalog.source} {data.source}
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
    const t = useT();

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
                {t.catalog.all}
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
            <a
                href={`/${id}`}
                onClick={e => { e.preventDefault(); onNavigate(id); }}
                style={{
                    color: 'var(--bim-link-fg, #0066cc)',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    borderBottom: '1px dashed var(--bim-link-fg, #0066cc)',
                    paddingBottom: '1px',
                    fontSize: '12px',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderBottomStyle = 'solid')}
                onMouseLeave={e => (e.currentTarget.style.borderBottomStyle = 'dashed')}
            >
                {label || id}
            </a>
        );
    }
    return <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #999)' }}>{label || id}</span>;
}

/** 格式化册号范围显示 */
function formatVolumeRange(volumes: number[], unitVolume: string): string {
    if (volumes.length === 0) return '';
    if (volumes.length === 1) return `${volumes[0]}`;
    // 检测是否连续
    const first = volumes[0];
    const last = volumes[volumes.length - 1];
    if (last - first + 1 === volumes.length) {
        return `${first}–${last}`;
    }
    // 非连续，用逗号
    if (volumes.length <= 3) return volumes.join(', ');
    return `${first}–${last} (${volumes.length}${unitVolume})`;
}

function BookRow({ book, onNavigate, renderLink, showVolumes }: {
    book: VolumeBookEntry;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
    showVolumes: boolean;
}) {
    const t = useT();
    const { convert } = useConvert();
    const linkId = book.book_id || book.work_id;

    // 册数信息
    const volInfo = showVolumes && book.volumes.length > 0
        ? formatVolumeRange(book.volumes, t.unit.volume)
        : null;

    // 找到/缺失信息
    const hasMissing = book.missing_volumes && book.missing_volumes.length > 0;

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
            {showVolumes && (
                <span style={{
                    flexShrink: 0,
                    minWidth: '48px',
                    fontSize: '12px',
                    color: 'var(--bim-desc-fg, #999)',
                    textAlign: 'right',
                }}>
                    {volInfo}
                </span>
            )}

            {/* 书名 + 版本 */}
            <span style={{
                flex: 1,
                fontWeight: 500,
                color: 'var(--bim-fg, #1a1a1a)',
            }}>
                {convert(book.title)}
                {book.sub_items && book.sub_items.length > 0 && (
                    <span style={{
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #999)',
                        fontWeight: 400,
                        marginLeft: '6px',
                    }}>
                        ({book.sub_items.map(s => convert(s)).join('、')})
                    </span>
                )}
                {book.edition && (
                    <span style={{
                        fontSize: '11px',
                        color: 'var(--bim-desc-fg, #aaa)',
                        fontWeight: 400,
                        marginLeft: '8px',
                    }}>
                        {convert(book.edition)}
                    </span>
                )}
            </span>

            {/* 册数统计（expected/found） */}
            {book.expected_volumes != null && (
                <span style={{
                    fontSize: '11px',
                    color: hasMissing ? '#e67e22' : 'var(--bim-desc-fg, #999)',
                    flexShrink: 0,
                }}>
                    {book.found_volumes ?? 0}/{book.expected_volumes}{t.unit.volume}
                </span>
            )}

            {/* 链接 */}
            {linkId && (
                <BidLink
                    id={linkId}
                    label={book.book_id ? t.indexType.book : t.indexType.work}
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
                    {t.catalog.unmatched_label}
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
    const t = useT();
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
                setError(t.catalog.notFound);
            } else {
                setLoaded(result);
            }
        }).catch(err => {
            if (!cancelled) setError(err instanceof Error ? err.message : t.catalog.loadFailed);
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [dataProp, collectionId, transport, t]);

    // 是否有分部信息
    const hasSections = data?.sections && data.sections.length > 0;

    // 是否为按册分组模式（有 volume_index 或 多书共用同册）
    const useVolumeGrouping = useMemo(() => {
        if (!data) return false;
        // 有 volume_index 明确要求按册分组
        if (data.volume_index && Object.keys(data.volume_index).length > 0) return true;
        // 多本书首册相同 → 需要按册分组
        const firstVols = data.books.map(b => b.volumes[0]).filter(v => v != null);
        const unique = new Set(firstVols);
        return unique.size < firstVols.length;
    }, [data]);

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
                (b.sub_items && b.sub_items.some(s => s.toLowerCase().includes(q))) ||
                (b.edition && b.edition.toLowerCase().includes(q))
            );
        }
        return books;
    }, [data, activeSection, searchQuery]);

    // 按册号分组（仅在 useVolumeGrouping 时使用）
    const groupedByVolume = useMemo(() => {
        if (!useVolumeGrouping) return null;

        const groups: { volume: number; books: VolumeBookEntry[] }[] = [];
        const volumeMap = new Map<number, VolumeBookEntry[]>();

        for (const book of filteredBooks) {
            if (!book.volumes || book.volumes.length === 0) continue;
            const firstVolume = book.volumes[0];
            if (!volumeMap.has(firstVolume)) {
                volumeMap.set(firstVolume, []);
            }
            volumeMap.get(firstVolume)!.push(book);
        }

        // 按册号排序
        const sortedVolumes = [...volumeMap.keys()].sort((a, b) => a - b);
        for (const vol of sortedVolumes) {
            groups.push({ volume: vol, books: volumeMap.get(vol)! });
        }

        return groups;
    }, [filteredBooks, useVolumeGrouping]);

    if (loading) {
        return (
            <div className={className} style={{ ...style, padding: '24px' }}>
                <div style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>
                    {t.catalog.loading}
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

            {hasSections && (
                <SectionNav
                    sections={data.sections!}
                    activeSection={activeSection}
                    onSelect={setActiveSection}
                />
            )}

            {/* 搜索 */}
            <div style={{ marginBottom: '12px' }}>
                <input
                    type="text"
                    placeholder={t.search.searchBookName}
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
                    {filteredBooks.length} {t.unit.bu}
                </span>
            </div>

            {/* 目录列表 */}
            <div style={{
                border: '1px solid var(--bim-widget-border, #e0e0e0)',
                borderRadius: '6px',
                overflow: 'hidden',
            }}>
                {groupedByVolume ? (
                    /* 按册分组模式 */
                    groupedByVolume.map((group, gi) => (
                        <div key={`${group.volume}-${gi}`}>
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
                                {formatTemplate(t.catalog.volume, { n: group.volume })}
                            </div>
                            {group.books.map((book, i) => (
                                <BookRow
                                    key={`${group.volume}-${i}`}
                                    book={book}
                                    onNavigate={onNavigate}
                                    renderLink={renderLink}
                                    showVolumes={book.volumes.length > 1}
                                />
                            ))}
                        </div>
                    ))
                ) : (
                    /* 平铺模式（百衲本等，每本书独立行） */
                    filteredBooks.map((book, i) => (
                        <BookRow
                            key={i}
                            book={book}
                            onNavigate={onNavigate}
                            renderLink={renderLink}
                            showVolumes={true}
                        />
                    ))
                )}
                {filteredBooks.length === 0 && (
                    <div style={{
                        padding: '32px',
                        textAlign: 'center',
                        color: 'var(--bim-desc-fg, #999)',
                        fontSize: '13px',
                    }}>
                        {t.catalog.noMatch}
                    </div>
                )}
            </div>
        </div>
    );
};
