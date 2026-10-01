/**
 * 元数据首页样式（class 前缀 bim-mh-）。分区外壳、书架、四部、行列表沿用阅读首页的 bim-rh-*（同一套判准），
 * 这里只写元数据首页独有的：页首两栏与最近浏览、类型签、著录进度表、四库七阁格、时间轴、谱系卡、在线资源条、数据与授权。
 *
 * 边框、底色一律走 --bim-fr-* 版式令牌（overview 设计/v4/版式判准.md）：疏朗无框线、界栏有框，组件里不写死边框。
 * 断点同阅读首页：≥1080 宽屏，720–1079 中屏，≤719 手机。
 */
import { bim } from '../../styles/tokens';
import { READ_HOME_NARROW_QUERY } from '../read-home/read-home-css';

const MID_QUERY = '(max-width: 1079px)';
const COARSE_QUERY = `${READ_HOME_NARROW_QUERY}, (pointer: coarse)`;

export const META_HOME_CSS = `
/* ── 页首：检索（宿主插槽）＋类型签｜最近浏览 ── */
.bim-mh-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 360px); gap: 16px 48px; align-items: start; padding-top: 8px; }
.bim-mh-q { min-width: 0; }
.bim-mh-types { display: flex; flex-wrap: wrap; gap: 6px 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.bim-mh-types a {
  display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 10px;
  border: ${bim('fr-tag-bd')}; background: ${bim('fr-tag-bg')}; color: ${bim('quiet-fg')}; font-size: 13px;
}
.bim-mh-types a:hover { color: ${bim('accent')}; }
.bim-mh-types b { font-weight: 600; color: ${bim('ink')}; }
.bim-mh-types small { font-size: 11.5px; color: ${bim('aux-fg')}; }

.bim-mh-recent { min-width: 0; padding: 12px 14px 10px; border: ${bim('fr-rail-bd')}; background: ${bim('fr-rail-bg')}; }
.bim-mh-recent-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.bim-mh-recent-h h2 { margin: 0; font-size: 12px; font-weight: 400; letter-spacing: 0.16em; color: ${bim('meta-fg')}; }
.bim-mh-recent-h button {
  padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: ${bim('meta-fg')};
  text-decoration: underline; text-underline-offset: 3px;
}
.bim-mh-recent-h button:hover { color: ${bim('accent')}; }
.bim-mh-recent ol { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.bim-mh-recent li a {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: baseline;
  padding: ${bim('fr-row-pad')}; border-top: ${bim('fr-row-bd')}; color: ${bim('ink')}; font-size: 13.5px;
}
.bim-mh-recent li:first-child a { border-top: 0; }
.bim-mh-recent li a:hover { color: ${bim('accent')}; }
.bim-mh-recent li a > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bim-mh-recent li a small { font-size: 11.5px; color: ${bim('aux-fg')}; white-space: nowrap; }
.bim-mh-ty { font-style: normal; font-size: 11px; padding: 0 3px; border: ${bim('fr-tag-bd')}; background: ${bim('fr-tag-bg')}; color: ${bim('quiet-fg')}; }
.bim-mh-recent-empty { margin: 8px 0 4px; font-size: 12.5px; color: ${bim('meta-fg')}; }

/* ── 历代史志：书架下的著录进度表＋同类书目 ── */
.bim-mh-zhi { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 400px); gap: 28px 40px; align-items: start; margin-top: 32px; }
.bim-mh-tbl-wrap { overflow-x: auto; }
.bim-mh-tbl { width: 100%; border-collapse: collapse; border: ${bim('fr-tbl-cell-bd')}; font-size: 13px; font-variant-numeric: tabular-nums; }
.bim-mh-tbl caption { text-align: left; padding-bottom: 10px; font-size: 14px; font-weight: 600; letter-spacing: 0.12em; color: ${bim('ink')}; }
.bim-mh-tbl caption small { margin-left: 8px; font-weight: 400; font-size: 12px; letter-spacing: 0; color: ${bim('aux-fg')}; }
.bim-mh-tbl th {
  text-align: left; padding: 6px; border: ${bim('fr-tbl-cell-bd')}; background: ${bim('fr-tbl-zebra')};
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: ${bim('meta-fg')}; white-space: nowrap;
}
.bim-mh-tbl td { padding: 7px 6px; border: ${bim('fr-tbl-cell-bd')}; vertical-align: middle; color: ${bim('body-fg')}; }
.bim-mh-tbl tbody th {
  padding: 7px 6px; background: transparent; font-size: 13px; font-weight: 400; letter-spacing: 0; color: ${bim('ink')}; white-space: normal;
}
.bim-mh-tbl tbody tr:nth-child(even) > * { background: ${bim('fr-tbl-zebra')}; }
.bim-mh-tbl .bim-mh-r { text-align: right; }
.bim-mh-tbl tbody a { color: ${bim('ink')}; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 3px; }
.bim-mh-tbl tbody a:hover { color: ${bim('accent')}; }
.bim-mh-meter { display: flex; align-items: center; gap: 6px; min-width: 84px; }
.bim-mh-meter i { flex: 1; height: 4px; position: relative; background: ${bim('rule')}; }
.bim-mh-meter i::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--bimmh-w, 0%); background: ${bim('accent')}; }
.bim-mh-meter small { font-size: 12px; color: ${bim('meta-fg')}; }
.bim-mh-st { padding: 0 5px; font-size: 11.5px; white-space: nowrap; background: ${bim('warn-bg')}; color: ${bim('warn-fg')}; }
.bim-mh-st[data-st="done"] { background: ${bim('check-fine-bg')}; color: ${bim('check-fine-fg')}; }
.bim-mh-st[data-st="todo"] { background: ${bim('fr-tag-bg')}; color: ${bim('meta-fg')}; }

/* ── 丛编：四库七阁格＋分组 ── */
.bim-mh-ge { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin: 0 0 10px; padding: 0; list-style: none; }
.bim-mh-ge a {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px 8px; text-align: center;
  border: ${bim('fr-spine-bd')}; background: ${bim('fr-spine-bg')}; color: ${bim('ink')}; font-size: 15px; font-weight: 600; letter-spacing: 0.1em;
}
.bim-mh-ge a:hover { color: ${bim('accent')}; }
.bim-mh-ge small { font-size: 11px; font-weight: 400; letter-spacing: 0; color: ${bim('meta-fg')}; }
.bim-mh-cg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px 36px; margin-top: 24px; }
.bim-mh-cg > div { min-width: 0; }

/* ── 人物：时间轴（手机改列表） ── */
.bim-mh-tl-rows { position: relative; margin: 6px 0 0; padding: 0; list-style: none; }
.bim-mh-tl-bar { position: absolute; height: 22px; }
.bim-mh-tl-bar i { position: absolute; left: 0; top: 18px; height: 4px; min-width: 4px; background: ${bim('accent')}; }
.bim-mh-tl-bar a { position: relative; white-space: nowrap; font-size: 13px; color: ${bim('ink')}; }
.bim-mh-tl-bar a:hover { color: ${bim('accent')}; }
/* 靠右端的人：名字与卒年一头右对齐，往左排，免得出界 */
.bim-mh-tl-bar[data-end] a { position: absolute; right: 0; top: 0; }
.bim-mh-tl-bar small, .bim-mh-tl-list small { margin-left: 4px; font-size: 11.5px; color: ${bim('meta-fg')}; font-variant-numeric: tabular-nums; }
.bim-mh-tl-axis { position: relative; height: 26px; margin-top: 4px; border-top: ${bim('fr-axis-bd')}; }
.bim-mh-tl-axis::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: ${bim('fr-axis-band')}; background: ${bim('tint-bg')}; z-index: 0; }
.bim-mh-tl-axis span {
  position: absolute; z-index: 1; top: calc(${bim('fr-axis-band')} + 6px); transform: translateX(-50%);
  font-size: 11px; color: ${bim('meta-fg')}; white-space: nowrap; font-variant-numeric: tabular-nums;
}
.bim-mh-tl-axis span::before { content: ""; position: absolute; left: 50%; top: -6px; width: 1px; height: ${bim('fr-tick')}; background: ${bim('rule-strong')}; }
.bim-mh-tl-list { display: none; margin: 0; padding: 0; list-style: none; }
.bim-mh-tl-list[data-only] { display: flex; flex-direction: column; }
.bim-mh-tl-list a {
  display: grid; grid-template-columns: 5.5em minmax(0, 1fr); gap: 10px; align-items: baseline;
  padding: ${bim('fr-row-pad')}; border-top: ${bim('fr-row-bd')}; color: ${bim('ink')}; font-size: 14px;
}
.bim-mh-tl-list li:first-child a { border-top: 0; }
.bim-mh-tl-list a:hover { color: ${bim('accent')}; }
.bim-mh-tl-foot { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0 0; font-size: 12.5px; color: ${bim('meta-fg')}; }

/* ── 版本谱系卡 ── */
.bim-mh-lin { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.bim-mh-lin a {
  height: 100%; display: flex; flex-direction: column; gap: 6px; padding: 14px 16px;
  border: ${bim('fr-card-bd')}; background: ${bim('fr-card-bg')}; box-shadow: ${bim('fr-shadow')}; color: ${bim('ink')} !important;
}
.bim-mh-lin a:hover { background: ${bim('tint-bg')}; }
:root[data-layout="boxed"] .bim-mh-lin a:hover { background: ${bim('fr-card-bg')}; border-color: ${bim('accent')}; }
.bim-mh-lin svg { color: ${bim('accent')}; opacity: 0.55; }
.bim-mh-lin b { font-size: 16px; font-weight: 600; letter-spacing: 0.1em; }
.bim-mh-lin small { font-size: 12px; color: ${bim('meta-fg')}; }
.bim-mh-lin span { margin-top: auto; font-size: 12.5px; color: ${bim('accent')}; }

/* ── 在线资源 ── */
.bim-mh-cov { display: flex; flex-direction: column; gap: 10px; max-width: 860px; margin: 0; padding: 0; list-style: none; }
.bim-mh-cov li { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr) auto; gap: 12px; align-items: center; font-size: 13.5px; color: ${bim('ink')}; }
.bim-mh-cov a { color: ${bim('ink')}; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 3px; }
.bim-mh-cov a:hover { color: ${bim('accent')}; }
.bim-mh-cov .bim-mh-bar { height: 10px; position: relative; background: ${bim('rule')}; }
.bim-mh-cov .bim-mh-bar::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--bimmh-w, 0%); background: ${bim('accent')}; opacity: 0.7; }
.bim-mh-cov small { font-size: 12px; color: ${bim('meta-fg')}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bim-mh-todo { margin: 8px 0 0; font-size: 12.5px; color: ${bim('meta-fg')}; }

/* ── 数据与授权 ── */
.bim-mh-data { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap: 28px 40px; }
.bim-mh-data > div { min-width: 0; }
.bim-mh-nums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; margin: 0; padding: 0; list-style: none; }
.bim-mh-nums li { padding-top: 8px; border-top: ${bim('fr-row-bd')}; }
.bim-mh-nums b { display: block; font-size: 24px; font-weight: 600; letter-spacing: 0.02em; color: ${bim('ink')}; }
.bim-mh-nums span { font-size: 12px; color: ${bim('meta-fg')}; }
.bim-mh-loss { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.bim-mh-loss a {
  height: 100%; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px;
  border: ${bim('fr-card-bd')}; background: ${bim('fr-card-bg')}; color: ${bim('ink')}; font-size: 15px; font-weight: 600; letter-spacing: 0.2em;
}
.bim-mh-loss a:hover { color: ${bim('accent')}; }
.bim-mh-loss small { font-size: 12px; font-weight: 400; letter-spacing: 0; color: ${bim('meta-fg')}; }
.bim-mh-lic { display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.8; color: ${bim('body-fg')}; }
.bim-mh-lic p { margin: 0; }
.bim-mh-lic code { padding: 1px 5px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; background: ${bim('tint-bg')}; color: ${bim('ink')}; }
.bim-mh-cc0 { display: inline-block; margin-right: 8px; padding: 1px 7px; font-size: 11.5px; letter-spacing: 0.08em; background: ${bim('check-fine-bg')}; color: ${bim('check-fine-fg')}; }

/* ── 中屏 ── */
@media ${MID_QUERY} {
  .bim-mh-head, .bim-mh-zhi { grid-template-columns: minmax(0, 1fr); }
  .bim-mh-cg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bim-mh-lin { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .bim-mh-data { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .bim-mh-data > div:first-child { grid-column: 1 / -1; }
  .bim-mh-nums { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* ── 手机 ── */
@media ${READ_HOME_NARROW_QUERY} {
  .bim-mh-cg, .bim-mh-data { grid-template-columns: minmax(0, 1fr); }
  .bim-mh-ge { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .bim-mh-lin { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bim-mh-nums { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bim-mh-tl-rows, .bim-mh-tl-axis { display: none; }
  .bim-mh-tl-list { display: flex; flex-direction: column; }
  .bim-mh-tl-list small { margin-left: 0; }
  .bim-mh-cov li { grid-template-columns: minmax(0, 1fr) auto; }
  .bim-mh-cov .bim-mh-bar { grid-column: 1 / -1; grid-row: 2; }
}

@media ${COARSE_QUERY} {
  .bim-mh-recent li a, .bim-mh-types a, .bim-mh-tl-list a { min-height: 44px; align-items: center; }
  .bim-mh-recent-h button { min-height: 44px; }
}
`;
