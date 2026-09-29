// @vitest-environment node
/** LocaleProvider 在纯 node 环境（无 window）下 SSR，简体首帧即转换（overview#268） */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '../../src/i18n/provider';
import { useConvert } from '../../src/i18n';

function Probe() {
    const { convert } = useConvert();
    return <b>{convert('維基文庫')}</b>;
}

describe('LocaleProvider SSR（node 环境）', () => {
    it('没有浏览器全局也能同步转换', () => {
        expect(typeof window).toBe('undefined');
        expect(renderToString(<LocaleProvider locale="zh-Hans"><Probe /></LocaleProvider>)).toContain('维基文库');
        expect(renderToString(<LocaleProvider locale="zh-Hant"><Probe /></LocaleProvider>)).toContain('維基文庫');
    });
});
