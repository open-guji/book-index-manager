/**
 * 阅读偏好地基 L0（overview#505）：新字段默认值、旧 properNames 迁移、非法值回默认、新旧存档往返，
 * 以及设置面板各条目可渲染并改动偏好（只绑定偏好，不做行为）。
 */
import React, { useContext, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_READER_PREFS, loadReaderPrefs, saveReaderPrefs, properNamesOn } from '../../src/components/Reader/prefs';
import type { ReaderPrefs } from '../../src/components/Reader/prefs';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { LocaleContext, LocaleProvider } from '../../src/i18n';

const KEY = 'bim-reader-prefs';
const put = (o: unknown) => localStorage.setItem(KEY, JSON.stringify(o));

describe('prefs：默认值', () => {
    beforeEach(() => { localStorage.clear(); });

    it('新字段默认值与设计表一致', () => {
        expect(DEFAULT_READER_PREFS).toMatchObject({
            pageBreaks: true, pageIndicatorY: 0.33, bookTitleStyle: 'wavy', showWorks: true,
            properNameMode: null, quoteStyle: 'original', scriptMode: null, preserveMargins: true,
        });
        expect('properNames' in DEFAULT_READER_PREFS).toBe(false);
        expect(loadReaderPrefs()).toEqual(DEFAULT_READER_PREFS);
    });
});

describe('prefs：迁移', () => {
    beforeEach(() => { localStorage.clear(); });

    it('旧 properNames true→full、false→off、null／缺省→null（没选过）', () => {
        put({ properNames: true }); expect(loadReaderPrefs().properNameMode).toBe('full');
        put({ properNames: false }); expect(loadReaderPrefs().properNameMode).toBe('off');
        put({ properNames: null }); expect(loadReaderPrefs().properNameMode).toBeNull();
        put({}); expect(loadReaderPrefs().properNameMode).toBeNull();
    });

    it('新旧键并存时新键优先；新键非法时仍可按旧键迁', () => {
        put({ properNames: true, properNameMode: 'lite' }); expect(loadReaderPrefs().properNameMode).toBe('lite');
        put({ properNames: false, properNameMode: 'bogus' }); expect(loadReaderPrefs().properNameMode).toBe('off');
    });

    it('读出的偏好里没有旧键；写回只写新键', () => {
        put({ properNames: true, fontSize: 20 });
        const p = loadReaderPrefs();
        expect('properNames' in p).toBe(false);
        saveReaderPrefs(p);
        const stored = JSON.parse(localStorage.getItem(KEY)!);
        expect(stored.properNameMode).toBe('full');
        expect('properNames' in stored).toBe(false);
        expect(loadReaderPrefs()).toEqual(p); // 往返不变
    });

    it('其余旧存档字段照常读', () => {
        put({ fontSize: 22, readingMode: 'paragraph', workLinks: false, writingMode: 'vertical', fontFamily: 'kai' });
        expect(loadReaderPrefs()).toMatchObject({
            fontSize: 22, readingMode: 'paragraph', workLinks: false, writingMode: 'vertical', fontFamily: 'kai',
            pageBreaks: true, quoteStyle: 'original', scriptMode: null,
        });
    });
});

describe('prefs：非法值一律回默认', () => {
    beforeEach(() => { localStorage.clear(); });

    it('每个新字段的坏值', () => {
        put({
            pageBreaks: 'no', pageIndicatorY: 5, bookTitleStyle: 'curly', showWorks: 0,
            properNameMode: 'all', quoteStyle: 'fancy', scriptMode: 'klingon', preserveMargins: null, unknownKey: 1,
        });
        const p = loadReaderPrefs();
        expect(p).toEqual(DEFAULT_READER_PREFS);
        expect('unknownKey' in p).toBe(false);
    });

    it('pageIndicatorY：区间 0.1–0.9 内照用，区间外、NaN、字符串回默认', () => {
        for (const y of [0.1, 0.5, 0.9]) { put({ pageIndicatorY: y }); expect(loadReaderPrefs().pageIndicatorY).toBe(y); }
        for (const y of [0.05, 0.95, -1, '0.5', null]) { put({ pageIndicatorY: y }); expect(loadReaderPrefs().pageIndicatorY).toBe(0.33); }
    });

    it('合法的非默认值往返保持', () => {
        const want: Partial<ReaderPrefs> = {
            pageBreaks: false, pageIndicatorY: 0.6, bookTitleStyle: 'bracket', showWorks: false,
            properNameMode: 'lite', quoteStyle: 'classic', scriptMode: 'orig', preserveMargins: false,
        };
        saveReaderPrefs({ ...DEFAULT_READER_PREFS, ...want });
        expect(loadReaderPrefs()).toMatchObject(want);
        for (const m of ['modern', 'classic', 'original'] as const) { put({ quoteStyle: m }); expect(loadReaderPrefs().quoteStyle).toBe(m); }
        for (const m of ['orig', 'hant', 'hans'] as const) { put({ scriptMode: m }); expect(loadReaderPrefs().scriptMode).toBe(m); }
    });

    it('properNamesOn：lite、full 画，off、null 不画', () => {
        expect([properNamesOn('full'), properNamesOn('lite'), properNamesOn('off'), properNamesOn(null)]).toEqual([true, true, false, false]);
    });
});

