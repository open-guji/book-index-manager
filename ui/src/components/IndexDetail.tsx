import React, { useState, useEffect } from 'react';
import type {
    IndexType,
    ResourceEntry,
    IndexDetailData,
    BookDetailData,
    CollectionDetailData,
    WorkDetailData,
    AuthorInfo,
    LocationInfo,
} from '../types';
import type { IndexTransport } from '../transport/types';
import { ResourceList } from './ResourceList';

export interface IndexDetailProps {
    /** 详情数据（直接传入，优先于 id+transport） */
    data?: IndexDetailData;
    /** 条目 ID，配合 transport 自动加载 */
    id?: string;
    /** 数据传输层 */
    transport?: IndexTransport;
    /** 点击关联条目时回调 */
    onNavigate?: (id: string) => void;
    /** 自定义关联条目链接渲染 */
    renderLink?: (id: string, label?: string) => React.ReactNode;
    /** 额外的 header 内容插槽 */
    headerExtra?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

const TYPE_LABELS: Record<IndexType, string> = {
    book: '书籍',
    work: '作品',
    collection: '丛编',
};

const TYPE_ICONS: Record<IndexType, string> = {
    book: '📖',
    work: '📜',
    collection: '📚',
};

// ── 内部子组件 ──

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h2 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--bim-fg, #333)',
            marginTop: '28px',
            marginBottom: '14px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
            letterSpacing: '0.5px',
        }}>
            {children}
        </h2>
    );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex',
            padding: '9px 0',
            borderBottom: '1px solid color-mix(in srgb, var(--bim-widget-border, #e0e0e0) 40%, transparent)',
        }}>
            <span style={{
                width: '100px',
                flexShrink: 0,
                fontSize: '13px',
                color: 'var(--bim-desc-fg, #717171)',
                fontWeight: 500,
            }}>{label}</span>
            <span style={{
                fontSize: '13px',
                color: 'var(--bim-fg, #333)',
                flex: 1,
            }}>{children}</span>
        </div>
    );
}

function AuthorList({ authors }: { authors: AuthorInfo[] }) {
    return (
        <span>
            {authors.map((a, i) => (
                <span key={i}>
                    {i > 0 && '、'}
                    {a.dynasty && <span style={{ color: 'var(--bim-desc-fg, #717171)' }}>[{a.dynasty}] </span>}
                    {a.name}
                    {a.role && <span style={{ color: 'var(--bim-desc-fg, #717171)' }}> ({a.role})</span>}
                </span>
            ))}
        </span>
    );
}

function IdLink({ id, label, onNavigate, renderLink }: {
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
                    textDecoration: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >
                {label || id}
            </span>
        );
    }
    return <span>{label || id}</span>;
}

function DetailHeader({ title, type, headerExtra }: {
    title: string;
    type: IndexType;
    headerExtra?: React.ReactNode;
}) {
    return (
        <div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>{TYPE_ICONS[type]}</span>
                    <span style={{
                        padding: '2px 8px',
                        fontSize: '12px',
                        fontWeight: 500,
                        borderRadius: '4px',
                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                        color: 'var(--bim-desc-fg, #717171)',
                        background: 'var(--bim-input-bg, #fff)',
                    }}>
                        {TYPE_LABELS[type]}
                    </span>
                </div>
                {headerExtra && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{headerExtra}</div>}
            </div>
            <h1 style={{
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--bim-fg, #333)',
                margin: '0 0 4px',
                letterSpacing: '0.5px',
            }}>
                {title}
            </h1>
        </div>
    );
}

