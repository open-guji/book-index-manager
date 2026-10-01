import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { AuthorInfo, CollatedEditionIndex, CollatedJuan, CollatedSection, JuanGroup, TextQualityGrade } from '../types';
import { TEXT_QUALITY_LABELS } from '../types';
import type { IndexStorage } from '../storage/types';
import { useI18n } from '../i18n/use-i18n';
import type { LocaleMessages } from '../i18n/types';
import { useBidUrl } from '../core/bid-url';
import { renderInterlinear, truncateOutsideJiazhu } from './detail/primitives';
import { bim } from '../styles/tokens';
import { ReaderMdText, canParagraphize, renderReaderInline } from './Reader/ReaderText';
import type { ReaderPrefs } from './Reader/prefs';

// ── 工具函数 ──

// 兼容旧数据：部分 JSON 仍存 ABCD 字母。数据迁移后可删。
const LEGACY_GRADE_MAP: Record<string, TextQualityGrade> = {
    A: 'fine', B: 'rough', C: 'rough', D: 'ocr',
};
function normalizeTextQualityGrade(g: unknown): TextQualityGrade | null {
    if (typeof g !== 'string') return null;
    if (g in TEXT_QUALITY_LABELS) return g as TextQualityGrade;
    if (g in LEGACY_GRADE_MAP) return LEGACY_GRADE_MAP[g];
    return null;
}

/** 兼容繁简两种 type 写法（直齋等繁体整理本用 書/類，多数志书用 书/类）。
 *  规一化到简体后再比对。
 */
const TYPE_T2S: Record<string, string> = {
    '書': '书', '類': '类', '結語': '结语', '結语': '结语',
    '考證': '考证', '詩': '诗',
};

/**
 * book-text 拆分后整理本数据统一改用英文 type 枚举（book/poem/category/...），
 * 前端一直只认中文（书/诗/类/...），导致所有判断落空——书目标题不渲染、
 * 目录统计归零、原文视图完全空白。2026-09-03 补上英文→中文映射。
 * prose（散文/赋）、reconstruction（辑佚复原条目）语义上都是书目条目，
 * 归入「书」；verification 归入「考证」；page_header（页眉，非正文）不映射，
 * 调用处按未知类型过滤掉；comment 是本次新增的独立类型「注释」。
 */
const TYPE_EN2CN: Record<string, string> = {
    book: '书', poem: '诗', category: '类', preface: '序',
    verification: '考证', prose: '书', reconstruction: '书',
    comment: '注释',
};
export function normSectionType(t: unknown): string {
    if (typeof t !== 'string') return '';
    return TYPE_T2S[t] ?? TYPE_EN2CN[t] ?? t;
}

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UNITS = ['', '十', '百', '千'];
const CN_BIG_UNITS = ['', '萬', '億'];

function toChineseNumeral(n: number): string {
    if (n === 0) return '〇';
    if (n < 0) return `負${toChineseNumeral(-n)}`;

    const parts: string[] = [];
    let remaining = n;
    let bigIdx = 0;

    while (remaining > 0) {
        const segment = remaining % 10000;
        if (segment > 0) {
            parts.unshift(segmentToChinese(segment, bigIdx > 0) + CN_BIG_UNITS[bigIdx]);
        } else if (parts.length > 0) {
            parts.unshift('〇');
        }
        remaining = Math.floor(remaining / 10000);
        bigIdx++;
    }

    return parts.join('').replace(/〇+/g, '〇').replace(/〇$/, '');
}

function segmentToChinese(n: number, needLeadingZero: boolean): string {
    const digits: number[] = [];
    let v = n;
    while (v > 0) { digits.unshift(v % 10); v = Math.floor(v / 10); }

    let result = '';
    for (let i = 0; i < digits.length; i++) {
        const d = digits[i];
        const unitIdx = digits.length - 1 - i;
        if (d === 0) {
            if (result && !result.endsWith('〇')) result += '〇';
        } else {
            if (d === 1 && unitIdx === 1 && (i === 0 && !needLeadingZero)) {
                result += CN_UNITS[unitIdx];
            } else {
                result += CN_DIGITS[d] + CN_UNITS[unitIdx];
            }
        }
    }
    return result.replace(/〇$/, '');
}

// ── 搜索归一化（繁→简，独立于 locale） ──

type Normalizer = (s: string) => string;
let _searchNormalizer: Normalizer | null = null;
let _searchNormLoading: Promise<void> | null = null;
const _searchNormSubs = new Set<() => void>();

function ensureSearchNormalizer(): Promise<void> {
    if (_searchNormalizer) return Promise.resolve();
    if (_searchNormLoading) return _searchNormLoading;
    _searchNormLoading = import('opencc-js/t2cn').then(mod => {
        _searchNormalizer = mod.Converter({ from: 'tw', to: 'cn' });
        _searchNormSubs.forEach(cb => cb());
    }).catch(() => {
        _searchNormalizer = (s: string) => s;
        _searchNormSubs.forEach(cb => cb());
    });
    return _searchNormLoading;
}

/**
 * 词典未就绪时的兜底。必须是稳定引用：每次渲染新建函数会让 useCrossJuanSearch
 * 的 effect 每轮重跑、setMatchStates({}) 又触发渲染，形成死循环（jsdom 下直接卡死）。
 */
const IDENTITY_NORMALIZER: Normalizer = (s: string) => s;

/** 触发繁→简归一化加载，并在加载完成时刷新组件 */
function useSearchNormalizer(): Normalizer {
    const [, force] = useState(0);
    useEffect(() => {
        if (_searchNormalizer) return;
        const cb = () => force(n => n + 1);
        _searchNormSubs.add(cb);
        ensureSearchNormalizer();
        return () => { _searchNormSubs.delete(cb); };
    }, []);
    return _searchNormalizer ?? IDENTITY_NORMALIZER;
}

function normalizeForSearch(s: string, normalizer: Normalizer): string {
    return normalizer(s).toLowerCase();
}

// ── 高亮 ──

const HIGHLIGHT_BG = bim('highlight-bg');

/**
 * 在 displayed 中查找 query 出现位置并用 <mark> 包裹。
 * 通过 normalizer（繁→简）做归一化匹配，使简体输入能命中繁体内容。
 * 假定归一化是 1:1 长度映射（tw→cn 绝大多数字符如此），位置直接对位。
 */
