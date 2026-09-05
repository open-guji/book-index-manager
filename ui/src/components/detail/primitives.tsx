/**
 * 详情页版式原语。
 *
 * 三张页面（作品 / 版本 / 丛编）共享同一套骨架：单栏 1000px 版心、
 * 无卡片无圆角无阴影、层级全靠 1px/2px 直线。这里把重复出现的模式
 * 抽成组件，页面文件只负责「哪些区块、什么数据」。
 *
 * 配色一律走 --bim-* 变量（见 styles/variables.css 的详情页一节），
 * 不写字面色——否则换肤和深色模式就废了。
 */
import React, { useState } from 'react';
import { useBidUrl } from '../../core/bid-url';

// ══════════════════════════════════════════════════════════════
// 布局常量
// ══════════════════════════════════════════════════════════════

export const PAGE_MAX_WIDTH = 1000;

/** 窄屏断点。用 CSS media query 而非 window.innerWidth，保证 SSR/hydrate 一致 */
export const NARROW_QUERY = '(max-width: 719px)';

/**
 * 全局样式。用 class 前缀 bim-d- 避免与消费者站点冲突。
 *
 * 响应式全部在这里用 media query 表达：JS 侧不读 window 宽度，
 * 于是 Next.js 服务端渲染出的 HTML 与客户端首帧完全一致。
 */
export const DETAIL_CSS = `
.bim-d-page {
  background: var(--bim-page-bg, #fbf9f3);
  color: var(--bim-ink, #2a231c);
  font-family: var(--bim-font-body, system-ui, sans-serif);
  min-height: 100%;
  padding-bottom: 64px;
}
.bim-d-main {
  max-width: ${PAGE_MAX_WIDTH}px;
  margin: 0 auto;
  padding: 24px clamp(16px, 4vw, 28px) 0;
}
.bim-d-ui { font-family: var(--bim-font-ui, system-ui, sans-serif); }

.bim-d-page a { color: var(--bim-accent, #9c3a2c); text-decoration: none; }
.bim-d-page a:hover {
  color: var(--bim-accent-deep, #6f2a20);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.bim-d-page ::selection { background: var(--bim-selection-bg, #ecdcbc); }

/* 表格行 */
.bim-d-row { display: grid; align-items: center; padding: 9px 4px;
  border-bottom: 1px solid var(--bim-rule, #eae2d0); font-size: 14px; }
.bim-d-row:hover { background: var(--bim-row-hover-bg, #f5f1e5); }

/* intro / 成对区块：宽屏两栏，窄屏单栏 */
.bim-d-intro { display: grid; grid-template-columns: minmax(0, 1fr) 244px; gap: 30px;
  padding: 20px 0 26px; border-bottom: 1px solid var(--bim-rule, #e4dbc9);
  margin-bottom: 40px; align-items: start; }
.bim-d-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 34px;
  align-items: start; margin-bottom: 48px; }
.bim-d-pair-wide { grid-template-columns: 1fr 1.2fr; }

@media ${NARROW_QUERY} {
  .bim-d-intro { grid-template-columns: 1fr; gap: 20px; margin-bottom: 32px; }
  .bim-d-pair, .bim-d-pair-wide { grid-template-columns: 1fr; gap: 40px; }
  /* 表格：meta 列折到第二行，表头隐藏 */
  .bim-d-thead { display: none !important; }
  .bim-d-row { grid-template-columns: 22px 1fr !important; gap: 5px 10px !important;
    align-items: baseline; padding: 10px 2px; }
  .bim-d-row-meta { grid-column: 2; display: flex !important; flex-wrap: wrap;
    gap: 4px 14px; font-size: 12px; }
  .bim-d-h1 { font-size: 32px !important; }
}
`;

// ══════════════════════════════════════════════════════════════
// 骨架
// ══════════════════════════════════════════════════════════════

