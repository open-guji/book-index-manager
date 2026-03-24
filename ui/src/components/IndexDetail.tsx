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
    AdditionalTitle,
    IndexedByEntry,
    ContainedInEntry,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { extractStatus } from '../id';
import { ResourceList } from './ResourceList';

/** 已解析的收录关联（ID → 标题 + 册号） */
interface ResolvedContainedIn {
    id: string;
    title: string;
    volume_index?: number | string;
}

export interface IndexDetailProps {
    /** 详情数据（直接传入，优先于 id+transport） */
    data?: IndexDetailData;
    /** 条目 ID，配合 transport 自动加载 */
    id?: string;
    /** 数据传输层 */
    transport?: IndexStorage;
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

// ── 工具函数 ──

const CHINESE_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CHINESE_UNITS = ['', '十', '百', '千'];

function numberToChinese(n: number): string {
    if (n <= 0) return '';
    if (n >= 10000) return String(n); // 万以上直接用阿拉伯数字
    const str = String(n);
    const len = str.length;
    let result = '';
    let lastWasZero = false;
    for (let i = 0; i < len; i++) {
        const digit = parseInt(str[i]);
        const unitIndex = len - 1 - i;
        if (digit === 0) {
            lastWasZero = true;
        } else {
            if (lastWasZero && result) result += '〇';
            lastWasZero = false;
            // 十位的一可以省略：10→十，11→十一
            if (digit === 1 && unitIndex === 1 && i === 0) {
                result += CHINESE_UNITS[unitIndex];
            } else {
                result += CHINESE_DIGITS[digit] + CHINESE_UNITS[unitIndex];
            }
        }
    }
    return result;
}

// ── 内部子组件 ──

function TypeBadge({ type }: { type: IndexType }) {
    const colors: Record<IndexType, string> = {
        book: '#c0392b',
        work: '#8e6f3e',
        collection: '#2471a3',
    };
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 6px',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '1px',
            color: colors[type],
            border: `1px solid ${colors[type]}40`,
            borderRadius: '2px',
            background: `${colors[type]}08`,
        }}>
            {TYPE_LABELS[type]}
        </span>
    );
}

function StatusBadge({ isDraft }: { isDraft: boolean }) {
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 6px',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '1px',
            color: isDraft ? '#e67e22' : '#27ae60',
            border: `1px solid ${isDraft ? '#e67e2240' : '#27ae6040'}`,
            borderRadius: '2px',
            background: isDraft ? '#e67e2208' : '#27ae6008',
        }}>
            {isDraft ? '草稿' : '正式'}
        </span>
    );
}

function IdBadge({ id }: { id: string }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(id).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px 3px 10px',
            fontSize: '12px',
            color: 'var(--bim-desc-fg, #717171)',
            background: '#f6f6f6',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '4px',
        }}>
            <span>ID:</span>
            <span style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'var(--bim-fg, #333)',
            }}>
                {id}
            </span>
            <span
                onClick={handleCopy}
                title={copied ? '已复制' : '复制 ID'}
                style={{
                    cursor: 'pointer',
                    fontSize: '13px',
                    opacity: copied ? 1 : 0.5,
                    transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = copied ? '1' : '0.5')}
            >
                {copied ? '✓' : '⧉'}
            </span>
        </span>
    );
}

function Divider() {
    return (
        <div style={{
            height: '1px',
            margin: '8px 0 20px',
            background: 'linear-gradient(to right, var(--bim-widget-border, #e0e0e0), transparent)',
        }} />
    );
}

function SectionLabel({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '20px',
            marginBottom: '8px',
        }}>
            <span style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--bim-desc-fg, #717171)',
                letterSpacing: '1px',
            }}>
                {children}
            </span>
            <span style={{ flex: 1 }} />
            {extra}
        </div>
    );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', fontSize: '13px' }}>
            <span style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '12px' }}>{label}</span>
            <span style={{ color: 'var(--bim-fg, #333)' }}>{children}</span>
        </span>
    );
}

