/**
 * GUJI-240：分卷与各级标题（guji-format spec/04 v0.2 §4.2）。
 * 标题符 kind: heading 锚在标题首字前，标题到下一个分段符为止；分段符只锚段末字之后（pos: before 不认）。
 * 改字（换字、补字）不影响标题：标题只认首字格位。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import type { IndexStorage } from '../../src/storage/types';
import { GujiTextViewer, type PunctEntry } from '../../src/components/Reader/GujiTextViewer';
import { ReaderToc } from '../../src/components/Reader/ReaderToc';
import { flattenToc } from '../../src/components/Reader/ReaderShell';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import { adaptPunctJson } from '../../src/core/guji-pages';
import { headingKey, headingLabel, headingsFromPunct, nestHeadings, parseHeadingKey, sanitizeHeadings } from '../../src/core/text-headings';
import { LocaleProvider } from '../../src/i18n';
import type { ReaderTocItem } from '../../src/components/Reader/types';

vi.mock('../../src/components/Reader/GujiWarpCanvas', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadImage: async () => undefined,
    GujiWarpCanvas: () => <div data-testid="canvas-stub" />,
}));

/** jsdom 没有 scrollIntoView：测试期间记下被滚的元素 */
function recordScrolls(): { scrolled: Element[]; restore: () => void } {
    const proto = Element.prototype as any;
    const had = Object.prototype.hasOwnProperty.call(proto, 'scrollIntoView');
    const orig = proto.scrollIntoView;
    const scrolled: Element[] = [];
    proto.scrollIntoView = function (this: Element) { scrolled.push(this); };
    return { scrolled, restore: () => { if (had) proto.scrollIntoView = orig; else delete proto.scrollIntoView; } };
}

const cell = (a: string, c: string) => ({ a, c });
/** 一页，每个字串一列：列号从 1 起，格号从 1 起 */
const page = (n: number, cols: string[]) => ({
    page: n,
    columns: cols.map((t, ci) => ({ col: ci + 1, cells: Array.from(t).map((c, i) => cell(`${n}:${ci + 1}:${i + 1}`, c)) })),
});

// 四庫總目第 2 册卷二开头的缩样：卷名行、副题、類名、书名行、正文
const doc = [page(39, ['欽定四庫全書總目卷二', '經部二', '易類二', '易數鈎隱圖三卷', '宋劉牧撰'])];
const H = (anchor: string, mark: string, extra: Partial<PunctEntry> = {}): PunctEntry => ({ anchor, mark, kind: 'heading', pos: 'before', ...extra });
const BR = (anchor: string): PunctEntry => ({ anchor, mark: '\n\n', kind: 'break', pos: 'after' });
const P = (anchor: string, mark: string, pos: 'before' | 'after' = 'after'): PunctEntry => ({ anchor, mark, kind: 'point', pos });
const punct: PunctEntry[] = [
    H('39:1:1', '#', { label: '卷二　經部二' }), BR('39:1:10'),
    H('39:2:1', '#', { toc: false }), BR('39:2:3'),
    H('39:3:1', '##'), BR('39:3:3'),
    H('39:4:1', '###'), P('39:4:1', '《', 'before'), P('39:4:5', '》'), BR('39:4:7'),
    P('39:5:4', '。'), BR('39:5:4'),
];

function mount(docPages: any[], punctuations: PunctEntry[], extra: Partial<React.ComponentProps<typeof GujiTextViewer>> = {}) {
    const pages = adaptCharCord({ pages: docPages });
    const pageData: any = { page_id: 'vol:2', columns: [], pages };
    return render(
        <LocaleProvider locale="zh-Hant">
            <GujiTextViewer pageData={pageData} pages={pages as any} punctuations={punctuations} selectedCharIds={new Set()} {...extra} />
        </LocaleProvider>,
    );
}
const textOf = (el: Element) => el.textContent ?? '';

