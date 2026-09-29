/**
 * 详情页三栏版式（2026-09 N3a，新设计第三阶段）。
 *
 * 布局学新稿：左栏检索与本页导航（216px）｜中栏正文（版本表、著录…）｜
 * 右栏提要卡与旁栏清单（clamp(280px, 23vw, 360px)）。视觉沿用暖纸 + 朱色点缀：
 *
 * - 少边框、少分隔线：分组靠留白与底色阶（--bim-card-bg / --bim-zebra-bg）；
 * - 表格不画格线，用极淡的斑马纹和圆角行；
 * - 少按钮：整页只有一个主按钮「阅读全文」，其余是文字链接；
 * - 少 badge：元数据写成小一号的辅助字，「·」分隔；只有「有影印」用色块；
 * - 著录原文用宋体（--bim-font-serif），其余黑体。
 *
 * 手机端（≤719px）：左栏导航收起，按 提要卡 → 正文 → 旁栏 的顺序排。
 * 响应式全部走 CSS media query，SSR 与首帧一致。
 */
import React, { useState } from 'react';
import { useConvert } from '../../i18n';
import { bim } from '../../styles/tokens';

/** 左栏宽 */
export const RAIL_WIDTH = 216;
/** 右栏宽 */
export const CARD_WIDTH = 'clamp(280px, 23vw, 360px)';
/** 三栏版心 */
export const GRID_MAX_WIDTH = 1440;

/** 窄屏断点：与 primitives.NARROW_QUERY 相同（此处不 import，免得两文件循环依赖） */
const NARROW_QUERY = '(max-width: 719px)';

/** 触屏或窄屏：点击目标放大到 44px（Q5 巡检） */
const COARSE_QUERY = `${NARROW_QUERY}, (pointer: coarse)`;

