/**
 * 阅读器样式（class 前缀 bim-rd-，避免与宿主站点冲突）。
 *
 * 响应式全用 media query 表达，JS 不读窗口宽度——服务端渲染的 HTML 与客户端首帧一致。
 * 断点：
 * - 宽屏 ≥ 1100px：目录是可收起的侧栏（默认展开），书影在正文左侧
 * - 中屏 720–1099px：目录改抽屉（默认收起），书影仍在左侧
 * - 窄屏 ≤ 719px：书影区不显示，只留正文；目录是抽屉
 *
 * 宿主若有吸顶导航，设 `--bim-reader-top`（如 60px），工具条与侧栏会让出这段高度。
 * 颜色一律走 --bim-*。
 */
import { bim } from '../../styles/tokens';

export const READER_WIDE_QUERY = '(min-width: 1100px)';
export const READER_NARROW_QUERY = '(max-width: 719px)';
/** 窄屏或触屏：工具条点击区扩到 44×44（INT Q4） */
const READER_COARSE_QUERY = `${READER_NARROW_QUERY}, (pointer: coarse)`;

const TOP = bim('reader-top');
const BAR_H = '48px';

export const READER_CSS = `
.bim-rd {
  position: relative;
  background: ${bim('page-bg')};
  color: ${bim('ink')};
  font-family: ${bim('font-ui')};
  --bimrd-bar-h: ${BAR_H};
}
.bim-rd *, .bim-rd *::before, .bim-rd *::after { box-sizing: border-box; }

/* 跳到正文：平时按标准 visually-hidden 收成 1px 并裁掉（任何宽度都不外露），
   获得焦点时才还原成左上角的按钮 */
.bim-rd-skip {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.bim-rd-skip:focus {
  left: 8px; top: 8px; z-index: 60;
  width: auto; height: auto; margin: 0; overflow: visible; clip: auto; clip-path: none;
  padding: 8px 14px; border-radius: 6px;
  background: ${bim('ink')}; color: ${bim('page-bg')} !important;
  font-size: 14px; text-decoration: none !important;
  outline: 2px solid ${bim('accent')}; outline-offset: 2px;
}

.bim-rd-sr {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ── 工具条：文字 + 图标，不画按钮外框 ── */
.bim-rd-bar {
  position: sticky; top: ${TOP}; z-index: 30;
  height: var(--bimrd-bar-h);
  display: flex; align-items: center; gap: 16px;
  padding: 0 20px;
  background: color-mix(in srgb, ${bim('page-bg')} 94%, transparent);
  backdrop-filter: blur(8px);
}
.bim-rd-ttl { min-width: 0; display: flex; align-items: baseline; gap: 10px; overflow: hidden; white-space: nowrap; }
.bim-rd-ttl b { font-size: 15px; font-weight: 700; letter-spacing: 0.06em; color: ${bim('ink')}; overflow: hidden; text-overflow: ellipsis; }
.bim-rd-ttl span { font-size: 13px; color: ${bim('meta-fg')}; overflow: hidden; text-overflow: ellipsis; }
.bim-rd-ttl b a { color: inherit; text-decoration: none; }
.bim-rd-ttl b a:hover { color: ${bim('accent')}; text-decoration: underline; text-underline-offset: 4px; }
.bim-rd-ttl .bim-rd-dot { flex: none; }
.bim-rd-ttl .bim-rd-dot::before { content: "·"; }
.bim-rd-ttl .bim-rd-cur { color: ${bim('ink')}; flex: none; }
.bim-rd-chk { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.bim-rd-chk input { margin: 0; accent-color: ${bim('accent')}; cursor: pointer; }
.bim-rd-rowhead {
  display: flex; gap: 8px; padding: 8px 10px; border-bottom: 1px solid ${bim('ink')};
  font-family: ${bim('font-ui')}; font-size: 11.5px; letter-spacing: 0.12em; color: ${bim('meta-fg')};
}
.bim-rd-entries .bim-rd-row:hover { background: ${bim('row-hover-bg')}; }
.bim-rd-wl {
  display: inline-block; margin-left: 12px; padding: 1px 8px; font-size: 11.5px; letter-spacing: 0; font-weight: 400; line-height: 1.7;
  background: ${bim('flag-bg')}; color: ${bim('accent')} !important; text-decoration: none !important; vertical-align: 2px; white-space: nowrap;
}
.bim-rd-wl:hover { background: ${bim('accent')}; color: ${bim('page-bg')} !important; }
.bim-rd-tools { margin-left: auto; display: flex; align-items: center; gap: 14px; font-size: 13px; color: ${bim('quiet-fg')}; flex: none; }
.bim-rd-tools .bim-rd-sep { width: 1px; height: 14px; background: ${bim('rule')}; }
.bim-rd-t {
  background: none; border: 0; margin: 0; padding: 6px 2px;
  font: inherit; color: inherit; cursor: pointer; line-height: 1;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.bim-rd-t:hover { color: ${bim('ink')}; }
.bim-rd-t[aria-pressed="true"], .bim-rd-t[aria-current="true"] { color: ${bim('accent')}; }
.bim-rd-t:disabled { opacity: 0.4; cursor: default; }
.bim-rd-t svg { flex: none; }
.bim-rd-t .bim-rd-on { color: ${bim('accent')}; font-weight: 700; }
.bim-rd-t .bim-rd-off { opacity: 0.55; }
.bim-rd-ver { position: relative; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.bim-rd-ver-short { display: none; }
.bim-rd-ver select {
  max-width: 16em; min-height: 32px; margin: 0; padding: 0 2px;
  background: none; border: 0; font: inherit; color: ${bim('ink')}; cursor: pointer;
  text-overflow: ellipsis;
}
.bim-rd :focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: 2px; border-radius: 3px; }

/* ── 主体：目录 | 书影 | 正文 ── */
.bim-rd-body {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: start;
  min-height: calc(100vh - ${TOP} - var(--bimrd-bar-h));
}

/* 目录：宽屏是侧栏 */
.bim-rd-toc {
  grid-column: 1;
  position: sticky; top: calc(${TOP} + var(--bimrd-bar-h));
  width: 248px; height: calc(100vh - ${TOP} - var(--bimrd-bar-h));
  overflow-y: auto; overscroll-behavior: contain;
  padding: 0 10px 40px;
  background: ${bim('sidebar-bg')};
}
.bim-rd[data-toc="closed"] .bim-rd-toc { display: none; }
.bim-rd-scrim { display: none; }
/* 目录标题与搜索框吸在目录顶上：长目录滚动时关闭键、搜索框不跟着滚走 */
.bim-rd-toc-top { position: sticky; top: 0; z-index: 1; padding-top: 16px; background: ${bim('sidebar-bg')}; }
.bim-rd-toc-head { display: flex; align-items: center; gap: 8px; margin: 0 8px 10px; min-height: 22px; font-size: 12px; letter-spacing: 0.15em; color: ${bim('meta-fg')}; }
.bim-rd-toc-head .bim-rd-t { margin-left: auto; letter-spacing: 0; }
.bim-rd-toc-search {
  display: block; width: 100%; margin: 0 0 12px;
  padding: 7px 10px; border-radius: 6px;
  border: 1px solid transparent; background: ${bim('bg')};
  color: ${bim('ink')}; font: inherit; font-size: 13px;
}
.bim-rd-toc-search:focus { border-color: ${bim('accent')}; outline: none; }
.bim-rd-toc ul { list-style: none; margin: 0; padding: 0; }
.bim-rd-toc li ul { padding-left: 14px; }
.bim-rd-ti {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 5px 10px; border: 0; border-radius: 6px; margin: 0;
  background: none; font: inherit; font-size: 13px; line-height: 1.5; text-align: left;
  color: ${bim('quiet-fg')}; cursor: pointer;
}
.bim-rd-ti:hover { background: ${bim('row-hover-bg')}; color: ${bim('ink')}; }
.bim-rd-ti[aria-current="true"] { background: ${bim('bg')}; color: ${bim('accent')}; font-weight: 700; box-shadow: inset 2px 0 0 ${bim('accent')}; }
.bim-rd-ti:disabled { opacity: 0.45; cursor: default; background: none; }
.bim-rd-ti .bim-rd-hint { margin-left: auto; font-size: 12px; font-weight: 400; color: ${bim('meta-fg')}; flex: none; }
.bim-rd-ti-group { font-weight: 600; color: ${bim('ink')}; }
.bim-rd-ti-group svg { transition: transform 0.15s; flex: none; align-self: center; }
.bim-rd-ti-group[aria-expanded="true"] svg { transform: rotate(90deg); }

/* 书影：正文左侧 */
.bim-rd-img {
  grid-column: 2;
  position: sticky; top: calc(${TOP} + var(--bimrd-bar-h));
  width: clamp(300px, 32vw, 560px); height: calc(100vh - ${TOP} - var(--bimrd-bar-h));
  padding: 16px 0 16px 20px;
  display: flex; flex-direction: column; gap: 8px;
}
.bim-rd[data-img="closed"] .bim-rd-img { display: none; }
.bim-rd-img-box {
  position: relative; flex: 1; min-height: 0; border-radius: 10px;
  background: ${bim('sidebar-bg')};
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.bim-rd-img-fig { position: relative; margin: 0; max-width: 100%; max-height: 100%; }
.bim-rd-img-fig img { display: block; max-width: 100%; max-height: calc(100vh - ${TOP} - var(--bimrd-bar-h) - 80px); object-fit: contain; }
.bim-rd-img-fig svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.bim-rd-img-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; text-align: center; font-size: 13px; color: ${bim('meta-fg')}; }
.bim-rd-img-empty b { font-size: 15px; font-weight: 500; color: ${bim('quiet-fg')}; }
.bim-rd-img-frame {
  width: 46%; aspect-ratio: 2 / 3; border-radius: 4px; margin-bottom: 10px;
  background: repeating-linear-gradient(90deg, transparent 0 22px, color-mix(in srgb, ${bim('ink')} 5%, transparent) 22px 24px), ${bim('bg')};
}
.bim-rd-img-pager { display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 13px; color: ${bim('quiet-fg')}; }

/* 右栏（v3）：正文列右侧 220px，≥860px 才显示，吸顶 */
.bim-rd-rail { display: none; }
@media (min-width: 860px) {
  .bim-rd-text[data-rail] { display: grid; grid-template-columns: minmax(0, 50em) 220px; gap: 40px; align-items: start; justify-content: start; }
  .bim-rd-text[data-rail] .bim-rd-col { margin: 0; max-width: none; }
  .bim-rd-rail { display: block; position: sticky; top: calc(var(--bimrd-bar-h) + 16px); max-height: calc(100vh - var(--bimrd-bar-h) - 32px); overflow-y: auto; font-family: ${bim('font-ui')}; }
}
.bim-rd-rail-card { padding: 12px 14px; background: ${bim('bg')}; border: 1px solid ${bim('rule')}; }
.bim-rd-rail-cap { font-size: 11.5px; letter-spacing: 0.16em; color: ${bim('label-fg')}; }
.bim-rd-rail-n { display: flex; align-items: baseline; gap: 8px; margin-top: 4px; }
.bim-rd-rail-n b { font-size: 22px; font-weight: 600; color: ${bim('ink')}; }
.bim-rd-rail-n span { font-size: 12px; color: ${bim('meta-fg')}; }
.bim-rd-rail-n .bim-rd-rail-linked { margin-left: auto; color: ${bim('accent')}; white-space: nowrap; }
.bim-rd-rail-bar { display: flex; height: 5px; margin-top: 8px; background: ${bim('rule')}; }
.bim-rd-rail-bar span { background: ${bim('accent')}; }
.bim-rd-rail-list { list-style: none; margin: 0; padding: 0; }
.bim-rd-rail-list a { display: flex; align-items: baseline; gap: 8px; padding: 5px 12px; border-left: 2px solid ${bim('rule')}; font-size: 13px; color: ${bim('quiet-fg')}; text-decoration: none; }
.bim-rd-rail-list a > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bim-rd-rail-list a:hover { border-left-color: ${bim('accent')}; color: ${bim('ink')}; }
.bim-rd-rail-acts { margin-top: 18px; padding-top: 14px; border-top: 1px solid ${bim('rule')}; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; font-size: 12.5px; }
.bim-rd-rail-report { padding: 0; border: none; background: none; font: inherit; color: ${bim('accent')}; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.bim-rd-rail-report:hover { color: ${bim('ink')}; }
.bim-rd-rail-dot { flex: none; align-self: center; width: 5px; height: 5px; background: ${bim('rule')}; }
.bim-rd-rail-dot.on { background: ${bim('accent')}; }

/* 正文 */
.bim-rd-text { grid-column: 3; min-width: 0; padding: 32px 48px 96px 40px; outline: none; }
/* 正文列靠左紧贴目录栏（原来居中，两边各留 ~150px 空隙），并加宽 38em → 50em */
.bim-rd-col { max-width: 50em; margin: 0 auto 0 0; font-size: var(--bimrd-fs, 18px); }
.bim-rd-h1 { font-family: ${bim('font-ui')}; font-size: 28px; font-weight: 700; letter-spacing: 0.12em; margin: 0; color: ${bim('ink')}; line-height: 1.4; }
.bim-rd-meta { margin: 6px 0 0; font-size: 13px; line-height: 1.8; color: ${bim('meta-fg')}; font-family: ${bim('font-ui')}; }
.bim-rd-meta .bim-rd-dot::before { content: "·"; margin: 0 0.5em; }
.bim-rd-grade { display: inline-block; margin-left: 6px; padding: 0 6px; font-size: 11.5px; line-height: 1.7; background: ${bim('band-bg')}; color: ${bim('quiet-fg')}; }
.bim-rd-meta select { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.bim-rd a.bim-rd-link { color: ${bim('quiet-fg')}; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.bim-rd a.bim-rd-link:hover { color: ${bim('accent')}; }
.bim-rd-views { display: flex; gap: 14px; margin-top: 10px; font-size: 13px; color: ${bim('quiet-fg')}; font-family: ${bim('font-ui')}; }
.bim-rd-state { padding: 32px 0; font-size: 14px; color: ${bim('meta-fg')}; font-family: ${bim('font-ui')}; }

/* 宋体正文：18px / 2.05，避头尾 */
.bim-rd-prose {
  margin-top: 28px;
  font-family: ${bim('font-reading')};
  line-height: 2.05;
  color: ${bim('ink')};
  text-align: justify;
  line-break: strict;
  hanging-punctuation: allow-end;
  overflow-wrap: break-word;
}
.bim-rd-prose p { margin: 0.5em 0; text-indent: 2em; }
.bim-rd-prose .bim-rd-noindent { text-indent: 0; }
.bim-rd-prose h2, .bim-rd-prose h3, .bim-rd-prose h4 { font-family: ${bim('font-reading')}; color: ${bim('ink')}; line-height: 1.6; letter-spacing: 0.04em; }
.bim-rd-prose h2 { font-size: 1.2em; font-weight: 700; margin: 1.6em 0 0.6em; }
.bim-rd-prose h3 { font-size: 1.06em; font-weight: 700; margin: 1.4em 0 0.3em; }
.bim-rd-prose h4 { font-size: 1em; font-weight: 700; margin: 1.2em 0 0.2em; }
.bim-rd-prose > :first-child { margin-top: 0; }
/* 标题标签按层级不跳级（h1 下先 h2，INT Q5），外观按 md 原层级走 class */
.bim-rd-prose .bim-rd-hl2 { font-size: 1.2em; font-weight: 700; margin: 1.6em 0 0.6em; }
.bim-rd-prose .bim-rd-hl3 { font-size: 1.06em; font-weight: 700; margin: 1.4em 0 0.3em; }
.bim-rd-prose .bim-rd-hl4 { font-size: 1em; font-weight: 700; margin: 1.2em 0 0.2em; }
.bim-rd-prose > .bim-rd-hl2:first-child, .bim-rd-prose > .bim-rd-hl3:first-child, .bim-rd-prose > .bim-rd-hl4:first-child { margin-top: 0; }
.bim-rd-prose .bim-rd-gap { height: 0.6em; }
.bim-rd-entry { margin-top: 1.6em; }
.bim-rd-entry .bim-rd-entry-h { margin: 0 !important; font-size: 1.06em; }
.bim-rd-entry .bim-rd-entry-h a { color: inherit !important; text-decoration: none; }
.bim-rd-entry .bim-rd-entry-h a:hover { color: ${bim('accent')} !important; text-decoration: underline; text-underline-offset: 4px; }
.bim-rd-entry .bim-rd-sub { font-family: ${bim('font-ui')}; font-size: 13px; color: ${bim('meta-fg')}; text-indent: 0; margin: 0.2em 0 0; }
.bim-rd-entry .bim-rd-lbl { font-family: ${bim('font-ui')}; font-size: 0.72em; letter-spacing: 0.1em; color: ${bim('meta-fg')}; margin-right: 0.6em; }
.bim-rd-prose strong { font-weight: 700; }

/* 专名线：书名加波浪线，书名号隐去（仍可复制） */
.bim-rd-pn {
  text-decoration-line: underline; text-decoration-style: wavy;
  text-decoration-thickness: 1px; text-underline-offset: 0.32em;
  text-decoration-color: ${bim('quiet-fg')};
  text-decoration-skip-ink: none;
}

/* 竖排（预留）：只在宿主打开 allowVertical 时可切换 */
.bim-rd-vertical .bim-rd-prose {
  writing-mode: vertical-rl; max-height: calc(100vh - ${TOP} - var(--bimrd-bar-h) - 120px);
  overflow-x: auto; text-align: start;
}

.bim-rd-src { margin: 48px 0 0; font-size: 12px; line-height: 1.8; color: ${bim('meta-fg')}; font-family: ${bim('font-ui')}; }
.bim-rd-src .bim-rd-dot::before { content: "·"; margin: 0 0.5em; }
.bim-rd-src + .bim-rd-rev { margin-top: 4px; }
.bim-rd-pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 48px; font-size: 14px; font-family: ${bim('font-ui')}; }
.bim-rd-pg {
  display: block; min-width: 0; margin: 0; padding: 14px 16px; text-align: left; font: inherit;
  border: 1px solid ${bim('rule')}; background: ${bim('bg')}; color: ${bim('ink')}; cursor: pointer;
}
button.bim-rd-pg:hover { border-color: ${bim('accent')}; }
.bim-rd-pg-next { text-align: right; }
.bim-rd-pg-end { cursor: default; font-size: 13px; color: ${bim('label-fg')}; background: none; border-style: dashed; }
.bim-rd-pgcap { display: block; font-size: 11.5px; color: ${bim('label-fg')}; }
.bim-rd-pg .bim-rd-pglabel { display: block; margin-top: 3px; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 长回目不能撑宽页面：两侧各占不超过一半，标题省略号截断（390 宽 scrollWidth 曾到 648） */
.bim-rd-pglabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bim-rd-refs { margin-top: 48px; font-size: 12px; line-height: 1.8; color: ${bim('meta-fg')}; font-family: ${bim('font-ui')}; }
.bim-rd-refs h2 { font-size: 12px; font-weight: 600; letter-spacing: 0.2em; margin: 0 0 6px; color: ${bim('meta-fg')}; }
.bim-rd-refs ol { margin: 0; padding-left: 1.6em; }

/* ── 点击区 ≥44×44（INT Q4）：伪元素向外扩，按钮外观与排布不变；
      A− A+ 挨着，两边各扩约 10px 会叠在一起，所以二者之间多留 12px ── */
@media ${READER_COARSE_QUERY} {
  .bim-rd-tools .bim-rd-t, .bim-rd-toc-head .bim-rd-t { position: relative; }
  .bim-rd-tools .bim-rd-t::after, .bim-rd-toc-head .bim-rd-t::after {
    content: ""; position: absolute; left: 50%; top: 50%;
    width: max(100%, 44px); height: max(100%, 44px); transform: translate(-50%, -50%);
  }
  .bim-rd-tools .bim-rd-fs + .bim-rd-fs { margin-left: 12px; }
  .bim-rd-ver select { min-height: 44px; }
  .bim-rd-pager .bim-rd-pg { min-height: 44px; }
}

/* ── 中屏以下：目录改抽屉 ── */
@media not all and ${READER_WIDE_QUERY} {
  .bim-rd-toc {
    position: fixed; z-index: 50; left: 0; top: 0; bottom: 0; height: auto;
    width: min(86vw, 320px);
    box-shadow: ${bim('shadow-dialog')};
  }
  .bim-rd[data-toc="auto"] .bim-rd-toc { display: none; }
  .bim-rd[data-toc="open"] .bim-rd-scrim {
    display: block; position: fixed; inset: 0; z-index: 45; background: ${bim('backdrop')};
  }
  .bim-rd-text { padding: 28px 32px 80px; }
}

/* ── 窄屏：书影收起，只留正文 ── */
@media ${READER_NARROW_QUERY} {
  .bim-rd-bar { padding: 0 12px; gap: 10px; }
  .bim-rd-ttl span, .bim-rd-hide-narrow { display: none !important; }
  .bim-rd-ttl { flex: 1 1 auto; }
  .bim-rd-tools { gap: 10px; }
  .bim-rd-ver { min-width: 44px; min-height: 44px; justify-content: center; }
  .bim-rd-ver-short { display: inline; white-space: nowrap; }
  .bim-rd-ver select { position: absolute; inset: 0; width: 100%; max-width: none; opacity: 0; }
  .bim-rd-ver:focus-within { outline: 2px solid ${bim('accent')}; outline-offset: 2px; border-radius: 3px; }
  .bim-rd-tlabel { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .bim-rd-img { display: none !important; }
  .bim-rd-body { grid-template-columns: minmax(0, 1fr); }
  .bim-rd-text { grid-column: 1; padding: 20px 16px 64px; }
  .bim-rd-h1 { font-size: 20px; letter-spacing: 0.06em; }
  .bim-rd-prose { margin-top: 20px; }
}

/* ── 版式「界栏」（v4）：正文列框起来，目录栏与侧栏加分隔线。<html data-layout="boxed"> 才生效 ── */
:root[data-layout="boxed"] .bim-rd-col { border: ${bim('fr-bd')}; background: ${bim('fr-bg')}; padding: 28px clamp(20px, 3vw, 40px) 36px; }
:root[data-layout="boxed"] .bim-rd-toc { border-right: ${bim('fr-bd')}; }
:root[data-layout="boxed"] .bim-rd-views { border-bottom: 1px solid ${bim('fr-tab-bd')}; padding-bottom: 0; }
:root[data-layout="boxed"] .bim-rd-rail-card { background: ${bim('fr-bg')}; }
:root[data-layout="boxed"] .bim-rd-pg { background: ${bim('fr-bg')}; }

/* ── 配色「墨」：强调色≈正文色，行内链接加下划线（条目名、参考文献、来源） ── */
:root[data-theme="ink"] :is(.bim-rd-entry-h a, .bim-rd-link, .bim-rd-prose a, .bim-rd-meta a) {
  text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 3px;
}
/* 墨下「已开启」的工具条按钮（自然段、专名线、书影、当前语言）不能只靠颜色：加下划线 */
:root[data-theme="ink"] .bim-rd-t[aria-pressed="true"], :root[data-theme="ink"] .bim-rd-t[aria-current="true"] {
  text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px;
}
`;
