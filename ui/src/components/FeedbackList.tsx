import React from 'react';

export interface FeedbackItem {
    id: string;
    type: 'bug' | 'resource';
    content: string;
    createdAt: string;
    status: 'pending' | 'resolved';
    reply?: string;
}

export interface FeedbackListProps {
    items: FeedbackItem[];
    loading?: boolean;
}

const TYPE_CONFIG = {
    bug: { label: '错误反馈', color: 'var(--bim-danger, #f44336)' },
    resource: { label: '资源建议', color: 'var(--bim-primary, #0078d4)' },
};

const STATUS_CONFIG = {
    pending: { label: '待处理', color: 'var(--bim-warning, #ff9800)' },
    resolved: { label: '已处理', color: 'var(--bim-success, #4caf50)' },
};

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return iso;
    }
}

export const FeedbackList: React.FC<FeedbackListProps> = ({ items, loading }) => {
    if (loading) {
        return <div style={emptyStyle}>加载中...</div>;
    }

    if (items.length === 0) {
        return <div style={emptyStyle}>暂无反馈</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => {
                const typeConf = TYPE_CONFIG[item.type];
                const statusConf = STATUS_CONFIG[item.status];
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
    color: 'var(--bim-desc-fg, #999)', fontSize: '14px',
};

const cardStyle: React.CSSProperties = {
    background: 'var(--bim-bg, #fff)',
    border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '8px', padding: '16px',
};

const cardHeaderStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '10px', flexWrap: 'wrap', gap: '8px',
};

const badgeStyle: React.CSSProperties = {
    fontSize: '12px', color: '#fff', padding: '2px 8px',
    borderRadius: '4px', fontWeight: 500,
};

const timeStyle: React.CSSProperties = {
    fontSize: '12px', color: 'var(--bim-desc-fg, #999)',
};

const contentStyle: React.CSSProperties = {
    fontSize: '14px', lineHeight: '1.6',
    color: 'var(--bim-fg, #333)', whiteSpace: 'pre-wrap',
};

const replyStyle: React.CSSProperties = {
    marginTop: '12px', padding: '10px 12px',
    background: 'var(--bim-input-bg, #f5f5f5)', borderRadius: '6px',
    fontSize: '13px', lineHeight: '1.6', color: 'var(--bim-fg, #333)',
};

const replyLabelStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, marginBottom: '4px',
    color: 'var(--bim-primary, #0078d4)',
};
