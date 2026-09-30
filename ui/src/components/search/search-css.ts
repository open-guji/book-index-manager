/**
 * 搜索页 v4 样式（class 前缀 bim-sr-）：左栏筛选、结果工具行、表格、翻页。
 *
 * 全走 --bim-* 令牌；版式读 --bim-fr-*（界栏有框线，疏朗零变化）；墨配色下选中态靠描边／勾／字重，
 * 不只靠颜色。窄屏（≤719px）：筛选收成一个按钮展开，表格退成两行、不横向溢出。
 */
import { bim } from '../../styles/tokens';

export const SEARCH_NARROW_QUERY = '(max-width: 719px)';
const COARSE = `${SEARCH_NARROW_QUERY}, (pointer: coarse)`;

export const SEARCH_V4_CSS = `
.bim-sr-layout { display: grid; grid-template-columns: 208px minmax(0, 1fr); column-gap: 40px; align-items: start; padding: 0 20px; }
.bim-sr-layout[data-nofilters] { grid-template-columns: minmax(0, 1fr); }
.bim-sr-aside { position: sticky; top: calc(${bim('reader-top')} + 16px); padding-top: 2px; }
.bim-sr-main { min-width: 0; }
.bim-sr-fbtn { display: none; }
.bim-sr-filters { display: flex; flex-direction: column; gap: 22px; border: ${bim('fr-bd')}; background: ${bim('fr-bg')}; padding: ${bim('fr-bd-pad')}; }
.bim-sr-fg > h3 { margin: 0 0 8px; font-size: 11.5px; font-weight: 400; letter-spacing: .2em; color: ${bim('aux-fg')}; }
.bim-sr-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.bim-sr-chip {
  padding: 3px 9px; border: 1px solid ${bim('rule')}; background: ${bim('card-bg')}; color: ${bim('quiet-fg')};
  cursor: pointer; font: inherit; font-size: 12.5px; white-space: nowrap;
}
.bim-sr-chip:hover { border-color: ${bim('rule-dashed')}; color: ${bim('ink')}; }
.bim-sr-chip[aria-pressed="true"] { background: ${bim('accent')}; border-color: ${bim('accent')}; color: ${bim('page-bg')}; font-weight: 600; }
.bim-sr-chip[aria-pressed="true"]::before { content: "✓ " / ""; font-size: 10px; }
.bim-sr-opt { display: flex; align-items: center; gap: 8px; padding: 5px 2px; font-size: 13.5px; color: ${bim('quiet-fg')}; cursor: pointer; }
.bim-sr-opt input { margin: 0; width: 14px; height: 14px; accent-color: ${bim('accent')}; cursor: pointer; }
.bim-sr-opt:has(input:checked) { color: ${bim('ink')}; font-weight: 600; }
.bim-sr-seg { display: flex; border: 1px solid ${bim('rule')}; }
.bim-sr-seg button { flex: 1; padding: 5px 0; border: 0; background: ${bim('card-bg')}; color: ${bim('meta-fg')}; cursor: pointer; font: inherit; font-size: 12.5px; }
.bim-sr-seg button + button { border-left: 1px solid ${bim('rule')}; }
.bim-sr-seg button[aria-pressed="true"] { background: ${bim('flag-bg')}; color: ${bim('accent')}; font-weight: 700; box-shadow: inset 0 -2px 0 ${bim('accent')}; }
.bim-sr-clear { align-self: flex-start; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12.5px; color: ${bim('accent')}; text-decoration: underline; text-underline-offset: 3px; }
.bim-sr-note { margin: 0; font-size: 11.5px; line-height: 1.6; color: ${bim('aux-fg')}; }
.bim-sr-chips-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px 0 0; }
.bim-sr-chips-row .bim-sr-count { font-size: 12px; color: ${bim('meta-fg')}; margin-right: 4px; }
.bim-sr-tag-x { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 0; background: ${bim('flag-bg')}; color: ${bim('accent')}; cursor: pointer; font: inherit; font-size: 12px; }
.bim-sr-tag-x span { font-size: 13px; opacity: .7; }
.bim-sr-tools { display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin: 10px 0 0; font-size: 12.5px; }
.bim-sr-sorts { display: flex; align-items: center; gap: 14px; }
.bim-sr-sorts button { padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12.5px; color: ${bim('meta-fg')}; }
.bim-sr-sorts button[aria-pressed="true"] { color: ${bim('ink')}; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
.bim-sr-vsep { width: 1px; height: 14px; background: ${bim('rule')}; }
.bim-sr-view { display: inline-flex; border: 1px solid ${bim('rule')}; }
.bim-sr-view button { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border: 0; background: transparent; color: ${bim('meta-fg')}; cursor: pointer; font: inherit; font-size: 12px; }
.bim-sr-view button + button { border-left: 1px solid ${bim('rule')}; }
.bim-sr-view button[aria-pressed="true"] { background: ${bim('flag-bg')}; color: ${bim('accent')}; font-weight: 700; }

/* 表格 */
.bim-sr-tablewrap { margin-top: 14px; border: ${bim('fr-bd')}; background: ${bim('fr-bg')}; overflow-x: auto; }
.bim-sr-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13.5px; line-height: 1.5; }
.bim-sr-table th { padding: 7px 12px; border-bottom: 1px solid ${bim('rule-strong')}; font-size: 11.5px; font-weight: 400; letter-spacing: .12em; text-align: left; white-space: nowrap; color: ${bim('meta-fg')}; }
.bim-sr-table td { padding: 8px 12px; border-bottom: 1px solid ${bim('rule')}; vertical-align: baseline; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: ${bim('meta-fg')}; }
.bim-sr-table tbody tr:hover td { background: ${bim('row-hover-bg')}; }
.bim-sr-table td.bim-sr-c-title { font-size: 13.5px; font-weight: 500; }
.bim-sr-table td.bim-sr-c-title a { color: ${bim('ink')}; text-decoration: none; }
.bim-sr-table td.bim-sr-c-title a:hover { color: ${bim('accent')}; text-decoration: underline; text-underline-offset: 3px; }
.bim-sr-table .bim-sr-sub { display: none; }
.bim-sr-tl { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.bim-sr-tl a { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.bim-sr-table .bim-sr-measure { flex: none; font-size: 11.5px; font-weight: 400; color: ${bim('aux-fg')}; }
.bim-sr-c-type { display: table-cell; }
.bim-sr-c-res { text-align: right; }
.bim-sr-tag { display: inline-block; margin-left: 4px; padding: 0 6px; font-size: 10.5px; line-height: 18px; white-space: nowrap; background: ${bim('zebra-bg')}; color: ${bim('quiet-fg')}; }
.bim-sr-tag--img { background: ${bim('flag-bg')}; color: ${bim('accent')}; }
.bim-sr-tag--lost { background: none; box-shadow: inset 0 0 0 1px ${bim('rule')}; color: ${bim('aux-fg')}; }
.bim-sr-hl { background: ${bim('selection-bg')}; color: ${bim('ink')}; padding: 0 1px; }

/* 翻页 */
.bim-sr-pager { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin: 22px 0 0; font-size: 13px; }
.bim-sr-pager .bim-sr-info { font-size: 12px; color: ${bim('aux-fg')}; }
.bim-sr-pager ul { display: flex; align-items: center; gap: 4px; list-style: none; margin: 0; padding: 0; }
.bim-sr-pager button { min-width: 32px; padding: 5px 10px; border: 0; background: none; cursor: pointer; font: inherit; color: ${bim('quiet-fg')}; }
.bim-sr-pager button[aria-current="page"] { background: ${bim('flag-bg')}; color: ${bim('accent')}; font-weight: 700; box-shadow: inset 0 -2px 0 ${bim('accent')}; }
.bim-sr-pager button:disabled { color: ${bim('label-fg')}; cursor: default; opacity: .6; }
.bim-sr-pager .bim-sr-gap { color: ${bim('aux-fg')}; padding: 0 2px; }
.bim-sr-empty { padding: 60px 0; text-align: center; font-size: 14px; color: ${bim('meta-fg')}; }

@media ${SEARCH_NARROW_QUERY} {
  .bim-sr-layout { grid-template-columns: minmax(0, 1fr); row-gap: 16px; padding: 0 16px; }
  .bim-sr-aside { position: static; }
  .bim-sr-fbtn {
    display: flex; width: 100%; justify-content: space-between; align-items: center; padding: 11px 14px;
    border: 1px solid ${bim('rule')}; background: ${bim('card-bg')}; cursor: pointer; font: inherit; font-size: 14px; color: ${bim('ink')};
  }
  .bim-sr-fbtn .bim-sr-fn { margin-left: 8px; font-size: 12px; color: ${bim('accent')}; }
  .bim-sr-fbtn .bim-sr-fa { font-size: 11px; color: ${bim('aux-fg')}; }
  .bim-sr-filters[data-collapsed] { display: none; }
  .bim-sr-filters { margin-top: 8px; padding: 14px; border: 1px solid ${bim('rule')}; background: ${bim('card-bg')}; }
  .bim-sr-table thead { display: none; }
  .bim-sr-table, .bim-sr-table tbody, .bim-sr-table tr, .bim-sr-table td { display: block; width: 100%; box-sizing: border-box; }
  .bim-sr-table td { padding: 0 12px; border-bottom: 0; white-space: normal; }
  .bim-sr-table tr { padding: 8px 0; border-bottom: 1px solid ${bim('rule')}; }
  .bim-sr-table td.bim-sr-c-title { padding-top: 2px; }
  .bim-sr-table td.bim-sr-c-type, .bim-sr-table td.bim-sr-c-who, .bim-sr-table td.bim-sr-c-era, .bim-sr-table td.bim-sr-c-cls { display: none; }
  .bim-sr-table .bim-sr-sub { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: ${bim('meta-fg')}; }
  .bim-sr-table td.bim-sr-c-res { text-align: left; padding-bottom: 2px; }
  .bim-sr-table td.bim-sr-c-res:empty { display: none; }
}
@media ${COARSE} {
  .bim-sr-chip { min-height: 36px; }
  .bim-sr-opt { min-height: 44px; }
  .bim-sr-seg button { min-height: 44px; }
  .bim-sr-view button { min-height: 44px; }
  .bim-sr-sorts button { min-height: 44px; padding: 0 4px; }
  .bim-sr-pager button { min-height: 44px; min-width: 44px; }
  .bim-sr-clear, .bim-sr-tag-x { min-height: 44px; }
}

/* 界栏：结果表格、筛选、翻页条读 --bim-fr-* 令牌（疏朗＝无框，下面不生效） */
:root[data-layout="boxed"] .bim-sr-filters { border: ${bim('fr-bd')}; }
:root[data-layout="boxed"] .bim-sr-table th { background: ${bim('fr-bg')}; }
/* 墨：强调色≈正文色，标题链接另加下划线 */
:root[data-theme="ink"] .bim-sr-table td.bim-sr-c-title a { text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 3px; }
`;
