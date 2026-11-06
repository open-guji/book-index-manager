import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n/provider';
import { FeedbackTab } from '../../src/components/FeedbackTab';
import { createFeedbackTransport, feedbackTransportOf } from '../../src/core/feedback-api';
import type { FeedbackTransport } from '../../src/core/feedback-api';

describe('FeedbackTab · 走传输层', () => {
    it('列表经 transport.listFeedback 取，组件不碰全局 fetch', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const transport: FeedbackTransport = {
            listFeedback: vi.fn(async () => [{ id: '1', type: 'bug', content: '某处错字', createdAt: '2026-11-01T00:00:00Z', status: 'pending' }]),
            submitFeedback: vi.fn(async () => {}),
        };
        render(<LocaleProvider><FeedbackTab resourceId="r1" transport={transport} /></LocaleProvider>);
        await waitFor(() => expect(screen.getByText('某处错字')).toBeTruthy());
        expect(transport.listFeedback).toHaveBeenCalledWith('r1');
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});

describe('createFeedbackTransport', () => {
    it('GET 带 resourceId，success 才返回条目；网络错误返回空', async () => {
        const f = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, items: [{ id: 'a' }] }) })) as unknown as typeof fetch;
        const tr = createFeedbackTransport('/x', { fetch: f });
        expect(await tr.listFeedback('a b')).toEqual([{ id: 'a' }]);
        expect(f).toHaveBeenCalledWith('/x?resourceId=a%20b');
        const bad = createFeedbackTransport('/x', { fetch: (async () => { throw new Error('net'); }) as typeof fetch });
        expect(await bad.listFeedback('a')).toEqual([]);
    });
    it('POST 失败抛服务端给的 error', async () => {
        const f = vi.fn(async () => ({ ok: false, json: async () => ({ error: '太频繁' }) })) as unknown as typeof fetch;
        const tr = createFeedbackTransport(() => '/y', { fetch: f });
        await expect(tr.submitFeedback({ type: 'bug', content: 'c' })).rejects.toThrow('太频繁');
    });
    it('feedbackTransportOf：storage 两个方法都有才算', () => {
        expect(feedbackTransportOf({})).toBeNull();
        expect(feedbackTransportOf({ listFeedback: async () => [] })).toBeNull();
        const both = { listFeedback: async () => [], submitFeedback: async () => {} };
        expect(feedbackTransportOf(both)).toBe(both);
    });
});
