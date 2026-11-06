import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FeedbackList } from './FeedbackList';
import type { FeedbackItem } from './FeedbackList';
import { FeedbackForm } from './FeedbackForm';
import { useI18n } from '../i18n';
import { createFeedbackTransport } from '../core/feedback-api';
import type { FeedbackTransport } from '../core/feedback-api';

export interface FeedbackTabProps {
    /** 该资源的 ID（用于过滤反馈条目） */
    resourceId: string;
    /**
     * 反馈传输层（`IndexStorage` 的 `listFeedback`／`submitFeedback`，或 `createFeedbackTransport(url)`）。
     * 组件本身不发请求。
     */
    transport?: FeedbackTransport;
    /**
     * @deprecated 请传 `transport`。没传 `transport` 时按这个端点建一个 HTTP 传输层（默认 `/api/feedback`）。
     */
    apiUrl?: string | (() => string);
}

/**
 * 反馈 tab 内容：列出已有反馈 + 提交新反馈。
 * 与 FeedbackList/FeedbackForm 不同，FeedbackTab 自带数据加载和提交逻辑（经传输层），
 * 适合直接作为详情页的 tab 内容使用。
 */
export const FeedbackTab: React.FC<FeedbackTabProps> = ({ resourceId, transport, apiUrl }) => {
    const { t } = useI18n();
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const tRef = useRef(t);
    tRef.current = t;
    const tr = useMemo(
        () => transport ?? createFeedbackTransport(apiUrl, { defaultError: tRef.current('feedback.submitFailed') }),
        [transport, apiUrl],
    );

    const loadFeedback = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await tr.listFeedback(resourceId));
        } catch {
            // 取不到：列表留空
        } finally {
            setLoading(false);
        }
    }, [resourceId, tr]);

    useEffect(() => {
        loadFeedback();
    }, [loadFeedback]);

    const handleSubmit = async (data: { type: string; content: string; contact?: string }) => {
        await tr.submitFeedback({
            ...data,
            pageUrl: typeof window !== 'undefined' ? window.location.href : '',
            resourceId,
        });
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