export const LAYOUT_CSS = `
.bim-d-main.bim-d-main-grid { max-width: ${GRID_MAX_WIDTH}px; padding: 16px 32px 0; }
.bim-d-grid {
  display: grid;
  grid-template-columns: ${RAIL_WIDTH}px minmax(0, 1fr) ${CARD_WIDTH};
  grid-template-rows: auto 1fr;
  grid-template-areas: "rail main card" "rail main side";
  column-gap: 32px; row-gap: 28px; align-items: start;
}
.bim-d-g-rail { grid-area: rail; position: sticky; top: 16px; min-width: 0; }
.bim-d-g-main { grid-area: main; min-width: 0; }
.bim-d-g-card { grid-area: card; min-width: 0; }
.bim-d-g-side { grid-area: side; min-width: 0; display: flex; flex-direction: column; gap: 28px; }
.bim-d-g-side:empty { display: none; }

.bim-d-meta { color: ${bim('aux-fg')}; font-size: 13px; }
.bim-d-dot::before { content: "·"; margin: 0 .45em; color: ${bim('aux-fg')}; }

/* 左栏 */
.bim-d-rail-cap { font-size: 12px; letter-spacing: .2em; color: ${bim('aux-fg')}; margin: 0 12px 6px; }
.bim-d-rail-nav { list-style: none; margin: 0; padding: 0; }
.bim-d-rail-nav a {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding: 7px 12px; border-radius: 6px; font-size: 15px;
  color: ${bim('quiet-fg')} !important; text-decoration: none !important;
}
.bim-d-rail-nav a:hover { background: ${bim('zebra-bg')}; color: ${bim('ink')} !important; }
.bim-d-rail-nav .bim-d-meta { font-size: 12px; }
.bim-d-rail-links { margin-top: 20px; }
.bim-d-rail-back { display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px;
  font-size: 13px; color: ${bim('aux-fg')} !important; }

/* 区块 */
.bim-d-sec + .bim-d-sec { margin-top: 48px; }
.bim-d-sec { scroll-margin-top: 16px; }
.bim-d-sec-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin-bottom: 14px; }
.bim-d-sec-head h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: .04em; color: ${bim('ink')}; }
.bim-d-sec-head .bim-d-sec-act { margin-left: auto; font-size: 13px; }

/* 文字页签式筛选。min-height = 页签行高：朝代页签随次级数据晚到，行高先占好（INT Q3） */
.bim-d-filters { min-height: 26px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 18px; margin-bottom: 10px; font-size: 13px; }
.bim-d-tab {
  background: none; border: 0; padding: 4px 0; cursor: pointer; font: inherit;
  color: ${bim('quiet-fg')};
}
.bim-d-tab:hover { color: ${bim('ink')}; }
.bim-d-tab[aria-pressed="true"] { color: ${bim('accent')}; font-weight: 700; box-shadow: inset 0 -2px 0 ${bim('accent')}; }
.bim-d-filters .bim-d-spacer { flex: 1; }
.bim-d-check { display: inline-flex; align-items: center; gap: 6px; color: ${bim('quiet-fg')}; cursor: pointer; }
.bim-d-check input { accent-color: ${bim('accent')}; margin: 0; width: 15px; height: 15px; }

/* 斑马表：不画格线 */
.bim-d-zt { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 15px; }
.bim-d-zt th { text-align: left; font-weight: 400; color: ${bim('aux-fg')}; font-size: 12px;
  letter-spacing: .1em; padding: 6px 12px; white-space: nowrap; }
.bim-d-zt td { padding: 10px 12px; vertical-align: baseline; }
.bim-d-zt tbody tr:nth-child(odd) td { background: ${bim('zebra-bg')}; }
.bim-d-zt tbody tr td:first-child { border-radius: 6px 0 0 6px; }
.bim-d-zt tbody tr td:last-child { border-radius: 0 6px 6px 0; }
.bim-d-zt tbody tr:hover td { background: ${bim('tint-bg')}; }
.bim-d-zt td.bim-d-zt-main { padding: 0; }
.bim-d-zt td.bim-d-zt-main > a, .bim-d-zt td.bim-d-zt-main > span.bim-d-zt-name {
  display: block; padding: 10px 12px; color: ${bim('ink')}; font-weight: 500;
}
.bim-d-zt td.bim-d-zt-main > a:hover { color: ${bim('accent')}; }
.bim-d-zt td.bim-d-zt-main .bim-d-meta { display: block; margin: -8px 12px 0; padding-bottom: 10px; font-size: 12px; font-weight: 400; }
.bim-d-zt .bim-d-zt-sub { color: ${bim('quiet-fg')}; font-size: 13px; }
.bim-d-zt .bim-d-zt-nowrap { white-space: nowrap; }
.bim-d-zt .bim-d-zt-empty { color: ${bim('aux-fg')}; }
/* 版本表：行高先按「有影印」色块那一行的高度占好，解析到的年代、馆藏、色块进来时行不再长高（INT Q3） */
.bim-d-zt-ver tbody tr { height: 58px; }
/* 版本行一律「版本名 + 一行卷帙小字」（小字晚到，没有时也留空行）：行高固定，
   加载前后表格高度不变，下面的「展开」按钮不会下移（P2-8） */

.bim-d-flag {
  display: inline-block; padding: 1px 8px; border-radius: 4px;
  background: ${bim('flag-bg')}; color: ${bim('accent')} !important;
  font-size: 12px; line-height: 20px; white-space: nowrap;
}
a.bim-d-flag:hover { text-decoration: none !important; background: ${bim('tint-bg')}; }

.bim-d-more {
  display: inline-flex; align-items: center; min-height: 32px; margin-top: 6px;
  background: none; border: 0; padding: 0; cursor: pointer; font: inherit; font-size: 13px;
  color: ${bim('accent')};
}
.bim-d-more:hover { text-decoration: underline; text-underline-offset: 3px; }

/* 著录：朝代时间轴 + 单卡翻页 */
.bim-d-lu { display: block; }
.bim-d-tl2 { list-style: none; margin: 0 0 18px; padding: 0; display: flex; overflow-x: auto; }
.bim-d-tl2 li { flex: 1 0 64px; min-width: 64px; }
.bim-d-tl2 button { height: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; background: none;
  border: 0; cursor: pointer; padding: 4px 2px 8px; font: inherit; color: ${bim('quiet-fg')}; position: relative; }
.bim-d-tl2 button::before { content: ""; position: absolute; left: 0; right: 0; top: 30px; height: 1px; background: ${bim('rule')}; }
.bim-d-tl2-dyn { font-size: 12px; color: ${bim('aux-fg')}; min-height: 18px; }
.bim-d-tl2-dot { position: relative; width: 9px; height: 9px; border-radius: 50%; box-sizing: border-box;
  background: ${bim('page-bg')}; border: 1px solid ${bim('aux-fg')}; }
.bim-d-tl2-name { display: flex; flex-direction: column; align-items: center; font-size: 15px; line-height: 1.25;
  font-family: ${bim('font-serif')}; }; }
.bim-d-tl2 button:hover .bim-d-tl2-name { color: ${bim('accent')}; }
.bim-d-tl2 button[aria-selected="true"] .bim-d-tl2-dot { background: ${bim('accent')}; border-color: ${bim('accent')}; }
.bim-d-tl2 button[aria-selected="true"] .bim-d-tl2-name { color: ${bim('ink')}; font-weight: 700; }
.bim-d-lu-pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 18px;
  padding-top: 12px; border-top: 1px solid ${bim('rule')}; font-size: 13px; }
.bim-d-lu-pager button { background: none; border: 0; padding: 4px 0; cursor: pointer; font: inherit; color: ${bim('accent')}; }
.bim-d-lu-pager button:disabled { cursor: default; }
.bim-d-lu-pager button:not(:disabled):hover { text-decoration: underline; text-underline-offset: 3px; }
.bim-d-lu-body { padding: 18px 22px 14px; min-width: 0; border-radius: 10px; background: ${bim('card-bg')}; }
.bim-d-lu-title { font-size: 17px; font-weight: 700; color: ${bim('ink')}; }
.bim-d-quote { margin: 14px 0 0; font-family: ${bim('font-serif')}; font-size: 17px; line-height: 2;
  color: ${bim('ink')}; text-align: justify; }
.bim-d-quote-label { margin-top: 16px; font-size: 12px; letter-spacing: .1em; color: ${bim('aux-fg')}; }
.bim-d-quote-label + .bim-d-quote { margin-top: 4px; }

/* 提要卡 */
.bim-d-card { background: ${bim('card-bg')}; border-radius: 10px; padding: 24px;
  box-shadow: ${bim('shadow-summary')}; }
.bim-d-card h1 { margin: 0; font-size: 36px; font-weight: 700; letter-spacing: .08em; line-height: 1.25;
  color: ${bim('ink')}; word-break: break-word; }
.bim-d-card h1.bim-d-card-long { font-size: 26px; letter-spacing: .04em; line-height: 1.35; }
.bim-d-card-sub { margin-top: 6px; font-size: 17px; font-weight: 500; color: ${bim('quiet-fg')}; }
.bim-d-card-byline { margin-top: 8px; font-size: 15px; color: ${bim('ink')}; }
.bim-d-card-cls { margin-top: 4px; }
.bim-d-card-desc { margin-top: 16px; color: ${bim('quiet-fg')}; line-height: 1.85; font-size: 15px; }
/* 提要卡顶上的类型小字（版本 / 叢編 / 人物）：四类页长得一样，靠它区分 */
.bim-d-card-kind { margin-bottom: 6px; font-size: 12px; letter-spacing: .3em; color: ${bim('aux-fg')}; }
/* 简介折叠：截到 N 行（行数由 --detail-clamp 给），「展開」后放开 */
.bim-d-card-desc.bim-d-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
  -webkit-line-clamp: var(--detail-clamp, 6); }
/* 截断时里面的 MarkdownText 段落不要再带上下外边距，免得第一行前空一截 */
.bim-d-card-desc.bim-d-clamp > * { margin-top: 0; }
.bim-d-card-toggle { background: none; border: 0; padding: 0; cursor: pointer; font: inherit; font-size: 13px;
  color: ${bim('accent')}; display: inline-flex; align-items: center; min-height: 28px; }
.bim-d-card-toggle:hover { text-decoration: underline; text-underline-offset: 3px; }
.bim-d-card details.bim-d-more-names { margin-top: 8px; font-size: 13px; }
.bim-d-card details.bim-d-more-names summary { cursor: pointer; color: ${bim('accent')}; display: inline-flex;
  align-items: center; min-height: 28px; }
.bim-d-card details.bim-d-more-names dl { margin-top: 6px; }

/* 左栏「上一级」：版本页的所属作品、丛编页的上级丛编 */
.bim-d-up { display: block; margin-top: 16px; padding: 10px 12px; border-radius: 8px; background: ${bim('zebra-bg')}; }
.bim-d-up-cap { display: block; font-size: 12px; letter-spacing: .1em; color: ${bim('aux-fg')}; }
.bim-d-up a { font-size: 16px; font-weight: 700; color: ${bim('ink')} !important; }
.bim-d-up a:hover { color: ${bim('accent')} !important; }
.bim-d-up a::after { content: " →"; font-weight: 400; color: ${bim('aux-fg')}; }

/* 资源分组：一组一个小标题、一句说明；镜像收成一行文字链接，不再逐行重复组名 */
.bim-d-rg + .bim-d-rg { margin-top: 22px; }
.bim-d-rg-h { font-size: 15px; font-weight: 700; color: ${bim('ink')}; margin: 0; }
.bim-d-rg-d { font-size: 13px; color: ${bim('aux-fg')}; margin: 2px 0 8px; max-width: 46em;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bim-d-rg-mir { padding: 6px 12px 0; font-size: 13px; color: ${bim('quiet-fg')}; }
.bim-d-rg-mir a { color: ${bim('accent')} !important; margin-right: 14px; }

/* 本站全文：一块浅底的阅读入口 + 回目网格（不另加按钮，主按钮在提要卡） */
.bim-d-ft { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 24px; align-items: center;
  padding: 18px 20px; border-radius: 10px; background: ${bim('zebra-bg')}; }
.bim-d-ft-h { margin: 0; font-size: 17px; font-weight: 700; color: ${bim('ink')}; }
.bim-d-ft .bim-d-meta { grid-column: 1; }
.bim-d-ft-go { grid-column: 2; grid-row: 1 / span 2; color: ${bim('accent')} !important; font-weight: 500; white-space: nowrap; }
.bim-d-chap { list-style: none; margin: 12px 0 0; padding: 0; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 0 20px; font-size: 14px; }
.bim-d-chap a { display: flex; gap: 10px; padding: 5px 0; color: ${bim('quiet-fg')} !important;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bim-d-chap a:hover { color: ${bim('accent')} !important; }
.bim-d-chap-pending { height: 142px; margin-top: 12px; }
.bim-d-chap b { font-weight: 400; color: ${bim('aux-fg')}; flex: none; }

/* 版本源流：一条竖线，靠字重和颜色分层，不画框 */
.bim-d-tl { list-style: none; margin: 0; padding: 0 0 0 18px; position: relative; }
.bim-d-tl::before { content: ""; position: absolute; left: 4px; top: 10px; bottom: 10px; width: 1px; background: ${bim('rule')}; }
.bim-d-tl > li { position: relative; padding: 6px 0; }
.bim-d-tl > li::before { content: ""; position: absolute; left: -18px; top: 15px; width: 9px; height: 9px;
  border-radius: 50%; background: ${bim('rule-dashed')}; }
.bim-d-tl > li.bim-d-tl-cur::before { background: ${bim('accent')}; }
.bim-d-tl-rel { display: inline-block; min-width: 4.5em; font-size: 12px; color: ${bim('aux-fg')}; letter-spacing: .1em; }
.bim-d-tl-t { color: ${bim('ink')}; font-weight: 500; }
.bim-d-tl-cur .bim-d-tl-t { color: ${bim('accent')}; }
.bim-d-tl-ev { display: block; margin-left: 4.5em; font-size: 12px; color: ${bim('aux-fg')}; }
.bim-d-tl details { margin: 4px 0 0 4.5em; font-size: 13px; }
.bim-d-tl summary { cursor: pointer; color: ${bim('accent')}; display: inline-flex; align-items: center; min-height: 28px; }

/* 著作举要：无框的排印块 */
.bim-d-picks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
.bim-d-pick { padding: 16px 18px; border-radius: 10px; background: ${bim('zebra-bg')}; min-width: 0; }
.bim-d-pick-t { display: block; font-size: 18px; font-weight: 700; letter-spacing: .04em; }
.bim-d-pick-t a { color: ${bim('ink')} !important; }
.bim-d-pick-t a:hover { color: ${bim('accent')} !important; }
.bim-d-pick .bim-d-meta { display: block; margin-top: 4px; font-size: 12px; }
.bim-d-pick-n { margin-top: 10px; font-size: 13px; color: ${bim('quiet-fg')}; display: flex; gap: 8px; align-items: center; }

/* 著作举要：版本数放大 */
.bim-d-pick-num { font-size: 26px; font-weight: 700; line-height: 1; color: ${bim('ink')}; letter-spacing: 0; }
.bim-d-pick-num + span { font-size: 13px; }
.bim-d-pick-n { align-items: baseline; }
.bim-d-pick-n .bim-d-flag { margin-left: auto; }
.bim-d-sec-sub { margin: -8px 0 16px; font-size: 13px; color: ${bim('aux-fg')}; }

/* 提要卡：生卒条、著作四部分布条 */
.bim-d-life { margin-top: 18px; }
.bim-d-life-bar { position: relative; height: 6px; border-radius: 3px; background: ${bim('rule')}; }
.bim-d-life-bar > i { position: absolute; top: 0; bottom: 0; border-radius: 3px; background: ${bim('sect-jing')}; }
.bim-d-life-lab { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; color: ${bim('aux-fg')}; }
.bim-d-dist { margin-top: 18px; }
.bim-d-dist-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: ${bim('aux-fg')}; }
.bim-d-dist-head b { font-size: 20px; color: ${bim('ink')}; margin-right: 3px; }
.bim-d-dist-bar { display: flex; gap: 1px; height: 6px; margin-top: 8px; border-radius: 3px; overflow: hidden; }
.bim-d-dist-bar > i { display: block; }
.bim-d-dist-key { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 12px; color: ${bim('quiet-fg')}; }
.bim-d-dist-key i { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 2px; }
.bim-d-dist-seg { display: block; flex-basis: 0; min-width: 2px; height: 100%; padding: 0; border: 0; cursor: pointer; }
.bim-d-dist-seg:disabled { cursor: default; }
.bim-d-dist-seg[aria-pressed="true"] { outline: 2px solid ${bim('ink')}; outline-offset: -2px; }
.bim-d-dist-bar:has(.bim-d-dist-seg[aria-pressed="true"]) .bim-d-dist-seg:not([aria-pressed="true"]) { opacity: .35; }
.bim-d-sq { display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 1px; vertical-align: middle; }
.bim-d-side-note { margin: 8px 0 0; font-size: 12px; color: ${bim('aux-fg')}; }

/* 提要卡：数字格（版本 / 有影印 / 家著录） */
.bim-d-stats { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; margin: 18px 0 0; padding: 14px 0 2px;
  border-top: 1px solid ${bim('rule')}; }
.bim-d-stats > div + div { padding-left: 14px; border-left: 1px solid ${bim('rule')}; }
.bim-d-stats b { display: block; font-size: 24px; font-weight: 700; line-height: 1.1; color: ${bim('ink')}; }
.bim-d-stats span { display: block; margin-top: 4px; font-size: 12px; color: ${bim('aux-fg')}; }
.bim-d-side-sub { margin: -2px 0 6px; font-size: 12px; color: ${bim('aux-fg')}; }
.bim-d-side li .bim-d-kind { padding: 0 6px; border-radius: 3px; background: ${bim('zebra-bg')}; line-height: 18px; }

/* 提要卡：版本类型／年代／卷帙 三个标签 */
.bim-d-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.bim-d-tag { padding: 1px 8px; border-radius: 3px; font-size: 12px; line-height: 20px; color: ${bim('quiet-fg')};
  background: ${bim('zebra-bg')}; }
.bim-d-tag-0 { background: ${bim('flag-bg')}; color: ${bim('accent')}; }
.bim-d-tag-2 { background: none; box-shadow: inset 0 0 0 1px ${bim('rule')}; }

/* 分段切换（卡片／关系图） */
.bim-d-seg { display: inline-flex; border-radius: 6px; box-shadow: inset 0 0 0 1px ${bim('rule')}; overflow: hidden; }
.bim-d-seg button { min-height: 28px; padding: 0 12px; border: 0; background: none; cursor: pointer; font: inherit;
  font-size: 13px; color: ${bim('quiet-fg')}; }
.bim-d-seg button[aria-pressed="true"] { background: ${bim('flag-bg')}; color: ${bim('accent')}; font-weight: 700; }

/* 版本源流·卡片流 */
.bim-d-lf-list { list-style: none; margin: 0; padding: 0 0 0 22px; position: relative; }
.bim-d-lf-list::before { content: ""; position: absolute; left: 4px; top: 12px; bottom: 12px; width: 1px; background: ${bim('rule')}; }
.bim-d-lf-node { position: relative; padding: 6px 0; }
.bim-d-lf-node::before { content: ""; position: absolute; left: -22px; top: 22px; width: 9px; height: 9px; border-radius: 50%;
  box-sizing: border-box; background: ${bim('page-bg')}; border: 1px solid ${bim('aux-fg')}; }
.bim-d-lf-cur::before { background: ${bim('accent')}; border-color: ${bim('accent')}; }
.bim-d-lf-out::before { top: 16px; }
.bim-d-lf-card, .bim-d-lf-dash { padding: 12px 16px; border-radius: 8px; min-width: 0; }
.bim-d-lf-card { background: ${bim('card-bg')}; box-shadow: inset 0 0 0 1px ${bim('rule')}; }
.bim-d-lf-dash { box-shadow: inset 0 0 0 1px ${bim('rule-dashed')}; }
.bim-d-lf-tag { display: inline-block; margin-right: 10px; padding: 0 7px; border-radius: 3px; font-size: 12px; line-height: 20px;
  background: ${bim('zebra-bg')}; color: ${bim('quiet-fg')}; }
.bim-d-lf-name { font-weight: 700; color: ${bim('ink')}; }
.bim-d-lf-ev { margin: 6px 0 0; font-size: 13px; line-height: 1.8; color: ${bim('quiet-fg')}; }
.bim-d-lf-cur { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.bim-d-lf-here { padding: 12px 16px; border-radius: 8px; background: ${bim('accent')}; color: ${bim('on-color-fg')}; min-width: 0; }
.bim-d-lf-here .bim-d-lf-name { color: ${bim('on-color-fg')}; }
.bim-d-lf-here .bim-d-lf-tag { background: color-mix(in srgb, ${bim('on-color-fg')} 18%, transparent); color: ${bim('on-color-fg')}; }
.bim-d-lf-yr { display: block; margin-top: 4px; font-size: 13px; opacity: .9; }
.bim-d-lf-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.bim-d-lf-out { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.bim-d-lf-out-h { font-size: 12px; letter-spacing: .1em; color: ${bim('aux-fg')}; }
.bim-d-lf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.bim-d-lf-chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 3px 10px; border-radius: 6px;
  box-shadow: inset 0 0 0 1px ${bim('rule')}; font-size: 14px; }
.bim-d-lf-app { margin-top: 10px; font-size: 14px; }
.bim-d-lf-app summary { cursor: pointer; min-height: 28px; display: inline-flex; align-items: center; gap: 6px; color: ${bim('accent')}; }

/* 影印分组：一组一张卡 */
.bim-d-rg { padding: 14px 16px 10px; border-radius: 10px; background: ${bim('card-bg')}; box-shadow: inset 0 0 0 1px ${bim('rule')}; }
.bim-d-rg .bim-d-zt tbody tr:nth-child(odd) td { background: none; }

/* 旁栏：时间轴点（同作品版本） */
.bim-d-side-tl ul { position: relative; padding-left: 16px; }
.bim-d-side-tl ul::before { content: ""; position: absolute; left: 3px; top: 12px; bottom: 12px; width: 1px; background: ${bim('rule')}; }
.bim-d-side-tl li { position: relative; }
.bim-d-side-tl li::before { content: ""; position: absolute; left: -16px; top: 14px; width: 7px; height: 7px; border-radius: 50%;
  box-sizing: border-box; background: ${bim('page-bg')}; border: 1px solid ${bim('aux-fg')}; }
.bim-d-side-tl li.bim-d-side-cur::before { background: ${bim('accent')}; border-color: ${bim('accent')}; }

/* 本页内检索（丛编子目） */
.bim-d-find { height: 30px; min-width: 190px; padding: 0 12px; border: 0; border-radius: 6px; box-sizing: border-box;
  background: ${bim('tint-bg')}; color: ${bim('ink')}; font: inherit; font-size: 13px; }
.bim-d-find::placeholder { color: ${bim('aux-fg')}; }
.bim-d-find:focus { outline: 2px solid ${bim('accent')}; outline-offset: 1px; }

/* 旁栏：当前条目高亮 */
.bim-d-side-all a { color: ${bim('accent')} !important; }
.bim-d-side li.bim-d-side-cur, .bim-d-side li.bim-d-side-cur .bim-d-meta { color: ${bim('accent')}; font-weight: 500; }
.bim-d-card dl { margin: 18px 0 0; display: grid; grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 16px; font-size: 13px; }
.bim-d-card dt { color: ${bim('aux-fg')}; white-space: nowrap; }
.bim-d-card dd { margin: 0; color: ${bim('ink')}; min-width: 0; overflow-wrap: anywhere; }
.bim-d-card-foot { margin-top: 14px; font-size: 12px; text-align: center; color: ${bim('aux-fg')}; }
.bim-d-card-foot:empty { display: none; }
.bim-d-card-foot details { text-align: left; margin-top: 6px; }
.bim-d-card-foot summary { cursor: pointer; display: inline-flex; align-items: center; min-height: 32px; }

/* 唯一主按钮 */
.bim-d-btn {
  display: flex; align-items: center; justify-content: center; margin-top: 22px; width: 100%;
  height: 44px; padding: 0 24px; border: 0; border-radius: 8px; box-sizing: border-box;
  background: ${bim('accent')}; color: ${bim('on-color-fg')} !important;
  font: 500 15px/1 ${bim('font-ui')}; letter-spacing: .08em; cursor: pointer; white-space: nowrap;
  text-decoration: none !important;
}
.bim-d-btn:hover { background: ${bim('accent-deep')}; }
.bim-d-card-alt { display: flex; align-items: center; justify-content: center; min-height: 40px; margin-top: 8px;
  border-radius: 6px; background: ${bim('flag-bg')}; font-size: 14px; color: ${bim('accent')} !important; }
.bim-d-card-alt:hover { text-decoration: none !important; background: ${bim('tint-bg')}; }

/* 旁栏清单：小标题是 h2（提要卡 h1 之下不跳级，INT Q5），外观仍是 15px 小标题 */
.bim-d-side h3, .bim-d-side .bim-d-side-h { margin: 0 0 6px; font-size: 15px; font-weight: 700; color: ${bim('ink')};
  display: flex; align-items: baseline; gap: 8px; }
.bim-d-side h3 .bim-d-meta, .bim-d-side .bim-d-side-h .bim-d-meta { font-weight: 400; font-size: 12px; }
.bim-d-side ul { list-style: none; margin: 0; padding: 0; }
.bim-d-side li { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; font-size: 15px; min-width: 0; }
.bim-d-side li > a, .bim-d-side li > span:first-child { color: ${bim('ink')}; min-width: 0; overflow-wrap: anywhere; }
.bim-d-side li > a:hover { color: ${bim('accent')}; }
.bim-d-side li .bim-d-meta { font-size: 12px; flex: none; }

/* 点击目标 ≥44px（Q5）：触屏与窄屏 */
@media ${COARSE_QUERY} {
  .bim-d-tab, .bim-d-check, .bim-d-more, .bim-d-rail-back,
  .bim-d-card-foot summary, .bim-d-card-toggle, .bim-d-card details.bim-d-more-names summary,
  .bim-d-tl summary, .bim-d-chap a { min-height: 44px; }
  .bim-d-chap a { align-items: center; }
  .bim-d-side li { padding: 0; }
  .bim-d-side a { display: inline-flex; align-items: center; min-height: 44px; }
  .bim-d-tl2 button, .bim-d-lu-pager button { min-height: 44px; }
  .bim-d-hit { min-width: 44px !important; min-height: 44px !important; display: inline-flex !important;
    align-items: center; justify-content: center; }
  .bim-d-zt td.bim-d-zt-main > a, .bim-d-zt td.bim-d-zt-main > span.bim-d-zt-name {
    min-height: 44px; box-sizing: border-box; display: flex; align-items: center; }
  /*
   * 视觉不变、热区外扩到 44×44（INT Q4）：「有影印」色块、顶条的面包屑（返回索引）/ 繁简 / GitHub 图标、
   * 朝代页签（单字「宋」「元」只有 13px 宽）。伪元素居中外扩，宽高都至少 44px。
   */
  .bim-d-flag, .bim-d-top a, .bim-d-top button, .bim-d-tab { position: relative; }
  .bim-d-flag::after, .bim-d-top a::after, .bim-d-top button::after, .bim-d-tab::after {
    content: ""; position: absolute; left: 50%; top: 50%;
    width: max(calc(100% + 8px), 44px); height: max(100%, 44px); transform: translate(-50%, -50%);
  }
  /* 影印「鏡像」链接：一行里并排几个，只上下外扩到 44，左右各扩 6px（间距 14px，不叠） */
  .bim-d-rg-mir a { position: relative; }
  .bim-d-rg-mir a::after {
    content: ""; position: absolute; left: -6px; right: -6px; top: 50%;
    height: 44px; transform: translateY(-50%);
  }
  /*
   * 相邻热区不能叠：两字页签（26px）两边各扩 9px，间距 18px 正好贴边，放宽到 20px；
   * 单字页签（13px）两边各扩 15.5px，再左右各多留 7px
   */
  .bim-d-filters { column-gap: 20px; }
  .bim-d-tab.bim-d-tab-1 { margin: 0 7px; }
}

/* 中等宽度：左栏折到顶部一行 */
@media (max-width: 1100px) {
  .bim-d-grid {
    grid-template-columns: minmax(0, 1fr) ${CARD_WIDTH};
    grid-template-rows: auto auto 1fr;
    grid-template-areas: "rail rail" "main card" "main side";
  }
  .bim-d-g-rail { position: static; }
  .bim-d-rail-navwrap { display: none; }
  .bim-d-rail-links { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 0 16px; }
  .bim-d-rail-links .bim-d-rail-cap { display: none; }
  .bim-d-rail-links .bim-d-rail-nav { display: flex; flex-wrap: wrap; gap: 0 16px; }
  .bim-d-rail-links .bim-d-rail-nav a { padding: 7px 0; color: ${bim('accent')} !important; font-size: 14px; }
  .bim-d-up { display: inline-block; margin-top: 12px; }
}

/* 手机：左栏收起，提要卡 → 正文 → 旁栏 */
@media ${NARROW_QUERY} {
  .bim-d-main.bim-d-main-grid { padding: 8px 16px 0; }
  .bim-d-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas: "rail" "card" "main" "side";
    row-gap: 28px;
  }
  .bim-d-card { box-shadow: none; background: transparent; padding: 0; border-radius: 0; }
  .bim-d-card h1 { font-size: 28px; }
  .bim-d-card h1.bim-d-card-long { font-size: 22px; }
  .bim-d-zt thead { display: none; }
  .bim-d-zt, .bim-d-zt tbody, .bim-d-zt tr, .bim-d-zt td { display: block; width: 100%; box-sizing: border-box; }
  .bim-d-zt tr { padding: 0 0 10px; border-radius: 6px; }
  .bim-d-zt tbody tr:nth-child(odd) { background: ${bim('zebra-bg')}; }
  .bim-d-zt tbody tr:nth-child(odd) td, .bim-d-zt tbody tr:hover td { background: transparent; }
  .bim-d-zt td { padding: 0 12px; }
  .bim-d-zt td:not(.bim-d-zt-main) { display: inline; width: auto; padding: 0 0 0 12px; font-size: 12px;
    color: ${bim('aux-fg')}; }
  .bim-d-zt td.bim-d-zt-blank { display: none; }
  .bim-d-zt td.bim-d-zt-main .bim-d-meta { padding-bottom: 2px; }
  /* 手机上版本行是块：解析前先按「名 + 卷帙小字 + 一行年代馆藏」占高（实测解析后 81–87px） */
  .bim-d-zt-ver tbody tr { height: auto; }
  /* 朝代页签晚到、在手机上自成一行：解析中先占两行（页签一行 + 复选框一行，实测共 66px） */
  .bim-d-filters[data-pending] { min-height: 66px; align-content: flex-end; }
  .bim-d-zt-ver tbody tr[data-loading] { min-height: 84px; }
  .bim-d-lu-body { padding: 14px 16px 10px; }
  .bim-d-card .bim-d-card-desc.bim-d-clamp { -webkit-line-clamp: 4; }
  .bim-d-up { display: inline-flex; gap: 8px; align-items: baseline; margin-top: 10px; padding: 6px 12px; }
  .bim-d-up a { font-size: 14px; }
  .bim-d-ft { grid-template-columns: minmax(0, 1fr); }
  .bim-d-lf-cur { grid-template-columns: minmax(0, 1fr); }
  .bim-d-seg button { min-height: 44px; }
  .bim-d-ft-go { grid-column: 1; grid-row: auto; margin-top: 6px; }
  .bim-d-chap { grid-template-columns: 1fr 1fr; }
  .bim-d-chap-pending { height: 270px; }
  .bim-d-picks { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .bim-d-pick { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; padding: 12px 14px; }
  .bim-d-pick-n { margin: 0; grid-column: 2; grid-row: 1 / span 2; }
  .bim-d-find { flex-basis: 100%; min-height: 40px; }
}
`;

