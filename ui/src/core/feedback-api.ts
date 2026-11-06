/**
 * 反馈的传输层：组件（FeedbackTab）不直接 `fetch`，由宿主的 `IndexStorage`（`listFeedback`／`submitFeedback`）
 * 或这里的 `createFeedbackTransport(apiUrl)` 提供。
 */

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

/** 提交一条反馈（contact 选填，仅站方可见） */
export interface FeedbackSubmission {
    type: string;
    content: string;
    contact?: string;
    pageUrl?: string;
    resourceId?: string;
}

export interface FeedbackTransport {
    /** 某条目的已有反馈；取不到返回空数组 */
    listFeedback(resourceId: string): Promise<FeedbackItem[]>;
    /** 提交；失败抛 Error（message 给读者看） */
    submitFeedback(data: FeedbackSubmission): Promise<void>;
}

/**
 * 基于 HTTP 端点的实现：
 * GET  `${apiUrl}?resourceId=...` 返回 `{ success: boolean, items: FeedbackItem[] }`；
 * POST `${apiUrl}` body 同 FeedbackSubmission，返回 2xx。
 * apiUrl 可以是函数（按当前 hostname 动态决定，如 localhost → 远程，生产 → 同源）。
 */
export function createFeedbackTransport(
    apiUrl: string | (() => string) = '/api/feedback',
    opts?: { fetch?: typeof fetch; defaultError?: string },
): FeedbackTransport {
    const url = () => (typeof apiUrl === 'function' ? apiUrl() : apiUrl);
    const doFetch = (...a: Parameters<typeof fetch>) => (opts?.fetch ?? fetch)(...a);
    return {
        async listFeedback(resourceId) {
            try {
                const res = await doFetch(`${url()}?resourceId=${encodeURIComponent(resourceId)}`);
                const data = await res.json();
                return data?.success && Array.isArray(data.items) ? (data.items as FeedbackItem[]) : [];
            } catch {
                return []; // 网络错误：列表留空
            }
        },
        async submitFeedback(data) {
            const res = await doFetch(url(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.error || opts?.defaultError || 'submit failed');
            }
        },
    };
}

/** storage 同时带 listFeedback／submitFeedback 就直接当反馈传输层用 */
export function feedbackTransportOf(storage: Partial<FeedbackTransport> | undefined | null): FeedbackTransport | null {
    return storage && typeof storage.listFeedback === 'function' && typeof storage.submitFeedback === 'function'
        ? (storage as FeedbackTransport)
        : null;
}