describe('正文：标题段', () => {
    it('标题段排成 h2～h4，级别按 # 个数；正文仍是 <p>', () => {
        const { container } = mount(doc, punct);
        const hs = Array.from(container.querySelectorAll('.guji-reflow-heading'));
        expect(hs.map(h => h.tagName)).toEqual(['H2', 'H2', 'H3', 'H4']);
        expect(hs.map(textOf)).toEqual(['欽定四庫全書總目卷二', '經部二', '易類二', '《易數鈎隱圖》三卷']);
        expect(hs.map(h => h.getAttribute('data-heading-anchor'))).toEqual(['39:1:1', '39:2:1', '39:3:1', '39:4:1']);
        expect(hs[1].getAttribute('data-heading-toc')).toBe('0');
        const ps = Array.from(container.querySelectorAll('p.guji-reflow-paragraph'));
        expect(ps.map(textOf)).toEqual(['宋劉牧撰。']);
    });

    it('标题符、分段符的 mark 不进正文', () => {
        const { container } = mount(doc, punct);
        expect(container.textContent).not.toMatch(/#/);
        expect(container.textContent).not.toMatch(/\n/);
    });

    it('改字不影响标题：换首字、换末字，标题照旧锚在首字、到分段符为止', () => {
        const changed = [page(39, ['钦定四庫全書總目卷二', '經部貳', '易類二', '易數鈎隱圖三卷', '宋劉牧撰'])];
        const { container } = mount(changed, punct);
        const hs = Array.from(container.querySelectorAll('.guji-reflow-heading'));
        expect(hs.map(h => h.getAttribute('data-heading-anchor'))).toEqual(['39:1:1', '39:2:1', '39:3:1', '39:4:1']);
        expect(textOf(hs[0])).toBe('钦定四庫全書總目卷二');
        expect(textOf(hs[1])).toBe('經部貳');
    });

    it('在分段处补字：改字工具把分段符挪到新字上，新字就归进标题', () => {
        const changed = [page(39, ['欽定四庫全書總目卷二一', '經部二', '易類二', '易數鈎隱圖三卷', '宋劉牧撰'])];
        const moved = punct.map(p => (p.kind === 'break' && p.anchor === '39:1:10' ? BR('39:1:11') : p));
        const hs = Array.from(mount(changed, moved).container.querySelectorAll('.guji-reflow-heading'));
        expect(textOf(hs[0])).toBe('欽定四庫全書總目卷二一');
        // 分段符没挪：新字自成一段，不算进标题
        const kept = mount(changed, punct).container;
        expect(textOf(kept.querySelectorAll('.guji-reflow-heading')[0])).toBe('欽定四庫全書總目卷二');
    });

    it('分段符 pos=before 不认：不在该字前分段', () => {
        const { container } = mount([page(3, ['甲乙', '丙丁'])], [{ anchor: '3:2:1', mark: '\n\n', kind: 'break', pos: 'before' }]);
        expect(container.querySelectorAll('p.guji-reflow-paragraph')).toHaveLength(1);
    });

    it('分叶线关：下一页首字是标题时不与上一页末段相并', () => {
        const two = [page(3, ['甲乙']), page(4, ['丙丁'])];
        const { container } = mount(two, [H('4:1:1', '#')], { pageBreaks: false });
        expect(container.querySelectorAll('.guji-reflow-heading')).toHaveLength(1);
        expect(Array.from(container.querySelectorAll('p.guji-reflow-paragraph')).map(textOf)).toEqual(['甲乙']);
        const merged = mount(two, [], { pageBreaks: false }).container;
        expect(merged.querySelectorAll('p.guji-reflow-paragraph')).toHaveLength(1);
    });

    it('scrollToAnchor：滚到标题段并把书影页报给宿主', () => {
        const { scrolled, restore } = recordScrolls();
        try {
            const onPage = vi.fn();
            mount(doc, punct, { scrollToAnchor: { anchor: '39:3:1', nonce: 1 }, onVisiblePageChange: onPage });
            expect(scrolled.at(-1)?.getAttribute('data-heading-anchor')).toBe('39:3:1');
            expect(onPage).toHaveBeenCalledWith(39);
        } finally {
            restore();
        }
    });
});

describe('adaptPunctJson：标题符与认不得的类别', () => {
    it('heading 只认 pos=before、mark 为 1～6 个 #；label／toc 保留', () => {
        const out = adaptPunctJson([
            { anchor: '1:1:1', mark: '#', kind: 'heading', pos: 'before', label: ' 卷一 ', toc: true },
            { anchor: '1:2:1', mark: '##', kind: 'heading', pos: 'before', toc: false },
            { anchor: '1:3:1', mark: '#', kind: 'heading', pos: 'after' },
            { anchor: '1:4:1', mark: '#######', kind: 'heading', pos: 'before' },
            { anchor: '1:5:1', mark: '卷', kind: 'heading', pos: 'before' },
        ]);
        expect(out.map(p => p.anchor)).toEqual(['1:1:1', '1:2:1']);
        expect(out[0].label).toBe('卷一');
        expect(out[0].toc).toBeUndefined();
        expect(out[1].toc).toBe(false);
    });

    it('认不得的 kind、pos 整条丢弃，不当普通标点插进正文', () => {
        const out = adaptPunctJson([
            { anchor: '1:1:1', mark: '§', kind: 'section' },
            { anchor: '1:1:2', mark: '，', kind: 'range' },
            { anchor: '1:1:3', mark: '，', pos: 'range' },
            { anchor: '1:1:4', mark: '，' },
            { anchor: '1:1:5', mark: '\n\n', kind: 'break', pos: 'before' },
        ]);
        expect(out.map(p => p.anchor)).toEqual(['1:1:4']);
    });
});

describe('目录：从标题算、套层级', () => {
    const pages = adaptCharCord({ pages: doc });

    it('headingsFromPunct：只收进目录的标题；label 优先，否则原文；书目条只留书名、去书名号', () => {
        expect(headingsFromPunct(pages, punct)).toEqual([
            { level: 1, label: '卷二　經部二', anchor: '39:1:1' },
            { level: 2, label: '易類二', anchor: '39:3:1' },
            { level: 3, label: '易數鈎隱圖', anchor: '39:4:1' },
        ]);
    });

    it('标题到分段符为止；pos=before 的分段符不认，标题一直延到下一个标题', () => {
        const after: PunctEntry[] = [H('39:3:1', '##'), BR('39:3:3')];
        expect(headingsFromPunct(pages, after)).toEqual([{ level: 2, label: '易類二', anchor: '39:3:1' }]);
        const before: PunctEntry[] = [H('39:3:1', '##'), { anchor: '39:4:1', mark: '\n\n', kind: 'break', pos: 'before' }, H('39:5:1', '##')];
        expect(headingsFromPunct(pages, before)[0].label).toBe('易類二易數鈎隱圖三卷');
    });

    it('没有标题符＝空', () => {
        expect(headingsFromPunct(pages, [BR('39:2:3')])).toEqual([]);
        expect(headingsFromPunct(null, punct)).toEqual([]);
    });

    it('nestHeadings 按级别套树，跳级挂在最近的上级下', () => {
        const tree = nestHeadings([
            { level: 1, label: '卷一', anchor: 'a' },
            { level: 3, label: '書甲', anchor: 'b' },
            { level: 2, label: '易類一', anchor: 'c' },
            { level: 3, label: '書乙', anchor: 'd' },
            { level: 1, label: '卷二', anchor: 'e' },
        ]);
        expect(tree.map(n => n.label)).toEqual(['卷一', '卷二']);
        expect(tree[0].children.map(n => n.label)).toEqual(['書甲', '易類一']);
        expect(tree[0].children[1].children.map(n => n.label)).toEqual(['書乙']);
    });

    it('sanitizeHeadings 丢掉形状不对的缓存项；key 拆得回来', () => {
        expect(sanitizeHeadings([{ level: 1, label: '卷一', anchor: '3:1:1' }, { level: 0, label: 'x', anchor: 'y' }, { level: 2, label: '', anchor: 'z' }, null]))
            .toEqual([{ level: 1, label: '卷一', anchor: '3:1:1' }]);
        expect(sanitizeHeadings('x')).toEqual([]);
        expect(parseHeadingKey(headingKey('002', '39:1:1'))).toEqual({ chapter: '002', anchor: '39:1:1' });
        expect(parseHeadingKey('002')).toBeNull();
    });
});

describe('目录树：册可选中、章内标题不算翻卷单位', () => {
    const toc: ReaderTocItem[] = [
        { key: '001', label: '第1册' },
        {
            key: '002', label: '第2册', selectable: true, children: [
                { key: '002#39:1:1', label: '卷二', inChapter: true, selectable: true, children: [{ key: '002#39:3:1', label: '易類二', inChapter: true }] },
            ],
        },
        { key: '003', label: '第3册' },
    ];

    it('flattenToc：册都在、标题不在', () => {
        expect(flattenToc(toc).map(i => i.key)).toEqual(['001', '002', '003']);
    });

    it('点册名选中该册；点标题回传标题 key；当前标题所在的组自动展开', () => {
        const onSelect = vi.fn();
        const { container, rerender } = render(
            <LocaleProvider locale="zh-Hant"><ReaderToc items={toc} activeKey="001" onSelect={onSelect} /></LocaleProvider>,
        );
        const btn = (k: string) => container.querySelector<HTMLButtonElement>(`[data-rd-toc-key="${k}"]`);
        expect(btn('002#39:1:1')).toBeNull(); // 收起
        fireEvent.click(btn('002')!);
        expect(onSelect).toHaveBeenLastCalledWith('002');
        expect(btn('002#39:1:1')).not.toBeNull(); // 点名字同时展开
        rerender(<LocaleProvider locale="zh-Hant"><ReaderToc items={toc} activeKey="002#39:3:1" onSelect={onSelect} /></LocaleProvider>);
        expect(btn('002#39:3:1')!.getAttribute('aria-current')).toBe('true');
        fireEvent.click(btn('002#39:3:1')!);
        expect(onSelect).toHaveBeenLastCalledWith('002#39:3:1');
    });
});

// ── 接到 TextReader：目录树、点标题、现算标题 ──

describe('TextReader：册 → 卷 → 標題', () => {
    const WORK = '96mid1ogzk';
    const cached = [
        { level: 1, label: '卷二　經部二', anchor: '39:1:1' },
        { level: 2, label: '易類二', anchor: '39:3:1' },
        { level: 3, label: '易數鈎隱圖', anchor: '39:4:1' },
    ];
    const transport = {
        getItem: async () => ({ title: '總目' }),
        getTextManifest: async () => ({ id: WORK, versions: [{ key: 'default', kind: 'self_collated', label: '自校本', source: 'original', is_original: true }] }),
        getTextIndex: async () => ({ heading_levels: ['卷', '類', '書'], chapters: [
            { n: 2, file: '002', title: '經部總敘·易類一至三', char_file: '002.char.json', headings: cached },
            { n: 3, file: '003', title: '易類四至五', char_file: '003.char.json' },
        ] }),
        getChapter: async () => null,
    } as unknown as IndexStorage;
    const warp = (_ch: string) => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages: adaptCharCord({ pages: doc }), punctuations: punct });

    function mountReader(chapter: string, onLocationChange = vi.fn()) {
        const view = render(
            <LocaleProvider locale="zh-Hant">
                <TextReader
                    id={WORK}
                    transport={transport}
                    chapter={chapter}
                    onLocationChange={onLocationChange}
                    resolveWarpData={async (ch: string) => warp(ch) as never}
                    resolveImages={async () => [] as never}
                />
            </LocaleProvider>,
        );
        return view;
    }
    const tocBtn = (c: HTMLElement, k: string) => c.querySelector<HTMLButtonElement>(`[role="navigation"] [data-rd-toc-key="${k}"]`);

    it('index.json 有 headings：当前册展开出卷，点卷名回传 anchor 并滚到标题', async () => {
        const { scrolled, restore } = recordScrolls();
        try {
            const onLoc = vi.fn();
            const { container } = mountReader('002', onLoc);
            await waitFor(() => expect(container.querySelector('.guji-reflow-heading')).not.toBeNull(), { timeout: 5000 });
            expect(tocBtn(container, '002')).not.toBeNull();
            expect(tocBtn(container, '003')).not.toBeNull();
            // 卷在标题里：章行写册，不写卷
            expect(tocBtn(container, '002')!.textContent).toContain('冊2');
            const vol = tocBtn(container, '002#39:1:1')!;
            expect(vol.textContent).toContain('卷二');
            fireEvent.click(vol);
            expect(onLoc).toHaveBeenLastCalledWith(expect.objectContaining({ chapter: '002', anchor: '39:1:1' }), 'chapter');
            await waitFor(() => expect(scrolled.some(e => e.getAttribute('data-heading-anchor') === '39:1:1')).toBe(true));
            // 卷展开后能看到類
            expect(tocBtn(container, '002#39:3:1')).not.toBeNull();
        } finally {
            restore();
        }
    });

    it('index.json 没有 headings：当前册从 punct 现算', async () => {
        const { container } = mountReader('003');
        await waitFor(() => expect(tocBtn(container, '003#39:1:1')).not.toBeNull(), { timeout: 5000 });
        expect(tocBtn(container, '003#39:1:1')!.textContent).toContain('卷二　經部二');
    });
});

describe('headingLabel：目录名化简（与 book-text heading_label 同口径）', () => {
    it('书目条只留书名（连前缀），去书名号；非书目条只去书名号', () => {
        expect(headingLabel('《子夏易傳》十一卷内府藏本')).toBe('子夏易傳');
        expect(headingLabel('新本《鄭氏周易》三卷江蘇巡撫採進本')).toBe('新本鄭氏周易');
        expect(headingLabel('《某書》不分卷')).toBe('某書');
        expect(headingLabel('讀《論語》法')).toBe('讀論語法');
        expect(headingLabel('卷一　經部一')).toBe('卷一　經部一');
    });
});
