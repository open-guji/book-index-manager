/**
 * 版式护栏的台子（overview#526）：在真实浏览器里渲染阅读器正文，量几何，不靠样式推算。
 * 数据是 96mid1ogzk 002 的真实片段（第 3–5 页：第 3 页有抬头列，第 4–5 页各有行首空格列），见 fixtures/。
 * 用法见 layout.spec.ts；这里只负责把组件挂出来，并把「挂好了」告诉测试。
 *
 * 为什么量几何、不比截图像素：不同机器的字体不同，像素比对会误报；几何关系（换行后第一个字的 x、
 * 抬头字与同行字的 y、画布尺寸）与字体无关，回归一出现就变。
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../../src/i18n/provider';
import { GujiTextViewer } from '../../src/components/Reader/GujiTextViewer';
import { GujiWarpCanvas, fullImageTrimRect, type PageWarpData } from '../../src/components/Reader/GujiWarpCanvas';
import { READER_CSS } from '../../src/components/Reader/reader-css';
import { adaptCharCord } from '../../src/core/guji-char-cord';
import char from './fixtures/96mid1ogzk-002-p3-5.char.json';
import cord from './fixtures/96mid1ogzk-002-p3-5.cord.json';

const q = new URLSearchParams(location.search);
const scenario = q.get('s') ?? 'text';
const pages = adaptCharCord(char, cord);

function Text() {
    // 宽度定死，换行位置才可复现
    return (
        <div id="host" style={{ width: 760, margin: '0 auto', padding: 24 }}>
            <GujiTextViewer
                pageData={{ page_id: 'vol:3', columns: [], pages } as never}
                pages={pages as never}
                punctuations={[]}
                selectedCharIds={new Set()}
                mode="horizontal"
                pageBreaks={q.get('pageBreaks') !== '0'}
            />
        </div>
    );
}

/**
 * 书影画布：新数据页（逐字坐标、没有透视条带）按 TextReader 的同一方式构造 PageWarpData——整幅原图铺满，
 * 字框用 cord 的像素框。图是页内现画的纯色图（不走网络）。?margins=1 保留空白，缺省去空白。
 */
function Canvas() {
    const info = pages.find(p => p.page === 3)!;
    const pageData: PageWarpData = {
        page_id: `p:${info.page}`,
        title: `第${info.page}葉`,
        image_size: [info.width, info.height],
        total_warped_w: info.width,
        columns: [{
            col: 1, warped_w: info.width, warped_h: info.height, offset_x: 0, strips: [],
            chars: info.columns.flatMap(c => c.chars).map(ch => ({ id: ch.id, char: ch.char, slot: ch.slot, pos: ch.pos, sub: ch.sub, bbox_col: ch.bbox ?? [0, 0, 0, 0] })),
        }],
    };
    const [url, setUrl] = useState('');
    useEffect(() => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d')!;
        g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 64, 64);
        setUrl(c.toDataURL('image/png'));
    }, []);
    const w = window as unknown as Record<string, unknown>;
    w.__image = { w: info.width, h: info.height };
    w.__trim = fullImageTrimRect(pageData);
    w.__boxes = info.columns.flatMap(c => c.chars).map(ch => ch.bbox).filter(Boolean);
    if (!url) return null;
    return (
        <div id="host" style={{ width: 600, height: 800 }}>
            <GujiWarpCanvas imageUrl={url} pageData={pageData} selectedCharIds={new Set()} preserveMargins={q.get('margins') === '1'} />
        </div>
    );
}

/**
 * 新图源（殿本 qiefen2）：1260×1920、本身已无空白的整图页。图上画了与字框同位置的黑框，字框全部选中（高亮）。
 * 坐标对得上＝高亮框正好罩住图上的黑框；?margins=1|0 对比保留／去空白。
 */
function TightCanvas() {
    const W = 1260, H = 1920;
    const boxes: [number, number, number, number][] = [];
    for (let c = 0; c < 8; c++) for (let r = 0; r < 12; r++) boxes.push([40 + c * 150, 40 + r * 150, 40 + c * 150 + 110, 40 + r * 150 + 110]);
    const pageData: PageWarpData = {
        page_id: 'p:1', title: '第1葉', image_size: [W, H], total_warped_w: W,
        columns: [{ col: 1, warped_w: W, warped_h: H, offset_x: 0, strips: [], chars: boxes.map((b, i) => ({ id: `1:1:${i}`, char: '字', slot: i, pos: i, bbox_col: b })) }],
    };
    const [url, setUrl] = useState('');
    useEffect(() => {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d')!;
        g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#222'; g.lineWidth = 6;
        for (const b of boxes) g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        setUrl(c.toDataURL('image/png'));
    }, []);
    if (!url) return null;
    return (
        <div id="host" style={{ width: 500, height: 760 }}>
            <GujiWarpCanvas imageUrl={url} pageData={pageData} selectedCharIds={new Set(boxes.map((_, i) => `1:1:${i}`))} preserveMargins={q.get('margins') === '1'} />
        </div>
    );
}

const App = () => (
    <LocaleProvider locale="zh-Hant">
        <style>{READER_CSS}</style>
        {scenario === 'text' && <Text />}
        {scenario === 'canvas' && <Canvas />}
        {scenario === 'canvas-tight' && <TightCanvas />}
    </LocaleProvider>
);

createRoot(document.getElementById('root')!).render(<App />);
// 挂好了：下一帧字体与布局稳定后测试再量
requestAnimationFrame(() => requestAnimationFrame(() => { (window as unknown as { __ready: boolean }).__ready = true; }));
