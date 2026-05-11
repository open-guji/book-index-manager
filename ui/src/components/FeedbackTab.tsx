import React, { useState, useEffect, useCallback } from 'react';
import { FeedbackList } from './FeedbackList';
import type { FeedbackItem } from './FeedbackList';
import { FeedbackForm } from './FeedbackForm';

export interface FeedbackTabProps {
    /** 该资源的 ID（用于过滤反馈条目） */
    resourceId: string;
    /**
     * 反馈 API 端点。
     * GET   `${apiUrl}?resourceId=...` 返回 `{ success: boolean, items: FeedbackItem[] }`
     * POST  `${apiUrl}` body `{ type, content, pageUrl, resourceId }` 返回 2xx
     * 默认 `/api/feedback`。
     * 也支持函数形式：根据当前 hostname 动态决定（如 localhost → 远程，生产 → 同源）。
     */
    apiUrl?: string | (() => string);
}

function resolveApiUrl(apiUrl: FeedbackTabProps['apiUrl']): string {
    if (typeof apiUrl === 'function') return apiUrl();
    return apiUrl ?? '/api/feedback';
}

/**
 * 反馈 tab 内容：列出已有反馈 + 提交新反馈。
 * 与 FeedbackList/FeedbackForm 不同，FeedbackTab 自带数据加载和提交逻辑，
 * 适合直接作为详情页的 tab 内容使用。
 */
export const FeedbackTab: React.FC<FeedbackTabProps> = ({ resourceId, apiUrl }) => {
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadFeedback = useCallback(async () => {
        const url = resolveApiUrl(apiUrl);
        setLoading(true);
        try {
            const res = await fetch(`${url}?resourceId=${encodeURIComponent(resourceId)}`);
            const data = await res.json();
            if (data.success) setItems(data.items);
        } catch {
            // ignore network errors — list stays empty
        } finally {
            setLoading(false);
        }
    }, [resourceId, apiUrl]);

    useEffect(() => {
        loadFeedback();
    }, [loadFeedback]);

    const handleSubmit = async (data: { type: string; content: string }) => {
        const url = resolveApiUrl(apiUrl);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                pageUrl: typeof window !== 'undefined' ? window.location.href : '',
                resourceId,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error || '提交失败');
        }
        setTimeout(() => loadFeedback(), 500);
    };

    return (
        <div>
            <FeedbackList items={items} loading={loading} />
            <div style={{ marginTop: '24px' }}>
                <FeedbackForm onSubmit={handleSubmit} />
            </div>
        </div>
    );
};
