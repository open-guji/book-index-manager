/**
 * GUJI-141 阅读器侧 mock（F6 步 6 接口约定 §九·补）：
 * 给定章 md 与叶子序列，断言 createMdCursor(md).align(leaf) 的结果。
 * 期望值 mdStart 是码点下标；null 表示对不上（应返回 undefined，游标不动）。
 */
import { describe, expect, it } from 'vitest';
import fixture from './md-cursor-leaves.json';
import { createMdCursor } from '../../../src/core/md-cursor';

describe('md-cursor 契约 mock（GUJI-141，阅读器侧）', () => {
    it('每个叶子的 align 结果与契约一致，且游标只向前', () => {
        const cursor = createMdCursor(fixture.md);
        const md = Array.from(fixture.md);
        let prev = -1;
        for (const { s, mdStart } of fixture.leaves) {
            const got = cursor.align(s);
            if (mdStart === null) {
                expect(got, `叶子 ${JSON.stringify(s)} 应对不上`).toBeUndefined();
                continue;
            }
            expect(got, `叶子 ${JSON.stringify(s)}`).toBe(mdStart);
            expect(md.slice(got!, got! + Array.from(s)[0].length).join('')).toBe(Array.from(s)[0]);
            expect(got!).toBeGreaterThan(prev);
            prev = got!;
        }
    });
});