function renderHighlighted(displayed: string, query: string, normalizer: Normalizer): React.ReactNode {
    if (!query) return displayed;
    const nq = normalizeForSearch(query, normalizer);
    if (!nq) return displayed;
    const ndisp = normalizeForSearch(displayed, normalizer);
    // 长度不一致时退化为不高亮（仍显示原文），避免错位
    if (ndisp.length !== displayed.length) return displayed;
    const out: React.ReactNode[] = [];
    let cursor = 0;
    let key = 0;
    while (cursor < displayed.length) {
        const idx = ndisp.indexOf(nq, cursor);
        if (idx === -1) {
            out.push(displayed.slice(cursor));
            break;
        }
        if (idx > cursor) out.push(displayed.slice(cursor, idx));
        out.push(
            <mark key={key++} style={{ background: HIGHLIGHT_BG, padding: 0, color: 'inherit' }}>
                {displayed.slice(idx, idx + nq.length)}
            </mark>
        );
        cursor = idx + nq.length;
    }
    return <>{out}</>;
}

/** 判断一个 section 是否匹配 query（catalog 字段集 / kaozhen 字段集） */
function sectionMatches(s: CollatedSection, q: string, isKaozhen: boolean, normalizer: Normalizer): boolean {
    if (!q) return true;
    const nq = normalizeForSearch(q, normalizer);
    const fields: (string | undefined | null)[] = isKaozhen
        ? [s.title, s.header_line, s.content, s.comment]
        : [s.title, s.book_title, s.author, s.author_info, s.summary, s.content, s.comment, s.additional_comment];
    return fields.some(f => typeof f === 'string' && normalizeForSearch(f, normalizer).includes(nq));
}

/** 从 raw md 文本中粗略判断是否匹配 */
function rawTextMatches(text: string, q: string, normalizer: Normalizer): boolean {
    if (!q) return true;
    return normalizeForSearch(text, normalizer).includes(normalizeForSearch(q, normalizer));
}

// ── 样式常量 ──

// 回退值即原本的硬编码色，消费者不覆盖时观感不变
const SECTION_TYPE_COLORS: Record<string, string> = {
    '类': bim('section-lei'),
    '书': bim('section-shu'),
    '序': bim('section-xu'),
    '结语': bim('section-jieyu'),
    '注释': bim('section-zhushi'),
};

const KAOZHEN_TYPE_COLORS: Record<string, string> = {
    '考证': bim('section-kaozhen'),
};

/** 归一后的条目类型 → 徽章文字；字典里没有的（未知类型）按数据文字转换 */
function sectionTypeLabel(messages: LocaleMessages, normType: string, convert: (s: string) => string): string {
    return (messages.collated.sectionType as Record<string, string>)[normType] ?? convert(normType);
}

// ── 子组件 ──

/** 将文件名转为显示名 */
export function juanDisplayName(f: string): string {
    /*
     * 卷文件名有两种形态：扁平的 `juan001.json`，与带目录的 `juan/001.json`
     * （漢書藝文志等即是后者）。原先只按前者剥前缀，`juan/001` 剥掉 `juan`
     * 还剩 `/001`，读者看到的是「卷/001」——多一条斜杠。
     * 统一把分隔符去掉再判断。
     */
    const name = f.replace('.json', '').replace(/[/\\]/g, '');
    if (name === 'fulu') return '附錄';
    if (name.startsWith('juanshou')) {
        const n = name.replace('juanshou', '');
        return `卷首${n}`;
    }
    if (name.startsWith('juan')) {
        const n = name.replace('juan', '').replace(/^0+/, '');
        return `卷${n}`;
    }
    // 中文文件名（考证类）：直接去掉扩展名返回
    return name;
}

/** 每卷搜索状态：number = match 数；'loading' = 正在加载；undefined = 未触发搜索 */
export type JuanMatchState = number | 'loading' | undefined;

export function groupFileCount(group: JuanGroup): number {
    const own = group.files.length;
    const childCount = group.children?.reduce((sum, c) => sum + groupFileCount(c), 0) || 0;
    return own + childCount;
}

/** 计算分组内匹配总数，所有子文件都已加载完毕才返回 number；任一在 loading 返回 'loading'；query 为空返回 undefined */
export function groupMatchState(group: JuanGroup, matchStates: Record<string, JuanMatchState>): JuanMatchState {
    const all: string[] = [];
    const collect = (g: JuanGroup) => {
        all.push(...g.files);
        g.children?.forEach(collect);
    };
    collect(group);
    if (all.length === 0) return undefined;
    const states = all.map(f => matchStates[f]);
    if (states.every(s => s === undefined)) return undefined;
    if (states.some(s => s === 'loading')) return 'loading';
    let sum = 0;
    for (const s of states) if (typeof s === 'number') sum += s;
    return sum;
}

/** 折叠开关 <button> 的样式归零：外观与原先的 div 行一致 */
const toggleBtnReset: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
};

/**
 * 「▶ 展开」开关。有可展开内容时渲染 <button aria-expanded>（键盘 Tab / Enter / 空格可操作），
 * 否则退化为普通 span。不传 onClick 时点击冒泡给外层行处理——外层行里还有
 * 「→作品」等链接，不能整行都包进 button（交互元素不可嵌套）。
 * button 只能装行内内容，children 里用 span（需要块级就 display: block）。
 */
function ToggleArea({ enabled, expanded, onClick, style, children }: {
    enabled: boolean;
    expanded: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
    children: React.ReactNode;
}) {
    if (!enabled) return <span style={style}>{children}</span>;
    return (
        <button type="button" aria-expanded={expanded} onClick={onClick} style={{ ...toggleBtnReset, ...style }}>
            {children}
        </button>
    );
}

function SectionTypeBadge({ type }: { type: string }) {
    /*
     * 必须先归一。数据里的 section.type 自 2026-08 英文枚举迁移后是
     * `category`/`book`/`preface`，而 SECTION_TYPE_COLORS 与本徽章的文案
     * 都按中文（'类'/'书'/'序'）写的——直接拿原值，读者看到的就是一列
     * 英文 `category`，颜色也全部落到灰色兜底。
     * 漢書藝文志卷一（9 个 category 段）即是。
     */
    const { convert, messages } = useI18n();
    const label = normSectionType(type);
    const color = SECTION_TYPE_COLORS[label] || bim('desc-fg');
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 5px',
            fontSize: '10px',
            fontWeight: 500,
            color,
            border: `1px solid ${color}40`,
            borderRadius: '2px',
            background: `${color}08`,
            flexShrink: 0,
        }}>
            {sectionTypeLabel(messages, label, convert)}
        </span>
    );
}

