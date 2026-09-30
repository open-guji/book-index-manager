import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import {
    THEME_INIT_SCRIPT, THEME_STORAGE_KEY, applyTheme, currentTheme, normalizeTheme, readStoredTheme, storeTheme,
    LAYOUT_STORAGE_KEY, applyLayout, currentLayout, normalizeLayout, readStoredLayout, storeLayout,
} from '../../src/theme';

beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-layout');
    vi.restoreAllMocks();
});

describe('主题 API', () => {
    it('无存储时默认朱砂', () => {
        expect(readStoredTheme()).toBe('zhusha');
        expect(currentTheme()).toBe('zhusha');
    });

    it('applyTheme 写 <html data-theme>；存取往返', () => {
        expect(applyTheme('indigo')).toBe('indigo');
        expect(document.documentElement.getAttribute('data-theme')).toBe('indigo');
        storeTheme('indigo');
        expect(readStoredTheme()).toBe('indigo');
        applyTheme('zhusha');
        expect(document.documentElement.getAttribute('data-theme')).toBe('zhusha');
    });

    it('data-theme / 存储里的非法值回退朱砂', () => {
        expect(normalizeTheme('purple')).toBe('zhusha');
        expect(normalizeTheme(undefined)).toBe('zhusha');
        expect(applyTheme('purple')).toBe('zhusha');
        expect(document.documentElement.getAttribute('data-theme')).toBe('zhusha');
        document.documentElement.setAttribute('data-theme', '"><x');
        expect(currentTheme()).toBe('zhusha');
        window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
        expect(readStoredTheme()).toBe('zhusha');
    });

    it('存储不可用（读写抛错）时不抛、按默认', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        expect(readStoredTheme()).toBe('zhusha');
        expect(() => storeTheme('indigo')).not.toThrow();
    });

    it('首屏脚本：存了 indigo 才改属性；没存、非法值、读存储抛错都不改也不抛', () => {
        const run = () => new Function(THEME_INIT_SCRIPT)();
        document.documentElement.setAttribute('data-theme', 'zhusha');
        run();
        expect(document.documentElement.getAttribute('data-theme')).toBe('zhusha');
        window.localStorage.setItem(THEME_STORAGE_KEY, 'indigo');
        run();
        expect(document.documentElement.getAttribute('data-theme')).toBe('indigo');
        document.documentElement.setAttribute('data-theme', 'zhusha');
        window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
        run();
        expect(document.documentElement.getAttribute('data-theme')).toBe('zhusha');
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        expect(run).not.toThrow();
    });
});

describe('v4 外观：墨与版式', () => {
    it('三种配色都合法；老用户存的 zhusha／indigo 原样有效（不需要迁移）', () => {
        for (const t of ['zhusha', 'indigo', 'ink'] as const) {
            window.localStorage.setItem(THEME_STORAGE_KEY, t);
            expect(readStoredTheme()).toBe(t);
        }
        expect(applyTheme('ink')).toBe('ink');
        expect(document.documentElement.getAttribute('data-theme')).toBe('ink');
    });

    it('版式：默认疏朗；存取往返；非法值回退疏朗', () => {
        expect(readStoredLayout()).toBe('airy');
        expect(currentLayout()).toBe('airy');
        expect(applyLayout('boxed')).toBe('boxed');
        expect(document.documentElement.getAttribute('data-layout')).toBe('boxed');
        storeLayout('boxed');
        expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('boxed');
        expect(readStoredLayout()).toBe('boxed');
        expect(normalizeLayout('grid')).toBe('airy');
        expect(applyLayout('grid')).toBe('airy');
        document.documentElement.setAttribute('data-layout', '"><x');
        expect(currentLayout()).toBe('airy');
    });

    it('首屏脚本：同时读两个键——ink／boxed 才改属性，没存或非法不改，存储抛错不抛', () => {
        const run = () => new Function(THEME_INIT_SCRIPT)();
        run();
        expect(document.documentElement.getAttribute('data-theme')).toBeNull();
        expect(document.documentElement.getAttribute('data-layout')).toBeNull();
        window.localStorage.setItem(THEME_STORAGE_KEY, 'ink');
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, 'boxed');
        run();
        expect(document.documentElement.getAttribute('data-theme')).toBe('ink');
        expect(document.documentElement.getAttribute('data-layout')).toBe('boxed');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-layout');
        window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, 'grid');
        run();
        expect(document.documentElement.getAttribute('data-theme')).toBeNull();
        expect(document.documentElement.getAttribute('data-layout')).toBeNull();
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        expect(run).not.toThrow();
    });
});

describe('ThemeToggle', () => {
    it('三个单选，默认朱砂选中', () => {
        render(<ThemeToggle />);
        expect(screen.getByRole('radiogroup')).toBeTruthy();
        expect(screen.getAllByRole('radio').map(r => r.getAttribute('aria-label'))).toEqual(['朱砂', '靛青', '墨']);
        expect(screen.getByRole('radio', { name: '朱砂' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', { name: '靛青' }).getAttribute('aria-checked')).toBe('false');
    });

    it('点靛藍：写 <html>、写存储、通知宿主；再点朱砂还原', () => {
        const onChange = vi.fn();
        render(<ThemeToggle onChange={onChange} />);
        fireEvent.click(screen.getByRole('radio', { name: '靛青' }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('indigo');
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('indigo');
        expect(onChange).toHaveBeenLastCalledWith('indigo');
        expect(screen.getByRole('radio', { name: '靛青' }).getAttribute('aria-checked')).toBe('true');
        fireEvent.click(screen.getByRole('radio', { name: '朱砂' }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('zhusha');
        expect(onChange).toHaveBeenLastCalledWith('zhusha');
    });

    it('挂载时读 <html> 上已设的主题；存储不可用时点选仍生效于本页', () => {
        document.documentElement.setAttribute('data-theme', 'indigo');
        const { unmount } = render(<ThemeToggle />);
        expect(screen.getByRole('radio', { name: '靛青' }).getAttribute('aria-checked')).toBe('true');
        unmount();
        document.documentElement.setAttribute('data-theme', 'zhusha');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        render(<ThemeToggle />);
        fireEvent.click(screen.getByRole('radio', { name: '靛青' }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('indigo');
    });
});
