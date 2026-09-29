import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import {
    THEME_INIT_SCRIPT, THEME_STORAGE_KEY, applyTheme, currentTheme, normalizeTheme, readStoredTheme, storeTheme,
} from '../../src/theme';

beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
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

describe('ThemeToggle', () => {
    it('两个单选，默认朱砂选中', () => {
        render(<ThemeToggle />);
        expect(screen.getByRole('radiogroup')).toBeTruthy();
        expect(screen.getByRole('radio', { name: '朱砂' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', { name: '靛藍' }).getAttribute('aria-checked')).toBe('false');
    });

    it('点靛藍：写 <html>、写存储、通知宿主；再点朱砂还原', () => {
        const onChange = vi.fn();
        render(<ThemeToggle onChange={onChange} />);
        fireEvent.click(screen.getByRole('radio', { name: '靛藍' }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('indigo');
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('indigo');
        expect(onChange).toHaveBeenLastCalledWith('indigo');
        expect(screen.getByRole('radio', { name: '靛藍' }).getAttribute('aria-checked')).toBe('true');
        fireEvent.click(screen.getByRole('radio', { name: '朱砂' }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('zhusha');
        expect(onChange).toHaveBeenLastCalledWith('zhusha');
    });

    it('挂载时读 <html> 上已设的主题；存储不可用时点选仍生效于本页', () => {
        document.documentElement.setAttribute('data-theme', 'indigo');
        const { unmount } = render(<ThemeToggle />);
        expect(screen.getByRole('radio', { name: '靛藍' }).getAttribute('aria-checked')).toBe('true');
        unmount();
        document.documentElement.setAttribute('data-theme', 'zhusha');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        render(<ThemeToggle />);
        fireEvent.click(screen.getByRole('radio', { name: '靛藍' }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('indigo');
    });
});
