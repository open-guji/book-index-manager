import { describe, expect, it } from 'vitest';
import { mentionHref } from '../../src/components/detail/MentionsSection';

const m = { item: 'b1', key: 'default', chapter: '028', start: '3:1:2', end: '3:1:4', text: '某某', before: '', after: '' };

describe('mentionHref：专名出处深链', () => {
    it('有 u：?u=起~止（重切不漂）', () => {
        expect(mentionHref({ ...m, u: 12, ue: 14 })).toBe('/read/b1/028?u=12~14');
    });
    it('单字或止同起：只写一个 u', () => {
        expect(mentionHref({ ...m, u: 12, ue: 12 })).toBe('/read/b1/028?u=12');
        expect(mentionHref({ ...m, u: 12 })).toBe('/read/b1/028?u=12');
    });
    it('没有 u（老数据）或 u 不合法：退回 #格位', () => {
        expect(mentionHref(m)).toBe('/read/b1/028#3:1:2~3:1:4');
        expect(mentionHref({ ...m, u: 1.5 })).toBe('/read/b1/028#3:1:2~3:1:4');
        expect(mentionHref({ ...m, key: 'v2', u: 0 })).toBe('/read/b1/v2/028#3:1:2~3:1:4');
    });
});
