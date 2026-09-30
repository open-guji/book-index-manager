/**
 * 搜索页 v4（overview#298）：筛选状态与 URL／Meili filter 往返、左栏、翻页、结果区（表格／卡片／页签／清除）。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { IndexBrowser } from '../../src/components/IndexBrowser';
import { SearchFiltersPanel } from '../../src/components/search/SearchFiltersPanel';
import { pageWindow } from '../../src/components/search/ResultPager';
import { SEARCH_V4_CSS } from '../../src/components/search/search-css';
import {
    EMPTY_FILTERS, buildMeiliFilter, countActiveFilters, filtersFromParams, filtersToParams, sameFilters, typeSupportsFilters,
    DYNASTY_GROUPS, sortFor, type SearchFilters,
} from '../../src/core/search-filters';
import type { IndexStorage } from '../../src/storage/types';
import type { IndexEntry } from '../../src/types';

beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); });

const F = (p: Partial<SearchFilters>): SearchFilters => ({ ...EMPTY_FILTERS, ...p });

describe('筛选状态：Meili filter 串', () => {
    it('无筛选＝空串；单值用 =，多值用 IN；「未分類」发空串值', () => {
        expect(buildMeiliFilter(EMPTY_FILTERS, 'work')).toBe('');
        expect(buildMeiliFilter(F({ classification: ['史部'] }), 'work')).toBe('classification = "史部"');
        expect(buildMeiliFilter(F({ classification: ['史部', ''] }), 'work')).toBe('classification IN ["史部", ""]');
        expect(buildMeiliFilter(F({ dynasty: ['清'] }), 'work')).toBe('dynasty = "清"');
    });

    it('朝代分组展开成索引里的实际取值（取并集去重）', () => {
        expect(buildMeiliFilter(F({ dynasty: ['漢'] }), 'work')).toBe('dynasty IN ["漢", "西漢", "東漢"]');
        const two = buildMeiliFilter(F({ dynasty: ['漢', '元'] }), 'entity')!;
        expect(two).toContain('"西漢"');
        expect(two).toContain('"元末明初"');
    });

    it('组合：朝代＋部类＋资源＋存佚用 AND 串起来', () => {
        expect(buildMeiliFilter(F({ dynasty: ['清'], classification: ['集部'], hasImage: true, hasText: true, loss: 'lost' }), 'work'))
            .toBe('dynasty = "清" AND classification = "集部" AND has_image = true AND has_text = true AND loss_status = "lost"');
        expect(buildMeiliFilter(F({ hasCollated: true }), 'work')).toBe('has_collated = true');
    });

    it('各类索引能筛的字段与代理一致：版本不支持部类／存佚／整理本，丛编只有类型；不支持就返回 null（不查、按 0 条）', () => {
        expect(buildMeiliFilter(F({ dynasty: ['宋'], hasImage: true }), 'book')).toContain('has_image = true');
        expect(buildMeiliFilter(F({ classification: ['史部'] }), 'book')).toBeNull();
        expect(buildMeiliFilter(F({ loss: 'extant' }), 'book')).toBeNull();
        expect(buildMeiliFilter(F({ hasCollated: true }), 'book')).toBeNull();
        expect(buildMeiliFilter(F({ dynasty: ['宋'] }), 'collection')).toBeNull();
        expect(buildMeiliFilter(EMPTY_FILTERS, 'collection')).toBe('');
        expect(buildMeiliFilter(F({ dynasty: ['宋'] }), 'entity')).toContain('dynasty');
        expect(typeSupportsFilters('entity', F({ hasImage: true }))).toBe(false);
    });

    it('值里没有引号、反斜杠等会被代理拒绝的字符', () => {
        for (const g of DYNASTY_GROUPS) for (const v of g.values) expect(v).not.toMatch(/["\\\u0000-\u001f]/);
    });
});

describe('排序', () => {
    it('sort 进 URL 往返；不认识的键丢掉；不算「筛选」（不计数）', () => {
        const p = filtersToParams(F({ sort: 'era:desc' }));
        expect(p.get('sort')).toBe('era:desc');
        expect(filtersFromParams(p).sort).toBe('era:desc');
        expect(filtersFromParams(new URLSearchParams('sort=completeness:desc')).sort).toBe('');
        expect(countActiveFilters(F({ sort: 'title:asc' }))).toBe(0);
        expect(sameFilters(F({ sort: 'era:asc' }), F({ sort: 'era:desc' }))).toBe(false);
    });

    it('sortFor：丛编没有年代与拼音字段，不带 sort；其余类带', () => {
        expect(sortFor('work', F({ sort: 'era:asc' }))).toBe('era:asc');
        expect(sortFor('entity', F({ sort: 'title:desc' }))).toBe('title:desc');
        expect(sortFor('collection', F({ sort: 'era:asc' }))).toBeUndefined();
        expect(sortFor('work', EMPTY_FILTERS)).toBeUndefined();
    });
});

describe('排序控件（结果区）', () => {
    it('相关度／年代／书名；再点当前项翻转方向；点另一项从升序开始；只换排序留在当前页签', async () => {
        const onFiltersChange = vi.fn();
        const { rerender } = mount({ filters: EMPTY_FILTERS, onFiltersChange });
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        const group = screen.getByRole('group', { name: '排序' });
        expect(within(group).getByRole('button', { name: '相關度' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(within(group).getByRole('button', { name: '年代' }));
        expect(onFiltersChange).toHaveBeenLastCalledWith(F({ sort: 'era:asc' }));
        rerender(<IndexBrowser transport={transportWith()} hideModeIndicator initialQuery="史記" filtersEnabled filters={F({ sort: 'era:asc' })} onFiltersChange={onFiltersChange} />);
        const era = await within(screen.getByRole('group', { name: '排序' })).findByRole('button', { name: /年代/ });
        expect(era.getAttribute('aria-pressed')).toBe('true');
        expect(era.textContent).toContain('↑');
        fireEvent.click(era);
        expect(onFiltersChange).toHaveBeenLastCalledWith(F({ sort: 'era:desc' }));
        fireEvent.click(within(screen.getByRole('group', { name: '排序' })).getByRole('button', { name: /書名/ }));
        expect(onFiltersChange).toHaveBeenLastCalledWith(F({ sort: 'title:asc' }));
        fireEvent.click(within(screen.getByRole('group', { name: '排序' })).getByRole('button', { name: '相關度' }));
        expect(onFiltersChange).toHaveBeenLastCalledWith(F({ sort: '' }));
    });

    it('「清除全部筛选」不动排序', () => {
        const onChange = vi.fn();
        render(<SearchFiltersPanel filters={F({ dynasty: ['漢'], sort: 'title:asc' })} onChange={onChange} />);
        fireEvent.click(screen.getByText('清除全部篩選'));
        expect(onChange).toHaveBeenLastCalledWith(F({ sort: 'title:asc' }));
    });
});

describe('筛选状态：URL 往返', () => {
    const full = F({ dynasty: ['漢', '唐'], classification: ['史部', ''], hasImage: true, hasText: true, hasCollated: true, loss: 'partially_extant' });

    it('写出再读回相同；键短而稳定', () => {
        const p = filtersToParams(full);
        expect(p.get('dy')).toBe('漢,唐');
        expect(p.get('cls')).toBe('史部,_');
        expect(p.get('img')).toBe('1');
        expect(p.get('loss')).toBe('partially_extant');
        expect(sameFilters(filtersFromParams(p), full)).toBe(true);
    });

    it('保留 URL 里别的参数（q、tab），只动自己的键；清空时把自己的键删干净', () => {
        const p = new URLSearchParams('q=史記&tab=work&dy=清');
        filtersToParams(EMPTY_FILTERS, p);
        expect(p.toString()).toBe('q=%E5%8F%B2%E8%A8%98&tab=work');
    });

    it('认不出的值一律丢掉，被改坏的链接不报错', () => {
        const f = filtersFromParams(new URLSearchParams('dy=漢,火星&cls=乙部,史部&loss=weird&img=yes'));
        expect(f.dynasty).toEqual(['漢']);
        expect(f.classification).toEqual(['史部']);
        expect(f.loss).toBe('');
        expect(f.hasImage).toBe(false);
        expect(countActiveFilters(f)).toBe(2);
    });
});

describe('左栏筛选面板', () => {
    it('四组＋清除；点选触发 onChange（朝代多选、部类勾选、资源勾选、存佚单选）', () => {
        const onChange = vi.fn();
        const { rerender } = render(<SearchFiltersPanel filters={EMPTY_FILTERS} onChange={onChange} />);
        expect(screen.queryByText('清除全部筛选')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '漢' }));
        expect(onChange).toHaveBeenLastCalledWith(F({ dynasty: ['漢'] }));
        fireEvent.click(screen.getByRole('checkbox', { name: '史部' }));
        expect(onChange).toHaveBeenLastCalledWith(F({ classification: ['史部'] }));
        fireEvent.click(screen.getByRole('checkbox', { name: '有影印' }));
        expect(onChange).toHaveBeenLastCalledWith(F({ hasImage: true }));
        fireEvent.click(screen.getByRole('button', { name: '佚' }));
        expect(onChange).toHaveBeenLastCalledWith(F({ loss: 'lost' }));
        rerender(<SearchFiltersPanel filters={F({ dynasty: ['漢'], loss: 'lost' })} onChange={onChange} />);
        expect(screen.getByRole('button', { name: '漢' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: '佚' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByText('清除全部篩選'));
        expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTERS);
    });

    it('手机「筛选」按钮：有名字、带已选个数、aria-expanded 随开合', () => {
        render(<SearchFiltersPanel filters={F({ dynasty: ['漢', '唐'], hasText: true })} onChange={() => {}} />);
        // 宽屏下这个按钮被样式隐藏（只在窄屏出现，jsdom 里其它用例注入过的样式会让它没有可访问名称），按类名取
        const btn = document.querySelector('.bim-sr-fbtn') as HTMLButtonElement;
        expect(btn.textContent).toMatch(/^篩選/);
        expect(btn.textContent).toContain('3 項已選');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        const panel = document.getElementById(btn.getAttribute('aria-controls')!)!;
        expect(panel.hasAttribute('data-collapsed')).toBe(true);   // 窄屏默认收起（样式按它隐藏）
        fireEvent.click(btn);
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(panel.hasAttribute('data-collapsed')).toBe(false);
    });

    it('选中朝代的对勾是装饰：CSS 生成内容带空替代文本，不混进按钮的可访问名称', () => {
        expect(SEARCH_V4_CSS).toMatch(/\.bim-sr-chip\[aria-pressed="true"\]::before \{ content: "✓ " \/ "";/);
    });

    it('窄屏样式：收成按钮、表格退成两行、不横向溢出', () => {
        expect(SEARCH_V4_CSS).toMatch(/@media \(max-width: 719px\)[\s\S]*\.bim-sr-fbtn \{[^}]*display: flex/);
        expect(SEARCH_V4_CSS).toMatch(/\.bim-sr-filters\[data-collapsed\] \{ display: none; \}/);
        expect(SEARCH_V4_CSS).toMatch(/\.bim-sr-table thead \{ display: none; \}/);
        expect(SEARCH_V4_CSS).toMatch(/\.bim-sr-tablewrap \{[^}]*overflow-x: auto/);
    });
});

describe('翻页窗口', () => {
    it('首尾与当前±1，其余折成 gap', () => {
        expect(pageWindow(1, 5)).toEqual([1, 2, 'gap', 5]);
        expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
        expect(pageWindow(1, 1)).toEqual([1]);
        expect(pageWindow(20, 20)).toEqual([1, 'gap', 19, 20]);
    });
});

// ── 结果区 ──

const mk = (id: string, type: IndexEntry['type'], title: string, extra: Partial<IndexEntry> = {}): IndexEntry => ({ id, type, title, ...extra });
const WORKS = [
    mk('w1', 'work', '史記', { author: '司馬遷', dynasty: '西漢', classification: '史部', has_image: true, has_text: true, juan_count: 130 }),
    mk('w2', 'work', '史記集解', { author: '裴駰', dynasty: '南朝宋', classification: '史部', loss_status: 'lost' }),
];
const BOOKS = [mk('b1', 'book', '宋建安黃善夫家塾刻本', { edition: '刻本', era: '宋', has_image: true })];
const PEOPLE = [mk('p1', 'entity', '司馬遷', { birth_year: -145, death_year: -86, dynasty: '西漢' })];

function transportWith(spy?: { all?: ReturnType<typeof vi.fn>; search?: ReturnType<typeof vi.fn> }): IndexStorage {
    const base = {
        loadEntries: async () => ({ entries: [], total: 0, page: 1, pageSize: 50 }),
        getItem: async () => null,
        saveItem: async () => { throw new Error('x'); },
        deleteItem: async () => { throw new Error('x'); },
        generateId: async () => { throw new Error('x'); },
        getCounts: async () => ({ works: 0, books: 0, collections: 0, entities: 0, resourceCounts: { hasText: 0, hasImage: 0 }, subtypeStats: {} }),
    };
    return {
        ...base,
        searchAll: async (q: string, limit?: number, filters?: SearchFilters) => {
            spy?.all?.(q, limit, filters);
            return { works: WORKS, books: BOOKS, collections: [], entities: PEOPLE, totalWorks: 120, totalBooks: 1, totalCollections: 0, totalEntities: 1 };
        },
        search: async (q: string, type: string, opts: { page?: number; pageSize?: number; filters?: SearchFilters }) => {
            spy?.search?.(q, type, opts);
            return { entries: type === 'work' ? WORKS : [], total: type === 'work' ? 120 : 0, page: opts.page ?? 1, pageSize: opts.pageSize ?? 50 };
        },
    } as unknown as IndexStorage;
}

function mount(props: Partial<React.ComponentProps<typeof IndexBrowser>> = {}, spy?: Parameters<typeof transportWith>[0]) {
    return render(
        <IndexBrowser
            transport={transportWith(spy)}
            hideModeIndicator
            initialQuery="史記"
            filtersEnabled
            {...props}
        />,
    );
}

describe('IndexBrowser（filtersEnabled）结果区', () => {
    it('默认表格：六列表头、责任者／年代／部类取自条目、资源小标签、佚字标；类型页签带条数', async () => {
        mount();
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        const heads = within(screen.getByRole('table')).getAllByRole('columnheader').map(h => h.textContent);
        expect(heads).toEqual(['題名', '類型', '責任者', '年代', '部類', '資源']);
        const row = screen.getByRole('link', { name: '史記' }).closest('tr')!;
        expect(row.textContent).toContain('司馬遷');
        expect(row.textContent).toContain('西漢');
        expect(row.textContent).toContain('史部');
        expect(row.textContent).toContain('影印');
        expect(screen.getByRole('link', { name: '史記集解' }).closest('tr')!.textContent).toContain('佚');
        // 没有的列写「—」，不编造
        expect(screen.getByRole('link', { name: '宋建安黃善夫家塾刻本' }).closest('tr')!.textContent).toContain('—');
        const tabs = screen.getByRole('group', { name: /結果分類|结果分类/ });
        expect(within(tabs).getByRole('button', { name: /全部/ }).textContent).toContain('122');
        expect(within(tabs).getByRole('button', { name: /作品/ }).textContent).toContain('120');
    });

    it('表格／卡片切换：选择存 localStorage，重新挂载仍是卡片', async () => {
        const { unmount } = mount();
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: '卡片' }));
        expect(screen.queryByRole('table')).toBeNull();
        expect(document.querySelectorAll('.bim-sc').length).toBeGreaterThan(0);
        expect(window.localStorage.getItem('bim-search-view')).toBe('card');
        unmount();
        mount();
        await waitFor(() => expect(document.querySelectorAll('.bim-sc').length).toBeGreaterThan(0));
        expect(screen.getByRole('button', { name: '卡片' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('存储读写抛错时视图切换仍可用（只在本页生效）', async () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        mount();
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        expect(() => fireEvent.click(screen.getByRole('button', { name: '卡片' }))).not.toThrow();
        expect(document.querySelectorAll('.bim-sc').length).toBeGreaterThan(0);
        spy.mockRestore();
    });

    it('带筛选搜索：searchAll 收到 filters；「筛出 N 条」与已选小标签；点小标签取消一项', async () => {
        const all = vi.fn();
        const onFiltersChange = vi.fn();
        mount({ filters: F({ dynasty: ['漢'], classification: ['史部'] }), onFiltersChange }, { all });
        await waitFor(() => expect(all).toHaveBeenCalled());
        expect(all.mock.calls[0][2]).toEqual(F({ dynasty: ['漢'], classification: ['史部'] }));
        expect(await screen.findByText('篩出 122 條')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '取消篩選：漢' }));
        expect(onFiltersChange).toHaveBeenLastCalledWith(F({ classification: ['史部'] }));
    });

    it('点作品页签：走 search(type, {page:1,pageSize:50,filters})，出翻页；点第 2 页请求第 2 页', async () => {
        const search = vi.fn();
        mount({ filters: F({ hasImage: true }) }, { search });
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        fireEvent.click(within(screen.getByRole('group', { name: /結果分類|结果分类/ })).getByRole('button', { name: /作品/ }));
        await waitFor(() => expect(search).toHaveBeenCalledWith('史記', 'work', { page: 1, pageSize: 50, filters: F({ hasImage: true }) }));
        const pager = await screen.findByRole('navigation', { name: '翻頁' });
        expect(pager.textContent).toContain('共 120 條 · 每頁 50 條 · 第 1 / 3 頁');
        fireEvent.click(within(pager).getByRole('button', { name: '2' }));
        await waitFor(() => expect(search).toHaveBeenLastCalledWith('史記', 'work', { page: 2, pageSize: 50, filters: F({ hasImage: true }) }));
        expect(within(pager).getByRole('button', { name: '2' }).getAttribute('aria-current')).toBe('page');
    });

    it('筛选变了：回到「全部」第 1 页并重新请求', async () => {
        const search = vi.fn();
        const all = vi.fn();
        const { rerender } = mount({ filters: EMPTY_FILTERS }, { all, search });
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        fireEvent.click(within(screen.getByRole('group', { name: /結果分類|结果分类/ })).getByRole('button', { name: /作品/ }));
        await waitFor(() => expect(search).toHaveBeenCalled());
        rerender(<IndexBrowser transport={transportWith({ all, search })} hideModeIndicator initialQuery="史記" filtersEnabled filters={F({ loss: 'extant' })} />);
        await waitFor(() => expect(all).toHaveBeenLastCalledWith('史記', 5, F({ loss: 'extant' })));
        expect(within(screen.getByRole('group', { name: /結果分類|结果分类/ })).getByRole('button', { name: /全部/ }).getAttribute('aria-pressed')).toBe('true');
    });

    it('空结果：有筛选用设计稿文案（减少筛选、切换繁简），不含「按相关度／只看有影印」', async () => {
        const t = transportWith();
        (t as unknown as { searchAll: unknown }).searchAll = async () => ({ works: [], books: [], collections: [], entities: [], totalWorks: 0, totalBooks: 0, totalCollections: 0, totalEntities: 0 });
        render(<IndexBrowser transport={t} hideModeIndicator initialQuery="鑰" filtersEnabled filters={F({ dynasty: ['明'] })} />);
        expect(await screen.findByText(/沒有找到匹配的條目。試試更短的書名、減少篩選，或切換繁 \/ 簡。/)).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/按相關度|按相关度|只看有影印/);
    });

    it('不开 filtersEnabled：行为与以前一致（无左栏筛选、无表格）', async () => {
        render(<IndexBrowser transport={transportWith()} hideModeIndicator initialQuery="史記" />);
        await waitFor(() => expect(document.body.textContent).toContain('史記'));
        expect(document.querySelector('.bim-sr-layout')).toBeNull();
        expect(screen.queryByRole('table')).toBeNull();
    });
});

describe('筛选的本地镜像', () => {
    it('点一下立刻亮（不等宿主把它写进 URL）；宿主传来的值变了再以宿主为准', async () => {
        const onFiltersChange = vi.fn();   // 宿主没回传新值（模拟 URL 还没更新）
        const { rerender } = mount({ filters: EMPTY_FILTERS, onFiltersChange });
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
        fireEvent.click(screen.getByRole('checkbox', { name: '史部' }));
        expect((screen.getByRole('checkbox', { name: '史部' }) as HTMLInputElement).checked).toBe(true);
        expect(onFiltersChange).toHaveBeenCalledWith(F({ classification: ['史部'] }));
        // 后退：宿主传回无筛选 → 界面跟着还原
        rerender(<IndexBrowser transport={transportWith()} hideModeIndicator initialQuery="史記" filtersEnabled filters={F({ hasText: true })} onFiltersChange={onFiltersChange} />);
        await waitFor(() => expect((screen.getByRole('checkbox', { name: '有全文' }) as HTMLInputElement).checked).toBe(true));
        expect((screen.getByRole('checkbox', { name: '史部' }) as HTMLInputElement).checked).toBe(false);
    });
});
