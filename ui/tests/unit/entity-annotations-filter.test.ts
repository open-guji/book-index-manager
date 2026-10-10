/**
 * 专名号三档筛选（filterEntitiesByMode）：每个 mode × showWorks × kind 的保留／剔除，顺序与入参不变。
 */
import { describe, expect, it } from 'vitest';
import { filterEntitiesByMode, type EntityKind, type EntitySpan, type ProperNameMode } from '../../src/core/entity-annotations';

const KINDS: EntityKind[] = ['work', 'people', 'place', 'office', 'dynasty', 'reign', 'other'];
const mk = (kind: EntityKind, i = 0): EntitySpan => ({ key: `e${kind}${i}`, kind, text: kind });
const ALL = KINDS.map((k) => mk(k));

const EXPECT: Record<ProperNameMode, EntityKind[]> = {
    off: [],
    lite: ['people', 'place', 'dynasty'],
    full: ['people', 'place', 'dynasty', 'office', 'reign', 'other'],
};

describe('filterEntitiesByMode', () => {
    const modes: ProperNameMode[] = ['off', 'lite', 'full'];
    for (const mode of modes) {
        for (const showWorks of [true, false, undefined]) {
            it(`mode=${mode} showWorks=${String(showWorks)}`, () => {
                const opts = showWorks === undefined ? undefined : { showWorks };
                const kept = filterEntitiesByMode(ALL, mode, opts).map((s) => s.kind);
                const worksKept = showWorks === false ? [] : ['work'];
                const expected = KINDS.filter((k) => k !== 'work' && EXPECT[mode].includes(k));
                // 保持原顺序：按 KINDS 的顺序对照
                expect(kept).toEqual(KINDS.filter((k) => worksKept.includes(k) || expected.includes(k)));
            });
        }
    }

    it('书名与档位无关：off 下 showWorks 缺省或 true 仍保留', () => {
        expect(filterEntitiesByMode([mk('work')], 'off').map((s) => s.kind)).toEqual(['work']);
        expect(filterEntitiesByMode([mk('work')], 'off', { showWorks: true }).map((s) => s.kind)).toEqual(['work']);
        expect(filterEntitiesByMode([mk('work')], 'full', { showWorks: false })).toEqual([]);
    });

    it('顺序保持，且不改入参、不改 span 对象', () => {
        const input = [mk('people', 1), mk('work', 2), mk('place', 3), mk('other', 4)];
        const snapshot = JSON.parse(JSON.stringify(input));
        const out = filterEntitiesByMode(input, 'full');
        expect(out.map((s) => s.key)).toEqual(['epeople1', 'ework2', 'eplace3', 'eother4']);
        expect(input).toEqual(snapshot);
        expect(out).not.toBe(input);
        expect(out[0]).toBe(input[0]);
    });
});
