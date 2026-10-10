/**
 * ResourceEditor：新建／改类型只写 `types` 数组，不再写单值 `type`
 * （schema/legacy.md §五；text+image 拆成 ['text','image']）
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResourceEditor } from '../../src/components/ResourceEditor';
import type { ResourceEntry } from '../../src/types';

describe('ResourceEditor 写 types', () => {
    it('点「添加资源」新建的条目带 types:["text"]，没有 type', () => {
        const onChange = vi.fn();
        render(<ResourceEditor items={[]} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button'));
        const next = onChange.mock.calls[0][0] as ResourceEntry[];
        expect(next).toHaveLength(1);
        expect(next[0].types).toEqual(['text']);
        expect('type' in next[0]).toBe(false);
    });

    it('按 filterType 新建：text+image 拆成两项', () => {
        const onChange = vi.fn();
        render(<ResourceEditor items={[]} onChange={onChange} filterType="text+image" />);
        fireEvent.click(screen.getByRole('button'));
        const next = onChange.mock.calls[0][0] as ResourceEntry[];
        expect(next[0].types).toEqual(['text', 'image']);
        expect('type' in next[0]).toBe(false);
    });

    it('改类型：旧单值 type 被去掉，换成 types（text+image 拆两项）', () => {
        const onChange = vi.fn();
        const items: ResourceEntry[] = [{ id: 'a', name: '旧资源', url: 'https://e.com', type: 'text' }];
        render(<ResourceEditor items={items} onChange={onChange} />);
        fireEvent.click(screen.getByText('旧资源')); // 展开
        const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
        expect(select.value).toBe('text'); // 旧 type 仍能读出
        fireEvent.change(select, { target: { value: 'text+image' } });
        const next = onChange.mock.calls[0][0] as ResourceEntry[];
        expect(next[0].types).toEqual(['text', 'image']);
        expect('type' in next[0]).toBe(false);
        expect(next[0].name).toBe('旧资源');
    });

    it('改类型：单类型写单元素数组', () => {
        const onChange = vi.fn();
        const items: ResourceEntry[] = [{ id: 'a', name: '资源甲', url: 'https://e.com', types: ['text', 'image'] }];
        render(<ResourceEditor items={items} onChange={onChange} />);
        fireEvent.click(screen.getByText('资源甲'));
        const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
        expect(select.value).toBe('text+image');
        fireEvent.change(select, { target: { value: 'physical' } });
        expect((onChange.mock.calls[0][0] as ResourceEntry[])[0].types).toEqual(['physical']);
    });
});

describe('validateResource 闭集', () => {
    it('types 闭集含 catalog／annotated', async () => {
        const { validateResource } = await import('../../src/core/schema');
        const base = { id: 'a', name: 'A', url: 'https://e.com' };
        expect(validateResource({ ...base, types: ['catalog'] } as ResourceEntry)).toEqual([]);
        expect(validateResource({ ...base, types: ['image', 'annotated'] } as unknown as ResourceEntry)).toEqual([]);
        expect(validateResource({ ...base, types: ['bogus'] } as unknown as ResourceEntry)).not.toEqual([]);
    });
});
