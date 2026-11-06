/**
 * 阅读器插件演示台（A41 迁移 P 线）：用一个假的「对校」插件把设置组、工具条、按格修饰、浮层、选字浮条都走一遍。
 * 手动看效果／出 PR 截图用：`npx vite --port 5199`，打开 /tests/layout/plugin-demo.html。
 */
import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../../src/i18n/provider';
import { TextReader } from '../../src/components/TextReader';
import type { ReaderPlugin } from '../../src/components/Reader/plugins';
import type { IndexStorage } from '../../src/storage/types';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import char from './fixtures/96mid1ogzk-002-p3-5.char.json';
import cord from './fixtures/96mid1ogzk-002-p3-5.cord.json';

const WORK = '96mid1ogzk';
const transport = {
    getItem: async () => ({ title: '欽定四庫全書總目' }),
    getTextManifest: async () => ({ id: WORK, versions: [{ key: 'original', kind: 'collated', label: '底本', source: 'collated' }] }),
    getTextIndex: async () => ({ chapters: [{ n: 2, file: '002', title: '卷二', char_file: '002.char.json', cord_file: '002.cord.json' }] }),
    getChapter: async () => ({ md: 'x', json: null }),
} as unknown as IndexStorage;
const pages = adaptCharCord(char, cord);
const resolveWarpData = async () => ({ page_id: '', title: '', image_size: [0, 0], total_warped_w: 0, columns: [], pages, punctuations: [] }) as never;

function App() {
    const plugins = useMemo<ReaderPlugin[]>(() => {
        const ids = pages.flatMap(p => p.columns.flatMap(c => c.chars.map(ch => ch.id)));
        const at = (i: number) => ids[i];
        return [{
            id: 'demo-compare',
            settings: { group: 'compare', title: '对校（演示）', render: api => <button type="button" className="bim-rd-t bim-rd-sp-tg" aria-pressed="true" onClick={() => api.refresh()}>对照本：武英殿本</button> },
            toolbar: { slot: 'actions', render: () => <button type="button" className="bim-rd-t">下载本冊</button> },
            decorate: () => new Map([
                [at(3), { tone: 'warn', underline: 'wavy', sub: '訂', title: '异文' }],
                [at(10), { tone: 'add', insertAfter: '之' }],
                [at(17), { tone: 'omit', sub: '〇' }],
                [at(24), { tone: 'accent', focus: true }],
            ]),
            overlay: () => <div style={{ background: 'var(--bim-card-bg, #fff)', border: '1px solid var(--bim-rule, #ccc)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>异文 4 处 · <button type="button">‹ 上一处</button> <button type="button">下一处 ›</button></div>,
            selectionActions: sel => [{ key: 'report', label: `报错（${sel.text.length} 字）`, onClick: () => {} }],
        }];
    }, []);
    return (
        <LocaleProvider>
            <TextReader id={WORK} transport={transport} versionKey="original" chapter="002" resolveWarpData={resolveWarpData} plugins={plugins} />
        </LocaleProvider>
    );
}
createRoot(document.getElementById('root')!).render(<App />);
