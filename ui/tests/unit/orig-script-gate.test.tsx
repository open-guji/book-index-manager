/**
 * overview#540：「原字」档只有自校文本可选。外来文本没有规范层，原字无从区别于来源原样，置灰。
 * 置灰只是不让「选择」原字——存档里已经是 orig 的读者，按钮仍显示按下，点「繁」「简」即可离开。
 */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n';
import { ReaderShell } from '../../src/components/Reader/ReaderShell';
import { DEFAULT_READER_PREFS, type ReaderPrefs } from '../../src/components/Reader/prefs';

function Shell({ origScriptAvailable, initial, spy }: { origScriptAvailable?: boolean; initial?: Partial<ReaderPrefs>; spy?: (p: Partial<ReaderPrefs>) => void }) {
    const [prefs, setPrefs] = useState<ReaderPrefs>({ ...DEFAULT_READER_PREFS, ...initial });
    return (
        <ReaderShell
            title="測試書"
            toc={[{ key: '001', label: '卷一' }]}
            activeKey="001"
            onSelect={() => {}}
            prefs={prefs}
            onPrefsChange={(p) => { spy?.(p); setPrefs((prev) => ({ ...prev, ...p })); }}
            images={[]}
            origScriptAvailable={origScriptAvailable}
        >
            <p>正文</p>
        </ReaderShell>
    );
}

/** 设置面板默认是关的，字形行（ScriptRow）不挂载；测试必须先打开，否则只检查了顶栏那一个按钮 */
const mount = (props: React.ComponentProps<typeof Shell>) => {
    const v = render(<LocaleProvider locale="zh-Hant"><Shell {...props} /></LocaleProvider>);
    if (!screen.queryByRole('group', { name: '繁簡' })) fireEvent.click(screen.getAllByRole('button', { name: /^閱讀設置$/ })[0]);
    return v;
};
/** 顶栏快捷（原｜繁｜简）与设置面板里的字形行，各一个「原」按钮——两处都要在 */
const origButtons = () => {
    const bs = screen.getAllByRole('button', { name: /^原字$|^此文本沒有規範層，無「原字」可選$/ });
    expect(bs, '顶栏和设置面板各一个「原」按钮（面板没打开就只有一个）').toHaveLength(2);
    return bs;
};

describe('字形「原字」档的可选性', () => {
    it('缺省（宿主没传）：可选，与改前一致', () => {
        mount({});
        for (const b of origButtons()) expect((b as HTMLButtonElement).disabled).toBe(false); // 两处都可选
    });

    it('自校文本（origScriptAvailable）：可选，点了设成 orig', () => {
        const spy = vi.fn();
        mount({ origScriptAvailable: true, spy });
        fireEvent.click(origButtons()[0]);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scriptMode: 'orig' }));
    });

    it('外来文本（origScriptAvailable=false）：顶栏和设置面板里的「原」都置灰，点了不改偏好，提示说明原因', () => {
        const spy = vi.fn();
        mount({ origScriptAvailable: false, spy });
        const bs = origButtons();
        for (const b of bs) {
            expect((b as HTMLButtonElement).disabled).toBe(true);
            expect(b.getAttribute('title')).toBe('此文本沒有規範層，無「原字」可選');
            fireEvent.click(b);
        }
        expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ scriptMode: 'orig' }));
    });

    it('外来文本上「繁」「简」照常可点，不受影响', () => {
        const spy = vi.fn();
        mount({ origScriptAvailable: false, spy });
        const group = screen.getAllByRole('group', { name: /字形/ })[0];
        const hans = within(group).getAllByRole('button').find(b => /简|簡/.test(b.textContent ?? ''));
        expect(hans).toBeTruthy();
        expect((hans as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(hans!);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scriptMode: 'hans' }));
    });

    it('存档已经是 orig 的读者进到外来文本：「原」仍显示按下（与正文一致），点「繁」可以离开', () => {
        const spy = vi.fn();
        mount({ origScriptAvailable: false, initial: { scriptMode: 'orig' }, spy });
        const pressed = origButtons().filter(b => b.getAttribute('aria-pressed') === 'true');
        expect(pressed).toHaveLength(2); // 顶栏和面板都显示「原」按下
        const group = screen.getAllByRole('group', { name: /字形/ })[0];
        const hant = within(group).getAllByRole('button').find(b => /繁/.test(b.textContent ?? ''));
        fireEvent.click(hant!);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scriptMode: 'hant' }));
    });
});
