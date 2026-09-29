import { describe, it, expect } from 'vitest';
import { getDisplayNameFromUrl } from '../../src/core/resources';

describe('getDisplayNameFromUrl：站点名按域名给繁体（overview#268）', () => {
    it('书格、百度网盘', () => {
        expect(getDisplayNameFromUrl('https://www.shuge.org/view/shiji/')).toBe('書格');
        expect(getDisplayNameFromUrl('https://pan.baidu.com/s/1abc')).toBe('百度網盤');
    });
    it('未知域名返回 undefined', () => {
        expect(getDisplayNameFromUrl('https://example.org/x')).toBeUndefined();
    });
});