function AuthorLine({ authors, type }: { authors: AuthorInfo[]; type: IndexType }) {
    return (
        <span style={{
            fontSize: '14px',
            color: 'var(--bim-fg, #333)',
            lineHeight: 1.6,
        }}>
            {authors.map((a, i) => (
                <span key={i}>
                    {i > 0 && <span style={{ color: 'var(--bim-desc-fg, #aaa)', margin: '0 4px' }}>·</span>}
                    {a.dynasty && (
                        <span style={{
                            color: 'var(--bim-desc-fg, #717171)',
                            fontSize: '12px',
                        }}>〔{a.dynasty}〕</span>
                    )}
                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                    {a.role && (
                        <span style={{
                            color: 'var(--bim-desc-fg, #999)',
                            fontSize: '12px',
                            marginLeft: '2px',
                        }}> {a.role}</span>
                    )}
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
                    borderBottom: '1px dashed var(--bim-link-fg, #0066cc)',
                    paddingBottom: '1px',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderBottomStyle = 'solid')}
                onMouseLeave={e => (e.currentTarget.style.borderBottomStyle = 'dashed')}
            >
                {label || id}
            </span>
        );
    }
    return <span>{label || id}</span>;
}

// ── Header ──

function DetailHeader({ id, title, type, isDraft, authors, volumeText, meta, headerExtra }: {
    id: string;
    title: string;
    type: IndexType;
    isDraft: boolean;
    authors?: AuthorInfo[];
    volumeText?: string;
    meta: React.ReactNode[];
    headerExtra?: React.ReactNode;
}) {
    return (
        <div style={{ marginBottom: '4px' }}>
            {/* 标题行：左侧标题 + 右侧徽章 */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
            }}>
                <h1 style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: 'var(--bim-fg, #1a1a1a)',
                    margin: '0 0 6px',
                    lineHeight: 1.3,
                    letterSpacing: '0.5px',
                    flex: 1,
                    minWidth: 0,
                }}>
                    {title}
                    {volumeText && (
                        <span style={{
                            fontSize: '15px',
                            fontWeight: 400,
                            color: 'var(--bim-desc-fg, #717171)',
                            marginLeft: '8px',
                        }}>
                            {volumeText}
                        </span>
                    )}
                </h1>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0,
                    paddingTop: '4px',
                }}>
                    <TypeBadge type={type} />
                    <StatusBadge isDraft={isDraft} />
                    <IdBadge id={id} />
                    {headerExtra}
                </div>
            </div>
            {(authors?.length || meta.length > 0) && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    gap: '12px',
                    marginTop: '6px',
                }}>
                    {authors && authors.length > 0 && (
                        <AuthorLine authors={authors} type={type} />
                    )}
                    {meta}
                </div>
            )}
        </div>
    );
}

// ── 收录于 ──