function BookSection({ section, onNavigate, highlightQuery = '', no, showUnlinked = false, domId }: {
    /** 右栏锚点跳转用的 id */
    domId?: string;
    section: CollatedSection;
    onNavigate?: (id: string) => void;
    highlightQuery?: string;
    /** 序号（v3 条目表格第一列）；不传就不画这一列 */
    no?: number;
    /** 没有 work_id 的条目在右列写「未关联」（v3；「标出作品链接」关掉时不写） */
    showUnlinked?: boolean;
}) {
    const { t, convert } = useI18n();
    const buildUrl = useBidUrl();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        return renderInterlinear(convert(s), (seg) =>
            highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg, { t });
    };
    const [expanded, setExpanded] = useState(false);
    const hasSummary = !!section.summary;
    const hasComment = !!section.comment;
    const hasAdditionalComment = !!section.additional_comment;
    const hasLongContent = !!(section.content && section.content.length > 60);
    const hasContent = hasSummary || hasComment || hasAdditionalComment || hasLongContent;
    // 搜索时默认展开匹配条目，便于查看上下文
    useEffect(() => {
        if (highlightQuery) setExpanded(true);
    }, [highlightQuery]);
    // 缩略预览：直接截取 content 前段
    const preview = !expanded && hasLongContent ? truncateOutsideJiazhu(section.content!.replace(/\n/g, ' '), 80) + '…' : null;

    return (
        <div className="bim-rd-row" id={domId} style={{
            borderBottom: `1px solid ${bim('rule')}`,
            overflow: 'hidden',
        }}>
            <div
                onClick={() => hasContent && setExpanded(!expanded)}
                style={{
                    padding: '10px 10px',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                    cursor: hasContent ? 'pointer' : 'default',
                    userSelect: 'none',
                }}
            >
                {no != null && (
                    <span className="bim-rd-no" style={{ flex: 'none', width: 28, fontSize: 12, color: bim('label-fg') }}>{no}</span>
                )}
                <ToggleArea
                    enabled={hasContent}
                    expanded={expanded}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '8px' }}
                >
                    {hasContent && (
                        <span aria-hidden="true" style={{
                            fontSize: '9px',
                            color: bim('desc-fg'),
                            transition: 'transform 0.15s',
                            transform: expanded ? 'rotate(90deg)' : 'none',
                            display: 'inline-block',
                            flexShrink: 0,
                        }}>&#9654;</span>
                    )}
                    <span style={{ display: 'block', flex: 1, minWidth: 0 }}>
                        <span style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: bim('fg'),
                        }}>
                            {section.book_title ? <>《{hl(section.book_title)}》</> : hl(section.title)}
                            {section.n_juan != null && (
                                <span style={{
                                    fontSize: '12px',
                                    fontWeight: 400,
                                    color: bim('desc-fg'),
                                    marginLeft: '6px',
                                }}>
                                    {t('collated.nJuan', { n: convert(toChineseNumeral(section.n_juan)) })}
                                </span>
                            )}
                            {(section.author_info || section.author) && (
                                <span style={{
                                    fontSize: '12px',
                                    fontWeight: 400,
                                    color: bim('desc-fg'),
                                    marginLeft: '8px',
                                }}>
                                    {hl(section.author_info || section.author)}
                                </span>
                            )}
                        </span>
                        {!expanded && preview && (
                            <span style={{
                                display: 'block',
                                fontSize: '12px',
                                color: bim('desc-fg'),
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: '2px',
                            }}>
                                {hl(preview)}
                            </span>
                        )}
                    </span>
                </ToggleArea>
                {section.edition && (
                    <span style={{
                        fontSize: '11px',
                        color: bim('desc-fg'),
                    }}>
                        {hl(section.edition)}
                    </span>
                )}
                {section.tag && (
                    <span style={{
                        fontSize: '11px',
                        color: bim('section-tag-fg'),
                    }}>
                        {section.tag === 'triangle' ? '△' : section.tag}
                    </span>
                )}
                {section.work_id && onNavigate && (
                    <a
                        href={buildUrl(section.work_id)}
                        onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onNavigate(section.work_id!); }}
                        style={{
                            fontSize: '11px',
                            color: bim('link-fg'),
                            cursor: 'pointer',
                            textDecoration: 'none',
                            flexShrink: 0,
                        }}
                        title={t('collated.viewWork')}
                        aria-label={t('collated.viewWorkOf', { title: convert(section.book_title || section.title) })}
                    >
                        {t('collated.workArrow')}
                    </a>
                )}
                {showUnlinked && !section.work_id && (
                    <span style={{ fontSize: '11px', color: bim('label-fg'), flexShrink: 0 }}>{t('collated.unlinked')}</span>
                )}
            </div>

            {expanded && hasContent && (
                <div style={{
                    padding: '8px 12px 12px',
                    borderTop: `1px solid ${bim('widget-border')}`,
                    background: bim('bg'),
                }}>
                    {section.author_info && (
                        <div style={{
                            fontSize: '13px',
                            color: bim('desc-fg'),
                            marginBottom: '8px',
                        }}>
                            {hl(section.author_info)}
                        </div>
                    )}
                    {section.summary && (
                        <div style={{
                            marginBottom: '8px',
                            padding: '10px 14px',
                            borderLeft: `3px solid ${bim('primary')}`,
                            background: `color-mix(in srgb, ${bim('primary')} 4%, transparent)`,
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: bim('desc-fg'),
                                marginBottom: '4px',
                                letterSpacing: '1px',
                            }}>{t('collated.summary')}</div>
                            <p style={{
                                fontSize: '13px',
                                color: bim('fg'),
                                lineHeight: 1.9,
                                margin: 0,
                                textAlign: 'justify',
                            }}>{hl(section.summary)}</p>
                        </div>
                    )}
                    {section.comment && (
                        <div style={{
                            marginBottom: '8px',
                            padding: '8px 14px',
                            borderLeft: `3px solid ${bim('desc-fg')}`,
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: bim('desc-fg'),
                                marginBottom: '4px',
                                letterSpacing: '1px',
                            }}>{t('collated.comment')}</div>
                            <p style={{
                                fontSize: '13px',
                                color: bim('fg'),
                                lineHeight: 1.8,
                                margin: 0,
                                fontStyle: 'italic',
                            }}>{hl(section.comment)}</p>
                        </div>
                    )}
                    {section.additional_comment && (
                        <div style={{
                            padding: '8px 14px',
                            borderLeft: `3px solid ${bim('desc-fg')}`,
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: bim('desc-fg'),
                                marginBottom: '4px',
                                letterSpacing: '1px',
                            }}>{t('collated.additionalComment')}</div>
                            <p style={{
                                fontSize: '13px',
                                color: bim('fg'),
                                lineHeight: 1.8,
                                margin: 0,
                                fontStyle: 'italic',
                            }}>{hl(section.additional_comment)}</p>
                        </div>
                    )}
                    {hasLongContent && !hasSummary && !hasComment && !hasAdditionalComment && (
                        <p style={{
                            fontSize: '13px',
                            color: bim('fg'),
                            lineHeight: 1.9,
                            margin: 0,
                            textAlign: 'justify',
                            whiteSpace: 'pre-line',
                        }}>{hl(section.content)}</p>
                    )}
                </div>
            )}
        </div>
    );
}

