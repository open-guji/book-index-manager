import { describe, it, expect, afterEach } from 'vitest';
import { loadImage, setImageSourceResolver } from '../../src/components/Reader/GujiWarpCanvas';

describe('setImageSourceResolver', () => {
    afterEach(() => setImageSourceResolver(null));

    it('宿主返回 Promise 就用它给的图，并按地址缓存', async () => {
        const fake = { naturalWidth: 10, naturalHeight: 20 } as unknown as HTMLImageElement;
        let calls = 0;
        setImageSourceResolver((url) => (url.startsWith('host:') ? (calls++, Promise.resolve(fake)) : null));
        expect(await loadImage('host:a')).toBe(fake);
        expect(await loadImage('host:a')).toBe(fake);
        expect(calls).toBe(1);
    });

    it('宿主给 null 当加载失败，且不缓存失败', async () => {
        let calls = 0;
        setImageSourceResolver(() => (calls++, Promise.resolve(null)));
        expect(await loadImage('host:b')).toBeNull();
        expect(await loadImage('host:b')).toBeNull();
        expect(calls).toBe(2);
    });
});
