/**
 * 专名线默认值（overview#444）：用户没选过时，本章有专名层数据就默认开、没有就关；用户点过就照用户的。
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { DEFAULT_READER_PREFS, loadReaderPrefs } from '../../src/components/Reader/prefs';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: () => <div data-testid="canvas-stub" />,
}));
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const WORK = '96mid1ogzk';
const char = { pages: [{ page: 3, columns: [{ col: 1, cells: [
    { a: '3:1:1', c: '讀' }, { a: '3:1:2', c: '易' }, { a: '3:1:3', c: '私' }, { a: '3:1:4', c: '言' },
] }] }] };
const cord = { pages: [{ page: 3, canvas: { id: `https://x/iiif/${WORK}/canvas/03/0003`, seq: '0003', width: 1000, height: 1400 },
    cells: ['3:1:1', '3:1:2', '3:1:3', '3:1:4'].map((a, i) => ({ a, box: [1, 1 + i * 20, 10, 10] })) }] };
const entity = { entities: [
    { id: 'e1', type: 'work', text: '讀易', anchor: { start: '3:1:1', end: '3:1:2' }, span: { start_offset: 0, end_offset: 2 }, target: { status: 'new_candidate' } },
    { id: 'e2', type: 'people', text: '私言', anchor: { start: '3:1:3', end: '3:1:4' }, span: { start_offset: 2, end_offset: 4 }, target: { status: 'new_candidate' } },
] };

const transport = {
    getItem: async () => ({ title: '總目' }),
    getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
    getTextIndex: async () => ({ chapters: [{ n: 3, file: '003', title: '卷四', char_file: '003.char.json', cord_file: '003.cord.json' }] }),
    getChapter: async () => ({ md: 'x', json: null }),
} as unknown as IndexStorage;

async function mount(withEntities: boolean) {
    const view = render(
        <LocaleProvider>
            <TextReader
                id={WORK}
                transport={transport}
                versionKey="original"
                chapter="003"
                resolveWarpData={async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord(char, cord), punctuations: [] }) as never}
                resolveImages={async () => [] as never}
                resolveEntities={withEntities ? (async () => entity) : undefined}
            />
        </LocaleProvider>,
    );
    await waitFor(() => expect(view.container.querySelector('[data-page-section]')).not.toBeNull(), { timeout: 5000 });
    return view;
}

// 专名线开关在右侧「阅读设置」侧栏里（overview#463），收起时不渲染：先展开再取
const grp = () => {
    if (!screen.queryByRole('group', { name: /專名線|专名线/ })) {
        fireEvent.click(screen.getAllByRole('button', { name: /閱讀設置|阅读设置/ })[0]);
    }
    return within(screen.getByRole('group', { name: /專名線|专名线/ }));
};
const full = () => grp().getByRole('button', { name: '完整' });
const off = () => grp().getByRole('button', { name: /不顯示|不显示/ });

describe('专名线默认值', () => {
    beforeEach(() => { localStorage.clear(); });

    it('prefs：默认 null（没选过）；存储里的 true／false 都照用', () => {
        expect(DEFAULT_READER_PREFS.properNameMode).toBeNull();
        expect(loadReaderPrefs().properNameMode).toBeNull();
        localStorage.setItem('bim-reader-prefs', JSON.stringify({ properNameMode: 'off' }));
        expect(loadReaderPrefs().properNameMode).toBe('off');
        localStorage.setItem('bim-reader-prefs', JSON.stringify({ properNameMode: 'lite' }));
        expect(loadReaderPrefs().properNameMode).toBe('lite');
        localStorage.setItem('bim-reader-prefs', JSON.stringify({ properNameMode: 'full' }));
        expect(loadReaderPrefs().properNameMode).toBe('full');
    });

    it('本章有专名层数据：没选过时一进来就画专名线、开关是按下状态', async () => {
        const { container } = await mount(true);
        await waitFor(() => expect(container.querySelectorAll('.bim-et-work').length).toBeGreaterThan(0));
        expect(full().getAttribute('aria-pressed')).toBe('true');
    });

    it('用户关掉后记住：存 false，再进来仍是关', async () => {
        const first = await mount(true);
        await waitFor(() => expect(first.container.querySelectorAll('.bim-et-work').length).toBeGreaterThan(0));
        fireEvent.click(off());
        // 专名号档位「不显示」关掉人名等；书名只看「标注书名」开关（overview#510），不随档位
        await waitFor(() => expect(first.container.querySelectorAll('.bim-et-person').length).toBe(0));
        expect(first.container.querySelectorAll('.bim-et-work').length).toBeGreaterThan(0);
        const stored = JSON.parse(localStorage.getItem('bim-reader-prefs') ?? '{}');
        expect(stored.properNameMode).toBe('off');
        expect('properNames' in stored).toBe(false); // 写回只写新键
        first.unmount();
        const second = await mount(true);
        await waitFor(() => expect(off().getAttribute('aria-pressed')).toBe('true'));
        expect(second.container.querySelectorAll('.bim-et-person').length).toBe(0);
    });

    it('本章没有专名层数据：没选过时不画线、开关不按下', async () => {
        const { container } = await mount(false);
        expect(container.querySelectorAll('.bim-et').length).toBe(0);
        // 没选过：按本章实体数默认——没有专名层数据＝off 按下，full 不按下
        expect(off().getAttribute('aria-pressed')).toBe('true');
        expect(full().getAttribute('aria-pressed')).toBe('false');
    });
});
