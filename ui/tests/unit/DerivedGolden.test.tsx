/**
 * 详情页「金样」对照（清退第二道：页面直接读 build 产物的 `_` 字段，删掉 adaptEntry 兼容层）。
 *
 * 夹具 `fixtures/derived-golden/` 是 book-index 真实 build 产物里挑的一批条目（Work／Book／Collection／Entity，
 * 含多版本、丛编、人物多作品、枢纽、志书等；挑法见 `scripts/make-derived-golden.py`），
 * 每个样本经 BookDetailLayout 渲染两种方式：
 *   - transport：宿主不预取，页面经 transport.getItem 取条目（枢纽名称来自 getHubs）；
 *   - seed：宿主预取（SSR），条目作 initialDetail 传入。
 * 渲染稳定后取整页 HTML 的 SHA-256 与可见文字，存进 `golden.json`。
 *
 * `golden.json` 是**切换前**（adaptEntry 兼容层还在、页面读旧形字段时）的渲染结果；
 * 切换后页面直接读 `_` 字段，渲染必须与它逐字节一致——这是「纯重构、用户看到的页面不变」的证据。
 * 之后改页面导致输出有意变化时，重新生成并在 PR 里说明：
 *     UPDATE_DERIVED_GOLDEN=1 npx vitest run tests/unit/DerivedGolden.test.tsx
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { BookDetailLayout } from '../../src/components/BookDetailLayout';
import { LocaleProvider } from '../../src/i18n/provider';

// vitest 在 ui/ 下跑（package.json 的 test 脚本）；jsdom 环境里 import.meta.url 不是 file: URL，故用 cwd
const DIR = join(process.cwd(), 'tests/unit/fixtures/derived-golden');
const read = <T,>(f: string): T => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as T;

const entries = read<Record<string, Record<string, unknown>>>('entries.json');
const hubs = read<Record<string, unknown>>('hubs.json');
const cases = read<{ key: string; id: string }[]>('cases.json');
const GOLDEN_PATH = join(DIR, 'golden.json');
const UPDATE = !!process.env.UPDATE_DERIVED_GOLDEN;
/** sha：整页 HTML；tsha／len／head：可见文字的摘要，不匹配时用来判断差在哪（全文用 DUMP_DERIVED_GOLDEN_DIR 导出再 diff） */
type Snap = { sha: string; tsha: string; len: number; head: string };
const golden: Record<string, Snap> = existsSync(GOLDEN_PATH) ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) : {};
const produced: Record<string, Snap> = {};
const DUMP = process.env.DUMP_DERIVED_GOLDEN_DIR;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function makeTransport() {
    const calls = { n: 0 };
    return {
        calls,
        transport: {
            getItem: async (id: string) => { calls.n++; return entries[id] ? structuredClone(entries[id]) : null; },
            getEntry: async () => null,
            getLineageGraph: async () => null,
            getHubs: async () => hubs,
        },
    };
}

/** React 的 useId 等随渲染顺序变的标识不参与比较 */
const normalize = (html: string) => html.replace(/:r[0-9a-z]+:/g, ':r:');

async function renderSettled(id: string, mode: 'transport' | 'seed') {
    const { transport, calls } = makeTransport();
    const initialDetail = mode === 'seed' ? (structuredClone(entries[id]) as never) : undefined;
    const view = render(
        <LocaleProvider converter={(s: string) => s}>
            <BookDetailLayout
                id={id}
                transport={transport as never}
                initialDetail={initialDetail}
                activeTab="basic"
                onTabChange={() => {}}
            />
        </LocaleProvider>,
    );
    // 次级请求（版本、子目、作品行）一环套一环：等取数次数连续几轮不再增长
    let stable = 0;
    let last = -1;
    for (let i = 0; i < 80 && stable < 4; i++) {
        await act(async () => { await new Promise(r => setTimeout(r, 4)); });
        if (calls.n === last) stable++; else { stable = 0; last = calls.n; }
    }
    const html = normalize(view.container.innerHTML);
    const body = view.container.cloneNode(true) as HTMLElement;
    body.querySelectorAll('style,script').forEach(n => n.remove());
    const text = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
    view.unmount();
    return { html, text, snap: { sha: sha(html), tsha: sha(text), len: text.length, head: text.slice(0, 120) } as Snap };
}

describe('详情页金样（切换前渲染 vs 现在）', () => {
    for (const c of cases) {
        for (const mode of ['transport', 'seed'] as const) {
            const key = `${c.key}:${mode}`;
            it(key, async () => {
                const { html, text, snap } = await renderSettled(c.id, mode);
                // 页面真的渲染出了东西（防止两边都是空白而“一致”）
                expect(snap.len).toBeGreaterThan(20);
                if (DUMP) {
                    const f = join(DUMP, key.replace(/[:]/g, '_'));
                    writeFileSync(`${f}.html`, html);
                    writeFileSync(`${f}.txt`, text);
                }
                produced[key] = snap;
                if (UPDATE) return;
                const want = golden[key];
                expect(want, `golden.json 里没有 ${key}`).toBeDefined();
                expect(snap, `${key} 的可见文字与金样不同`).toEqual(want);
            }, 30000);
        }
    }

    it.skipIf(!UPDATE)('写出 golden.json', () => {
        const sorted = Object.fromEntries(Object.entries(produced).sort(([a], [b]) => (a < b ? -1 : 1)));
        writeFileSync(GOLDEN_PATH, JSON.stringify(sorted));
    });
});
