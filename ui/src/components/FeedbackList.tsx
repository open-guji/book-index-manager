import React from 'react';
import { LoadingDots } from './common/LoadingDots';
import { useBidUrl } from '../core/bid-url';
import { bim } from '../styles/tokens';

export interface FeedbackItem {
    id: string;
    // G-23 第二批：type/status 服务端已扩充（suggestion/contact/other、in_progress/wontfix/duplicate）。
    // 旧版 UI 不认识的取值一律回退显示「其他」/「待处理」，不能崩——见 TYPE_CONFIG/STATUS_CONFIG 的 fallback。
    type: 'bug' | 'resource' | 'suggestion' | 'contact' | 'other' | (string & {});
    content: string;
    createdAt: string;
    status: 'pending' | 'in_progress' | 'resolved' | 'wontfix' | 'duplicate' | (string & {});
    reply?: string;
    pageUrl?: string;
    resourceId?: string;
}

export interface FeedbackListProps {
    items: FeedbackItem[];
    loading?: boolean;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
    bug: { label: '错误反馈', color: bim('danger') },
    resource: { label: '资源建议', color: bim('primary') },
    suggestion: { label: '功能建议', color: bim('primary') },
    other: { label: '其他', color: bim('desc-fg') },
};
const FALLBACK_TYPE = { label: '其他', color: bim('desc-fg') };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: '待处理', color: bim('warning') },
    in_progress: { label: '处理中', color: bim('primary') },
    resolved: { label: '已处理', color: bim('success') },
    wontfix: { label: '不采纳', color: bim('desc-fg') },
    duplicate: { label: '重复', color: bim('desc-fg') },
};
const FALLBACK_STATUS = { label: '待处理', color: bim('warning') };

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return iso;
    }
}

/**
 * G-23 第二批 §一·10：pageUrl 只对本站域名渲染成链接，任意外部网址一律按纯文本展示。
 * “本站”＝当前查看页面所在的域名（不硬编码域名——book-index-ui 是通用组件，不该认哪个站是自己）。
 */
export function isSameSiteUrl(url: string | undefined, currentHref: string): boolean {
    if (!url) return false;
    try {
        const target = new URL(url, currentHref);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
        const current = new URL(currentHref);
        return target.hostname === current.hostname;
    } catch {
        return false;
    }
}

export const FeedbackList: React.FC<FeedbackListProps> = ({ items, loading }) => {
    const buildUrl = useBidUrl();
    if (loading) {
        return <LoadingDots />;
    }

    if (items.length === 0) {
        return <div style={emptyStyle}>暂无反馈</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => {
                const typeConf = TYPE_CONFIG[item.type] || FALLBACK_TYPE;
                const statusConf = STATUS_CONFIG[item.status] || FALLBACK_STATUS;
                const pageUrlIsOwn = typeof window !== 'undefined' && isSameSiteUrl(item.pageUrl, window.location.href);
                return (
                    <div key={item.id} style={cardStyle}>
                        {/* Header: type badge + status + time */}
                        <div style={cardHeaderStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ ...badgeStyle, background: typeConf.color }}>
                                    {typeConf.label}
                                </span>
                                <span style={{ ...badgeStyle, background: statusConf.color }}>
                                    {statusConf.label}
                                </span>
                            </div>
                            <span style={timeStyle}>{formatTime(item.createdAt)}</span>
                        </div>

                        {/* Source info */}
                        {(item.resourceId || item.pageUrl) && (
                            <div style={sourceStyle}>
                                {item.resourceId && (
                                    <a href={buildUrl(item.resourceId)} style={sourceLinkStyle}>
                                        {item.resourceId}
                                    </a>
                                )}
                                {item.pageUrl && !item.resourceId && (
                                    pageUrlIsOwn ? (
                                        <a href={item.pageUrl} style={sourceLinkStyle}>
                                            {item.pageUrl.replace(/^https?:\/\/[^/]+/, '')}
                                        </a>
                                    ) : (
                                        <span style={sourceLinkStyle}>{item.pageUrl}</span>
                                    )
                                )}
                            </div>
                        )}

                        {/* Content */}
                        <div style={contentStyle}>{item.content}</div>

                        {/* Reply */}
                        {item.reply && (
                            <div style={replyStyle}>
                                <div style={replyLabelStyle}>回复</div>
                                <div>{item.reply}</div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// --- Styles ---

const emptyStyle: React.CSSProperties = {
    textAlign: 'center', padding: '40px 0',
    color: bim('desc-fg'), fontSize: '14px',
};

const cardStyle: React.CSSProperties = {
    background: bim('bg'),
    border: `1px solid ${bim('widget-border')}`,
    borderRadius: '8px', padding: '16px',
};

const cardHeaderStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '10px', flexWrap: 'wrap', gap: '8px',
};

const badgeStyle: React.CSSProperties = {
    fontSize: '12px', color: bim('on-color-fg'), padding: '2px 8px',
    borderRadius: '4px', fontWeight: 500,
};

const timeStyle: React.CSSProperties = {
    fontSize: '12px', color: bim('desc-fg'),
};

const sourceStyle: React.CSSProperties = {
    fontSize: '12px', marginBottom: '6px',
};

const sourceLinkStyle: React.CSSProperties = {
    color: bim('primary'), textDecoration: 'none',
    borderBottom: `1px dashed ${bim('primary')}`,
};

const contentStyle: React.CSSProperties = {
    fontSize: '14px', lineHeight: '1.6',
    color: bim('fg'), whiteSpace: 'pre-wrap',
};

const replyStyle: React.CSSProperties = {
    marginTop: '12px', padding: '10px 12px',
    background: bim('input-bg'), borderRadius: '6px',
    fontSize: '13px', lineHeight: '1.6', color: bim('fg'),
};

const replyLabelStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, marginBottom: '4px',
    color: bim('primary'),
};
