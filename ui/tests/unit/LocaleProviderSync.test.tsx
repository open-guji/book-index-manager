/**
 * LocaleProvider 首屏繁简一致（overview#268）：
 * 原来 converter 在 effect 里动态 import，SSR 与客户端首帧都是 null，数据文字首屏是繁体、
 * 界面文案却是简体。现在简体模式首帧就有同步 converter。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import { LocaleProvider } from '../../src/i18n/provider';
import { useConvert } from '../../src/i18n';

function Probe({ text = '維基文庫' }: { text?: string }) {
    const { convert } = useConvert();
    return <span data-testid="p">{convert(text)}</span>;
}

const html = (locale: 'zh-Hans' | 'zh-Hant', text?: string) =>
    renderToString(<LocaleProvider locale={locale}><Probe text={text} /></LocaleProvider>);

describe('LocaleProvider 同步 converter', () => {
    it('简体：服务端渲染的第一帧就已转换（无需等 effect）', () => {
        expect(html('zh-Hans')).toContain('维基文库');
    });

    it('繁体：不转换', () => {
        expect(html('zh-Hant')).toContain('維基文庫');
    });

    it('曹霑保留，其余照转', () => {
        const out = html('zh-Hans', '曹霑著紅樓夢');
        expect(out).toContain('曹霑');
        expect(out).toContain('红楼梦');
        expect(out).not.toContain('曹沾');
    });

    it('水合与服务端 HTML 一致，不报 mismatch，首帧即简体', async () => {
        const serverHtml = html('zh-Hans');
        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.appendChild(container);
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const firstFrame: string[] = [];
        function Spy() {
            const { convert } = useConvert();
            firstFrame.push(convert('維基文庫'));
            return <span data-testid="p">{convert('維基文庫')}</span>;
        }
        await act(async () => {
            hydrateRoot(container, <LocaleProvider locale="zh-Hans"><Spy /></LocaleProvider>);
        });
        expect(firstFrame[0]).toBe('维基文库');
        expect(container.textContent).toBe('维基文库');
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
        container.remove();
    });

    it('可注入自己的同步 converter', () => {
        const out = renderToString(
            <LocaleProvider locale="zh-Hans" converter={t => t.toUpperCase() + '!'}><Probe text="ab" /></LocaleProvider>,
        );
        expect(out).toContain('AB!');
    });
});
