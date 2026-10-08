/**
 * overview#458 批次 0.4：详情页取数加并发上限（人物页展开、版本表、丛编子目、谱系原来串行）。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { mapLimit } from '../../src/core/map-limit';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import type { IndexDetailData } from '../../src/types';

const tick = () => new Promise(r => setTimeout(r, 1));

describe('mapLimit', () => {
    it('结果按输入顺序返回，同时在飞的不超过 limit', async () => {
        let inflight = 0, peak = 0;
        const out = await mapLimit([...Array(30).keys()], 8, async (n) => {
            inflight++; peak = Math.max(peak, inflight);
            await tick();
            inflight--;
            return n * 2;
        });
        expect(out).toEqual([...Array(30).keys()].map(n => n * 2));
        expect(peak).toBe(8);
    });

    it('空数组、少于 limit 个都正常', async () => {
        expect(await mapLimit([], 8, async (n: number) => n)).toEqual([]);
        expect(await mapLimit([1, 2], 8, async (n) => n + 1)).toEqual([2, 3]);
    });

    it('有一项抛错就整体 reject（与 Promise.all 一致，调用方自己 catch）', async () => {
        await expect(mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('x'); return n; })).rejects.toThrow('x');
    });
});

describe('版本表取数有并发上限', () => {
    it('作品页 24 个版本：getItem 同时在飞的不超过 8', async () => {
        const ids = Array.from({ length: 24 }, (_, i) => `b${i}`);
        const work = { id: 'w1', type: 'work', title: '史記', books: ids, _edition_count: ids.length } as unknown as IndexDetailData;
        let inflight = 0, peak = 0, calls = 0;
        const getItem = vi.fn(async (id: string) => {
            if (id === 'w1') return work as unknown as Record<string, unknown>;
            calls++; inflight++; peak = Math.max(peak, inflight);
            await tick();
            inflight--;
            return { id, type: 'book', title: '史記', edition: id };
        });
        const transport = {
            getItem, getEntry: vi.fn(async () => null), getLineageGraph: vi.fn(async () => null),
            getTextManifest: vi.fn(async () => null), getTextIndex: vi.fn(async () => null),
        };
        render(<BookDetailLayout id="w1" transport={transport as never} initialDetail={work} activeTab="basic" onTabChange={() => {}} />);
        await waitFor(() => expect(calls).toBeGreaterThanOrEqual(ids.length));
        expect(peak).toBeLessThanOrEqual(8);
        expect(peak).toBeGreaterThan(1);
    });
});
