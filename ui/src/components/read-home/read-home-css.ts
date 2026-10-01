/**
 * 阅读首页样式（class 前缀 bim-rh-，避免与宿主站点冲突）。
 *
 * 颜色、边框、间距全走 --bim-* 令牌：3 套配色（朱砂／靛青／墨，<html data-theme>）与
 * 2 种版式（疏朗／界栏，<html data-layout>）由令牌切换，这里不写死颜色。
 * 响应式全用 media query，JS 不读窗口宽度——服务端渲染的 HTML 与客户端首帧一致。
 * 断点同设计稿：≥1080 宽屏，720–1079 中屏，≤719 手机。
 */
import { bim } from '../../styles/tokens';

export const READ_HOME_NARROW_QUERY = '(max-width: 719px)';
const MID_QUERY = '(max-width: 1079px)';
const COARSE_QUERY = `${READ_HOME_NARROW_QUERY}, (pointer: coarse)`;

/** 年代带 5 档底色：0–3 浅底墨字，4 深底纸色字（见 model.periodLevel） */
const BAND_MIX = [8, 18, 30, 42, 88];

export const READ_HOME_CSS = `
.bim-rh { color: ${bim('ink')}; font-family: ${bim('font-ui')}; font-size: 14px; line-height: 1.6; }
.bim-rh *, .bim-rh *::before, .bim-rh *::after { box-sizing: border-box; }
.bim-rh a { color: ${bim('accent')}; text-decoration: none; }
.bim-rh a:hover { color: ${bim('accent-deep')}; }
.bim-rh :focus-visible { outline: 2px solid ${bim('accent')}; outline-offset: 2px; }
.bim-rh-num { font-variant-numeric: tabular-nums; }
.bim-rh-sr {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ── 统计 ── */
.bim-rh-stats { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 26px; font-size: 12.5px; color: ${bim('meta-fg')}; }
.bim-rh-stats b { color: ${bim('ink')}; font-weight: 600; font-size: 20px; margin-right: 4px; }

/* ── 分区导航（手机吸顶） ── */
.bim-rh-secnav {
  position: sticky; top: ${bim('reader-top')}; z-index: 10;
  background: color-mix(in srgb, ${bim('page-bg')} 94%, transparent); backdrop-filter: blur(6px);
  border-block: 1px solid ${bim('rule')};
}
.bim-rh-secnav ul { display: flex; gap: 4px 22px; margin: 0; padding: 10px 0; list-style: none; overflow-x: auto; scrollbar-width: none; }
.bim-rh-secnav a { display: inline-block; font-size: 13px; color: ${bim('quiet-fg')}; white-space: nowrap; }
.bim-rh-secnav a:hover { color: ${bim('accent')}; }

/* ── 分区通用：疏朗靠留白，界栏加外框（--bim-fr-*） ── */
.bim-rh-main { display: flex; flex-direction: column; gap: ${bim('fr-gap')}; padding: 40px 0 72px; }
.bim-rh-sec { min-width: 0; border: ${bim('fr-bd')}; background: ${bim('fr-bg')}; scroll-margin-top: calc(${bim('reader-top')} + 56px); }
.bim-rh-hd {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px;
  padding: ${bim('fr-hd-pad')}; border-bottom: ${bim('fr-hd-bd')}; margin-bottom: 18px;
}
:root[data-layout="boxed"] .bim-rh-hd { margin-bottom: 0; }
.bim-rh-hd h2 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.1em; color: ${bim('ink')}; }
.bim-rh-hd .bim-rh-sub { font-size: 13px; color: ${bim('meta-fg')}; }
.bim-rh-hd .bim-rh-more { margin-left: auto; font-size: 13px; white-space: nowrap; }
.bim-rh-bd { min-width: 0; padding: ${bim('fr-bd-pad')}; }
.bim-rh-gt { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; font-size: 14px; font-weight: 600; letter-spacing: 0.12em; color: ${bim('ink')}; }
.bim-rh-gt small { font-weight: 400; font-size: 12px; color: ${bim('aux-fg')}; letter-spacing: 0; }

/* ── 推荐阅读：题签卡 ── */
.bim-rh-picks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.bim-rh-picks > li { min-width: 0; display: flex; }
.bim-rh-pk {
  flex: 1; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; padding: 20px 20px 18px;
  background: ${bim('card-bg')}; border: 1px solid ${bim('rule')}; box-shadow: ${bim('fr-shadow')};
  color: ${bim('ink')} !important;
}
.bim-rh-pk:hover { border-color: ${bim('accent')}; }
.bim-rh-slip {
  display: flex; flex-direction: column; align-items: center; gap: 2px; width: 34px; align-self: start;
  min-height: 132px; max-height: 190px; overflow: hidden; padding: 12px 0;
  border: 1px solid ${bim('rule-accent-soft')}; background: ${bim('flag-bg')}; color: ${bim('accent-deep')};
  font-size: 15px; font-weight: 600; line-height: 1.2;
}
.bim-rh-pk-body { min-width: 0; display: flex; flex-direction: column; }
.bim-rh-badge { align-self: flex-start; padding: 1px 7px; border: 1px solid ${bim('rule-dashed')}; font-size: 11.5px; letter-spacing: 0.06em; color: ${bim('quiet-fg')}; white-space: nowrap; }
.bim-rh-pk h3 { margin: 8px 0 0; font-size: 18px; font-weight: 600; letter-spacing: 0.06em; line-height: 1.45; color: ${bim('ink')}; }
.bim-rh-pk .bim-rh-by { margin-top: 3px; font-size: 12.5px; color: ${bim('meta-fg')}; }
.bim-rh-pk p { margin: 10px 0 0; font-size: 13.5px; line-height: 1.9; color: ${bim('body-fg')}; }
.bim-rh-go { margin-top: auto; padding-top: 12px; font-size: 13px; color: ${bim('accent')}; }

/* ── 专题：史志书架 ── */
.bim-rh-shelf-wrap { overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
.bim-rh-shelf { display: flex; align-items: flex-end; gap: 14px; min-width: max-content; margin: 0; padding: 4px 2px 0; list-style: none; border-bottom: 3px solid ${bim('quiet-fg')}; }
.bim-rh-era { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.bim-rh-era > span { font-size: 12px; color: ${bim('meta-fg')}; letter-spacing: 0.1em; white-space: nowrap; padding: 0 2px; border-bottom: 1px solid ${bim('rule-dashed')}; }
.bim-rh-spines { display: flex; align-items: flex-end; gap: 3px; margin: 0; padding: 0; list-style: none; }
.bim-rh-spine {
  width: 30px; padding: 10px 0; display: flex; flex-direction: column; align-items: center; gap: 1px;
  font-size: 13px; line-height: 1.15; border: 1px solid ${bim('rule-accent-soft')}; background: ${bim('card-bg')};
  color: ${bim('body-fg')} !important;
}
.bim-rh-spine:hover { border-color: ${bim('accent')}; color: ${bim('accent')} !important; }
.bim-rh-spine[data-orig] { background: ${bim('accent')}; border-color: ${bim('accent')}; color: ${bim('page-bg')} !important; }
.bim-rh-spine[data-orig]:hover { background: ${bim('accent-deep')}; color: ${bim('page-bg')} !important; }
.bim-rh-spine .bim-rh-n { margin-top: auto; padding-top: 6px; font-size: 11px; letter-spacing: 0; }
.bim-rh-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 12px; font-size: 12px; color: ${bim('meta-fg')}; }
.bim-rh-legend i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px; border: 1px solid ${bim('rule-accent-soft')}; background: ${bim('card-bg')}; }
.bim-rh-legend i[data-orig] { background: ${bim('accent')}; border-color: ${bim('accent')}; }

/* ── 专题：分组列表 ── */
.bim-rh-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px 40px; }
.bim-rh-shelf-box + .bim-rh-groups { margin-top: 32px; }
.bim-rh-grp { min-width: 0; }
.bim-rh-rows { margin: 0; padding: 0; list-style: none; }
.bim-rh-rows a {
  display: flex; align-items: baseline; gap: 10px; min-width: 0; min-height: 36px; padding: 8px 2px;
  border-top: 1px solid ${bim('rule')}; color: ${bim('ink')}; font-size: 14px;
}
.bim-rh-rows li:last-child a { border-bottom: 1px solid ${bim('rule')}; }
.bim-rh-rows a:hover { color: ${bim('accent')}; }
.bim-rh-rows .bim-rh-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bim-rh-rows small { margin-left: auto; flex: none; font-size: 12px; color: ${bim('aux-fg')}; white-space: nowrap; }
.bim-rh-cnt { flex: none; padding: 0 4px; border: 1px solid ${bim('rule-dashed')}; font-size: 11px; font-style: normal; color: ${bim('meta-fg')}; }
.bim-rh-expand { display: none; margin-top: 8px; padding: 0; border: 0; background: none; font: inherit; font-size: 12.5px; color: ${bim('accent')}; cursor: pointer; }

/* ── 名著与版本 ── */
.bim-rh-works { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.bim-rh-wk { min-width: 0; height: 100%; display: flex; flex-direction: column; gap: 10px; padding: 18px 20px 16px; border: 1px solid ${bim('rule')}; background: ${bim('card-bg')}; }
.bim-rh-wk-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.bim-rh-wk-h h3 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 0.08em; color: ${bim('ink')}; }
.bim-rh-wk-h .bim-rh-by { font-size: 12.5px; color: ${bim('meta-fg')}; }
.bim-rh-wk-h .bim-rh-c { margin-left: auto; font-size: 12px; color: ${bim('aux-fg')}; white-space: nowrap; }
.bim-rh-lin { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; }
.bim-rh-lin > small { flex: none; width: 4.5em; font-size: 12px; color: ${bim('aux-fg')}; letter-spacing: 0.05em; }
.bim-rh-chip {
  display: inline-flex; align-items: center; min-height: 30px; padding: 3px 10px; white-space: nowrap;
  border: 1px solid ${bim('rule-dashed')}; background: ${bim('page-bg')}; color: ${bim('body-fg')} !important; font-size: 13px;
}
.bim-rh-chip:hover { border-color: ${bim('accent')}; color: ${bim('accent')} !important; }
.bim-rh-wk-f { margin-top: auto; padding-top: 8px; border-top: 1px dashed ${bim('rule')}; font-size: 12.5px; }

/* ── 四部 ── */
.bim-rh-bu { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.bim-rh-bu-c { min-width: 0; border-top: 3px solid ${bim('ink')}; padding-top: 12px; }
:root[data-layout="boxed"] .bim-rh-bu-c { border: ${bim('fr-bd')}; border-top: 3px solid ${bim('ink')}; padding: 12px 14px 14px; background: ${bim('page-bg')}; }
.bim-rh-bu-h { display: flex; align-items: baseline; gap: 10px; color: ${bim('ink')} !important; }
.bim-rh-bu-h b { font-size: 26px; font-weight: 600; letter-spacing: 0.2em; }
.bim-rh-bu-h span { margin-left: auto; font-size: 13px; color: ${bim('meta-fg')}; }
.bim-rh-bu-l { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.bim-rh-bu-l a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 5px 0; color: ${bim('body-fg')}; font-size: 13.5px; }
.bim-rh-bu-l a:hover { color: ${bim('accent')}; }
.bim-rh-bu-l small { font-size: 12px; color: ${bim('aux-fg')}; }
.bim-rh-bar { grid-column: 1 / -1; position: relative; height: 3px; background: ${bim('rule')}; }
.bim-rh-bar::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--bimrh-w, 0%); background: ${bim('rule-accent-soft')}; }
.bim-rh-bu-more { display: inline-block; margin-top: 8px; font-size: 12.5px; }
.bim-rh-uncl { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin-top: 18px; padding: 12px 14px; border: 1px dashed ${bim('rule-dashed')}; font-size: 13px; color: ${bim('meta-fg')}; }
.bim-rh-uncl b { color: ${bim('body-fg')}; font-weight: 500; }
.bim-rh-uncl a { margin-left: auto; }

/* ── 按年代：比例横带（手机改格子） ── */
.bim-rh-band { display: flex; height: 64px; margin: 0; padding: 0; list-style: none; border: 1px solid ${bim('rule-dashed')}; overflow: hidden; }
.bim-rh-band > li { min-width: 0; display: flex; }
.bim-rh-band > li + li { border-left: 1px solid ${bim('page-bg')}; }
.bim-rh-band a {
  flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 8px; overflow: hidden;
  color: ${bim('ink')} !important; font-size: 13px;
}
${BAND_MIX.map((p, i) => `.bim-rh-band a[data-k="${i}"] { background: color-mix(in srgb, ${bim('accent')} ${p}%, ${bim('card-bg')}); }`).join('\n')}
.bim-rh-band a[data-k="4"] { color: ${bim('page-bg')} !important; }
.bim-rh-band a:hover { outline: 2px solid ${bim('ink')}; outline-offset: -2px; }
.bim-rh-band .bim-rh-pl { white-space: nowrap; font-weight: 500; letter-spacing: 0.06em; overflow: hidden; text-overflow: ellipsis; }
.bim-rh-band small { white-space: nowrap; font-size: 11.5px; }
.bim-rh-band .bim-rh-pl-s { display: none; }
.bim-rh-band a[data-narrow] .bim-rh-pl, .bim-rh-band a[data-narrow] small { display: none; }
.bim-rh-band a[data-narrow] .bim-rh-pl-s { display: block; font-weight: 500; }
.bim-rh-pfoot { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12px; color: ${bim('aux-fg')}; }

/* ── 单篇诗文 ── */
.bim-rh-authors { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 26px 32px; margin: 0; padding: 0; list-style: none; }
.bim-rh-au { min-width: 0; }
.bim-rh-au-h { display: flex; align-items: baseline; gap: 8px; margin: 0; padding-bottom: 6px; border-bottom: 1px solid ${bim('quiet-fg')}; font-size: 16px; font-weight: 600; letter-spacing: 0.1em; color: ${bim('ink')}; }
.bim-rh-au-h span { font-size: 12px; font-weight: 400; letter-spacing: 0; color: ${bim('meta-fg')}; }
.bim-rh-au-h small { margin-left: auto; font-size: 12px; font-weight: 400; letter-spacing: 0; color: ${bim('aux-fg')}; }
.bim-rh-au ul { list-style: none; margin: 6px 0 0; padding: 0; }
.bim-rh-au li a { display: block; padding: 4px 0; font-size: 14px; color: ${bim('body-fg')}; }
.bim-rh-au li a:hover { color: ${bim('accent')}; }
.bim-rh-au .bim-rh-more { display: inline-block; margin-top: 4px; font-size: 12.5px; }

/* ── 配色「墨」：强调色≈正文色，行内文字链接加下划线 ── */
:root[data-theme="ink"] :is(.bim-rh-go, .bim-rh-more, .bim-rh-bu-more, .bim-rh-wk-f a, .bim-rh-uncl a, .bim-rh-expand) {
  text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 3px;
}

/* ── 中屏 ── */
@media ${MID_QUERY} {
  .bim-rh-picks, .bim-rh-works, .bim-rh-groups, .bim-rh-bu { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bim-rh-authors { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

/* ── 手机 ── */
@media ${READ_HOME_NARROW_QUERY} {
  .bim-rh-main { padding-top: 24px; }
  .bim-rh-stats { gap: 4px 18px; }
  .bim-rh-stats b { font-size: 16px; }
  .bim-rh-hd h2 { font-size: 19px; }
  .bim-rh-hd .bim-rh-more { margin-left: 0; }
  /* 推荐：横向滑动 */
  .bim-rh-picks { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; padding-bottom: 6px; scrollbar-width: none; }
  .bim-rh-picks > li { flex: 0 0 82%; scroll-snap-align: start; }
  .bim-rh-pk { padding: 16px; gap: 14px; }
  .bim-rh-slip { min-height: 112px; font-size: 14px; }
  .bim-rh-works, .bim-rh-groups { grid-template-columns: minmax(0, 1fr); }
  .bim-rh-groups { gap: 24px; }
  .bim-rh-shelf-box + .bim-rh-groups { margin-top: 24px; }
  /* 长分组只露前 6 条，「全部」按钮展开 */
  .bim-rh-grp:not([data-open]) .bim-rh-rows li:nth-child(n+7) { display: none; }
  .bim-rh-expand { display: inline-flex; }
  .bim-rh-bu { gap: 22px 16px; }
  .bim-rh-bu-h b { font-size: 21px; }
  .bim-rh-authors { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 18px; }
  /* 年代：横带改 3 列格子，每格都写全名与部数 */
  .bim-rh-band { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; height: auto; border: 0; overflow: visible; }
  .bim-rh-band > li { flex: none !important; }
  .bim-rh-band > li + li { border-left: 0; }
  .bim-rh-band a { padding: 8px 10px; border: 1px solid ${bim('rule')}; font-size: 13.5px; }
  .bim-rh-band a[data-narrow] .bim-rh-pl, .bim-rh-band a[data-narrow] small { display: block; }
  .bim-rh-band a[data-narrow] .bim-rh-pl-s { display: none; }
}

/* 触屏或窄屏：点击目标放大到 44px */
@media ${COARSE_QUERY} {
  .bim-rh-rows a, .bim-rh-bu-l a, .bim-rh-au li a, .bim-rh-chip, .bim-rh-secnav a, .bim-rh-expand { min-height: 44px; display: flex; align-items: center; }
  .bim-rh-chip { display: inline-flex; }
}

@media (prefers-reduced-motion: reduce) { .bim-rh * { scroll-behavior: auto !important; transition: none !important; } }
`;
