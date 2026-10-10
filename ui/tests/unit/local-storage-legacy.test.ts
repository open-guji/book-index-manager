/**
 * LocalStorage 不再写旧关系字段（schema/legacy.md §五）：
 * 作品归属只写 Book.work_id，丛编成员只写成员侧 contained_in；
 * parent_work {id,title}、books 两个分支已删。
 */
import { describe, it, expect } from 'vitest';
import { LocalStorage } from '../../src/storage/local-storage';
import type { FileSystem } from '../../src/core/filesystem';

const noFs = {} as FileSystem;

function makeStorage(items: Record<string, Record<string, unknown>>) {
    const ls = new LocalStorage({ fs: noFs, workspaceRoot: '/x' });
    const saved: Array<{ type: string; id: string; data: Record<string, unknown> }> = [];
    (ls as unknown as { storage: unknown }).storage = {
        getItem: async (id: string) => (items[id] ? structuredClone(items[id]) : null),
        saveItem: async (type: string, id: string, data: Record<string, unknown>) => { saved.push({ type, id, data }); },
    };
    return { ls, saved };
}

describe('LocalStorage 关系读写只用新字段', () => {
    it('linkEntity：work_id／contained_in 照写（contained_in 为对象形）', async () => {
        const { ls, saved } = makeStorage({ b1: { id: 'b1', type: 'book', title: '某本' } });
        await ls.linkEntity('b1', 'work_id', 'w1');
        await ls.linkEntity('b1', 'contained_in', 'c1');
        expect(saved[0].data.work_id).toBe('w1');
        expect(saved[1].data.contained_in).toEqual([{ id: 'c1' }]);
    });

    it.each(['parentWork', 'parent_work', 'containedBooks', 'books'])(
        'linkEntity／unlinkEntity：旧字段 %s 不再支持，也不写 parent_work／books',
        async (field) => {
            const { ls, saved } = makeStorage({
                w1: { id: 'w1', type: 'work', title: '某作品' },
                w2: { id: 'w2', type: 'work', title: '另一作品' },
            });
            await expect(ls.linkEntity('w1', field, 'w2')).rejects.toThrow(/Unknown relation field/);
            await expect(ls.unlinkEntity('w1', field)).rejects.toThrow(/Unknown relation field/);
            expect(saved).toHaveLength(0);
        },
    );

    it('getRelations：旧 parent_work／books 数据不再被读成关系', async () => {
        const { ls } = makeStorage({
            w1: { id: 'w1', type: 'work', title: '某作品', parent_work: { id: 'w0', title: '上级' }, books: ['b1'] },
            c1: { id: 'c1', type: 'collection', title: '某丛编', books: ['b1'] },
        });
        expect(await ls.getRelations('w1')).toEqual({});
        expect(await ls.getRelations('c1')).toEqual({});
    });
});