// ══════════════════════════════════════════════════════════════
// 骨架
// ══════════════════════════════════════════════════════════════

export interface RailLink {
    key: string;
    label: string;
    onClick: () => void;
    href?: string;
}

export interface RailNavItem {
    /** 区块锚点 id */
    id: string;
    label: string;
    count?: React.ReactNode;
}

/**
 * 三栏骨架。
 *
 * rail   —— 左栏：宿主传入的检索框等（railTop）+ 返回链接 + 「上一级」+ 本页区块导航
 * main   —— 中栏正文
 * card   —— 右栏提要卡
 * side   —— 右栏提要卡下的旁栏清单（手机上排到正文之后）
 */
export function DetailGrid({ railTop, back, up, nav, railLinks, main, card, side }: {
    railTop?: React.ReactNode;
    back?: React.ReactNode;
    /** 「上一级」：版本页的所属作品、丛编页的上级丛编（见 RailUp） */
    up?: React.ReactNode;
    nav?: RailNavItem[];
    /**
     * 左栏「更多」：切到本条目其他页面的入口（丛编目录、宿主注入的 extraTabs 如「数字化」）。
     * 与本页锚点导航不同，窄屏也显示（折成一行文字链接），否则手机上就没有入口了。
     */
    railLinks?: RailLink[];
    main: React.ReactNode;
    card: React.ReactNode;
    side?: React.ReactNode;
}) {
    const { convert } = useConvert();
    const navItems = (nav || []).filter(Boolean);
    return (
        <div className="bim-d-grid">
            <aside className="bim-d-g-rail bim-d-ui">
                {railTop}
                {back && <div style={{ marginTop: railTop ? 12 : 0 }}>{back}</div>}
                {up}
                {navItems.length > 1 && (
                    <nav className="bim-d-rail-navwrap" aria-label={convert('本頁導航')} style={{ marginTop: 20 }}>
                        <p className="bim-d-rail-cap" style={{ marginTop: 0 }}>{convert('本頁')}</p>
                        <ul className="bim-d-rail-nav">
                            {navItems.map(it => (
                                <li key={it.id}>
                                    <a href={`#${it.id}`}>
                                        <span>{convert(it.label)}</span>
                                        {it.count != null && <span className="bim-d-meta">{it.count}</span>}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
                {railLinks && railLinks.length > 0 && (
                    <nav className="bim-d-rail-links" aria-label={convert('更多')}>
                        <p className="bim-d-rail-cap">{convert('更多')}</p>
                        <ul className="bim-d-rail-nav">
                            {railLinks.map(l => (
                                <li key={l.key}>
                                    <a
                                        href={l.href ?? '#'}
                                        onClick={e => {
                                            if (e.metaKey || e.ctrlKey) return;
                                            e.preventDefault();
                                            l.onClick();
                                        }}
                                    >
                                        <span>{convert(l.label)}</span>
                                        <span className="bim-d-meta" aria-hidden="true">→</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </aside>
            <div className="bim-d-g-main">{main}</div>
            <div className="bim-d-g-card">{card}</div>
            <div className="bim-d-g-side">{side}</div>
        </div>
    );
}

/** 左栏「上一级」块：小字说明 + 一个链接（链接由调用方给，通常是 BidLink） */
export function RailUp({ caption, children }: { caption: string; children: React.ReactNode }) {
    const { convert } = useConvert();
    return (
        <div className="bim-d-up bim-d-ui">
            <span className="bim-d-up-cap">{convert(caption)}</span>
            {children}
        </div>
    );
}

/** 正文区块：h2 + 辅助字计数 + 右侧文字操作 */
export function Sec({ id, title, meta, action, children }: {
    id?: string;
    title: string;
    meta?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { convert } = useConvert();
    return (
        <section id={id} className="bim-d-sec">
            <div className="bim-d-sec-head bim-d-ui">
                <h2>{convert(title)}</h2>
                {meta != null && meta !== '' && <span className="bim-d-meta">{meta}</span>}
                {action && <span className="bim-d-sec-act">{action}</span>}
            </div>
            {children}
        </section>
    );
}

/** 「·」分隔的一行辅助字；空项自动略去 */
export function MetaLine({ items, className, style }: {
    items: React.ReactNode[];
    className?: string;
    style?: React.CSSProperties;
}) {
    const shown = items.filter(x => x != null && x !== '' && x !== false);
    if (!shown.length) return null;
    return (
        <span className={`bim-d-meta${className ? ` ${className}` : ''}`} style={style}>
            {shown.map((x, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className="bim-d-dot" />}
                    <span>{x}</span>
                </React.Fragment>
            ))}
        </span>
    );
}

/** 文字页签（朝代、部类、职任筛选） */
export function TabFilter<K extends string>({ items, value, onChange }: {
    items: { key: K; label: string }[];
    value: K;
    onChange: (k: K) => void;
}) {
    const { convert } = useConvert();
    return (
        <>
            {items.map(it => (
                <button
                    key={it.key}
                    type="button"
                    className={[...convert(it.label)].length === 1 ? 'bim-d-tab bim-d-tab-1' : 'bim-d-tab'}
                    aria-pressed={it.key === value}
                    onClick={() => onChange(it.key)}
                >
                    {convert(it.label)}
                </button>
            ))}
        </>
    );
}

/** 复选框（「只看有影印」） */
export function CheckFilter({ label, checked, onChange }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    const { convert } = useConvert();
    return (
        <label className="bim-d-check">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            {convert(label)}
        </label>
    );
}

/** 「展开其余 N 种」「显示更多」：文字链接样式的按钮 */
export function MoreLink({ label, onClick }: { label: string; onClick: () => void }) {
    const { convert } = useConvert();
    return (
        <button type="button" className="bim-d-more bim-d-ui" onClick={onClick}>
            {convert(label)}
        </button>
    );
}

// ══════════════════════════════════════════════════════════════
// 提要卡
// ══════════════════════════════════════════════════════════════

export interface CardFact {
    label: string;
    value: React.ReactNode;
    title?: string;
}

/**
 * 右栏提要卡：标题 → 署名 → 分类等辅助字 → 简介 → 事实表 → 「阅读全文」 → 数据版本等小字。
 * 整页唯一的主按钮就在这里（readAction）。
 */
export function SummaryCard({
    kind, title, subtitle, byline, meta, description, clampDescription, facts, stats, readAction, secondaryAction, children, foot,
}: {
    /** 标题上方的类型小字（版本 / 叢編 / 人物） */
    kind?: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    byline?: React.ReactNode;
    meta?: React.ReactNode;
    description?: React.ReactNode;
    /**
     * 简介截到几行（手机上统一 4 行），下附「展開」。调用方按字数判断要不要截
     * （见 descNeedsClamp）：不量渲染高度，SSR 与首帧一致，「展開」也不会晚到把下面顶开。
     */
    clampDescription?: number;
    facts?: CardFact[];
    /** 事实表之前的数字格（版本 / 有影印 / 家著录）；value 为 0 或空的项不出 */
    stats?: { value: React.ReactNode; label: string }[];
    /** 「阅读全文」主按钮（ReadButton） */
    readAction?: React.ReactNode;
    /** 主按钮下方的次要入口：只许文字链接（「看原書影印」） */
    secondaryAction?: React.ReactNode;
    /** 事实表之后、按钮之前的附加内容（附记等） */
    children?: React.ReactNode;
    /** 卡底小字：数据版本、审核状态、待核事项 */
    foot?: React.ReactNode;
}) {
    const { convert } = useConvert();
    const shownFacts = (facts || []).filter(f => f.value != null && f.value !== '');
    const shownStats = (stats || []).filter(x => x.value != null && x.value !== '' && x.value !== 0);
    const [descOpen, setDescOpen] = useState(false);
    const clamped = !!clampDescription && !descOpen;
    return (
        <div className="bim-d-card">
            {kind && <div className="bim-d-card-kind bim-d-ui">{convert(kind)}</div>}
            {/* 长标题（版本名「欽定四庫全書·文淵閣本」之类）降一级字号，免得折成三行 */}
            <h1 className={typeof title === 'string' && [...title].length > 7 ? 'bim-d-card-long' : undefined}>{title}</h1>
            {subtitle && <div className="bim-d-card-sub">{subtitle}</div>}
            {byline && <p className="bim-d-card-byline" style={{ marginBottom: 0 }}>{byline}</p>}
            {meta && <div className="bim-d-card-cls bim-d-ui">{meta}</div>}
            {description && (
                <div
                    className={clamped ? 'bim-d-card-desc bim-d-clamp' : 'bim-d-card-desc'}
                    style={clamped ? { ['--detail-clamp' as string]: clampDescription } as React.CSSProperties : undefined}
                >
                    {description}
                </div>
            )}
            {description && !!clampDescription && (
                <button type="button" className="bim-d-card-toggle bim-d-ui" aria-expanded={descOpen}
                    onClick={() => setDescOpen(v => !v)}>
                    {convert(descOpen ? '收起' : '展開')}
                </button>
            )}
            {shownStats.length > 0 && (
                <div className="bim-d-stats bim-d-ui">
                    {shownStats.map((x, i) => <div key={i}><b>{x.value}</b><span>{convert(x.label)}</span></div>)}
                </div>
            )}
            {shownFacts.length > 0 && (
                <dl className="bim-d-ui">
                    {shownFacts.map((f, i) => (
                        <React.Fragment key={i}>
                            <dt>{convert(f.label)}</dt>
                            <dd title={f.title}>{f.value}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            )}
            {children}
            {readAction}
            {secondaryAction}
            {foot && <div className="bim-d-card-foot bim-d-ui">{foot}</div>}
        </div>
    );
}

/**
 * 简介要不要截：按字数估。提要卡 360px 宽约 17 字一行，截 6 行约 100 字；
 * 手机 4 行约 80 字。110 字以上才截，免得「展開」后只多出半行。
 */
export function descNeedsClamp(text?: string): boolean {
    return !!text && [...text.replace(/\s+/g, '')].length > 110;
}

/** 「阅读全文」：有 href 渲染成链接（指向宿主的阅读页），否则按钮 */
export function ReadButton({ href, onClick, label = '閱讀全文' }: {
    href?: string;
    onClick?: () => void;
    label?: string;
}) {
    const { convert } = useConvert();
    if (href) {
        return (
            <a
                className="bim-d-btn"
                href={href}
                onClick={onClick ? (e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    onClick();
                } : undefined}
            >
                {convert(label)}
            </a>
        );
    }
    return (
        <button type="button" className="bim-d-btn" onClick={onClick}>{convert(label)}</button>
    );
}

// ══════════════════════════════════════════════════════════════
// 旁栏
// ══════════════════════════════════════════════════════════════

/** 旁栏清单：小标题 + 若干行（行内容由调用方给）+ 「显示更多（n）」 */
export function SideList({ id, title, meta, items, metas, currentIndex, cap = 8, moreLabel, foot, sub, timeline }: {
    id?: string;
    title: string;
    meta?: React.ReactNode;
    items: React.ReactNode[];
    /** 每行右侧的辅助字（年代等），与 items 一一对应 */
    metas?: React.ReactNode[];
    /** 当前条目所在行（高亮，aria-current） */
    currentIndex?: number;
    cap?: number;
    /** 默认「顯示更多（n）」 */
    moreLabel?: (rest: number) => string;
    /** 清单底部的小字说明 */
    foot?: React.ReactNode;
    /** 标题下的一行小字（分类计数等） */
    sub?: React.ReactNode;
    /** 行首画时间轴点（同作品版本） */
    timeline?: boolean;
}) {
    const { convert } = useConvert();
    const [all, setAll] = useState(false);
    if (!items.length) return null;
    const shown = all ? items : items.slice(0, cap);
    const rest = items.length - shown.length;
    return (
        <div id={id} className={timeline ? 'bim-d-side bim-d-side-tl' : 'bim-d-side'} style={{ scrollMarginTop: 16 }}>
            <h2 className="bim-d-ui bim-d-side-h">
                {convert(title)}
                {meta != null && meta !== '' && <span className="bim-d-meta">{meta}</span>}
            </h2>
            {sub && <p className="bim-d-side-sub bim-d-ui">{sub}</p>}
            <ul>
                {shown.map((it, i) => (
                    <li key={i} className={i === currentIndex ? 'bim-d-side-cur' : undefined}
                        aria-current={i === currentIndex ? 'page' : undefined}>
                        {it}
                        {metas?.[i] ? <span className="bim-d-meta" style={{ marginLeft: 'auto' }}>{metas[i]}</span> : null}
                    </li>
                ))}
            </ul>
            {rest > 0 && (
                <MoreLink
                    label={moreLabel ? moreLabel(rest) : `顯示更多（${rest}）`}
                    onClick={() => setAll(true)}
                />
            )}
            {foot && <p className="bim-d-side-note bim-d-ui">{foot}</p>}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// 卡底：审核状态 / 待核 / 数据版本
// ══════════════════════════════════════════════════════════════

const REVIEW_LABEL: Record<string, string> = {
    reviewed: '已審核',
    disputed: '有爭議',
    unreviewed: '未審核',
    draft: '草稿',
};

/**
 * 卡底小字。revision / review / todo 有值才出现；
 * review 缺省等同 unreviewed，但**不显示**「未審核」——全库目前都没审过，
 * 条条挂一句「未審核」只是噪音（SCHEMA「review」一节同此意）。
 */
export function CardFoot({ revision, revisedAt, review, todo }: {
    revision?: number | string;
    revisedAt?: string;
    review?: { status: string; by?: string; date?: string };
    todo?: { what: string; by?: string; date?: string }[];
}) {
    const { convert } = useConvert();
    // 只认已知状态：数据少的条目 review.status 可能是原始英文（draft 等），直接露出会显得像 bug
    const reviewLabel = review ? REVIEW_LABEL[review.status] : undefined;
    const reviewText = review && review.status !== 'unreviewed' && reviewLabel
        ? [reviewLabel, review.by, review.date].filter(Boolean).join(' ')
        : '';
    const line = [
        revision != null && revision !== '' ? `${convert('數據版本')} ${revision}` : '',
        revisedAt ?? '',
        convert(reviewText),
    ].filter(Boolean);
    const todos = (todo || []).filter(x => x && x.what);
    if (!line.length && !todos.length) return null;
    return (
        <>
            {line.length > 0 && <MetaLine items={line} style={{ fontSize: 12 }} />}
            {todos.length > 0 && (
                <details>
                    <summary>{convert(`待核 ${todos.length} 項`)}</summary>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                        {todos.map((x, i) => (
                            <li key={i}>
                                {convert(x.what)}
                                {(x.by || x.date) && (
                                    <span style={{ marginLeft: 6 }}>
                                        （{[x.by && convert(x.by), x.date].filter(Boolean).join(' · ')}）
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </>
    );
}
