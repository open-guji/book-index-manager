/**
 * schema-v2 派生字段兼容（overview#458）：新字段优先、缺了回退旧字段；旧格式数据行为不变。
 * 夹具取自 book-index schema-v2 的 build/contract-sample/（只读拷贝）。
 */
import { describe, it, expect } from 'vitest';
import { adaptEntry, needsHubs, type HubMap } from '../../src/core/derived-compat';
import { withDerivedCompat } from '../../src/storage/derived-compat-transport';
import type { IndexStorage } from '../../src/storage/types';
import { buildCollectionTable } from '../../src/core/detail-model';
import hubsJson from './fixtures/contract-sample/_hubs.json';
import hongloumeng from './fixtures/contract-sample/entry/d59df01avcw0.json';
import kaozheng from './fixtures/contract-sample/entry/d59dgrvmvrwg.json';
import zongmu from './fixtures/contract-sample/entry/d59dh3vo9af4.json';
import wuyingdian from './fixtures/contract-sample/entry/8rlcsybg2hhd.json';
import juzhen from './fixtures/contract-sample/entry/8rlcsybg2hhf.json';
import ouyangxiu from './fixtures/contract-sample/entry/hixhd2h9bdye.json';
import sengbao from './fixtures/contract-sample/entry/988fyztvri.json';
import shiji from './fixtures/shiji-work.json';

const hubs = hubsJson as HubMap;
const obj = (v: unknown) => v as Record<string, any>;

describe('adaptEntry · Work', () => {
    it('_books → books（Book id 数组），按 _books 顺序', () => {
        const out = obj(adaptEntry(obj(hongloumeng)));
        expect(out.books).toEqual(obj(hongloumeng)._books.map((b: any) => b.id));
        expect(out.books).toHaveLength(25);
        expect(out._edition_count).toBe(25);
    });

    it('_classifications → classification（优先 zongmu）；无分类的 Work 不出 classification', () => {
        const out = obj(adaptEntry(obj(zongmu)));
        expect(out.classification).toMatchObject({ l1: '史部', l2: '目錄類', source: '清史稿藝文志/目錄類' });
        const pick = obj(adaptEntry({
            type: 'work',
            _classifications: [
                { scheme: 'other', l1: '甲', l2: '', l3: '', l4: '' },
                { scheme: 'zongmu', l1: '子部', l2: '醫家類', l3: '', l4: '' },
            ],
        }));
        expect(pick.classification.l1).toBe('子部');
        expect(obj(adaptEntry({ type: 'work', _books: [] })).classification).toBeUndefined();
    });

    it('_related → related_works：取本条视角的词，枢纽名称从 _hubs 取', () => {
        const noHubs = obj(adaptEntry(obj(kaozheng)));
        expect(noHubs.related_works).toHaveLength(2);
        const part = noHubs.related_works.find((r: any) => r.relation === 'part_of');
        expect(part).toMatchObject({ id: 'd59dgrrusb28', title: '欽定四庫全書' });
        const hub = noHubs.related_works.find((r: any) => r.id === 'd59dh3vo9af4');
        expect(hub.title).toBe(''); // 没传 hubs：枢纽无名
        const withHubs = obj(adaptEntry(obj(kaozheng), hubs));
        expect(withHubs.related_works.find((r: any) => r.id === 'd59dh3vo9af4').title).toBe('欽定四庫全書總目');
    });

    it('_related 含 in/out 两个方向，反向词保留（紅樓夢 has_adaptation）', () => {
        const out = obj(adaptEntry(obj(hongloumeng), hubs));
        expect(out.related_works).toHaveLength(obj(hongloumeng)._related.length);
        expect(out.related_works.some((r: any) => r.relation === 'has_adaptation')).toBe(true);
        expect(out.related_works.every((r: any) => r.title)).toBe(true);
    });

    it('_catalogs → indexed_by：枢纽志书 {bid,h:1} 的名称来自 _hubs', () => {
        const out = obj(adaptEntry(obj(kaozheng), hubs));
        expect(out.indexed_by).toHaveLength(2);
        expect(out.indexed_by[0]).toMatchObject({ source_bid: 'd59f2mp0flz4' });
        expect(out.indexed_by[0].source).toBeTruthy();
    });

    it('_collections → contained_in（vol → volume_index），源里已有 contained_in 时不动', () => {
        const out = obj(adaptEntry({ type: 'work', _collections: [{ id: 'c1', vol: 3, sub: ['x'] }, { id: 'c2', h: 1 }] }));
        expect(out.contained_in).toEqual([{ id: 'c1', volume_index: 3, sub_items: ['x'] }, { id: 'c2' }]);
        const keep = obj(adaptEntry({ type: 'work', contained_in: [{ id: 'old' }], _collections: [{ id: 'new' }] }));
        expect(keep.contained_in).toEqual([{ id: 'old' }]);
    });
});