function Probe() {
    const ctx = useContext(LocaleContext);
    return <output data-testid="locale">{ctx?.locale}</output>;
}
let lastPrefs: ReaderPrefs = DEFAULT_READER_PREFS;
function Harness({ init }: { init?: Partial<ReaderPrefs> }) {
    const [prefs, setPrefs] = useState<ReaderPrefs>({ ...DEFAULT_READER_PREFS, ...init });
    lastPrefs = prefs;
    return (
        <>
            <Probe />
            <ReaderShell
                title="宋史"
                toc={[{ key: 'a', label: '卷一' }]}
                activeKey="a"
                onSelect={() => {}}
                prefs={prefs}
                onPrefsChange={patch => setPrefs(p => ({ ...p, ...patch }))}
                properNameToggle
            >
                <p>正文</p>
            </ReaderShell>
        </>
    );
}
const openSettings = () => {
    if (!screen.queryByRole('complementary', { name: '閱讀設置' })) fireEvent.click(screen.getAllByRole('button', { name: '閱讀設置' })[0]);
    return within(screen.getByRole('complementary', { name: '閱讀設置' }));
};
// 非受控：setLocale 才会真的切换；起点用 localStorage 里存的繁体
const mount = (init?: Partial<ReaderPrefs>) => {
    localStorage.setItem('bim-locale', 'zh-Hant');
    return render(<LocaleProvider><Harness init={init} /></LocaleProvider>);
};
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed') === 'true';

describe('设置面板：新条目只绑定偏好', () => {
    beforeEach(() => { localStorage.clear(); lastPrefs = DEFAULT_READER_PREFS; });

    it('专名号三档：没选过都不按下；点选后写 properNameMode', () => {
        mount();
        const g = within(openSettings().getByRole('group', { name: '專名線' }));
        for (const n of ['不顯示', '精簡', '完整']) expect(pressed(g.getByRole('button', { name: n }))).toBe(false);
        fireEvent.click(g.getByRole('button', { name: '精簡' }));
        expect(lastPrefs.properNameMode).toBe('lite');
        expect(pressed(g.getByRole('button', { name: '精簡' }))).toBe(true);
    });

    it('书名标注开关、书名号／波浪线二选一', () => {
        mount();
        const side = openSettings();
        const works = side.getByRole('checkbox', { name: '標註書名' }) as HTMLInputElement;
        expect(works.checked).toBe(true);
        fireEvent.click(works);
        expect(lastPrefs.showWorks).toBe(false);
        const g = within(side.getByRole('group', { name: '書名樣式' }));
        expect(pressed(g.getByRole('button', { name: '波浪線' }))).toBe(true);
        fireEvent.click(g.getByRole('button', { name: '書名號' }));
        expect(lastPrefs.bookTitleStyle).toBe('bracket');
    });

    it('引号样式三选一，默认原样', () => {
        mount();
        const g = within(openSettings().getByRole('group', { name: '引號' }));
        expect(pressed(g.getByRole('button', { name: '原樣' }))).toBe(true);
        fireEvent.click(g.getByRole('button', { name: '「」『』' }));
        expect(lastPrefs.quoteStyle).toBe('classic');
        fireEvent.click(g.getByRole('button', { name: '“”‘’' }));
        expect(lastPrefs.quoteStyle).toBe('modern');
    });

    it('版式：分叶分割线、保留空白两个开关', () => {
        mount();
        const side = openSettings();
        const pb = side.getByRole('checkbox', { name: '顯示分葉分割線' }) as HTMLInputElement;
        const pm = side.getByRole('checkbox', { name: '書影保留空白' }) as HTMLInputElement;
        expect([pb.checked, pm.checked]).toEqual([true, true]);
        fireEvent.click(pb); fireEvent.click(pm);
        expect([lastPrefs.pageBreaks, lastPrefs.preserveMargins]).toEqual([false, false]);
    });

    it('字形三态：scriptMode 为 null 时显示成跟随站点（繁）；选简体同步站点 locale，选原字不动 locale', () => {
        mount();
        const g = () => within(openSettings().getByRole('group', { name: '繁簡' }));
        expect(pressed(g().getByRole('button', { name: '通行繁體' }))).toBe(true);
        expect(lastPrefs.scriptMode).toBeNull();
        fireEvent.click(g().getByRole('button', { name: '簡體' }));
        expect(lastPrefs.scriptMode).toBe('hans');
        expect(screen.getByTestId('locale').textContent).toBe('zh-Hans');
        // 切到简体后界面文字变简体，设置侧栏仍展开：按简体名字重新取
        const g2 = within(within(screen.getByRole('complementary', { name: '阅读设置' })).getByRole('group', { name: '繁简' }));
        expect(pressed(g2.getByRole('button', { name: '简体' }))).toBe(true);
        fireEvent.click(g2.getByRole('button', { name: '原字' }));
        expect(lastPrefs.scriptMode).toBe('orig');
        expect(screen.getByTestId('locale').textContent).toBe('zh-Hans'); // 原字不改站点 locale
        expect(pressed(g2.getByRole('button', { name: '原字' }))).toBe(true);
    });
});