function InfoSection({ data, onNavigate, renderLink }: {
    data: IndexDetailData;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    const bookData = data.type === 'book' ? data as BookDetailData : null;
    const workData = data.type === 'work' ? data as WorkDetailData : null;

    const hasInfo = data.authors?.length || data.publication_info?.year
        || data.current_location?.name || data.volume_count?.description
        || data.page_count?.description || bookData?.contained_in?.length
        || bookData?.work_id || workData?.parent_work || workData?.parent_works?.length;

    if (!hasInfo) return null;

    return (
        <div style={{
            marginTop: '20px',
            padding: '16px 20px',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '10px',
            background: 'var(--bim-input-bg, #fff)',
        }}>
            {data.authors && data.authors.length > 0 && (
                <InfoRow label={data.type === 'collection' ? '编者' : '作者'}>
                    <AuthorList authors={data.authors} />
                </InfoRow>
            )}
            {data.publication_info?.year && (
                <InfoRow label="年代">{data.publication_info.year}</InfoRow>
            )}
            {data.current_location?.name && (
                <InfoRow label="现藏于">{data.current_location.name}</InfoRow>
            )}
            {data.volume_count?.description && (
                <InfoRow label="卷册">{data.volume_count.description}</InfoRow>
            )}
            {data.page_count?.description && (
                <InfoRow label="页数">{data.page_count.description}</InfoRow>
            )}
            {bookData?.contained_in && bookData.contained_in.length > 0 && (
                <InfoRow label="收录于">{bookData.contained_in.join('、')}</InfoRow>
            )}
            {bookData?.work_id && (
                <InfoRow label="所属作品">
                    <IdLink id={bookData.work_id} onNavigate={onNavigate} renderLink={renderLink} />
                </InfoRow>
            )}
            {workData?.parent_work && (
                <InfoRow label="上级作品">
                    <IdLink id={workData.parent_work.id} label={workData.parent_work.title} onNavigate={onNavigate} renderLink={renderLink} />
                </InfoRow>
            )}
            {workData?.parent_works && workData.parent_works.length > 0 && !workData.parent_work && (
                <InfoRow label="上级作品">
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {workData.parent_works.map(id => (
                            <IdLink key={id} id={id} onNavigate={onNavigate} renderLink={renderLink} />
                        ))}
                    </span>
                </InfoRow>
            )}
        </div>
    );
}

function HistoryTimeline({ items }: { items: LocationInfo[] }) {
    if (!items.length) return null;
    return (
        <>
            <SectionHeading>流转历史</SectionHeading>
            <div style={{ position: 'relative', paddingLeft: '24px' }}>
                <div style={{
                    position: 'absolute',
                    left: '8px',
                    top: '8px',
                    bottom: '8px',
                    width: '1px',
                    background: 'var(--bim-widget-border, #e0e0e0)',
                }} />
                {items.map((loc, i) => (
                    <div key={i} style={{ position: 'relative', marginBottom: '14px' }}>
                        <div style={{
                            position: 'absolute',
                            left: '-20px',
                            top: '5px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'var(--bim-primary, #0078d4)',
                            border: '2px solid var(--bim-input-bg, #fff)',
                        }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>
                            {loc.name}
                        </span>
                        {loc.description && (
                            <p style={{ fontSize: '13px', color: 'var(--bim-desc-fg, #717171)', margin: '4px 0 0' }}>
                                {loc.description}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

function HistoryList({ items }: { items: string[] }) {
    if (!items.length) return null;
    return (
        <>
            <SectionHeading>历史沿革</SectionHeading>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map((item, i) => (
                    <li key={i} style={{ fontSize: '13px', color: 'var(--bim-fg, #333)', display: 'flex', gap: '8px', lineHeight: 1.6 }}>
                        <span style={{ color: 'var(--bim-primary, #0078d4)', marginTop: '2px' }}>•</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </>
    );
}

function RelationList({ title, ids, onNavigate, renderLink }: {
    title: string;
    ids: string[];
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    if (!ids.length) return null;
    return (
        <>
            <SectionHeading>{title}</SectionHeading>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ids.map(id => (
                    <li key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bim-primary, #0078d4)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <IdLink id={id} onNavigate={onNavigate} renderLink={renderLink} />
                    </li>
                ))}
            </ul>
        </>
    );
}

// ── 主组件 ──

export const IndexDetail: React.FC<IndexDetailProps> = ({
    data: dataProp,
    id,
    transport,
    onNavigate,
    renderLink,
    headerExtra,
    className,
    style,
}) => {
    const [loaded, setLoaded] = useState<IndexDetailData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const detail = dataProp || loaded;

    useEffect(() => {
        if (dataProp || !id || !transport) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        transport.getItem(id).then(raw => {
            if (cancelled) return;
            if (!raw) {
                setError('未找到该条目');
            } else {
                setLoaded(raw as unknown as IndexDetailData);
            }
        }).catch(err => {
            if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [dataProp, id, transport]);

    if (loading) {
        return (
            <div className={className} style={{ ...style, padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ height: '28px', width: '200px', background: 'var(--bim-widget-border, #e0e0e0)', borderRadius: '6px', opacity: 0.5 }} />
                    <div style={{ height: '40px', width: '60%', background: 'var(--bim-widget-border, #e0e0e0)', borderRadius: '6px', opacity: 0.5 }} />
                    <div style={{ height: '200px', width: '100%', background: 'var(--bim-widget-border, #e0e0e0)', borderRadius: '10px', opacity: 0.3 }} />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={className} style={{ ...style, padding: '24px', textAlign: 'center', color: 'var(--bim-desc-fg, #717171)' }}>
                {error}
            </div>
        );
    }

    if (!detail) return null;

    const bookData = detail.type === 'book' ? detail as BookDetailData : null;
    const collectionData = detail.type === 'collection' ? detail as CollectionDetailData : null;
    const workData = detail.type === 'work' ? detail as WorkDetailData : null;

    return (
        <div className={className} style={style}>
            <DetailHeader title={detail.title} type={detail.type} headerExtra={headerExtra} />
            <InfoSection data={detail} onNavigate={onNavigate} renderLink={renderLink} />

            {detail.description?.text && (
                <>
                    <SectionHeading>简介</SectionHeading>
                    <p style={{ fontSize: '14px', color: 'var(--bim-fg, #333)', lineHeight: 1.8, margin: 0 }}>
                        {detail.description.text}
                    </p>
                </>
            )}

            {detail.resources && detail.resources.length > 0 && (
                <>
                    <SectionHeading>资源</SectionHeading>
                    <ResourceList items={detail.resources} groupByType />
                </>
            )}

            {bookData?.location_history && bookData.location_history.length > 0 && (
                <HistoryTimeline items={bookData.location_history} />
            )}

            {collectionData?.history && collectionData.history.length > 0 && (
                <HistoryList items={collectionData.history} />
            )}

            {bookData?.related_books && bookData.related_books.length > 0 && (
                <RelationList title="相关版本" ids={bookData.related_books} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {collectionData?.books && collectionData.books.length > 0 && (
                <RelationList title="收录书籍" ids={collectionData.books} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {workData?.books && workData.books.length > 0 && (
                <RelationList title="相关版本" ids={workData.books} onNavigate={onNavigate} renderLink={renderLink} />
            )}
        </div>
    );
};