describe('adaptEntry · Collection', () => {
    it('_members（Work 成员）→ contained_works，_member_count 保持总数', () => {
        const out = obj(adaptEntry({
            type: 'collection', _member_count: 3, _member_type: 'Work',
            _members: [
                { id: 'w1', t: 'work', title: '甲', vol: 1 },
                { id: 'w2', t: 'work', title: '乙', vol: [2, 3] },
                { id: 'w3', t: 'work', title: '丙' },
            ],
        }));
        expect(out.contained_works).toEqual([
            { id: 'w1', title: '甲', volume_index: 1 },
            { id: 'w2', title: '乙', volume_index: 2 },
            { id: 'w3', title: '丙' },
        ]);
        expect(out.books).toBeUndefined();
        expect(out._members_truncated).toBeUndefined();
    });

    it('混合丛编（武英殿聚珍版，288 项只带前 20）：Book 成员 → books，Work 成员 → contained_works，标截断', () => {
        const src = obj(juzhen);
        expect(src._members).toHaveLength(20);
        expect(src._member_count).toBe(288);
        const out = obj(adaptEntry(src));
        const nBook = src._members.filter((m: any) => m.t === 'book').length;
        const nWork = src._members.filter((m: any) => m.t === 'work').length;
        expect(out.books ?? []).toHaveLength(nBook);
        expect(out.contained_works ?? []).toHaveLength(nWork);
        expect(nBook + nWork).toBe(20);
        expect(out._members_truncated).toBe(true);
        expect(out._member_count).toBe(288);
    });

    it('子目表：新格式走 contained_works 取标题与册次', () => {
        const out = obj(adaptEntry({
            type: 'collection', _member_count: 2,
            _members: [{ id: 'w1', t: 'work', title: '甲', vol: 5 }, { id: 'w2', t: 'work', title: '乙' }],
        }));
        const table = buildCollectionTable(out as never, null);
        expect(table.rows.map(r => r.title)).toEqual(['甲', '乙']);
    });

    it('Book 成员的丛编（武英殿刻书，26 项带前 20）', () => {
        const out = obj(adaptEntry(obj(wuyingdian)));
        expect(out.books).toHaveLength(20);
        expect(out._members_truncated).toBe(true);
        expect(obj(wuyingdian)._children[1]).toEqual({ h: 1, id: '8rlcsybg2hhf' });
    });
});

describe('adaptEntry · Entity / Book', () => {
    it('_works → works（work_id、role、title 保留）', () => {
        const src = obj(ouyangxiu);
        const out = obj(adaptEntry(src));
        expect(out.works).toHaveLength(src._works.length);
        expect(out.works[0]).toMatchObject({ work_id: src._works[0].work_id, role: src._works[0].role, title: src._works[0].title });
    });

    it('Book 的 _collections（枢纽丛编 {id,h:1,vol,sub}）→ contained_in', () => {
        const out = obj(adaptEntry(obj(sengbao)));
        expect(out.contained_in[0]).toEqual({ id: '8rlb6yi1ecqo', volume_index: 1052, sub_items: ['補傳', '臨濟宗旨'] });
    });
});

