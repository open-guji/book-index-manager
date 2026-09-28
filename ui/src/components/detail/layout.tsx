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
.bim-d-zt-ver tbody tr { height: 42px; }

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

/* 著录分栏 */
.bim-d-lu { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 24px; align-items: start; }
.bim-d-lu-list { list-style: none; margin: 0; padding: 0; }
.bim-d-lu-list button {
  display: block; width: 100%; text-align: left; background: none; border: 0; cursor: pointer;
  padding: 7px 12px; border-radius: 6px; font: inherit; font-size: 15px; color: ${bim('quiet-fg')};
}
.bim-d-lu-list button:hover { background: ${bim('zebra-bg')}; }
.bim-d-lu-list button[aria-selected="true"] { background: ${bim('flag-bg')}; color: ${bim('accent')}; font-weight: 500; }
.bim-d-lu-body { padding: 4px 0; min-width: 0; }
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
  .bim-d-card-foot summary { min-height: 44px; }
  .bim-d-side li { padding: 0; }
  .bim-d-side a { display: inline-flex; align-items: center; min-height: 44px; }
  .bim-d-lu-list button { min-height: 44px; }
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
  /* 手机上版本行是块：解析前只有版本名一行，先按「名 + 一行年代馆藏」占高 */
  .bim-d-zt-ver tbody tr { height: auto; }
  /* 朝代页签晚到、在手机上自成一行：解析中先占两行（页签一行 + 复选框一行） */
  .bim-d-filters[data-pending] { min-height: 92px; align-content: flex-end; }
  .bim-d-zt-ver tbody tr[data-loading] { min-height: 64px; }
  .bim-d-lu { grid-template-columns: 1fr; gap: 12px; }
  .bim-d-lu-list { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
  .bim-d-lu-list button { white-space: nowrap; padding: 6px 12px; }
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
 * rail   —— 左栏：宿主传入的检索框等（railTop）+ 返回链接 + 本页区块导航
 * main   —— 中栏正文
 * card   —— 右栏提要卡
 * side   —— 右栏提要卡下的旁栏清单（手机上排到正文之后）
 */
export function DetailGrid({ railTop, back, nav, railLinks, main, card, side }: {
    railTop?: React.ReactNode;
    back?: React.ReactNode;
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
    title, subtitle, byline, meta, description, facts, readAction, children, foot,
}: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    byline?: React.ReactNode;
    meta?: React.ReactNode;
    description?: React.ReactNode;
    facts?: CardFact[];
    /** 「阅读全文」主按钮（ReadButton） */
    readAction?: React.ReactNode;
    /** 事实表之后、按钮之前的附加内容（附记等） */
    children?: React.ReactNode;
    /** 卡底小字：数据版本、审核状态、待核事项 */
    foot?: React.ReactNode;
}) {
    const { convert } = useConvert();
    const shownFacts = (facts || []).filter(f => f.value != null && f.value !== '');
    return (
        <div className="bim-d-card">
            {/* 长标题（版本名「欽定四庫全書·文淵閣本」之类）降一级字号，免得折成三行 */}
            <h1 className={typeof title === 'string' && [...title].length > 7 ? 'bim-d-card-long' : undefined}>{title}</h1>
            {subtitle && <div className="bim-d-card-sub">{subtitle}</div>}
            {byline && <p className="bim-d-card-byline" style={{ marginBottom: 0 }}>{byline}</p>}
            {meta && <div className="bim-d-card-cls bim-d-ui">{meta}</div>}
            {description && <div className="bim-d-card-desc">{description}</div>}
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
            {foot && <div className="bim-d-card-foot bim-d-ui">{foot}</div>}
        </div>
    );
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
export function SideList({ id, title, meta, items, cap = 8, moreLabel }: {
    id?: string;
    title: string;
    meta?: React.ReactNode;
    items: React.ReactNode[];
    cap?: number;
    /** 默认「顯示更多（n）」 */
    moreLabel?: (rest: number) => string;
}) {
    const { convert } = useConvert();
    const [all, setAll] = useState(false);
    if (!items.length) return null;
    const shown = all ? items : items.slice(0, cap);
    const rest = items.length - shown.length;
    return (
        <div id={id} className="bim-d-side" style={{ scrollMarginTop: 16 }}>
            <h2 className="bim-d-ui bim-d-side-h">
                {convert(title)}
                {meta != null && meta !== '' && <span className="bim-d-meta">{meta}</span>}
            </h2>
            <ul>
                {shown.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
            {rest > 0 && (
                <MoreLink
                    label={moreLabel ? moreLabel(rest) : `顯示更多（${rest}）`}
                    onClick={() => setAll(true)}
                />
            )}
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
    const reviewText = review && review.status !== 'unreviewed'
        ? [REVIEW_LABEL[review.status] ?? review.status, review.by, review.date].filter(Boolean).join(' ')
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