function CategoryHeader({ section, highlightQuery = '' }: { section: CollatedSection; highlightQuery?: string }) {
    const { t, convert } = useI18n();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        return renderInterlinear(convert(s), (seg) =>
            highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg, { t });
    };
    const [expanded, setExpanded] = useState(false);
    const hasContent = !!section.content;

    return (
        <div style={{ padding: '12px 0 6px' }}>
            <ToggleArea
                enabled={hasContent}
                expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: hasContent ? 'pointer' : 'default',
                    userSelect: 'none',
                }}
            >
                <SectionTypeBadge type={section.type} />
                <span style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: bim('fg'),
                }}>
                    {hl(section.title)}
                </span>
                {hasContent && (
                    <span aria-hidden="true" style={{
                        fontSize: '9px',
                        color: bim('desc-fg'),
                        transition: 'transform 0.15s',
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        display: 'inline-block',
                    }}>&#9654;</span>
                )}
            </ToggleArea>
            {expanded && hasContent && (
                <div style={{
                    marginTop: '8px',
                    padding: '10px 14px',
                    borderLeft: `3px solid color-mix(in srgb, ${SECTION_TYPE_COLORS[normSectionType(section.type)] || bim('desc-fg')} 25%, transparent)`,
                    borderRadius: '0 4px 4px 0',
                    background: bim('bg'),
                }}>
                    <p style={{
                        fontSize: '13px',
                        color: bim('fg'),
                        lineHeight: 1.9,
                        margin: 0,
                        textAlign: 'justify',
                        whiteSpace: 'pre-line',
                    }}>{hl(section.content!)}</p>
                </div>
            )}
        </div>
    );
}

/**
 * page_header 段里混着两种东西，靠长度区分：
 *
 * - **真页眉**：「卷二 經部二」这类每页重复的书口题名，中位 20 字，
 *   照原样渲染只会在正文里插进一串噪声。
 * - **正文**：欽定四庫全書總目的卷首一·聖諭（11250 字）、進書表、凡例
 *   二十則、勘閱繕校諸臣職名……都被标成了 page_header。
 *
 * 此前一律 `return null` 丢弃，于是这 29 段共 4 万余字在页面上完全不存在，
 * 「卷首1」打开是空的（只显示「0 部书」）。阈值取 100 字：实测该书 212 段
 * 里 183 段短于 100（全是书口题名），29 段长于 100（全是正文），界限干净。
 */
const PAGE_HEADER_TEXT_MIN = 100;

export function isPageHeaderContent(section: { type?: string; content?: string }): boolean {
    if (normSectionType(section.type) !== 'page_header') return false;
    return (section.content || '').length >= PAGE_HEADER_TEXT_MIN;
}

export function OtherSection({ section, highlightQuery = '' }: { section: CollatedSection; highlightQuery?: string }) {
    const { t, convert, messages } = useI18n();
    const normalizer = useSearchNormalizer();
    // 短 page_header 是每页重复的书口题名，丢弃；长的其实是正文，照常渲染
    if (normSectionType(section.type) === 'page_header' && !isPageHeaderContent(section)) return null;
    if (!section.content && !section.title) return null;
    const rawText = convert((section.content || section.title || '').replace(/\n{2,}/g, '\n'));
    // 序／結語等塊原先直出 rawText，夾注兩種記法都沒渲染（2026-09-26 E-03：漢志卷首總序整段 `<師古曰…>` 直出）
    const text: React.ReactNode = renderInterlinear(rawText, (seg) =>
        highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg, { t });
    const normType = normSectionType(section.type);
    const typeColor = SECTION_TYPE_COLORS[normType] || bim('desc-fg');
    // 序/结语/注释：带左边框、类型标签，与"书"条目区分
    const isLabeled = normType === '序' || normType === '结语' || normType === '注释';
    return (
        <div style={{
            padding: isLabeled ? '10px 12px' : '6px 0',
            margin: isLabeled ? '8px 0' : undefined,
            fontSize: '13px',
            color: bim('desc-fg'),
            lineHeight: 1.8,
            whiteSpace: 'pre-line',
            borderLeft: isLabeled ? `3px solid ${typeColor}40` : undefined,
            background: isLabeled ? bim('bg') : undefined,
            borderRadius: isLabeled ? '0 4px 4px 0' : undefined,
            position: 'relative',
        }}>
            {isLabeled && (
                <span style={{
                    display: 'inline-block',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: typeColor,
                    marginRight: '8px',
                    padding: '1px 5px',
                    border: `1px solid ${typeColor}40`,
                    borderRadius: '2px',
                    background: `${typeColor}08`,
                    verticalAlign: 'middle',
                }}>
                    {sectionTypeLabel(messages, normType, convert)}
                </span>
            )}
            {text}
        </div>
    );
}

/** 作品标签缓存：{ title, author } */
type WorkLabel = { title: string; author?: string };
export type WorkLabelCache = Map<string, WorkLabel | null>;

/** Hook：批量获取作品标签（懒加载+缓存） */
function useWorkLabels(
    workIds: string[],
    transport?: IndexStorage,
    cache?: React.RefObject<WorkLabelCache>,
): Record<string, WorkLabel | null> {
    const [labels, setLabels] = useState<Record<string, WorkLabel | null>>({});

    useEffect(() => {
        if (!transport || workIds.length === 0) return;
        let cancelled = false;

        const toFetch = workIds.filter(id => !cache?.current?.has(id));
        // 先从缓存填充已有的
        const initial: Record<string, WorkLabel | null> = {};
        for (const id of workIds) {
            if (cache?.current?.has(id)) {
                initial[id] = cache.current.get(id)!;
            }
        }
        if (Object.keys(initial).length > 0) setLabels(initial);

        if (toFetch.length === 0) return;

        // 优先用 getEntry，fallback 到 getItem
        const fetchOne = async (id: string): Promise<WorkLabel | null> => {
            try {
                if (transport.getEntry) {
                    const entry = await transport.getEntry(id);
                    if (entry) return { title: entry.title, author: entry.author };
                }
                const item = await transport.getItem(id);
                if (!item) return null;
                const title = (item.title as string) || id;
                const authors = item.authors as Array<{ name: string }> | undefined;
                const author = authors?.[0]?.name;
                return { title, author };
            } catch {
                return null;
            }
        };

        Promise.all(toFetch.map(async id => {
            const label = await fetchOne(id);
            cache?.current?.set(id, label);
            return [id, label] as const;
        })).then(results => {
            if (cancelled) return;
            setLabels(prev => {
                const next = { ...prev };
                for (const [id, label] of results) next[id] = label;
                return next;
            });
        });

        return () => { cancelled = true; };
    }, [workIds.join(','), transport]);

    return labels;
}

