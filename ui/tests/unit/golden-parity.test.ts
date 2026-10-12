/**
 * 黄金样例对拍（overview#568 B4 步骤 1）。
 *
 * 与 tests/test_golden_parity.py 读同一份 ../tests/golden/entries.json：
 * buildIndexEntry(record) 必须等于 expect_index_entry。Python 端 entry_extractor.build_index_entry
 * 是口径基准（与 book-index build_derived.index_entry 逐字对齐）。
 *
 * KNOWN_RED_UNTIL 里是「TS 端已知与基准不同、尚未对齐」的例子，用 it.fails 记录：
 * 对齐后 it.fails 会反过来失败，逼着把名字从这里删掉。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndexEntry, buildEntityIndexEntry } from '../../src/core/storage';
import type { IndexType } from '../../src/types';

interface GoldenCase {
    name: string;
    type: 'Book' | 'Work' | 'Collection' | 'Entity';
    record: Record<string, unknown>;
    expect_index_entry: Record<string, unknown>;
    negative: boolean;
}

const CASES: GoldenCase[] = JSON.parse(
    readFileSync(join(__dirname, '../../../tests/golden/entries.json'), 'utf-8'),
);

const KNOWN_RED_UNTIL: Record<string, string> = {};

const TYPE_OF: Record<GoldenCase['type'], IndexType> = {
    Book: 'book', Work: 'work', Collection: 'collection', Entity: 'entity',
};

describe('golden parity：buildIndexEntry 对拍 tests/golden/entries.json', () => {
    it('样例文件形状', () => {
        expect(CASES.length).toBeGreaterThan(0);
        expect(CASES.some(c => c.negative)).toBe(true);
        expect(CASES.some(c => !c.negative)).toBe(true);
        expect(new Set(CASES.map(c => c.name)).size).toBe(CASES.length);
        for (const n of Object.keys(KNOWN_RED_UNTIL)) expect(CASES.map(c => c.name)).toContain(n);
    });

    for (const c of CASES) {
        const run = () => {
            const path = c.expect_index_entry.path as string;
            const got = c.type === 'Entity'
                ? buildEntityIndexEntry(c.record, path)
                : buildIndexEntry(c.record, TYPE_OF[c.type], path);
            expect(got).toEqual(c.expect_index_entry);
        };
        if (c.name in KNOWN_RED_UNTIL) it.fails(`${c.name}（待对齐：${KNOWN_RED_UNTIL[c.name]}）`, run);
        else it(c.name, run);
    }
});
