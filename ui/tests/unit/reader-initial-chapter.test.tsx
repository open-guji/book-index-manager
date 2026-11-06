/** initialChapter：服务端直出首章文字，阅读器自己的正文出来后由阅读器卸载（不再靠宿主盯 DOM） */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const lead = {
    paragraphs: ['首章第一段', '首章第二段'],
    truncated: true,
    selfHref: '/read/x/001',
    next: { href: '/read/x/002', label: '下一章：卷二' },
    itemHref: '/item/x',
    itemLabel: '書目頁',
};
const transport = (md = '真正的正文') => ({
    getItem: async () => ({ title: '書' }),
    getTextManifest: async () => ({ id: 'x', versions: [{ key: 'default', kind: 'collated', label: '整理本' }] }),
    getTextIndex: async () => ({ chapters: [{ n: 1, file: '001', title: '卷一' }] }),
    getChapter: async () => ({ md, json: null }),
}) as unknown as IndexStorage;

describe('initialChapter', () => {
    it('服务端渲染：阅读器还在骨架时，首章文字与上下章链接就在 HTML 里', () => {
        const html = renderToString(<LocaleProvider><TextReader id="x" transport={transport()} initialChapter={lead} /></LocaleProvider>);
        expect(html).toContain('首章第一段');
        expect(html).toContain('rel="next"');
        expect(html).toContain('href="/read/x/001"');
        expect(html).toContain('data-reader-lead');
    });
    it('阅读器正文出来后自己卸载首章文字', async () => {
        const r = render(<LocaleProvider><TextReader id="x" transport={transport()} initialChapter={lead} /></LocaleProvider>);
        expect(r.container.textContent).toContain('首章第一段');
        await waitFor(() => expect(r.container.textContent).toContain('真正的正文'));
        await waitFor(() => expect(r.container.querySelector('[data-reader-lead]')).toBeNull());
    });
    it('不传 initialChapter：不渲染这一段', () => {
        const html = renderToString(<LocaleProvider><TextReader id="x" transport={transport()} /></LocaleProvider>);
        expect(html).not.toContain('data-reader-lead');
    });
});