export function PageFrame({ children, style }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return (
        <div className="bim-d-page" style={style}>
            <style>{DETAIL_CSS}</style>
            {/*
              * 用 div 而非 <main>：消费者（kaiyuanguji-web）的站点外壳里
              * 已经有一个 <main>，再嵌一个会出现两个 main —— 无障碍语义上
              * 一个文档只该有一个主区域，e2e 里 locator('main') 也会因此
              * 命中两个元素而报 strict mode violation。
              */}
            <div className="bim-d-main">{children}</div>
        </div>
    );
}

/** 顶条：品牌/面包屑 ｜ 右侧动作 */
export function TopStrip({ breadcrumb, actions }: {
    breadcrumb: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <div
            className="bim-d-ui"
            style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                justifyContent: 'space-between', gap: '8px 16px', marginBottom: 24,
                fontSize: 12, color: 'var(--bim-label-fg, #8b7a62)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {breadcrumb}
            </div>
            {actions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{actions}</div>
            )}
        </div>
    );
}

/** 方形字形徽章（版·源·目·考·續·叢·收·作） */
export function GlyphBadge({ char, tone = 'accent' }: {
    char: string;
    tone?: 'accent' | 'ink';
}) {
    return (
        <span
            aria-hidden="true"
            style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, flex: 'none', fontSize: 11,
                fontFamily: 'var(--bim-font-ui, system-ui, sans-serif)',
                background: tone === 'accent'
                    ? 'var(--bim-accent, #9c3a2c)'
                    : 'var(--bim-ink, #2a231c)',
                color: 'var(--bim-page-bg, #fbf9f3)',
            }}
        >
            {char}
        </span>
    );
}

export function Breadcrumb({ items }: {
    items: { label: string; onClick?: () => void; href?: string }[];
}) {
    return (
        <>
            {items.map((it, i) => {
                const last = i === items.length - 1;
                const sep = i > 0 && (
                    <span key={`s${i}`} style={{ color: 'var(--bim-hint-fg, #cbbda0)' }}>／</span>
                );
                const label = last || (!it.onClick && !it.href)
                    ? <span key={i} style={{ color: 'var(--bim-ink, #2a231c)' }}>{it.label}</span>
                    : (
                        <a
                            key={i}
                            href={it.href ?? '#'}
                            onClick={it.onClick ? (e) => {
                                if (e.metaKey || e.ctrlKey) return;
                                e.preventDefault();
                                it.onClick!();
                            } : undefined}
                            style={{ color: 'var(--bim-meta-fg, #7b6a54)' }}
                        >
                            {it.label}
                        </a>
                    );
                return <React.Fragment key={i}>{sep}{label}</React.Fragment>;
            })}
        </>
    );
}

/** 页头：大标题 + 副题 + 右上小字 + （可选）第二行 */
export function DetailHeader({ title, subtitle, aside, secondLine }: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    aside?: React.ReactNode;
    secondLine?: React.ReactNode;
}) {
    return (
        <header style={{ borderBottom: '2px solid var(--bim-rule-strong, #2a231c)', paddingBottom: 18 }}>
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
                justifyContent: 'space-between', gap: '10px 24px',
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px', minWidth: 0 }}>
                    <h1 className="bim-d-h1" style={{
                        margin: 0, fontSize: 42, fontWeight: 700,
                        letterSpacing: '.06em', lineHeight: 1.1, wordBreak: 'break-word',
                    }}>
                        {title}
                    </h1>
                    {subtitle && (
                        <span style={{
                            fontSize: 15, color: 'var(--bim-meta-fg, #7b6a54)', letterSpacing: '.06em',
                        }}>
                            {subtitle}
                        </span>
                    )}
                </div>
                {aside && (
                    <span className="bim-d-ui" style={{
                        fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)', letterSpacing: '.06em',
                    }}>
                        {aside}
                    </span>
                )}
            </div>
            {secondLine && (
                <div style={{ marginTop: 12, fontSize: 13.5, color: 'var(--bim-quiet-fg, #5b4f40)' }}>
                    {secondLine}
                </div>
            )}
        </header>
    );
}

