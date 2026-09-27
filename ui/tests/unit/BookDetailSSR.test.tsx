// @vitest-environment node
/**
 * U1（2026-09-27）：BookDetailLayout 在纯 node 环境（没有 window／document／localStorage）
 * 下 renderToString 不报错，并能用 initialDetail 渲染出完整详情。
 * 网站条目页 SSR（W2）在服务端渲染同一个组件，渲染期碰浏览器全局就会直接崩。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';
import shiji from './fixtures/shiji-work.json';

describe('BookDetailLayout SSR（node 环境）', () => {
    it('确实没有浏览器全局', () => {
        expect(typeof window).toBe('undefined');
        expect(typeof document).toBe('undefined');
        expect(typeof localStorage).toBe('undefined');
    });

    it('传 initialDetail：renderToString 出史記书名与作者，不调取数', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const getItem = vi.fn(async () => null);
        const html = renderToString(
            <BookDetailLayout
                id="d59f20aowb9c"
                transport={{ getItem } as never}
                initialDetail={shiji as unknown as IndexDetailData}
                activeTab="basic"
                onTabChange={() => {}}
            />,
        );
        expect(html).toContain('史記');
        expect(html).toContain('司馬遷');
        expect(html).not.toContain('找不到該條目');
        expect(getItem).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it('不传 initialDetail：renderToString 出加载骨架，不报错', () => {
        const html = renderToString(
            <BookDetailLayout
                id="d59f20aowb9c"
                transport={{ getItem: async () => null } as never}
                activeTab="basic"
                onTabChange={() => {}}
            />,
        );
        expect(html).not.toContain('史記');
        expect(html.length).toBeGreaterThan(0);
    });
});
