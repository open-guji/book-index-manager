/** GUJI-544：实体页印影图 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SealFigure } from '../../src/components/detail/SealFigure';

const BASE = 'https://data.example.com/asset';
const IM = { file: 'entity/a/b/c/x/1.webp', credit: '故宮', license: '公有領域', source_url: 'https://e.org/p' };

describe('SealFigure', () => {
    it('出图：URL＝资源根＋file，alt、署名、来源链接同显', () => {
        const { container } = render(<SealFigure images={[IM]} assetBase={BASE} name="文淵閣寶" />);
        const img = container.querySelector('img.bim-d-seal-main') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe(`${BASE}/entity/a/b/c/x/1.webp`);
        expect(img.getAttribute('alt')).toBe('文淵閣寶印影');
        const cap = container.querySelector('figcaption')!;
        expect(cap.textContent).toContain('故宮');
        expect(cap.textContent).toContain('公有領域');
        expect(cap.querySelector('a')!.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    });

    it('有 width/height 用真实比例占位', () => {
        const { container } = render(<SealFigure images={[{ ...IM, width: 300, height: 200 }]} assetBase={BASE} name="x" />);
        expect((container.querySelector('img') as HTMLElement).style.getPropertyValue('--seal-ar')).toBe('300 / 200');
    });

    it('不出图：没 assetBase／没 images／缺 credit 或 license', () => {
        expect(render(<SealFigure images={[IM]} name="x" />).container.innerHTML).toBe('');
        expect(render(<SealFigure assetBase={BASE} name="x" />).container.innerHTML).toBe('');
        expect(render(<SealFigure images={[{ ...IM, credit: '' }]} assetBase={BASE} name="x" />).container.innerHTML).toBe('');
        expect(render(<SealFigure images={[{ ...IM, license: undefined }]} assetBase={BASE} name="x" />).container.innerHTML).toBe('');
    });

    it('危险 file（.. 、绝对路径、带协议）被丢弃', () => {
        for (const file of ['../x.webp', '/x.webp', 'https://evil/x.webp', 'a/../b.webp']) {
            expect(render(<SealFigure images={[{ ...IM, file }]} assetBase={BASE} name="x" />).container.innerHTML).toBe('');
        }
    });

    it('非 http(s) 的 source_url 不成链接', () => {
        const { container } = render(<SealFigure images={[{ ...IM, source_url: 'javascript:alert(1)' }]} assetBase={BASE} name="x" />);
        expect(container.querySelector('figcaption a')).toBeNull();
    });

    it('多图：首图大、缩略图切换；首图加载失败整块卸载', () => {
        const { container } = render(<SealFigure images={[IM, { ...IM, file: 'entity/a/b/c/x/2.webp' }]} assetBase={BASE + '/'} name="x" />);
        const btns = container.querySelectorAll('.bim-d-seal-thumbs button');
        expect(btns.length).toBe(2);
        fireEvent.click(btns[1]);
        expect(container.querySelector('img.bim-d-seal-main')!.getAttribute('src')).toBe(`${BASE}/entity/a/b/c/x/2.webp`);
        fireEvent.error(container.querySelector('img.bim-d-seal-main')!);
        expect(container.innerHTML).toBe('');
    });
});

import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import { screen } from '@testing-library/react';

describe('EntityPage 接入', () => {
    const seal = { id: 's1', type: 'entity', subtype: 'seal', primary_name: '文淵閣寶', title: '文淵閣寶', images: [IM] };
    const mk = (assetBase?: string) => (
        <BookDetailLayout
            id="s1"
            transport={{ getItem: async () => seal, getEntry: async () => null, getLineageGraph: async () => null } as never}
            initialDetail={seal as never}
            activeTab="basic"
            onTabChange={() => {}}
            assetBase={assetBase}
        />
    );
    it('传 assetBase 出图，不传不出', async () => {
        const a = render(mk(BASE));
        await screen.findAllByText('文淵閣寶');
        expect(a.container.querySelector('.bim-d-card .bim-d-seal img')).toBeTruthy();
        a.unmount();
        const b = render(mk());
        await screen.findAllByText('文淵閣寶');
        expect(b.container.querySelector('.bim-d-seal')).toBeNull();
    });
});
