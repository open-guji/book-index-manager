/**
 * G-23 第二批 §一·6/10：book-index-ui 的公开反馈列表。
 *   - 服务端类型/状态白名单已扩充（suggestion/contact/other、in_progress/wontfix/duplicate），
 *     旧版 UI 遇到不认识的取值要回退显示「其他」/「待处理」，不能崩
 *   - pageUrl 只对本站域名渲染成链接，外部网址按纯文本展示
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedbackList } from '../../src/components/FeedbackList';
import type { FeedbackItem } from '../../src/components/FeedbackList';

function item(overrides: Partial<FeedbackItem>): FeedbackItem {
    return {
        id: 'fb_1_a', type: 'bug', content: '内容', createdAt: '2026-09-20T00:00:00.000Z',
        status: 'pending', ...overrides,
    };
}

describe('未知类型/状态回退（不崩）', () => {
    it('新扩充的 type（suggestion）：认识，显示专属标签', () => {
        render(<FeedbackList items={[item({ type: 'suggestion', content: '想要暗色模式' })]} />);
        expect(screen.getByText('想要暗色模式')).toBeInTheDocument();
        expect(screen.getByText('功能建议')).toBeInTheDocument();
    });

    it('完全陌生的 type（旧版数据模型之外）：不抛异常，显示「其他」', () => {
        expect(() => render(<FeedbackList items={[item({ type: 'something-new-2027' as FeedbackItem['type'] })]} />)).not.toThrow();
        expect(screen.getByText('其他')).toBeInTheDocument();
    });

    it('完全陌生的 status：不抛异常，回退「待处理」', () => {
        expect(() => render(<FeedbackList items={[item({ status: 'archived-2027' as FeedbackItem['status'] })]} />)).not.toThrow();
        expect(screen.getByText('待处理')).toBeInTheDocument();
    });
});

describe('pageUrl 域名过滤', () => {
    const HERE = 'https://www.kaiyuanguji.com/feedback';

    it('本站地址渲染为可点击链接', () => {
        Object.defineProperty(window, 'location', { value: { ...window.location, href: HERE, hostname: 'www.kaiyuanguji.com' }, writable: true });
        render(<FeedbackList items={[item({ pageUrl: 'https://www.kaiyuanguji.com/book-index?id=x' })]} />);
        expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('外部地址只显示文本，不渲染 <a>（防止看起来像站内可信链接）', () => {
        Object.defineProperty(window, 'location', { value: { ...window.location, href: HERE, hostname: 'www.kaiyuanguji.com' }, writable: true });
        render(<FeedbackList items={[item({ pageUrl: 'https://evil.example/phish' })]} />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText('https://evil.example/phish')).toBeInTheDocument();
    });
});