/** 考证条目：展示考证正文和关联作品链接 */
function KaozhenSection({ section, onNavigate, transport, workLabelCache, highlightQuery = '' }: {
    section: CollatedSection;
    onNavigate?: (id: string) => void;
    transport?: IndexStorage;
    workLabelCache?: React.RefObject<WorkLabelCache>;
    highlightQuery?: string;
}) {
    const { t, convert, messages } = useI18n();
    const buildUrl = useBidUrl();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        return renderInterlinear(convert(s), (seg) =>
            highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg, { t });
    };
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        if (highlightQuery) setExpanded(true);
    }, [highlightQuery]);
    // 同 SectionTypeBadge：颜色表按中文写，type 是英文枚举，必须先归一
    const typeKey = normSectionType(section.type);
    const typeColor = KAOZHEN_TYPE_COLORS[typeKey] || bim('desc-fg');
    const hasContent = !!section.content;
    const workIds = section.work_ids || [];
    const hasMultipleWorks = workIds.length > 1;

    const workLabels = useWorkLabels(
        hasMultipleWorks ? workIds : [],
        transport,
        workLabelCache,
    );

    // 截取前80字作为预览
    const preview = hasContent && !expanded
        ? (section.content!.length > 80 ? truncateOutsideJiazhu(section.content!, 80) + '……' : null)
        : null;

    return (
        <div style={{
            borderBottom: `1px solid ${bim('widget-border')}`,
            padding: '10px 0',
        }}>
            {/* 标题行 */}
            <div
                onClick={() => hasContent && setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    cursor: hasContent ? 'pointer' : 'default',
                    userSelect: 'none',
                }}
            >
                <ToggleArea
                    enabled={hasContent}
                    expanded={expanded}
                    style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: '8px' }}
                >
                    {hasContent && (
                        <span aria-hidden="true" style={{
                            fontSize: '9px',
                            color: bim('desc-fg'),
                            marginTop: '5px',
                            transition: 'transform 0.15s',
                            transform: expanded ? 'rotate(90deg)' : 'none',
                            display: 'inline-block',
                            flexShrink: 0,
                        }}>&#9654;</span>
                    )}
                    <span style={{ display: 'block', flex: 1 }}>
                        <span style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: bim('fg'),
                            lineHeight: 1.6,
                        }}>
                            {section.header_line ? hl(section.header_line) : hl(section.title)}
                        </span>
                        {/* 折叠时的内容预览 */}
                        {!expanded && preview && (
                            <span style={{
                                display: 'block',
                                margin: '4px 0 0',
                                fontSize: '12px',
                                color: bim('desc-fg'),
                                lineHeight: 1.7,
                            }}>
                                {hl(preview)}
                            </span>
                        )}
                    </span>
                </ToggleArea>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {/* 单作品：标题行右侧显示链接 */}
                    {workIds.length === 1 && onNavigate && (
                        <a
                            href={buildUrl(workIds[0])}
                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onNavigate(workIds[0]); }}
                            style={{
                                fontSize: '11px',
                                color: bim('link-fg'),
                                cursor: 'pointer',
                                textDecoration: 'none',
                                flexShrink: 0,
                            }}
                            title={t('collated.viewWork')}
                        >
                            {t('collated.arrowWork')}
                        </a>
                    )}
                    {/* 多作品：标题行只显示数量提示 */}
                    {hasMultipleWorks && (
                        <span style={{
                            fontSize: '11px',
                            color: bim('link-fg'),
                            flexShrink: 0,
                        }}>
                            {t('collated.nWorks', { n: workIds.length })}
                        </span>
                    )}
                    <span style={{
                        display: 'inline-block',
                        padding: '1px 5px',
                        fontSize: '10px',
                        fontWeight: 500,
                        color: typeColor,
                        border: `1px solid ${typeColor}40`,
                        borderRadius: '2px',
                        background: `${typeColor}08`,
                    }}>
                        {sectionTypeLabel(messages, typeKey, convert)}
                    </span>
                </div>
            </div>

            {/* 多作品列表（标题下方） */}
            {hasMultipleWorks && onNavigate && (
                <div style={{
                    margin: '6px 0 0 17px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 12px',
                }}>
                    {workIds.map(wid => {
                        const label = workLabels[wid];
                        const displayText = label
                            ? `${convert(label.title)}${label.author ? `（${convert(label.author)}）` : ''}`
                            : wid.slice(0, 8) + '…';
                        return (
                            <a
                                key={wid}
                                href={buildUrl(wid)}
                                onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onNavigate(wid); }}
                                style={{
                                    fontSize: '12px',
                                    color: bim('link-fg'),
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    lineHeight: 1.8,
                                }}
                                title={wid}
                            >
                                →{displayText}
                            </a>
                        );
                    })}
                </div>
            )}

            {/* 展开的考证正文 */}
            {expanded && hasContent && (
                <div style={{
                    marginTop: '10px',
                    padding: '12px 16px',
                    borderLeft: `3px solid ${typeColor}40`,
                    borderRadius: '0 4px 4px 0',
                    background: bim('bg'),
                }}>
                    <p style={{
                        fontSize: '13px',
                        color: bim('fg'),
                        lineHeight: 2.0,
                        margin: 0,
                        textAlign: 'justify',
                        whiteSpace: 'pre-line',
                    }}>
                        {hl(section.content!)}
                    </p>
                    {section.comment && (
                        <div style={{
                            marginTop: '10px',
                            paddingTop: '8px',
                            borderTop: `1px solid ${bim('widget-border')}`,
                            fontSize: '12px',
                            color: bim('desc-fg'),
                            lineHeight: 1.8,
                            fontStyle: 'italic',
                        }}>
                            {hl(section.comment)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** 考证内容视图（替代 JuanContent 用于 kaozhen 类型） */
function KaozhenContent({
    juan,
    searchQuery,
    onNavigate,
    transport,
    workLabelCache,
}: {
    juan: CollatedJuan;
    searchQuery: string;
    onNavigate?: (id: string) => void;
    transport?: IndexStorage;
    workLabelCache?: React.RefObject<WorkLabelCache>;
}) {
    const { t } = useI18n();
    const normalizer = useSearchNormalizer();
    const q = searchQuery.trim();

    // 章名、条数与原文来源已移到阅读器的卷头（JuanReading）
    const filteredSections = useMemo(() => {
        if (!q) return juan.sections;
        return juan.sections.filter(s => sectionMatches(s, q, true, normalizer));
    }, [juan.sections, q, normalizer]);

    return (
        <div>
            {/* 考证条目列表 */}
            <div>
                {filteredSections.map((section, i) => (
                    <KaozhenSection key={i} section={section} onNavigate={onNavigate} transport={transport} workLabelCache={workLabelCache} highlightQuery={q} />
                ))}
            </div>

            {filteredSections.length === 0 && (
                <div style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: bim('desc-fg'),
                    fontSize: '13px',
                }}>
                    {t('collated.noMatch')}
                </div>
            )}
        </div>
    );
}

/**
 * 整理本标题标签不跳级（阅读器 h1 是卷名）：「类」小标题始终 h2；条目的级别只看它前面
 * 出现过「类」没有——出现过是 h3，没出现过是 h2。同级条目因此始终同级。外观走 CSS 类，不随标签变。
 */
export function entryHeadingLeveler(): (kind: '类' | '条目') => 'h2' | 'h3' {
    let seenCategory = false;
    return kind => {
        if (kind === '类') { seenCategory = true; return 'h2'; }
        return seenCategory ? 'h3' : 'h2';
    };
}

/**
 * 整理本正文（按 sections 排）：类名作小标题，每条书目「书名（链到作品）＋ 解题」，
 * 与阅读页样张同一版式。取代旧的 RawTextView。
 *
 * 只跳过真页眉（书口题名）；长 page_header 其实是正文，见 isPageHeaderContent。
 */
function CollatedEntries({ sections, onNavigate, inline, workLinks = true }: {
    sections: CollatedSection[];
    onNavigate?: (id: string) => void;
    inline: (s: string) => React.ReactNode;
    /** 标出作品链接（默认开）：开＝书名可点＋标题旁「作品 →」；关＝书名是纯文字 */
    workLinks?: boolean;
}) {
    const buildUrl = useBidUrl();
    const { t, convert } = useI18n();
    const tagOf = entryHeadingLeveler();
    return (
        <>
            {sections.map((s, i) => {
                const ty = normSectionType(s.type);
                if (ty === 'page_header' && !isPageHeaderContent(s)) return null;
                if (ty === '类') {
                    return (
                        <React.Fragment key={i}>
                            {React.createElement(tagOf('类'), null, inline(convert(s.title)))}
                            {s.content && <p>{inline(convert(s.content))}</p>}
                        </React.Fragment>
                    );
                }
                if (ty === '书' || ty === '诗' || ty === '考证' || ty === '注释') {
                    const head = s.book_title
                        ? `《${s.book_title}》${s.n_juan != null ? t('collated.nJuan', { n: toChineseNumeral(s.n_juan) }) : ''}`
                        : s.title;
                    const title = inline(convert(head));
                    return (
                        <section key={i} className="bim-rd-entry" id={`rd-e-${i}`}>
                            {React.createElement(tagOf('条目'), { className: 'bim-rd-entry-h' }, s.work_id && onNavigate && workLinks ? (
                                    <>
                                        <a
                                            href={buildUrl(s.work_id)}
                                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(s.work_id!); }}
                                            title={t('collated.viewWork')}
                                        >{title}</a>
                                        <a
                                            className="bim-rd-wl"
                                            href={buildUrl(s.work_id)}
                                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(s.work_id!); }}
                                            aria-label={t('collated.viewWorkOf', { title: convert(head) })}
                                        >{t('collated.workArrow')}</a>
                                    </>
                                ) : title)}
                            {s.author_info && <p className="bim-rd-sub">{inline(convert(s.author_info))}</p>}
                            {s.content && s.content.split(/\n+/).map((para, j) => <p key={j}>{inline(convert(para))}</p>)}
                            {s.summary && <p><span className="bim-rd-lbl">{t('collated.summary')}</span>{inline(convert(s.summary))}</p>}
                            {s.comment && <p><span className="bim-rd-lbl">{t('collated.comment')}</span>{inline(convert(s.comment))}</p>}
                            {s.additional_comment && <p><span className="bim-rd-lbl">{t('collated.additionalComment')}</span>{inline(convert(s.additional_comment))}</p>}
                        </section>
                    );
                }
                if (s.content) return <p key={i}>{inline(convert(s.content))}</p>;
                return null;
            })}
        </>
    );
}