/** intro 区：左正文 + 右 facts */
export function IntroGrid({ children, facts }: {
    children?: React.ReactNode;
    facts?: React.ReactNode;
}) {
    // 只有 facts 没有正文时（Book description 仅 2.5% 有），facts 横排铺满，
    // 免得右侧孤零零一列、左边一大片空白
    if (!children && facts) {
        return (
            <div style={{
                padding: '20px 0 26px',
                borderBottom: '1px solid var(--bim-rule, #e4dbc9)',
                marginBottom: 40,
            }}>
                {facts}
            </div>
        );
    }
    return (
        <div className="bim-d-intro">
            <div style={{ minWidth: 0 }}>{children}</div>
            {facts}
        </div>
    );
}

export interface FactItem {
    label: string;
    value: React.ReactNode;
    /** hover 提示（如「據版本題名推斷」） */
    title?: string;
}

/** facts 列表：左标签右值，带朱色左线 */
export function FactList({ items, horizontal }: {
    items: FactItem[];
    /**
     * 横排模式：没有简介正文时用（Book 的 description 只有 2.5% 有）。
     * 此时标签与值改为上下堆叠——横排还左右对齐的话，标签和值之间会被
     * 拉开一大段空白，读者要横扫半个屏幕才能把「冊次」和「第 321–343 冊」
     * 对上号。
     */
    horizontal?: boolean;
}) {
    if (!items.length) return null;
    return (
        <div style={{
            borderLeft: '2px solid var(--bim-accent, #9c3a2c)',
            paddingLeft: 16,
            display: horizontal ? 'grid' : 'flex',
            gridTemplateColumns: horizontal ? 'repeat(auto-fit, minmax(150px, max-content))' : undefined,
            flexDirection: horizontal ? undefined : 'column',
            gap: horizontal ? '14px 40px' : 10,
            fontSize: 13,
        }}>
            {items.map((f, i) => (
                <div key={i} title={f.title}
                    style={horizontal
                        ? { display: 'flex', flexDirection: 'column', gap: 3 }
                        : { display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span className="bim-d-ui" style={{
                        color: 'var(--bim-label-fg, #a3937b)', letterSpacing: '.08em', flex: 'none',
                    }}>
                        {f.label}
                    </span>
                    <span style={{
                        color: 'var(--bim-body-fg, #3b3228)',
                        textAlign: horizontal ? 'left' : 'right',
                        minWidth: 0,
                    }}>
                        {f.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** 区块头：徽章 + 标题 + 计数 ｜ 右侧动作 */
export function SectionHead({ glyph, tone, title, count, actions, id }: {
    glyph: string;
    tone?: 'accent' | 'ink';
    title: string;
    count?: React.ReactNode;
    actions?: React.ReactNode;
    id?: string;
}) {
    return (
        <div
            id={id}
            style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
                justifyContent: 'space-between', gap: '10px 16px', marginBottom: 14,
                scrollMarginTop: 16,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GlyphBadge char={glyph} tone={tone} />
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '.1em' }}>
                    {title}
                </h2>
                {count != null && (
                    <span className="bim-d-ui" style={{
                        fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                    }}>
                        {count}
                    </span>
                )}
            </div>
            {actions && (
                <div className="bim-d-ui" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
                    {actions}
                </div>
            )}
        </div>
    );
}

export function Section({ children, style }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return <section style={{ marginBottom: 48, ...style }}>{children}</section>;
}

// ══════════════════════════════════════════════════════════════
// 按钮 / chip
// ══════════════════════════════════════════════════════════════

/** 筛选 chip（朝代、部类、分组）。选中态为朱红实心。 */
export function FilterChip({ label, active, onClick, dashed }: {
    label: string;
    active?: boolean;
    onClick?: () => void;
    dashed?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className="bim-d-ui"
            style={{
                padding: '5px 13px',
                border: `1px ${dashed && !active ? 'dashed' : 'solid'} ${active
                    ? 'var(--bim-accent, #9c3a2c)'
                    : 'var(--bim-rule, #e0d6c0)'}`,
                background: active ? 'var(--bim-accent, #9c3a2c)' : 'transparent',
                color: active ? 'var(--bim-page-bg, #fbf9f3)' : 'var(--bim-meta-fg, #7b6a54)',
                fontSize: 12, cursor: 'pointer', letterSpacing: '.04em', lineHeight: 1.4,
            }}
        >
            {label}
        </button>
    );
}

/** 文字按钮（排序切换等），带下划线 */
export function TextButton({ label, onClick }: { label: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="bim-d-ui"
            style={{
                background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, color: 'var(--bim-meta-fg, #7b6a54)',
                borderBottom: '1px solid var(--bim-rule, #d6c9ae)',
            }}
        >
            {label}
        </button>
    );
}

/** 整行宽的虚线「展开其余 N 条」按钮 */
export function MoreButton({ label, onClick, inline }: {
    label: string;
    onClick: () => void;
    /** inline = chip 牆里的「更多 N 種」，非整行 */
    inline?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="bim-d-ui"
            style={{
                marginTop: inline ? 0 : 12,
                width: inline ? undefined : '100%',
                padding: inline ? '4px 12px' : 9,
                background: 'none',
                border: '1px dashed var(--bim-rule-dashed, #d6c9ae)',
                cursor: 'pointer', fontSize: 12,
                color: 'var(--bim-meta-fg, #7b6a54)',
                letterSpacing: inline ? undefined : '.08em',
            }}
        >
            {label}
        </button>
    );
}

/** 条目 chip（关联作品、别名、同作品其他版本…） */
export function Chip({ children, href, onClick, title }: {
    children: React.ReactNode;
    href?: string;
    onClick?: () => void;
    title?: string;
}) {
    const style: React.CSSProperties = {
        display: 'inline-block', padding: '4px 10px',
        border: '1px solid var(--bim-rule, #e0d6c0)',
        fontSize: 13, color: 'var(--bim-body-fg, #3b3228)', lineHeight: 1.5,
    };
    if (href || onClick) {
        return (
            <a
                href={href ?? '#'}
                title={title}
                onClick={onClick ? (e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    onClick();
                } : undefined}
                style={style}
            >
                {children}
            </a>
        );
    }
    return <span title={title} style={style}>{children}</span>;
}

/** chip 牆：自动换行 + 「更多 N」 */
export function ChipWall({ children }: { children: React.ReactNode }) {
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>;
}

/** 册次方块（版本页「收入叢編」的 321…343） */
export function VolumeChips({ volumes, unit = '冊', max = 60 }: {
    volumes: number[];
    unit?: string;
    max?: number;
}) {
    const [all, setAll] = useState(false);
    if (!volumes.length) return null;
    const shown = all ? volumes : volumes.slice(0, max);
    return (
        <div className="bim-d-ui" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11.5 }}>
            {shown.map(n => (
                <span key={n} style={{
                    minWidth: 30, textAlign: 'center', padding: '2px 5px',
                    border: '1px solid var(--bim-rule, #e0d6c0)',
                    color: 'var(--bim-meta-fg, #7b6a54)',
                }}>
                    {n}
                </span>
            ))}
            {!all && volumes.length > max && (
                <button type="button" onClick={() => setAll(true)}
                    style={{
                        padding: '2px 8px', background: 'none', cursor: 'pointer',
                        border: '1px dashed var(--bim-rule-dashed, #d6c9ae)',
                        fontFamily: 'inherit', fontSize: 11.5, color: 'var(--bim-meta-fg, #7b6a54)',
                    }}>
                    +{volumes.length - max}
                </button>
            )}
            <span style={{ padding: '2px 6px', color: 'var(--bim-hint-fg, #b3a385)' }}>{unit}</span>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// 表格
// ══════════════════════════════════════════════════════════════

/** 表格容器：顶部墨线 */
export function DataTable({ children }: { children: React.ReactNode }) {
    return <div style={{ borderTop: '1px solid var(--bim-rule-strong, #2a231c)' }}>{children}</div>;
}

/**
 * 表头。columns 描述 meta 区的子列宽度（与行内保持一致）。
 * 窄屏由 CSS 隐藏。
 */
export function TableHead({ leadWidth, metaWidth, metaColumns, mainLabel }: {
    leadWidth: number;
    metaWidth: number;
    metaColumns: { label: string; width: string }[];
    mainLabel: string;
}) {
    return (
        <div
            className="bim-d-thead bim-d-ui"
            style={{
                display: 'grid',
                gridTemplateColumns: `${leadWidth}px 1fr ${metaWidth}px`,
                gap: 12, padding: '7px 4px',
                borderBottom: '1px solid var(--bim-rule-strong, #2a231c)',
                fontSize: 11, color: 'var(--bim-label-fg, #8b7a62)', letterSpacing: '.1em',
            }}
        >
            <span />
            <span>{mainLabel}</span>
            <span style={{
                display: 'grid',
                gridTemplateColumns: metaColumns.map(c => c.width).join(' '),
                gap: 12,
            }}>
                {metaColumns.map(c => <span key={c.label}>{c.label}</span>)}
            </span>
        </div>
    );
}

/** 表格行：行号 + 主内容 + meta 组合列 */
export function TableRow({ no, main, meta, leadWidth, metaWidth, metaColumns }: {
    no: React.ReactNode;
    main: React.ReactNode;
    meta: React.ReactNode;
    leadWidth: number;
    metaWidth: number;
    metaColumns: string[];
}) {
    return (
        <div
            className="bim-d-row"
            style={{ gridTemplateColumns: `${leadWidth}px 1fr ${metaWidth}px`, gap: 12 }}
        >
            <span className="bim-d-ui" style={{
                fontSize: 10.5, color: 'var(--bim-hint-fg, #c2b294)', textAlign: 'right',
            }}>
                {no}
            </span>
            <span style={{ minWidth: 0 }}>{main}</span>
            <span
                className="bim-d-row-meta"
                style={{
                    display: 'grid',
                    gridTemplateColumns: metaColumns.join(' '),
                    gap: 12, alignItems: 'center', fontSize: 12,
                }}
            >
                {meta}
            </span>
        </div>
    );
}

/** 空值占位「—」 */
export function Dash() {
    return <span style={{ color: 'var(--bim-hint-fg, #cbbda0)' }}>—</span>;
}

/**
 * 可展开行（书目收录 / 考证）：＋/－ 方块 + 主行 + 展开内容。
 * 展开内容缩进对齐主行文字，带浅色左线。
 */
export function ExpandRow({ open, onToggle, main, action, children }: {
    open: boolean;
    onToggle: () => void;
    main: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div style={{ borderBottom: '1px solid var(--bim-rule, #eae2d0)' }}>
            <div
                className="bim-d-expand-head"
                style={{
                    display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12,
                    alignItems: 'baseline', padding: '9px 4px',
                }}
            >
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    className="bim-d-ui"
                    style={{
                        width: 18, height: 18, display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center', padding: 0,
                        cursor: 'pointer', fontSize: 12, lineHeight: 1,
                        border: `1px solid ${open ? 'var(--bim-accent, #9c3a2c)' : 'var(--bim-rule-dashed, #d6c9ae)'}`,
                        background: open ? 'var(--bim-accent, #9c3a2c)' : 'transparent',
                        color: open ? 'var(--bim-page-bg, #fbf9f3)' : 'var(--bim-accent, #9c3a2c)',
                    }}
                >
                    {open ? '－' : '＋'}
                </button>
                <span style={{ fontSize: 14, minWidth: 0 }}>{main}</span>
                {action}
            </div>
            {open && children && (
                <div style={{
                    padding: '2px 4px 14px 38px',
                    borderLeft: '2px solid var(--bim-rule-accent-soft, #e0d3b6)',
                    marginLeft: 12,
                }}>
                    {children}
                </div>
            )}
        </div>
    );
}

/** 展开区里的引文块（提要 / 按语 / 附按） */
export function Quote({ label, children }: { label?: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 10 }}>
            {label && (
                <div className="bim-d-ui" style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: '.1em',
                    color: 'var(--bim-label-fg, #a3937b)', marginBottom: 4,
                }}>
                    {label}
                </div>
            )}
            <div style={{
                fontSize: 13.5, lineHeight: 2, color: 'var(--bim-quiet-fg, #5b4f40)',
                textAlign: 'justify',
            }}>
                {children}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// 资源
// ══════════════════════════════════════════════════════════════

/** 资源分组：标题 + 右上标签 + 若干行 */
export function ResourceGroup({ title, tag, children }: {
    title: string;
    tag?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8, paddingBottom: 7,
                borderBottom: '1px solid var(--bim-rule-strong, #2a231c)', marginBottom: 2,
            }}>
                <span style={{ fontSize: 14.5, letterSpacing: '.08em' }}>{title}</span>
                {tag && (
                    <span className="bim-d-ui" style={{
                        fontSize: 10.5, color: 'var(--bim-accent, #9c3a2c)', letterSpacing: '.06em',
                    }}>
                        {tag}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
        </div>
    );
}

/** 资源行：名称 + note + 外链箭头 */
export function ResourceRow({ name, note, href, extra }: {
    name: React.ReactNode;
    note?: string;
    href?: string;
    /** 行尾附加内容（如分册展开按钮） */
    extra?: React.ReactNode;
}) {
    const body = (
        <>
            <span style={{ fontSize: 14, minWidth: 0 }}>{name}</span>
            <span className="bim-d-ui" style={{
                fontSize: 11, color: 'var(--bim-hint-fg, #b3a385)', flex: 'none',
            }}>
                {href ? '↗' : ''}
            </span>
            {note && (
                <span className="bim-d-ui" style={{
                    gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
                }}>
                    {note}
                </span>
            )}
        </>
    );
    const style: React.CSSProperties = {
        display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px',
        padding: '9px 4px', borderBottom: '1px solid var(--bim-rule, #eae2d0)',
        color: 'var(--bim-body-fg, #3b3228)', alignItems: 'baseline',
    };
    return (
        <>
            {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" style={style}>{body}</a>
            ) : (
                <div style={style}>{body}</div>
            )}
            {extra}
        </>
    );
}

// ══════════════════════════════════════════════════════════════
// 页脚 / 空状态 / 链接
// ══════════════════════════════════════════════════════════════

export function DetailFooter({ left, right }: {
    left?: React.ReactNode;
    right?: React.ReactNode;
}) {
    return (
        <footer className="bim-d-ui" style={{
            marginTop: 52, paddingTop: 14,
            borderTop: '1px solid var(--bim-rule, #e4dbc9)',
            display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
            gap: '8px 16px', fontSize: 11.5, color: 'var(--bim-label-fg, #a3937b)',
        }}>
            <span>{left}</span>
            {right && <span style={{ display: 'flex', gap: 16 }}>{right}</span>}
        </footer>
    );
}

/** 空状态说明（如「暫無版本著錄」） */
export function EmptyNote({ children, action }: {
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="bim-d-ui" style={{
            padding: '18px 4px', fontSize: 12.5,
            color: 'var(--bim-label-fg, #a3937b)',
            borderBottom: '1px solid var(--bim-rule, #eae2d0)',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        }}>
            <span>{children}</span>
            {action}
        </div>
    );
}

/** 链接渲染上下文。消费者可据此调整样式，如表格里不显示类型图标。 */
export interface LinkContext {
    /** 位于成列的表格/列表中——整列同类型时图标只是噪音 */
    dense?: boolean;
}

export type RenderLink = (id: string, label?: string, ctx?: LinkContext) => React.ReactNode;

/** 内部条目链接。renderLink 优先（消费者可换成 next/link），其次 onNavigate。 */
export function BidLink({ id, label, onNavigate, renderLink, style, dense }: {
    id: string;
    label?: React.ReactNode;
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
    style?: React.CSSProperties;
    /** 表格内使用，透传给 renderLink 让消费者精简样式 */
    dense?: boolean;
}) {
    const buildUrl = useBidUrl();
    if (renderLink) {
        return <>{renderLink(id, typeof label === 'string' ? label : undefined, { dense })}</>;
    }
    return (
        <a
            href={buildUrl(id)}
            onClick={onNavigate ? (e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onNavigate(id);
            } : undefined}
            style={style}
        >
            {label ?? id}
        </a>
    );
}

/** 外部链接（资源、机构） */
export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children} <span className="bim-d-ui" style={{ fontSize: 11 }}>↗</span>
        </a>
    );
}