function IndexedBySection({ items, onNavigate, renderLink }: {
    items: IndexedByEntry[];
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    if (!items.length) return null;
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    return (
        <>
            <SectionLabel>收录</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map((entry, i) => {
                    const isExpanded = expandedIndex === i;
                    return (
                        <div key={i} style={{
                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            transition: 'box-shadow 0.15s',
                            ...(isExpanded ? { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } : {}),
                        }}>
                            <div
                                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                                style={{
                                    padding: '8px 12px',
                                    background: 'var(--bim-input-bg, #fff)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '6px',
                                    userSelect: 'none',
                                }}
                            >
                                <span style={{
                                    fontSize: '10px',
                                    color: 'var(--bim-desc-fg, #717171)',
                                    transition: 'transform 0.15s',
                                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                                    display: 'inline-block',
                                    flexShrink: 0,
                                }}>▶</span>
                                <span style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: 'var(--bim-fg, #333)',
                                }}>
                                    {entry.source}
                                </span>
                                {!isExpanded && entry.title_info && (
                                    <span style={{
                                        fontSize: '12px',
                                        color: 'var(--bim-desc-fg, #999)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {entry.title_info}
                                    </span>
                                )}
                                {entry.source_bid && (
                                    <span onClick={e => e.stopPropagation()}
                                        style={{ fontSize: '11px', marginLeft: 'auto', flexShrink: 0 }}>
                                        <IdLink id={entry.source_bid} label="查看 →" onNavigate={onNavigate} renderLink={renderLink} />
                                    </span>
                                )}
                            </div>
                            {isExpanded && (
                                <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--bim-widget-border, #e0e0e0)' }}>
                                    {(entry.title_info || entry.author_info || entry.version) && (
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '8px 16px',
                                            padding: '8px 0',
                                            fontSize: '13px',
                                        }}>
                                            {entry.title_info && <MetaItem label="题名">{entry.title_info}</MetaItem>}
                                            {entry.author_info && <MetaItem label="著者">{entry.author_info}</MetaItem>}
                                            {entry.version && <MetaItem label="版本">{entry.version}</MetaItem>}
                                        </div>
                                    )}
                                    {entry.summary && (
                                        <div style={{
                                            marginTop: '6px',
                                            padding: '10px 14px',
                                            borderLeft: '3px solid var(--bim-primary, #8e6f3e)',
                                            background: 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 4%, transparent)',
                                            borderRadius: '0 4px 4px 0',
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: 'var(--bim-desc-fg, #717171)',
                                                marginBottom: '4px',
                                                letterSpacing: '1px',
                                            }}>提要</div>
                                            <p style={{
                                                fontSize: '13px',
                                                color: 'var(--bim-fg, #333)',
                                                lineHeight: 1.9,
                                                margin: 0,
                                                textAlign: 'justify',
                                            }}>{entry.summary}</p>
                                        </div>
                                    )}
                                    {entry.comment && (
                                        <div style={{
                                            marginTop: '8px',
                                            padding: '8px 14px',
                                            borderLeft: '3px solid var(--bim-desc-fg, #aaa)',
                                            borderRadius: '0 4px 4px 0',
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: 'var(--bim-desc-fg, #717171)',
                                                marginBottom: '4px',
                                                letterSpacing: '1px',
                                            }}>按語</div>
                                            <p style={{
                                                fontSize: '13px',
                                                color: 'var(--bim-fg, #555)',
                                                lineHeight: 1.8,
                                                margin: 0,
                                                fontStyle: 'italic',
                                            }}>{entry.comment}</p>
                                        </div>
                                    )}
                                    {entry.additional_comment && (
                                        <div style={{
                                            marginTop: '8px',
                                            padding: '8px 14px',
                                            borderLeft: '3px solid var(--bim-desc-fg, #ccc)',
                                            borderRadius: '0 4px 4px 0',
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: 'var(--bim-desc-fg, #717171)',
                                                marginBottom: '4px',
                                                letterSpacing: '1px',
                                            }}>附按</div>
                                            <p style={{
                                                fontSize: '13px',
                                                color: 'var(--bim-fg, #555)',
                                                lineHeight: 1.8,
                                                margin: 0,
                                                fontStyle: 'italic',
                                            }}>{entry.additional_comment}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}

// ── 附录/副题 ──

function AdditionalTitlesList({ items }: { items: AdditionalTitle[] }) {
    if (!items.length) return null;
    return (
        <>
            <SectionLabel>附录</SectionLabel>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
            }}>
                {items.map((t, i) => (
                    <span key={i} style={{
                        display: 'inline-flex',
                        alignItems: 'baseline',
                        gap: '3px',
                        padding: '3px 8px',
                        fontSize: '13px',
                        color: 'var(--bim-fg, #333)',
                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                        borderRadius: '4px',
                        background: 'var(--bim-input-bg, #fff)',
                    }}>
                        《{t.book_title}》
                        {t.n_juan != null && (
                            <span style={{ color: 'var(--bim-desc-fg, #999)', fontSize: '12px' }}>{t.n_juan}卷</span>
                        )}
                    </span>
                ))}
            </div>
        </>
    );
}

// ── 流转历史 ──

function HistoryTimeline({ items }: { items: LocationInfo[] }) {
    if (!items.length) return null;
    return (
        <>
            <SectionLabel>流转历史</SectionLabel>
            <div style={{ position: 'relative', paddingLeft: '18px' }}>
                <div style={{
                    position: 'absolute',
                    left: '4px',
                    top: '6px',
                    bottom: '6px',
                    width: '1px',
                    background: 'var(--bim-widget-border, #ddd)',
                }} />
                {items.map((loc, i) => (
                    <div key={i} style={{ position: 'relative', marginBottom: '10px' }}>
                        <div style={{
                            position: 'absolute',
                            left: '-16px',
                            top: '5px',
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: 'var(--bim-primary, #8e6f3e)',
                            border: '1.5px solid var(--bim-input-bg, #fff)',
                        }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bim-fg, #333)' }}>
                            {loc.name}
                        </span>
                        {loc.description && (
                            <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #999)', marginLeft: '8px' }}>
                                {loc.description}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

// ── 历史沿革 ──

function HistoryList({ items }: { items: string[] }) {
    if (!items.length) return null;
    return (
        <>
            <SectionLabel>历史沿革</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((item, i) => (
                    <div key={i} style={{
                        fontSize: '13px',
                        color: 'var(--bim-fg, #333)',
                        lineHeight: 1.7,
                        paddingLeft: '12px',
                        position: 'relative',
                    }}>
                        <span style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            color: 'var(--bim-desc-fg, #ccc)',
                        }}>·</span>
                        {item}
                    </div>
                ))}
            </div>
        </>
    );
}

// ── 关联列表 ──

/** 已解析的关联条目 */
interface ResolvedRelation {
    id: string;
    title?: string;
    version?: string;
    type?: string;
}

function RelationList({ title, ids, transport, onNavigate, renderLink }: {
    title: string;
    ids: string[];
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    const [resolved, setResolved] = useState<ResolvedRelation[]>([]);

    useEffect(() => {
        if (!ids.length) { setResolved([]); return; }
        if (!transport) {
            setResolved(ids.map(id => ({ id })));
            return;
        }
        let cancelled = false;
        Promise.all(
            ids.map(id =>
                transport.getItem(id).then(raw => ({
                    id,
                    title: raw ? (raw as any).title : undefined,
                    version: raw ? (raw as any).version : undefined,
                    type: raw ? (raw as any).type : undefined,
                })).catch(() => ({ id } as ResolvedRelation))
            )
        ).then(items => {
            if (!cancelled) setResolved(items);
        });
        return () => { cancelled = true; };
    }, [ids, transport]);

    if (!ids.length) return null;

    return (
        <>
            <SectionLabel>
                {title}
                <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #aaa)', fontWeight: 400 }}>
                    ({ids.length})
                </span>
            </SectionLabel>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
            }}>
                {(resolved.length ? resolved : ids.map(id => ({ id } as ResolvedRelation))).map(item => {
                    const label = item.version
                        ? `${item.title || item.id}（${item.version}）`
                        : item.title || undefined;
                    return (
                        <span key={item.id} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            fontSize: '13px',
                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '4px',
                            background: 'var(--bim-input-bg, #fff)',
                            transition: 'border-color 0.15s',
                        }}>
                            <IdLink id={item.id} label={label} onNavigate={onNavigate} renderLink={renderLink} />
                        </span>
                    );
                })}
            </div>
        </>
    );
}

// ── 相关版本（纵向卡片 + 资源） ──

interface ResolvedBook {
    id: string;
    title?: string;
    version?: string;
    resources?: ResourceEntry[];
}

function BookVersionList({ ids, transport, onNavigate, renderLink }: {
    ids: string[];
    transport?: IndexStorage;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    const [books, setBooks] = useState<ResolvedBook[]>([]);

    useEffect(() => {
        if (!ids.length) { setBooks([]); return; }
        if (!transport) { setBooks(ids.map(id => ({ id }))); return; }
        let cancelled = false;
        Promise.all(
            ids.map(id =>
                transport.getItem(id).then(raw => ({
                    id,
                    title: raw ? (raw as any).title : undefined,
                    version: raw ? (raw as any).version : undefined,
                    resources: raw ? (raw as any).resources as ResourceEntry[] | undefined : undefined,
                })).catch(() => ({ id } as ResolvedBook))
            )
        ).then(items => { if (!cancelled) setBooks(items); });
        return () => { cancelled = true; };
    }, [ids, transport]);

    if (!ids.length) return null;

    return (
        <>
            <SectionLabel>
                相关版本
                <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #aaa)', fontWeight: 400 }}>
                    ({ids.length})
                </span>
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(books.length ? books : ids.map(id => ({ id } as ResolvedBook))).map(book => {
                    const label = book.version
                        ? `${book.title || book.id}（${book.version}）`
                        : book.title || undefined;
                    return (
                        <div key={book.id} style={{
                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            background: 'var(--bim-input-bg, #fff)',
                        }}>
                            <div style={{
                                padding: '10px 14px',
                                borderBottom: book.resources?.length
                                    ? '1px solid var(--bim-widget-border, #e0e0e0)'
                                    : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}>
                                <IdLink id={book.id} label={label} onNavigate={onNavigate} renderLink={renderLink} />
                            </div>
                            {book.resources && book.resources.length > 0 && (
                                <div style={{ padding: '10px 14px' }}>
                                    <ResourceList items={book.resources} groupByType />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}

// ── 作品信息卡片 ──

function WorkInfoCard({ workData, onNavigate, renderLink }: {
    workData: WorkDetailData;
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    return (
        <div style={{
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'var(--bim-input-bg, #fff)',
            marginTop: '4px',
        }}>
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 4%, transparent)',
            }}>
                <TypeBadge type="work" />
                <span style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--bim-fg, #333)',
                }}>
                    <IdLink id={workData.id} label={workData.title} onNavigate={onNavigate} renderLink={renderLink} />
                </span>
                {workData.juan_count?.number && (
                    <span style={{
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #717171)',
                    }}>
                        {numberToChinese(workData.juan_count.number)}卷
                    </span>
                )}
            </div>
            <div style={{ padding: '12px 16px' }}>
                {workData.authors && workData.authors.length > 0 && (
                    <AuthorLine authors={workData.authors} type="work" />
                )}
                {workData.description?.text && (
                    <p style={{
                        fontSize: '13px',
                        color: 'var(--bim-fg, #444)',
                        lineHeight: 1.8,
                        margin: workData.authors?.length ? '8px 0 0' : '0',
                        textAlign: 'justify',
                    }}>
                        {workData.description.text}
                    </p>
                )}
                {workData.parent_work && (
                    <div style={{ marginTop: '8px', fontSize: '13px' }}>
                        <MetaItem label="上级作品">
                            <IdLink id={workData.parent_work.id} label={workData.parent_work.title} onNavigate={onNavigate} renderLink={renderLink} />
                        </MetaItem>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── 收录于（BID-link + 册号） ──

function ContainedInLinks({ items, onNavigate, renderLink }: {
    items: ResolvedContainedIn[];
    onNavigate?: (id: string) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;
}) {
    if (!items.length) return null;
    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginTop: '6px',
        }}>
            {items.map(item => (
                <span key={item.id} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    fontSize: '13px',
                    border: '1px solid #2471a340',
                    borderRadius: '4px',
                    background: '#2471a308',
                }}>
                    <span style={{ fontSize: '11px', color: '#2471a3' }}>丛编</span>
                    <IdLink id={item.id} label={item.title || item.id} onNavigate={onNavigate} renderLink={renderLink} />
                    {item.volume_index != null && (
                        <span style={{
                            fontSize: '11px',
                            color: 'var(--bim-desc-fg, #717171)',
                            marginLeft: '2px',
                        }}>
                            第{item.volume_index}册
                        </span>
                    )}
                </span>
            ))}
        </div>
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
    const [workInfo, setWorkInfo] = useState<WorkDetailData | null>(null);
    const [containedInResolved, setContainedInResolved] = useState<ResolvedContainedIn[]>([]);

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

    // 加载作品信息 & 解析 contained_in
    useEffect(() => {
        if (!detail || !transport) {
            setWorkInfo(null);
            setContainedInResolved([]);
            return;
        }

        let cancelled = false;

        // 书籍：加载所属作品的详细信息
        if (detail.type === 'book') {
            const bookData = detail as BookDetailData;
            if (bookData.work_id) {
                transport.getItem(bookData.work_id).then(raw => {
                    if (!cancelled && raw && (raw as any).type === 'work') {
                        setWorkInfo(raw as unknown as WorkDetailData);
                    }
                }).catch(() => {});
            } else {
                setWorkInfo(null);
            }

            // 解析 contained_in → 标题 + 册号
            if (bookData.contained_in && bookData.contained_in.length > 0) {
                Promise.all(
                    bookData.contained_in.map(entry => {
                        const cid = typeof entry === 'string' ? entry : entry.id;
                        const volumeIndex = typeof entry === 'string' ? undefined : entry.volume_index;
                        return transport.getItem(cid).then(raw => ({
                            id: cid,
                            title: raw ? (raw as any).title || cid : cid,
                            volume_index: volumeIndex,
                        })).catch(() => ({ id: cid, title: cid, volume_index: volumeIndex }));
                    })
                ).then(resolved => {
                    if (!cancelled) setContainedInResolved(resolved);
                });
            } else {
                setContainedInResolved([]);
            }
        } else {
            setWorkInfo(null);
            setContainedInResolved([]);
        }

        return () => { cancelled = true; };
    }, [detail, transport]);

    if (loading) {
        return (
            <div className={className} style={{ ...style, padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[180, 260, 160].map((w, i) => (
                        <div key={i} style={{
                            height: i === 1 ? '32px' : '16px',
                            width: `${w}px`,
                            background: 'var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '4px',
                            opacity: 0.4,
                        }} />
                    ))}
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

    if (!detail) return null;

    const bookData = detail.type === 'book' ? detail as BookDetailData : null;
    const collectionData = detail.type === 'collection' ? detail as CollectionDetailData : null;
    const workData = detail.type === 'work' ? detail as WorkDetailData : null;

    // 从 ID 解析草稿状态
    let isDraft = false;
    try { isDraft = extractStatus(detail.id) === 'draft'; } catch {}

    // 卷数文字（显示在标题旁）
    let volumeText = '';
    if (detail.juan_count?.number) {
        volumeText = numberToChinese(detail.juan_count.number) + '卷';
    } else if (detail.juan_count?.description) {
        volumeText = detail.juan_count.description;
    }

    // 构建 meta 行
    const meta: React.ReactNode[] = [];
    if (detail.publication_info?.year) {
        meta.push(<MetaItem key="year" label="年代">{detail.publication_info.year}</MetaItem>);
    }
    if (detail.current_location?.name) {
        meta.push(<MetaItem key="loc" label="现藏">{detail.current_location.name}</MetaItem>);
    }
    if (detail.page_count?.description) {
        meta.push(<MetaItem key="page" label="页">{detail.page_count.description}</MetaItem>);
    }
    if (bookData?.version) {
        meta.push(<MetaItem key="ver" label="版本">{bookData.version}</MetaItem>);
    }
    if (workData?.parent_work) {
        meta.push(
            <MetaItem key="pw" label="上级作品">
                <IdLink id={workData.parent_work.id} label={workData.parent_work.title} onNavigate={onNavigate} renderLink={renderLink} />
            </MetaItem>
        );
    }
    if (workData?.parent_works && workData.parent_works.length > 0 && !workData.parent_work) {
        meta.push(
            <MetaItem key="pws" label="上级作品">
                {workData.parent_works.map((pid, i) => (
                    <span key={pid}>
                        {i > 0 && '、'}
                        <IdLink id={pid} onNavigate={onNavigate} renderLink={renderLink} />
                    </span>
                ))}
            </MetaItem>
        );
    }

    return (
        <div className={className} style={style}>
            <DetailHeader
                id={detail.id}
                title={detail.title}
                type={detail.type}
                isDraft={isDraft}
                authors={detail.authors}
                volumeText={volumeText}
                meta={meta}
                headerExtra={headerExtra}
            />

            {detail.description?.text && (
                <p style={{
                    fontSize: '14px',
                    color: 'var(--bim-fg, #444)',
                    lineHeight: 1.9,
                    margin: '0 0 4px',
                    textAlign: 'justify',
                }}>
                    {detail.description.text}
                </p>
            )}

            {containedInResolved.length > 0 && (
                <>
                    <SectionLabel>收录于</SectionLabel>
                    <ContainedInLinks items={containedInResolved} onNavigate={onNavigate} renderLink={renderLink} />
                </>
            )}

            {workInfo && (
                <>
                    <SectionLabel>所属作品</SectionLabel>
                    <WorkInfoCard workData={workInfo} onNavigate={onNavigate} renderLink={renderLink} />
                </>
            )}

            {detail.additional_titles && detail.additional_titles.length > 0 && (
                <AdditionalTitlesList items={detail.additional_titles} />
            )}

            {detail.indexed_by && detail.indexed_by.length > 0 && (
                <IndexedBySection items={detail.indexed_by} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {detail.resources && detail.resources.length > 0 && (
                <>
                    <SectionLabel>资源</SectionLabel>
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
                <RelationList title="相关版本" ids={bookData.related_books} transport={transport} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {collectionData?.books && collectionData.books.length > 0 && (
                <RelationList title="收录书籍" ids={collectionData.books} transport={transport} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {workData?.books && workData.books.length > 0 && (
                <BookVersionList ids={workData.books} transport={transport} onNavigate={onNavigate} renderLink={renderLink} />
            )}

            {workData?.related_works && workData.related_works.length > 0 && (
                <>
                    <SectionLabel>
                        相关作品
                        <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #aaa)', fontWeight: 400 }}>
                            ({workData.related_works.length})
                        </span>
                    </SectionLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {workData.related_works.map(rw => (
                            <span key={rw.id} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 10px',
                                fontSize: '13px',
                                border: '1px solid var(--bim-widget-border, #e0e0e0)',
                                borderRadius: '4px',
                                background: 'var(--bim-input-bg, #fff)',
                            }}>
                                <IdLink id={rw.id} label={rw.title} onNavigate={onNavigate} renderLink={renderLink} />
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