/** 这一卷有没有可按 sections 排的正文（书目条目、序、结语、长页眉……） */
export function hasSectionText(sections: CollatedSection[]): boolean {
    return sections.some(s => {
        const t = normSectionType(s.type);
        return t === '书' || t === '诗' || t === '考证' || t === '注释' || t === '类'
            || ((t === '序' || t === '结语') && !!s.content)
            || (t === 'page_header' && isPageHeaderContent(s));
    });
}

export type JuanView = 'text' | 'entries';

/**
 * 一卷的阅读区：卷名 h1、元数据一行（不用 badge）、「正文 / 条目」两种看法。
 *
 * - 正文（默认）：宋体连续排。条目分行时按 sections 排（书名可点到作品）；
 *   自然段时用 md 原文按体裁拼段（W7）。没有 sections 正文就用 md 原文。
 * - 条目：原先的「目錄」卡片视图（逐条展开看提要／按语），搜索时只列命中条目。
 * 考证类整理本只有条目看法。
 */
export function JuanReading({
    juan,
    rawText,
    positionLabel,
    groupLabel,
    index,
    searchQuery,
    onNavigate,
    transport,
    workLabelCache,
    prefs,
    view: viewProp,
    onViewChange,
}: {
    /** 「正文／条目」看法；不传就自己管（右栏要跳到另一种看法里的条目时由外层持有） */
    view?: JuanView;
    onViewChange?: (v: JuanView) => void;
    juan: CollatedJuan;
    rawText?: string | null;
    /** 「卷11」「49冊」等 */
    positionLabel?: string;
    /** 卷所在分组名（「經錄」）；与 positionLabel 一起组成卷头小标题「卷一 · 經錄」 */
    groupLabel?: string;
    index?: CollatedEditionIndex;
    searchQuery: string;
    onNavigate?: (id: string) => void;
    transport?: IndexStorage;
    workLabelCache?: React.RefObject<WorkLabelCache>;
    prefs: ReaderPrefs;
}) {
    const { t, convert, messages } = useI18n();
    const normalizer = useSearchNormalizer();
    const [viewOwn, setViewOwn] = useState<JuanView>('text');
    const view = viewProp ?? viewOwn;
    const setView = (v: JuanView) => { setViewOwn(v); onViewChange?.(v); };
    const q = searchQuery.trim();
    const isKaozhen = index?.type === 'kaozhen';

    const renderText = useCallback((seg: string) => (q ? renderHighlighted(seg, q, normalizer) : seg), [q, normalizer]);
    const inline = (s: string) => renderReaderInline(s, { renderText, properNames: prefs.properNames, t });

    const catalogSections = useMemo(() => {
        if (!q) return juan.sections;
        return juan.sections.filter(s => sectionMatches(s, q, isKaozhen, normalizer));
    }, [juan.sections, q, isKaozhen, normalizer]);

    const count = (t: string, list: CollatedSection[]) => list.filter(s => normSectionType(s.type) === t).length;
    const bookCount = count('书', juan.sections);
    const poemCount = count('诗', juan.sections);
    const kaozhenCount = count('考证', juan.sections);
    /*
     * 一条书目都没有的卷（四庫總目的卷首：聖諭、進表、凡例…通篇是正文）不写「0 部书」——
     * 那是拿目录式的口径去量纯正文，读者会以为内容没加载出来。
     */
    let countText = '';
    if (isKaozhen) countText = q ? t('collated.countTiaoOf', { m: count('考证', catalogSections), n: kaozhenCount }) : t('collated.countTiao', { n: kaozhenCount });
    else if (poemCount > 0) countText = q ? t('collated.countPoemsOf', { m: count('诗', catalogSections), n: poemCount }) : t('collated.countPoems', { n: poemCount });
    else if (bookCount > 0) countText = q ? t('collated.countBooksOf', { m: count('书', catalogSections), n: bookCount }) : t('collated.countBooks', { n: bookCount });

    const grade = index?.text_quality ? normalizeTextQualityGrade(index.text_quality.grade) : null;
    const meta: React.ReactNode[] = [];
    if (countText) meta.push(countText);
    if (isKaozhen && index?.target_source) meta.push(<>{t('collated.kaozhenTarget', { target: convert(index.target_source) })}</>);
    if (grade) {
        meta.push(
            <span title={messages.collated.qualityCriteria[grade]}>
                {index?.text_quality?.source_note
                    ? <>{t('collated.baseText', { note: convert(index.text_quality.source_note) })}<span className="bim-rd-grade">{messages.collated.qualityLabel[grade]}</span></>
                    : <>{t('collated.textQuality')}<span className="bim-rd-grade">{messages.collated.qualityLabel[grade]}</span></>}
            </span>,
        );
    }
    if (juan.source_url) {
        meta.push(<a className="bim-rd-link" href={juan.source_url} target="_blank" rel="noopener noreferrer">{t('collated.originalSource')}</a>);
    }

    const sectionText = !isKaozhen && hasSectionText(juan.sections);
    const useMd = !!rawText && (!sectionText || (prefs.readingMode === 'paragraph' && canParagraphize(rawText)));
    const hasText = !isKaozhen && (sectionText || !!rawText);
    const effectiveView: JuanView = isKaozhen || !hasText ? 'entries' : view;
    let rowNo = 0;

    return (
        <>
            <header>
                {(positionLabel || groupLabel) && (
                    <p className="bim-rd-kicker">
                        {positionLabel}
                        {positionLabel && groupLabel && <span className="bim-rd-dot" />}
                        {groupLabel && convert(groupLabel)}
                    </p>
                )}
                <h1 className="bim-rd-h1">{convert(juan.title)}</h1>
                {meta.length > 0 && (
                    <p className="bim-rd-meta">
                        {meta.map((m, i) => (
                            <React.Fragment key={i}>{i > 0 && <span className="bim-rd-dot" />}{m}</React.Fragment>
                        ))}
                    </p>
                )}
                {hasText && juan.sections.length > 0 && (
                    <div className="bim-rd-views" role="group" aria-label={t('collated.viewsGroup')}>
                        <button type="button" className="bim-rd-t" aria-pressed={effectiveView === 'text'} onClick={() => setView('text')}>{t('collated.viewText')}</button>
                        <button type="button" className="bim-rd-t" aria-pressed={effectiveView === 'entries'} onClick={() => setView('entries')}>{t('collated.viewEntries')}</button>
                    </div>
                )}
            </header>

            {effectiveView === 'text' && (
                <article className="bim-rd-prose">
                    {useMd
                        ? <ReaderMdText text={rawText!} mode={prefs.readingMode} properNames={prefs.properNames} renderText={renderText} dropTitle={juan.title} />
                        : <CollatedEntries sections={juan.sections} onNavigate={onNavigate} inline={inline} workLinks={prefs.workLinks} />}
                </article>
            )}

            {effectiveView === 'entries' && (
                <div className="bim-rd-entries" style={{ marginTop: 24 }}>
                    {isKaozhen ? (
                        <KaozhenContent
                            juan={juan}
                            searchQuery={searchQuery}
                            onNavigate={onNavigate}
                            transport={transport}
                            workLabelCache={workLabelCache}
                        />
                    ) : (
                        <>
                            {catalogSections.some(x => ['书', '诗', '考证'].includes(normSectionType(x.type))) && (
                                <div className="bim-rd-rowhead" aria-hidden="true">
                                    <span style={{ width: 28 }}>{t('collated.rowHeadNo')}</span><span style={{ flex: 1 }}>{t('collated.rowHeadTitle')}</span><span>{t('collated.rowHeadWork')}</span>
                                </div>
                            )}
                            {catalogSections.map((section, i) => {
                                const t = normSectionType(section.type);
                                // 考证条目（如「史記一百三十卷目錄一卷」）title 与 content 各自独立，
                                // 与「书」同样需要标题+正文一并展示，走 OtherSection 会丢标题。
                                if (t === '书' || t === '诗' || t === '考证') {
                                    rowNo += 1;
                                    return <BookSection key={i} domId={`rd-e-${juan.sections.indexOf(section)}`} section={section} onNavigate={prefs.workLinks ? onNavigate : undefined} highlightQuery={q} no={rowNo} showUnlinked={prefs.workLinks && !!onNavigate} />;
                                }
                                if (t === '类') {
                                    return <CategoryHeader key={i} section={section} highlightQuery={q} />;
                                }
                                return <OtherSection key={i} section={section} highlightQuery={q} />;
                            })}
                            {catalogSections.length === 0 && (
                                <div className="bim-rd-state" style={{ textAlign: 'center' }}>{t('collated.noMatch')}</div>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}

// ── 跨册搜索 hook ──

export interface JuanCacheEntry {
    juan: CollatedJuan | null;
    rawText: string | null;
}

/**
 * 输入 query 时懒加载所有册并计算每册的 matchCount。
 * load：按「卷／章 key」取一卷的内容（旧接口与新接口各自提供）；null 表示取不了，不搜索。
 * resetKey：条目（或版本）换了就清空缓存与已读卷名。
 */
export function useCrossJuanSearch(opts: {
    resetKey: string | undefined;
    load: ((file: string) => Promise<JuanCacheEntry>) | null;
    files: string[];
    activeFile: string | null;
    activeJuan: CollatedJuan | null;
    activeRawText: string | null;
    query: string;
    isKaozhen: boolean;
}) {
    const { resetKey, load, files, activeFile, activeJuan, activeRawText, query, isKaozhen } = opts;
    const normalizer = useSearchNormalizer();
    const cacheRef = useRef<Map<string, JuanCacheEntry>>(new Map());
    const [matchStates, setMatchStates] = useState<Record<string, JuanMatchState>>({});
    /**
     * 已读到的卷名（「正史類」）。索引里只有文件名，目录先写「卷11」，
     * 读过的卷（打开过或被跨卷搜索取过）补上卷名，不为此额外取数。
     */
    const [titles, setTitles] = useState<Record<string, string>>({});
    const noteTitle = useCallback((f: string, juan: CollatedJuan | null) => {
        const t = juan?.title;
        if (t) setTitles(prev => (prev[f] === t ? prev : { ...prev, [f]: t }));
    }, []);

    // 把当前 active 卷塞入缓存
    useEffect(() => {
        if (activeFile && activeJuan) {
            cacheRef.current.set(activeFile, { juan: activeJuan, rawText: activeRawText });
            noteTitle(activeFile, activeJuan);
        }
    }, [activeFile, activeJuan, activeRawText, noteTitle]);

    // 条目（或版本）切换 → 清空缓存与状态
    useEffect(() => {
        cacheRef.current.clear();
        setMatchStates({});
        setTitles({});
    }, [resetKey]);

    // 计算单册 matchCount
    const computeMatch = useCallback((entry: JuanCacheEntry, q: string): number => {
        let n = 0;
        if (entry.juan) {
            for (const s of entry.juan.sections) {
                if (sectionMatches(s, q, isKaozhen, normalizer)) n++;
            }
        }
        // raw md 文本作为补充：只用作 catalog 类型且 sections 没匹配上时确认存在
        if (n === 0 && entry.rawText && rawTextMatches(entry.rawText, q, normalizer)) n = 1;
        return n;
    }, [isKaozhen, normalizer]);

    useEffect(() => {
        const q = query.trim();
        if (!q) {
            setMatchStates({});
            return;
        }
        if (!load || files.length === 0) return;

        let cancelled = false;
        const initial: Record<string, JuanMatchState> = {};
        const toFetch: string[] = [];
        for (const f of files) {
            const cached = cacheRef.current.get(f);
            if (cached) {
                initial[f] = computeMatch(cached, q);
            } else {
                initial[f] = 'loading';
                toFetch.push(f);
            }
        }
        setMatchStates(initial);

        // 并发数限制：8
        const CONCURRENCY = 8;
        let cursor = 0;
        const worker = async () => {
            while (cursor < toFetch.length) {
                if (cancelled) return;
                const i = cursor++;
                const f = toFetch[i];
                try {
                    const entry: JuanCacheEntry = await load(f);
                    const juan = entry.juan;
                    cacheRef.current.set(f, entry);
                    noteTitle(f, juan);
                    if (cancelled) return;
                    setMatchStates(prev => ({ ...prev, [f]: computeMatch(entry, q) }));
                } catch {
                    if (cancelled) return;
                    setMatchStates(prev => ({ ...prev, [f]: 0 }));
                }
            }
        };
        const workers = Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, () => worker());
        Promise.all(workers);

        return () => { cancelled = true; };
    }, [query, resetKey, load, files.join(','), computeMatch, normalizer, noteTitle]);

    return { matchStates, titles };
}

/**
 * 右栏（v3）：「本卷」计数卡（N 部书、已关联 M、进度条）＋「条目」锚点列表。
 * 只在有书目条目的目录体卷里出；条目名点一下滚到正文（或条目页签）里对应那条。
 */
export function JuanRail({ juan, view, onView, textHasEntries }: {
    juan: CollatedJuan;
    view: JuanView;
    onView: (v: JuanView) => void;
    /** 正文看法里有没有逐条书目（自然段模式下没有，锚点无处可跳） */
    textHasEntries: boolean;
}) {
    const { t, convert } = useI18n();
    const items = juan.sections
        .map((s, i) => ({ s, i, t: normSectionType(s.type) }))
        .filter(x => x.t === '书' || x.t === '诗');
    if (items.length === 0) return null;
    const linked = items.filter(x => !!x.s.work_id).length;
    const unit = items.every(x => x.t === '诗') ? t('collated.railUnitPoems') : t('collated.railUnitBooks');
    const jump = (i: number) => {
        const go = () => document.getElementById(`rd-e-${i}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        if (view === 'text' && !textHasEntries) onView('entries');
        if (view === 'text' && !textHasEntries) setTimeout(go, 0); else go();
    };
    return (
        <>
            <div className="bim-rd-rail-card">
                <div className="bim-rd-rail-cap">{t('collated.railCap')}</div>
                <div className="bim-rd-rail-n">
                    <b>{items.length}</b><span>{unit}</span>
                    <span className="bim-rd-rail-linked">{t('collated.linkedN', { n: linked })}</span>
                </div>
                <div className="bim-rd-rail-bar" role="img" aria-label={t('collated.linkedOf', { n: linked, total: items.length })}>
                    <span style={{ width: `${Math.round((linked / items.length) * 100)}%` }} />
                </div>
            </div>
            <nav aria-label={t('collated.railEntriesNav')}>
                <div className="bim-rd-rail-cap" style={{ margin: '20px 0 6px 12px' }}>{t('collated.viewEntries')}</div>
                <ul className="bim-rd-rail-list">
                    {items.map(({ s, i }) => (
                        <li key={i}>
                            <a href={`#rd-e-${i}`} onClick={e => { e.preventDefault(); jump(i); }}>
                                <span className={`bim-rd-rail-dot${s.work_id ? ' on' : ''}`} aria-hidden="true" />
                                <span>{convert(s.book_title || s.title)}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
        </>
    );
}

/** 取作品的作者（含朝代），只给阅读页工具条的作者行用；取不到返回空数组 */
export function useWorkAuthors(workId?: string, transport?: IndexStorage): AuthorInfo[] {
    const [authors, setAuthors] = useState<AuthorInfo[]>([]);
    useEffect(() => {
        setAuthors([]);
        if (!workId || typeof transport?.getItem !== 'function') return;
        let cancelled = false;
        Promise.resolve(transport.getItem(workId))
            .then(item => {
                if (cancelled || !item) return;
                const list = (item.authors as AuthorInfo[] | undefined) ?? [];
                setAuthors(list.filter(a => a && a.name));
            })
            .catch(() => { /* 没有作者行也能读 */ });
        return () => { cancelled = true; };
    }, [workId, transport]);
    return authors;
}
