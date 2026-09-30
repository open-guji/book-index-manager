/**
 * 古籍总目样式（class 前缀 bim-ct-，避免与宿主站点冲突）。
 *
 * 响应式全用 media query 表达，JS 不读窗口宽度——服务端渲染的 HTML 与客户端首帧一致。
 * 断点：
 * - 宽屏 ≥ 1200px：卡片 4 列
 * - 中屏 720–1199px：卡片 2 列；分类树仍在左栏
 * - 窄屏 ≤ 719px：卡片 1 列；分类树折成顶部抽屉
 *
 * 视觉与 N3a 详情页一致：黑体、暖纸底、朱色只用在当前项与悬停，卡片不画框、靠底色分块。
 */
import { bim } from '../../styles/tokens';

export const CATALOG_NARROW_QUERY = '(max-width: 719px)';
/** 触屏或窄屏：点击目标放大到 44px（Q5 巡检） */
const COARSE_QUERY = `${CATALOG_NARROW_QUERY}, (pointer: coarse)`;

export const CATALOG_CSS = `
.bim-ct {
  display: grid; grid-template-columns: 248px minmax(0, 1fr); column-gap: 32px; align-items: start;
  max-width: 1440px; margin: 0 auto; padding: 20px 32px 48px; box-sizing: border-box;
  background: ${bim('page-bg')}; color: ${bim('ink')}; font-family: ${bim('font-ui')};
}
.bim-ct *, .bim-ct *::before, .bim-ct *::after { box-sizing: border-box; }
.bim-ct-sr {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ── 左栏 ── */
.bim-ct-side { position: sticky; top: calc(${bim('reader-top')} + 16px); max-height: calc(100vh - ${bim('reader-top')} - 32px); overflow-y: auto; }
.bim-ct-side-h { margin: 0 0 8px; padding: 0 10px; font-size: 13px; font-weight: 600; letter-spacing: 0.12em; color: ${bim('aux-fg')}; }
.bim-ct-drawer-btn { display: none; }

/* ── 分类树 ── */
.bim-ct-tree, .bim-ct-tree ul { list-style: none; margin: 0; padding: 0; }
.bim-ct-tree li { outline: none; }
.bim-ct-row {
  display: flex; align-items: center; gap: 4px; min-height: 34px;
  padding: 0 10px 0 calc(var(--bimct-lv, 0) * 14px + 4px); border-radius: 6px;
  font-size: 14px; line-height: 1.4; color: ${bim('body-fg')}; cursor: pointer; user-select: none;
}
.bim-ct-row:hover { background: ${bim('row-hover-bg')}; color: ${bim('ink')}; }
.bim-ct-tree li[aria-selected="true"] > .bim-ct-row { background: ${bim('zebra-bg')}; color: ${bim('accent')}; font-weight: 700; }
.bim-ct-tree li:focus-visible > .bim-ct-row { outline: 2px solid ${bim('accent')}; outline-offset: -2px; }
.bim-ct-tw {
  flex: none; width: 20px; align-self: stretch; display: inline-flex; align-items: center; justify-content: center;
  color: ${bim('aux-fg')};
}
.bim-ct-tw svg { transition: transform 0.15s; }
.bim-ct-tree li[aria-expanded="true"] > .bim-ct-row .bim-ct-tw svg { transform: rotate(90deg); }
.bim-ct-lb { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.bim-ct-n { flex: none; margin-left: 8px; font-size: 12px; font-weight: 400; color: ${bim('aux-fg')}; font-variant-numeric: tabular-nums; }
.bim-ct-tree li[aria-selected="true"] > .bim-ct-row .bim-ct-n { color: ${bim('accent')}; }
.bim-ct-tree .bim-ct-last { margin-top: 6px; padding-top: 6px; border-top: 1px solid ${bim('rule')}; }

/* ── 右栏 ── */
.bim-ct-main { min-width: 0; }
.bim-ct-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 14px; }
.bim-ct-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.04em; color: ${bim('ink')}; }
.bim-ct-crumb { font-size: 13px; color: ${bim('aux-fg')}; }
.bim-ct-stat { font-size: 13px; color: ${bim('aux-fg')}; }
.bim-ct-search { margin: 0 0 16px; }
.bim-ct-view { margin-left: auto; display: inline-flex; border-radius: 6px; box-shadow: inset 0 0 0 1px ${bim('rule')}; overflow: hidden; }
.bim-ct-view button { min-height: 28px; padding: 0 12px; border: 0; background: none; cursor: pointer; font: inherit; font-size: 13px; color: ${bim('quiet-fg')}; }
.bim-ct-view button[aria-pressed="true"] { background: ${bim('flag-bg')}; color: ${bim('accent')}; font-weight: 700; }
.bim-ct-view button:focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: -2px; }

/* ── 卡片网格 ── */
.bim-ct-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.bim-ct-card { min-width: 0; }
.bim-ct-card > a {
  display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 44px;
  padding: 14px 16px 12px; border-radius: 8px;
  background: ${bim('card-bg')}; color: inherit; text-decoration: none;
  transition: background 0.12s;
}
.bim-ct-card > a:hover { background: ${bim('tint-bg')}; }
.bim-ct-card > a:hover .bim-ct-ct { color: ${bim('accent')}; }
.bim-ct-card > a:focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: 2px; }
.bim-ct-ch { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.bim-ct-ct { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.4; color: ${bim('ink')}; overflow-wrap: anywhere; }
.bim-ct-juan { flex: none; font-size: 12px; color: ${bim('aux-fg')}; }
.bim-ct-by { font-size: 13px; line-height: 1.5; color: ${bim('quiet-fg')}; overflow-wrap: anywhere; }
.bim-ct-dy { font-size: 12px; color: ${bim('aux-fg')}; }
.bim-ct-sum {
  margin: 0; font-size: 13px; line-height: 1.65; color: ${bim('body-fg')};
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden;
}
.bim-ct-cls { margin-top: auto; padding-top: 2px; font-size: 12px; color: ${bim('aux-fg')}; }
.bim-ct-empty { padding: 48px 0; text-align: center; font-size: 14px; color: ${bim('aux-fg')}; }

/* ── 列表视图 ── */
.bim-ct-list { list-style: none; margin: 0; padding: 0; }
.bim-ct-lrow:nth-child(odd) { background: ${bim('zebra-bg')}; border-radius: 6px; }
.bim-ct-lrow > a {
  display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) minmax(0, 2fr); gap: 4px 20px; align-items: baseline;
  min-height: 44px; padding: 10px 14px; color: inherit; text-decoration: none; border-radius: 6px;
}
.bim-ct-lrow > a:hover { background: ${bim('tint-bg')}; }
.bim-ct-lrow > a:hover .bim-ct-lt { color: ${bim('accent')}; }
.bim-ct-lrow > a:focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: -2px; }
.bim-ct-lt { font-size: 16px; font-weight: 700; color: ${bim('ink')}; overflow-wrap: anywhere; }
.bim-ct-lt .bim-ct-juan { margin-left: 8px; font-weight: 400; }
.bim-ct-lrow .bim-ct-cls { margin: 0; padding: 0; }

/* ── 分页 ── */
.bim-ct-pager { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; margin: 24px 0 0; font-size: 14px; }
.bim-ct-pager ol { display: contents; list-style: none; }
.bim-ct-pg {
  display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; padding: 0 10px;
  border: 0; border-radius: 6px; background: none; font: inherit; color: ${bim('body-fg')};
  text-decoration: none; cursor: pointer;
}
.bim-ct-pg:hover { background: ${bim('row-hover-bg')}; color: ${bim('accent')}; }
.bim-ct-pg:focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: 1px; }
.bim-ct-pg[aria-current="page"] { background: ${bim('zebra-bg')}; color: ${bim('accent')}; font-weight: 700; cursor: default; }
.bim-ct-pg[aria-disabled="true"], .bim-ct-pg:disabled { color: ${bim('aux-fg')}; opacity: 0.6; cursor: default; background: none; }
.bim-ct-gap { min-width: 24px; text-align: center; color: ${bim('aux-fg')}; }
.bim-ct-pg-of { display: none; padding: 0 12px; color: ${bim('body-fg')}; font-variant-numeric: tabular-nums; }

@media (max-width: 1199px) {
  .bim-ct-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media ${CATALOG_NARROW_QUERY} {
  .bim-ct { display: block; padding: 12px 16px 40px; }
  .bim-ct-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .bim-ct-lrow > a { grid-template-columns: minmax(0, 1fr); }
  .bim-ct-view button { min-height: 44px; }
  .bim-ct-side { position: static; max-height: none; overflow: visible; margin: 0 0 12px; }
  .bim-ct-side-h { display: none; }
  .bim-ct-drawer-btn {
    display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 14px;
    border: 0; border-radius: 8px; background: ${bim('tint-bg')};
    font: inherit; font-size: 14px; color: ${bim('ink')}; text-align: left; cursor: pointer;
  }
  .bim-ct-drawer-btn span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bim-ct-drawer-btn svg { flex: none; transition: transform 0.15s; color: ${bim('aux-fg')}; }
  .bim-ct-drawer-btn[aria-expanded="true"] svg { transform: rotate(180deg); }
  .bim-ct-drawer-btn:focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: 2px; }
  .bim-ct-drawer { margin-top: 6px; padding: 6px; border-radius: 8px; background: ${bim('card-bg')}; max-height: 70vh; overflow-y: auto; }
  .bim-ct[data-drawer="closed"] .bim-ct-drawer { display: none; }
  .bim-ct-title { font-size: 18px; }
  .bim-ct-pager { flex-wrap: nowrap; justify-content: space-between; }
  .bim-ct-pager ol { display: none; }
  .bim-ct-pg-of { display: inline; }
}

/* 点击目标 ≥44px（Q5）：触屏与窄屏 */
@media ${COARSE_QUERY} {
  .bim-ct-row { min-height: 44px; }
  .bim-ct-tw { width: 44px; }
  .bim-ct-pg { min-width: 44px; height: 44px; }
}

/* ── 版式「界栏」（v4）：<html data-layout="boxed"> 才生效；值走 --bim-fr-* 令牌 ── */
:root[data-layout="boxed"] .bim-ct-side { border: ${bim('fr-bd')}; background: ${bim('fr-bg')}; padding: 14px 8px; }
:root[data-layout="boxed"] .bim-ct-head { padding: ${bim('fr-hd-pad')}; border: ${bim('fr-bd')}; border-bottom: ${bim('fr-hd-bd')}; background: ${bim('fr-bg')}; margin: 0; }
:root[data-layout="boxed"] .bim-ct-main > .bim-ct-search { margin-top: 14px; }
`;
