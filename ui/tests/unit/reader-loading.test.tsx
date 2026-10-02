/**
 * 阅读页首屏与来源行（overview#359 P2-8、P2-5）：
 *   - 文本清单／目录未到：先出书名与正文骨架（服务端渲染出的首屏也是这一态），不是一行小字；
 *   - 目录到了、正文还在路上：只出「加载中」，不先闪「无法加载章节内容」；
 *   - 整理本来源说明里的「《书名》(网址)」渲染成链接，网址不外露。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { TextReader } from '../../src/components/TextReader';
import { fakeTextTransport } from './helpers/text-transport';
import type { IndexStorage } from '../../src/storage/types';

const ID = 'd59f2nfhf8cg';

describe('首屏骨架', () => {
    it('服务端渲染（清单未到）：有书名、占位条与「加載中」状态', () => {
        const html = renderToString(<TextReader id={ID} transport={fakeTextTransport(ID, { md: '正文' })} title="武職選簿" />);
        expect(html).toContain('武職選簿');
        expect(html).toContain('aria-busy="true"');
        expect(html).toMatch(/role="status"[^>]*>加載中/);
    });

    it('目录到了、正文未到：不闪「无法加载章节内容」，正文到了照常显示', async () => {
        let release!: () => void;
        const base = fakeTextTransport(ID, { md: '兵部為清查功次' });
        const t = {
            ...base,
            getChapter: (...a: Parameters<NonNullable<IndexStorage['getChapter']>>) =>
                new Promise((r) => { release = () => r(base.getChapter!(...a)); }),
        } as unknown as IndexStorage;
        const seen: string[] = [];
        const { container } = render(<TextReader id={ID} transport={t} title="武職選簿" />);
        const obs = new MutationObserver(() => seen.push(container.textContent ?? ''));
        obs.observe(container, { subtree: true, childList: true, characterData: true });
        await waitFor(() => expect(release).toBeTypeOf('function'));
        await new Promise((r) => setTimeout(r, 30));
        release();
        expect(await screen.findByText(/兵部為清查功次/)).toBeTruthy();
        obs.disconnect();
        expect(seen.some((s) => /無法加載章節內容|无法加载章节内容/.test(s))).toBe(false);
    });
});

describe('整理本来源说明（底本）', () => {
    it('「《书名》(网址)」渲染成链接；长网址不出现在文字里', async () => {
        const note = '知乎@武泰斗天《明朝武职选簿[册数版]》(https://zhuanlan.zhihu.com/p/1987619270801236141)；整理本由 知乎@武泰斗天 持续更新';
        const t = fakeTextTransport(ID, {
            kind: 'collated',
            json: { title: '49冊[親軍衛]', sections: [{ title: '府軍前衛選簿', type: '书', content: '兵部為清查功次' }] },
            index: { type: 'catalog', text_quality: { grade: 'rough', source_note: note } },
        });
        render(<TextReader id={ID} transport={t} title="武職選簿" />);
        const link = await screen.findByRole('link', { name: /明朝武[職职][選选]簿/ });
        expect(link.getAttribute('href')).toBe('https://zhuanlan.zhihu.com/p/1987619270801236141');
        expect(link.closest('p, div')?.textContent).not.toContain('https://');
    });
});
