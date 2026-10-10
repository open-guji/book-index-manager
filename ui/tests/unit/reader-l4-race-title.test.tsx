/**
 * overview#513（#501 第 8、13 条）：
 *   - 对读章没有 .txt：getChapter 立即 null、对读数据（char／cord）还在路上时显示加载态，不闪「无法加载章节内容」；
 *   - 顶部标题行 书名·版本；原件版本的来源行界面层映射为「本站独立整理 · CC0 1.0」。
 */
import React from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { TextReader, isOriginalVersion } from '../../src/components/TextReader';
import { READER_CSS } from '../../src/components/Reader/reader-css';
import { fakeTextTransport } from './helpers/text-transport';

afterEach(cleanup);
const ID = 'd59f2nfhf8cg';
const FAIL = /無法加載章節內容|无法加载章节内容/;
const warpOf = () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: [], punctuations: [] }) as never;

describe('对读章加载竞态', () => {
    it('getChapter 立即 null、对读数据延后：期间显示加载态且不出现失败文案，数据到后正常渲染', async () => {
        let release!: () => void;
        const warp = new Promise<never>(r => { release = () => r(warpOf()); });
        const t = fakeTextTransport(ID, { kind: 'collated', md: null });
        const { container } = render(<TextReader id={ID} transport={t} title="书" resolveWarpData={() => warp} />);
        await waitFor(() => expect(container.querySelector('.bim-rd-body')).toBeTruthy());
        await new Promise(r => setTimeout(r, 30));
        expect(container.textContent).not.toMatch(FAIL);
        expect(container.textContent).toMatch(/加[载載]中/);
        release();
        await waitFor(() => expect(container.querySelector('.bim-rd-badge-warp, [data-testid="facsimile-panel"], article.bim-rd-prose')).toBeTruthy());
        expect(container.textContent).not.toMatch(FAIL);
    });

    it('真失败（getChapter 为空且对读数据也为空）仍显示失败态', async () => {
        const t = fakeTextTransport(ID, { md: null });
        render(<TextReader id={ID} transport={t} title="书" resolveWarpData={async () => null} />);
        expect(await screen.findByText(FAIL)).toBeTruthy();
    });
});

describe('标题行与来源行', () => {
    const orig = { edition_label: '武英殿刻本', source: 'original', is_original: true, source_name: '开源古籍CV整理', license: 'CC0 1.0' };

    it('原件版本：标题行为 书名·版本，来源映射为「本站独立整理 · CC0 1.0」，不出现 CV 整理字样', async () => {
        const t = fakeTextTransport(ID, { md: '正文', version: orig });
        const { container } = render(<TextReader id={ID} transport={t} title="钦定四库全书总目" />);
        await screen.findByText('正文');
        const ttl = container.querySelector('.bim-rd-ttl')!;
        expect(ttl.querySelector('b')!.textContent).toBe('钦定四库全书总目·武英殿刻本');
        expect(ttl.querySelector('.bim-rd-ttl-src')!.textContent).toMatch(/本站(独立整理|獨立整理) · CC0 1\.0/);
        expect(container.textContent).not.toContain('开源古籍CV整理');
        const meta = container.querySelector('.bim-rd-meta-src')!;
        expect(meta.textContent).toMatch(/本站(独立整理|獨立整理)CC0 1\.0/);
    });

    it('非原件版本：来源名照旧显示（不映射）', async () => {
        const t = fakeTextTransport(ID, { md: '正文', version: { source: 'wikisource', source_name: '維基文庫', license: 'CC BY-SA 4.0' } });
        const { container } = render(<TextReader id={ID} transport={t} title="某书" />);
        await screen.findByText('正文');
        expect(container.querySelector('.bim-rd-ttl .bim-rd-ttl-src')!.textContent).toBe('維基文庫');
        expect(container.querySelector('.bim-rd-ttl b')!.textContent).toBe('某书');
        expect(container.querySelector('.bim-rd-meta-src')!.textContent).toContain('維基文庫');
        expect(container.textContent).not.toMatch(/本站(独立整理|獨立整理)/);
    });

    it('isOriginalVersion：is_original 或 source==="original"', () => {
        expect(isOriginalVersion({ is_original: true })).toBe(true);
        expect(isOriginalVersion({ source: 'original' })).toBe(true);
        expect(isOriginalVersion({ source: 'wikisource' })).toBe(false);
    });

    it('窄屏：顶栏来源 span 带 bim-rd-ttl-src 收起，来源折到标题下的 bim-rd-meta-src（可折行）', () => {
        expect(READER_CSS).toMatch(/\.bim-rd-ttl span[^{]*\{ display: none/);
        expect(READER_CSS).toContain('.bim-rd-meta { margin: 6px 0 0');
        expect(READER_CSS).toMatch(/overflow-wrap: anywhere/);
    });
});
