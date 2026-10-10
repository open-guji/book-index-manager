/**
 * 枢纽名称补全（withHubTitles／fillHubTitles）：只补 title、不改字段形状。
 * 夹具取自 book-index build/contract-sample/（只读拷贝）。
 */
import { describe, it, expect } from 'vitest';
import { fillHubTitles, needsHubs, withHubTitles } from '../../src/storage/hub-titles';
import type { HubMap, IndexStorage } from '../../src/storage/types';
import hubsJson from './fixtures/contract-sample/_hubs.json';
import hongloumeng from './fixtures/contract-sample/entry/d59df01avcw0.json';
import kaozheng from './fixtures/contract-sample/entry/d59dgrvmvrwg.json';
import zongmu from './fixtures/contract-sample/entry/d59dh3vo9af4.json';
import sengbao from './fixtures/contract-sample/entry/988fyztvri.json';

const hubs = hubsJson as HubMap;
const obj = (v: unknown) => v as Record<string, any>;

describe('fillHubTitles', () => {
    it('Work _related 里的枢纽卡 {id,h:1} 补上名称，其余字段不动', () => {
        const out = obj(fillHubTitles(obj(kaozheng), hubs));
        expect(out._related).toHaveLength(2);
        const hub = out._related.find((r: any) => r.id === 'd59dh3vo9af4');
        expect(hub.title).toBe('欽定四庫全書總目');
        expect(hub).toMatchObject({ h: 1, relation: obj(kaozheng)._related.find((r: any) => r.id === 'd59dh3vo9af4').relation });
        // 非枢纽卡本来就有 title，原样
        const part = out._related.find((r: any) => r.relation === 'part_of');
        expect(part).toMatchObject({ id: 'd59dgrrusb28', title: '欽定四庫全書' });
    });

    it('没有 hubs 表：枢纽卡保持无名，不抛', () => {
        const out = obj(fillHubTitles(obj(kaozheng), null));
        expect(out._related.find((r: any) => r.id === 'd59dh3vo9af4').title).toBeUndefined();
    });

    it('_related 含 in/out 两个方向，反向词与 direction 保留（紅樓夢 has_adaptation）', () => {
        const out = obj(fillHubTitles(obj(hongloumeng), hubs));
        expect(out._related).toHaveLength(obj(hongloumeng)._related.length);
        expect(out._related.some((r: any) => r.relation === 'has_adaptation')).toBe(true);
        expect(out._related.every((r: any) => r.direction === 'in' || r.direction === 'out')).toBe(true);
        expect(out._related.every((r: any) => r.title)).toBe(true);
    });

    it('_collections 里的枢纽丛编 {id,h:1,vol,sub} 补名，册次与附属子目保留', () => {
        const out = obj(fillHubTitles(obj(sengbao), hubs));
        expect(out._collections[0]).toEqual({ id: '8rlb6yi1ecqo', h: 1, vol: 1052, sub: ['補傳', '臨濟宗旨'], title: '欽定四庫全書·文淵閣本' });
    });

    it('_catalogs 的枢纽志书 {bid,h:1} 按 bid 补名', () => {
        const out = obj(fillHubTitles({ _catalogs: [{ bid: 'd59dh3vo9af4', h: 1, section: '史部' }] }, hubs));
        expect(out._catalogs[0]).toEqual({ bid: 'd59dh3vo9af4', h: 1, section: '史部', title: '欽定四庫全書總目' });
    });

    it('不改入参', () => {
        const src = JSON.parse(JSON.stringify(kaozheng));
        const frozen = JSON.stringify(src);
        fillHubTitles(src, hubs);
        expect(JSON.stringify(src)).toBe(frozen);
    });
});

describe('needsHubs', () => {
    it('带 {id,h:1} 引用才需要取 _hubs', () => {
        expect(needsHubs(obj(kaozheng))).toBe(true);
        expect(needsHubs(obj(zongmu))).toBe(true);
        expect(needsHubs({ type: 'work', _books: [{ id: 'b' }], _related: [{ id: 'w', title: '甲' }] })).toBe(false);
        expect(needsHubs(null)).toBe(false);
    });
});

describe('withHubTitles（transport 包装）', () => {
    const base = (items: Record<string, any>, getHubs?: () => Promise<HubMap | null>) => {
        let hubCalls = 0;
        const t = {
            getItem: async (id: string) => items[id] ?? null,
            marker: 'kept',
            ...(getHubs ? { getHubs: async () => { hubCalls++; return getHubs(); } } : {}),
        } as unknown as IndexStorage;
        return { t, hubCalls: () => hubCalls };
    };

    it('getItem 返回补名后的条目，其余成员透传；不改 transport 里的原对象', async () => {
        const { t } = base({ x: kaozheng }, async () => hubs);
        const w = withHubTitles(t);
        const item = obj(await w.getItem('x'));
        expect(item._books).toHaveLength(3);
        expect(item._related.find((r: any) => r.id === 'd59dh3vo9af4').title).toBe('欽定四庫全書總目');
        expect(obj(kaozheng)._related.find((r: any) => r.id === 'd59dh3vo9af4').title).toBeUndefined();
        expect((w as any).marker).toBe('kept');
        expect(await w.getItem('missing')).toBeNull();
    });

    it('有枢纽引用才取 _hubs，且只取一次', async () => {
        const plain = { type: 'work', id: 'p', _books: [{ id: 'b' }], _related: [{ id: 'w', title: '甲', relation: 'related' }] };
        const { t, hubCalls } = base({ a: kaozheng, b: zongmu, p: plain }, async () => hubs);
        const w = withHubTitles(t);
        await w.getItem('p'); // 没有枢纽引用：不取
        expect(hubCalls()).toBe(0);
        await w.getItem('a');
        await w.getItem('b');
        expect(hubCalls()).toBe(1);
    });

    it('transport 没有 getHubs，或取 _hubs 失败：不抛，枢纽无名', async () => {
        const { t } = base({ a: kaozheng });
        expect(obj(await withHubTitles(t).getItem('a'))._related).toHaveLength(2);
        const { t: t2 } = base({ a: kaozheng }, async () => { throw new Error('404'); });
        const item = obj(await withHubTitles(t2).getItem('a'));
        expect(item._related).toHaveLength(2);
        expect(item._related.find((r: any) => r.id === 'd59dh3vo9af4').title).toBeUndefined();
    });
});
