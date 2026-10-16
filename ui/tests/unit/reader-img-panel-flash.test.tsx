/**
 * GUJI-181：书影还在取的时候不撑开书影栏。没有书影的书，栏「开一下又收」会让正文列横向跳两次（CLS 0.14）；
 * 有书影的书，图一到栏就开。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { TextReader } from '../../src/components/TextReader';
import type { IndexStorage } from '../../src/storage/types';
import { LocaleProvider } from '../../src/i18n';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const WORK = '96mid1ogzk';
const transport = {
    getItem: async () => ({ title: '總目' }),
    getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
    getTextIndex: async () => ({ chapters: [{ n: 1, file: '001', title: '卷一' }] }),
    getChapter: async () => ({ md: '正文', json: null }),
} as unknown as IndexStorage;

function setup(resolve: () => Promise<unknown>) {
    return render(
        <LocaleProvider>
            <TextReader id={WORK} transport={transport} versionKey="original" chapter="001" resolveImages={resolve as never} />
        </LocaleProvider>,
    );
}
const imgState = () => document.querySelector('.bim-rd')?.getAttribute('data-img');

describe('书影栏 · 加载中不撑开', () => {
    it('书影请求挂起时栏保持关闭；返回空后仍关闭（不闪开）', async () => {
        let done!: (v: unknown) => void;
        setup(() => new Promise(r => { done = r; }));
        await waitFor(() => expect(imgState()).toBeDefined());
        expect(imgState()).toBe('closed');
        await act(async () => { done(null); });
        expect(imgState()).toBe('closed');
    });
    it('返回了书影，栏打开', async () => {
        let done!: (v: unknown) => void;
        setup(() => new Promise(r => { done = r; }));
        await waitFor(() => expect(imgState()).toBeDefined());
        await act(async () => { done([{ id: 'p1', url: 'https://x/1.jpg', label: '1' }]); });
        await waitFor(() => expect(imgState()).toBe('open'));
    });
});