describe('旧格式：新字段缺失时原样不动；旧字段已有时不被覆盖', () => {
    it('旧 Work（史記）：输出与输入逐项相等', () => {
        const out = adaptEntry(obj(shiji));
        expect(out).toEqual(shiji);
    });

    it('旧 Collection / Entity：同样不动', () => {
        const coll = { type: 'collection', id: 'c', title: 'x', books: ['b1', 'b2'], contained_works: [{ id: 'w', title: 't' }], _member_count: 3 };
        expect(adaptEntry(coll)).toEqual(coll);
        const ent = { type: 'entity', id: 'e', works: [{ work_id: 'w', role: '撰' }] };
        expect(adaptEntry(ent)).toEqual(ent);
    });

    it('新旧并存时旧字段优先（books／works／classification）', () => {
        const w = adaptEntry({ type: 'work', books: ['old'], _books: [{ id: 'new' }], classification: { l1: '旧' }, _classifications: [{ scheme: 'zongmu', l1: '新' }] }) as any;
        expect(w.books).toEqual(['old']);
        expect(w.classification.l1).toBe('旧');
        const e = adaptEntry({ type: 'entity', works: [{ work_id: 'old' }], _works: [{ work_id: 'new' }] }) as any;
        expect(e.works).toEqual([{ work_id: 'old' }]);
    });

    it('不改入参', () => {
        const src = JSON.parse(JSON.stringify(hongloumeng));
        const frozen = JSON.stringify(src);
        adaptEntry(src, hubs);
        expect(JSON.stringify(src)).toBe(frozen);
    });
});

describe('needsHubs', () => {
    it('带 {id,h:1} 引用才需要取 _hubs', () => {
        expect(needsHubs(obj(kaozheng))).toBe(true);
        expect(needsHubs(obj(shiji))).toBe(false);
        expect(needsHubs(null)).toBe(false);
    });
});

describe('withDerivedCompat（transport 包装）', () => {
    const base = (items: Record<string, any>, getHubs?: () => Promise<HubMap | null>) => {
        let hubCalls = 0;
        const t = {
            getItem: async (id: string) => items[id] ?? null,
            marker: 'kept',
            ...(getHubs ? { getHubs: async () => { hubCalls++; return getHubs(); } } : {}),
        } as unknown as IndexStorage;
        return { t, hubCalls: () => hubCalls };
    };

    it('getItem 返回归一后的条目，其余成员透传', async () => {
        const { t } = base({ x: kaozheng });
        const w = withDerivedCompat(t);
        const item = obj(await w.getItem('x'));
        expect(item.books).toHaveLength(3);
        expect((w as any).marker).toBe('kept');
        expect(await w.getItem('missing')).toBeNull();
    });

    it('有枢纽引用才取 _hubs，且只取一次；名称写进 related_works', async () => {
        const { t, hubCalls } = base({ a: kaozheng, b: zongmu, s: shiji }, async () => hubs);
        const w = withDerivedCompat(t);
        const a = obj(await w.getItem('a'));
        await w.getItem('a');
        await w.getItem('s'); // 旧格式：不取
        expect(a.related_works.find((r: any) => r.id === 'd59dh3vo9af4').title).toBe('欽定四庫全書總目');
        expect(hubCalls()).toBe(1);
    });

    it('transport 没有 getHubs，或取 _hubs 失败：不抛，枢纽无名', async () => {
        const { t } = base({ a: kaozheng });
        expect(obj(await withDerivedCompat(t).getItem('a')).related_works).toHaveLength(2);
        const { t: t2 } = base({ a: kaozheng }, async () => { throw new Error('404'); });
        expect(obj(await withDerivedCompat(t2).getItem('a')).related_works).toHaveLength(2);
    });
});
