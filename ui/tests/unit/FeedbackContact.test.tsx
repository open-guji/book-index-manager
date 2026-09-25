/**
 * 反馈表单的选填联系方式（kaiyuanguji G-23，2026-09-25）。
 *
 * 读者没留联系方式时站方无法回复，所以加一栏选填邮箱。两个方向都钉住：
 *   - 填了：原样（去空白）随 onSubmit 带出
 *   - 没填：不带 contact 键（后端据此不落该字段，旧后端也不受影响）
 * FeedbackForm（详情页 tab）与 FeedbackDialog（全站浮动按钮）是两份表单，各测一遍。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackForm } from '../../src/components/FeedbackForm';
import { FeedbackDialog } from '../../src/components/FeedbackDialog';

function fill(content: string, contact?: string, submitText = '提交') {
    fireEvent.change(screen.getByPlaceholderText(/请描述您发现的错误/), { target: { value: content } });
    if (contact !== undefined) {
        fireEvent.change(screen.getByLabelText('联系方式（选填）'), { target: { value: contact } });
    }
    fireEvent.click(screen.getByText(submitText));
}

describe('FeedbackForm 联系方式', () => {
    it('填了邮箱：去空白后带出', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<FeedbackForm onSubmit={onSubmit} />);
        fill('有错字', '  me@example.com ');
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledWith({ type: 'bug', content: '有错字', contact: 'me@example.com' });
    });

    it('没填：不带 contact 键', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<FeedbackForm onSubmit={onSubmit} />);
        fill('有错字', '   ');
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0]).toEqual({ type: 'bug', content: '有错字' });
    });
});

describe('FeedbackDialog 联系方式', () => {
    it('选类型、填邮箱后提交：带出 contact', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<FeedbackDialog isOpen onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByText('反馈错误'));
        fill('链接坏了', 'wx: reader01', '提交反馈');
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledWith({ type: 'bug', content: '链接坏了', contact: 'wx: reader01' });
    });
});
