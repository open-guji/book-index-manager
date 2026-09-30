import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { AuthorInfo, CollatedEditionIndex, CollatedJuan, CollatedSection, JuanGroup, TextQualityGrade } from '../types';
import { TEXT_QUALITY_LABELS, TEXT_QUALITY_CRITERIA } from '../types';
import type { IndexStorage } from '../storage/types';
import { useConvert } from '../i18n';
import { LoadingDots } from './common/LoadingDots';
import { useBidUrl } from '../core/bid-url';
import { renderInterlinear, truncateOutsideJiazhu } from './detail/primitives';
import { bim } from '../styles/tokens';
import { ReaderShell } from './Reader/ReaderShell';
import type { PanelState } from './Reader/ReaderShell';
import { ReaderMdText, canParagraphize, renderReaderInline } from './Reader/ReaderText';
import { useReaderPrefs } from './Reader/prefs';
import type { ReaderPrefs } from './Reader/prefs';
import { useChapterImages } from './Reader/useChapterImages';
import type { ReaderImageOverlay, ReaderImageResolver, ReaderTocItem } from './Reader/types';

export interface CollatedEditionProps {
    /** 直接传入卷列表索引 */
    index?: CollatedEditionIndex;
    /** 作品 ID，配合 transport 自动加载 */
    workId?: string;
    /** 数据传输层 */
    transport?: IndexStorage;
    /** 点击关联条目时回调 */
    onNavigate?: (id: string) => void;
    /** 外部控制当前激活的卷文件 */
    activeJuan?: string | null;
    /** 卷切换回调（同步 URL 等） */
    onJuanChange?: (juan: string | null) => void;
    className?: string;
    style?: React.CSSProperties;
    /** 工具条上的书名；缺省用索引里的 title */
    title?: React.ReactNode;
    /** 书名后的小字；缺省「整理本」（考证类为「考證」） */
    subtitle?: React.ReactNode;
    /** 按卷取书影（每页一张图 + 可选逐字框），URL 由宿主给；不传则书影区收起 */
    resolveImages?: ReaderImageResolver;
    /** 书影上的自定义层（逐字框以外的格式） */
    renderImageOverlay?: ReaderImageOverlay;
    /** 书影区初始状态：auto = 有影像才展开 */
    imagePanel?: PanelState;
    /** 竖排开关（预留） */
    allowVertical?: boolean;
}

type ReaderOptions = Pick<CollatedEditionProps, 'title' | 'subtitle' | 'resolveImages' | 'renderImageOverlay' | 'imagePanel' | 'allowVertical'>;

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
type JuanMatchState = number | 'loading' | undefined;

function groupFileCount(group: JuanGroup): number {
    const own = group.files.length;
    const childCount = group.children?.reduce((sum, c) => sum + groupFileCount(c), 0) || 0;
    return own + childCount;
}

/** 计算分组内匹配总数，所有子文件都已加载完毕才返回 number；任一在 loading 返回 'loading'；query 为空返回 undefined */
function groupMatchState(group: JuanGroup, matchStates: Record<string, JuanMatchState>): JuanMatchState {
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
            {label}
        </span>
    );
}

/** 从 content 中提取班固自注（书名篇数之后的注文） */
function extractAnnotation(content?: string): string | null {
    if (!content) return null;
    // Pattern: 书名+篇数+句号 后面的文字就是班固自注
    // e.g. "《易傳周氏》二篇。字王孫也。" → annotation = "字王孫也。"
    // e.g. "《服氏》二篇。" → no annotation
    const m = content.match(/^[^。]*。(.+)$/s);
    if (m && m[1].trim()) return m[1].trim();
    return null;
}

function BookSection({ section, onNavigate, highlightQuery = '' }: { section: CollatedSection; onNavigate?: (id: string) => void; highlightQuery?: string }) {
    const { convert } = useConvert();
    const buildUrl = useBidUrl();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        return renderInterlinear(convert(s), (seg) =>
            highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg);
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
        <div style={{
            border: `1px solid ${bim('widget-border')}`,
            borderRadius: '6px',
            overflow: 'hidden',
            marginBottom: '6px',
        }}>
            <div
                onClick={() => hasContent && setExpanded(!expanded)}
                style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                    cursor: hasContent ? 'pointer' : 'default',
                    userSelect: 'none',
                    background: bim('input-bg'),
                }}
            >
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
                                    {toChineseNumeral(section.n_juan)}卷
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
                        title="查看作品"
                    >
                        →作品
                    </a>
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
                            }}>提要</div>
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
                            }}>按語</div>
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
                            }}>附按</div>
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
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        return renderInterlinear(convert(s), (seg) =>
            highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg);
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
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    // 短 page_header 是每页重复的书口题名，丢弃；长的其实是正文，照常渲染
    if (normSectionType(section.type) === 'page_header' && !isPageHeaderContent(section)) return null;
    if (!section.content && !section.title) return null;
    const rawText = convert((section.content || section.title || '').replace(/\n{2,}/g, '\n'));
    // 序／結語等塊原先直出 rawText，夾注兩種記法都沒渲染（2026-09-26 E-03：漢志卷首總序整段 `<師古曰…>` 直出）
    const text: React.ReactNode = renderInterlinear(rawText, (seg) =>
        highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg);
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
                    {normType}
                </span>
            )}
            {text}
        </div>
    );
}

/** 作品标签缓存：{ title, author } */
type WorkLabel = { title: string; author?: string };
type WorkLabelCache = Map<string, WorkLabel | null>;

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
    const { convert } = useConvert();
    const buildUrl = useBidUrl();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        return renderInterlinear(convert(s), (seg) =>
            highlightQuery ? renderHighlighted(seg, highlightQuery, normalizer) : seg);
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
                            title="查看作品"
                        >
                            →作品
                        </a>
                    )}
                    {/* 多作品：标题行只显示数量提示 */}
                    {hasMultipleWorks && (
                        <span style={{
                            fontSize: '11px',
                            color: bim('link-fg'),
                            flexShrink: 0,
                        }}>
                            {workIds.length}部作品
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
                        {typeKey}
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
                    无匹配结果
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
    const { convert } = useConvert();
    const tagOf = entryHeadingLeveler();
    return (
        <>
            {sections.map((s, i) => {
                const t = normSectionType(s.type);
                if (t === 'page_header' && !isPageHeaderContent(s)) return null;
                if (t === '类') {
                    return (
                        <React.Fragment key={i}>
                            {React.createElement(tagOf('类'), null, inline(convert(s.title)))}
                            {s.content && <p>{inline(convert(s.content))}</p>}
                        </React.Fragment>
                    );
                }
                if (t === '书' || t === '诗' || t === '考证' || t === '注释') {
                    const head = s.book_title
                        ? `《${s.book_title}》${s.n_juan != null ? toChineseNumeral(s.n_juan) + '卷' : ''}`
                        : s.title;
                    const title = inline(convert(head));
                    return (
                        <section key={i} className="bim-rd-entry">
                            {React.createElement(tagOf('条目'), { className: 'bim-rd-entry-h' }, s.work_id && onNavigate && workLinks ? (
                                    <>
                                        <a
                                            href={buildUrl(s.work_id)}
                                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(s.work_id!); }}
                                            title="查看作品"
                                        >{title}</a>
                                        <a
                                            className="bim-rd-wl"
                                            href={buildUrl(s.work_id)}
                                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(s.work_id!); }}
                                            aria-label={`查看作品：${head}`}
                                        >作品 →</a>
                                    </>
                                ) : title)}
                            {s.author_info && <p className="bim-rd-sub">{inline(convert(s.author_info))}</p>}
                            {s.content && s.content.split(/\n+/).map((para, j) => <p key={j}>{inline(convert(para))}</p>)}
                            {s.summary && <p><span className="bim-rd-lbl">提要</span>{inline(convert(s.summary))}</p>}
                            {s.comment && <p><span className="bim-rd-lbl">按語</span>{inline(convert(s.comment))}</p>}
                            {s.additional_comment && <p><span className="bim-rd-lbl">附按</span>{inline(convert(s.additional_comment))}</p>}
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
function hasSectionText(sections: CollatedSection[]): boolean {
    return sections.some(s => {
        const t = normSectionType(s.type);
        return t === '书' || t === '诗' || t === '考证' || t === '注释' || t === '类'
            || ((t === '序' || t === '结语') && !!s.content)
            || (t === 'page_header' && isPageHeaderContent(s));
    });
}

type JuanView = 'text' | 'entries';

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
    index,
    searchQuery,
    onNavigate,
    transport,
    workLabelCache,
    prefs,
}: {
    juan: CollatedJuan;
    rawText?: string | null;
    /** 「卷11」「49冊」等 */
    positionLabel?: string;
    index?: CollatedEditionIndex;
    searchQuery: string;
    onNavigate?: (id: string) => void;
    transport?: IndexStorage;
    workLabelCache?: React.RefObject<WorkLabelCache>;
    prefs: ReaderPrefs;
}) {
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    const [view, setView] = useState<JuanView>('text');
    const q = searchQuery.trim();
    const isKaozhen = index?.type === 'kaozhen';

    const renderText = useCallback((seg: string) => (q ? renderHighlighted(seg, q, normalizer) : seg), [q, normalizer]);
    const inline = (s: string) => renderReaderInline(s, { renderText, properNames: prefs.properNames });

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
    if (isKaozhen) countText = q ? `${count('考证', catalogSections)} / ${kaozhenCount} ${convert('條')}` : `${kaozhenCount} ${convert('條')}`;
    else if (poemCount > 0) countText = q ? `${count('诗', catalogSections)} / ${poemCount} 首` : `${poemCount} 首`;
    else if (bookCount > 0) countText = q ? `${count('书', catalogSections)} / ${bookCount} ${convert('部書')}` : `${bookCount} ${convert('部書')}`;

    const grade = index?.text_quality ? normalizeTextQualityGrade(index.text_quality.grade) : null;
    const meta: React.ReactNode[] = [];
    if (positionLabel) meta.push(positionLabel);
    if (countText) meta.push(countText);
    if (isKaozhen && index?.target_source) meta.push(<>{convert('考證對象')} {convert(index.target_source)}</>);
    if (grade) {
        meta.push(
            <span title={TEXT_QUALITY_CRITERIA[grade]}>
                {index?.text_quality?.source_note ? <>底本 {convert(index.text_quality.source_note)}（{convert(TEXT_QUALITY_LABELS[grade])}）</> : <>{convert('文本質量')} {convert(TEXT_QUALITY_LABELS[grade])}</>}
            </span>,
        );
    }
    if (juan.source_url) {
        meta.push(<a className="bim-rd-link" href={juan.source_url} target="_blank" rel="noopener noreferrer">{convert('原文來源')}</a>);
    }

    const sectionText = !isKaozhen && hasSectionText(juan.sections);
    const useMd = !!rawText && (!sectionText || (prefs.readingMode === 'paragraph' && canParagraphize(rawText)));
    const hasText = !isKaozhen && (sectionText || !!rawText);
    const effectiveView: JuanView = isKaozhen || !hasText ? 'entries' : view;

    return (
        <>
            <header>
                <h1 className="bim-rd-h1">{convert(juan.title)}</h1>
                {meta.length > 0 && (
                    <p className="bim-rd-meta">
                        {meta.map((m, i) => (
                            <React.Fragment key={i}>{i > 0 && <span className="bim-rd-dot" />}{m}</React.Fragment>
                        ))}
                    </p>
                )}
                {hasText && juan.sections.length > 0 && (
                    <div className="bim-rd-views" role="group" aria-label="看法">
                        <button type="button" className="bim-rd-t" aria-pressed={effectiveView === 'text'} onClick={() => setView('text')}>正文</button>
                        <button type="button" className="bim-rd-t" aria-pressed={effectiveView === 'entries'} onClick={() => setView('entries')}>{convert('條目')}</button>
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
                            {catalogSections.map((section, i) => {
                                const t = normSectionType(section.type);
                                // 考证条目（如「史記一百三十卷目錄一卷」）title 与 content 各自独立，
                                // 与「书」同样需要标题+正文一并展示，走 OtherSection 会丢标题。
                                if (t === '书' || t === '诗' || t === '考证') {
                                    return <BookSection key={i} section={section} onNavigate={prefs.workLinks ? onNavigate : undefined} highlightQuery={q} />;
                                }
                                if (t === '类') {
                                    return <CategoryHeader key={i} section={section} highlightQuery={q} />;
                                }
                                return <OtherSection key={i} section={section} highlightQuery={q} />;
                            })}
                            {catalogSections.length === 0 && (
                                <div className="bim-rd-state" style={{ textAlign: 'center' }}>无匹配结果</div>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}

// ── 工具：统一获取文件列表（兼容 catalog/kaozhen） ──

/** 从索引获取文件名列表（catalog 用 juan_files，kaozhen 用 files[].filename） */
function getIndexFiles(idx: import('../types').CollatedEditionIndex): string[] {
    if (idx.juan_files && idx.juan_files.length > 0) return idx.juan_files;
    if (idx.files && idx.files.length > 0) return idx.files.map(f => f.filename);
    return [];
}

/** 获取索引的第一个文件名 */
function getFirstFile(idx: import('../types').CollatedEditionIndex): string | null {
    const files = getIndexFiles(idx);
    return files.length > 0 ? files[0] : null;
}

// ── 跨册搜索 hook ──

interface JuanCacheEntry {
    juan: CollatedJuan | null;
    rawText: string | null;
}

/** 输入 query 时懒加载所有册并计算每册的 matchCount */
function useCrossJuanSearch(opts: {
    workId: string | undefined;
    transport: IndexStorage | undefined;
    files: string[];
    activeFile: string | null;
    activeJuan: CollatedJuan | null;
    activeRawText: string | null;
    query: string;
    isKaozhen: boolean;
}) {
    const { workId, transport, files, activeFile, activeJuan, activeRawText, query, isKaozhen } = opts;
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

    // workId 切换 → 清空缓存与状态
    useEffect(() => {
        cacheRef.current.clear();
        setMatchStates({});
        setTitles({});
    }, [workId]);

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
        if (!workId || !transport?.getCollatedJuan || files.length === 0) return;

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
                    const [juan, rawText] = await Promise.all([
                        transport.getCollatedJuan!(workId, f),
                        transport.getCollatedJuanText?.(workId, f) ?? Promise.resolve(null),
                    ]);
                    const entry: JuanCacheEntry = { juan, rawText };
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
    }, [query, workId, transport, files.join(','), computeMatch, normalizer, noteTitle]);

    return { matchStates, titles };
}

/** 取作品的作者（含朝代），只给阅读页工具条的作者行用；取不到返回空数组 */
function useWorkAuthors(workId?: string, transport?: IndexStorage): AuthorInfo[] {
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

// ── 主组件 ──

export const CollatedEdition: React.FC<CollatedEditionProps> = ({
    index: indexProp,
    workId,
    transport,
    onNavigate,
    activeJuan: externalActiveJuan,
    onJuanChange,
    className,
    style,
    title,
    subtitle,
    resolveImages,
    renderImageOverlay,
    imagePanel,
    allowVertical,
}) => {
    const [indexData, setIndexData] = useState<CollatedEditionIndex | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [internalActiveFile, setInternalActiveFile] = useState<string | null>(null);
    const [juanData, setJuanData] = useState<CollatedJuan | null>(null);
    const [juanLoading, setJuanLoading] = useState(false);
    const [juanRawText, setJuanRawText] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const workLabelCacheRef = useRef<WorkLabelCache>(new Map());
    /** 单卷请求序号：只认最后一次的响应，见 loadJuan */
    const juanReqSeqRef = useRef(0);

    // 如果外部传了 activeJuan 就用外部的，否则用内部状态
    const activeFile = externalActiveJuan ?? internalActiveFile;
    const setActiveFile = useCallback((file: string | null) => {
        setInternalActiveFile(file);
        onJuanChange?.(file);
    }, [onJuanChange]);

    const index = indexProp || indexData;

    /*
     * indexProp 到达时清掉内部 loading。
     *
     * 缺了这条会永远卡在「加载整理本...」：kyg 首帧 indexProp 还没就绪，
     * 下面那个自主加载 effect 已经 setLoading(true)；等 indexProp 到达，
     * 该 effect 因 `if (indexProp) return` 提前退出，setLoading(false)
     * 再没有机会执行。
     */
    useEffect(() => {
        if (indexProp) {
            setLoading(false);
            setError(null);
        }
    }, [indexProp]);

    /*
     * 外部没注入 index 时自行拉取（workId 模式）。
     * kyg 走 indexProp 注入，这条路径给 VS Code 插件等直接用 workId 的场合。
     */
    useEffect(() => {
        if (indexProp || !workId || !transport?.getCollatedEditionIndex) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        transport.getCollatedEditionIndex(workId).then(result => {
            if (cancelled) return;
            if (!result) setError('未找到整理本数据');
            else setIndexData(result);
        }).catch(err => {
            if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [indexProp, workId, transport]);

    /*
     * 自动选第一卷。
     *
     * 不选的话侧栏列着卷号、正文区却空着——URL 不带 juan 参数时（读者从
     * 概览页横幅点进来就是这种）整页看起来像没加载出来。仅在外部未指定
     * 时才代选，免得盖掉 URL/书签里的卷。
     */
    useEffect(() => {
        if (index && !activeFile) {
            const firstFile = getFirstFile(index);
            if (firstFile) setActiveFile(firstFile);
        }
    }, [index, activeFile, setActiveFile]);

    const effectiveWorkId = workId || index?.work_id;

    // 加载单卷
    const loadJuan = useCallback(async (file: string) => {
        if (!effectiveWorkId || !transport?.getCollatedJuan) return;
        /*
         * 只认最后一次请求的结果：快速连点卷号时响应回来的顺序不保证，
         * 先发的若后到会把新卷的正文盖掉。
         */
        const seq = ++juanReqSeqRef.current;
        setJuanLoading(true);
        setJuanData(null);
        setJuanRawText(null);
        try {
            const [data, rawText] = await Promise.all([
                transport.getCollatedJuan(effectiveWorkId, file),
                transport.getCollatedJuanText?.(effectiveWorkId, file) ?? Promise.resolve(null),
            ]);
            if (seq !== juanReqSeqRef.current) return;
            setJuanData(data);
            setJuanRawText(rawText);
        } catch {
            if (seq !== juanReqSeqRef.current) return;
            setJuanData(null);
            setJuanRawText(null);
        } finally {
            if (seq === juanReqSeqRef.current) setJuanLoading(false);
        }
    }, [effectiveWorkId, transport]);

    useEffect(() => {
        if (activeFile) {
            loadJuan(activeFile);
        }
    }, [activeFile, loadJuan]);

    const handleSelectFile = (file: string) => {
        setActiveFile(file);
        // 切册时不再清空搜索词 —— 跨册搜索语义下保留 query 是正确的
    };

    if (loading) {
        return (
            <div className={className} style={{ ...style, padding: '24px' }}>
                <div style={{ color: bim('desc-fg'), fontSize: '13px' }}>
                    加载整理本...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={className} style={{
                ...style,
                padding: '24px',
                textAlign: 'center',
                color: bim('desc-fg'),
                fontSize: '13px',
            }}>
                {error}
            </div>
        );
    }

    if (!index) return null;

    const isKaozhen = index.type === 'kaozhen';
    const allFiles = getIndexFiles(index);

    return <CollatedEditionInner
        className={className}
        style={style}
        index={index}
        allFiles={allFiles}
        isKaozhen={isKaozhen}
        effectiveWorkId={effectiveWorkId}
        transport={transport}
        activeFile={activeFile}
        handleSelectFile={handleSelectFile}
        juanData={juanData}
        juanRawText={juanRawText}
        juanLoading={juanLoading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onNavigate={onNavigate}
        workLabelCacheRef={workLabelCacheRef}
        reader={{ title, subtitle, resolveImages, renderImageOverlay, imagePanel, allowVertical }}
    />;
};

/** 卷在目录与卷头里的名字：有册号以册号为正名，读过的卷补上卷名 */
function juanLabel(file: string, index: CollatedEditionIndex, titles: Record<string, string>, convert: (s: string) => string): {
    position: string;
    label: string;
} {
    /*
     * 有册号时**以册号为正名**：武職選簿是按册（第 49–74 册）编的，
     * 书里根本没有「卷」这个层级，写「卷1」纯属杜撰。
     */
    const vol = index.juan_metadata?.[file]?.vol_label;
    const position = convert(vol ? `${vol}冊` : juanDisplayName(file));
    const kaozhenTitle = index.files?.find(f => f.filename === file)?.title;
    const t = kaozhenTitle ?? titles[file];
    if (!t) return { position, label: position };
    const ct = convert(t);
    // 中文文件名（考证类）显示名就是标题本身，不重复
    return { position, label: position === t || position === ct ? ct : `${position}　${ct}` };
}

/** 索引 → 目录树（分组 / 平铺） */
function buildJuanToc(
    index: CollatedEditionIndex,
    files: string[],
    matchStates: Record<string, JuanMatchState>,
    titles: Record<string, string>,
    convert: (s: string) => string,
): ReaderTocItem[] {
    const hintOf = (ms: JuanMatchState): React.ReactNode =>
        ms === 'loading' ? '…' : typeof ms === 'number' && ms > 0 ? ms : undefined;
    const leaf = (f: string, label?: string): ReaderTocItem => ({
        key: f,
        label: label ?? juanLabel(f, index, titles, convert).label,
        hint: hintOf(matchStates[f]),
        disabled: matchStates[f] === 0,
    });
    const walk = (g: JuanGroup, path: string): ReaderTocItem => {
        // 叶子分组且只有 1 个文件：直接是一项，不要多一层展开
        if (g.files.length === 1 && !g.children?.length) return leaf(g.files[0], convert(g.label));
        const gs = groupMatchState(g, matchStates);
        return {
            key: `group:${path}`,
            label: convert(g.label),
            hint: gs === 'loading' ? '…' : typeof gs === 'number' && gs > 0 ? `${gs}` : groupFileCount(g),
            defaultExpanded: typeof gs === 'number' && gs > 0,
            children: [
                ...g.files.map(f => leaf(f)),
                ...(g.children ?? []).map((c, i) => walk(c, `${path}.${i}`)),
            ],
        };
    };
    if (index.juan_groups && index.juan_groups.length > 0) {
        return index.juan_groups.map((g, i) => walk(g, `${i}`));
    }
    return files.map(f => leaf(f));
}

// 拆出 inner 组件以便在 hook 调用前确保 index 存在（避免在条件后调用 hook）
const CollatedEditionInner: React.FC<{
    className?: string;
    style?: React.CSSProperties;
    index: CollatedEditionIndex;
    allFiles: string[];
    isKaozhen: boolean;
    effectiveWorkId: string | undefined;
    transport: IndexStorage | undefined;
    activeFile: string | null;
    handleSelectFile: (file: string) => void;
    juanData: CollatedJuan | null;
    juanRawText: string | null;
    juanLoading: boolean;
    searchQuery: string;
    setSearchQuery: (s: string) => void;
    onNavigate?: (id: string) => void;
    workLabelCacheRef: React.RefObject<WorkLabelCache>;
    reader: ReaderOptions;
}> = ({
    className, style, index, allFiles, isKaozhen, effectiveWorkId, transport,
    activeFile, handleSelectFile, juanData, juanRawText, juanLoading,
    searchQuery, setSearchQuery, onNavigate, workLabelCacheRef, reader,
}) => {
    const { convert } = useConvert();
    const [prefs, setPrefs] = useReaderPrefs();
    const { matchStates, titles } = useCrossJuanSearch({
        workId: effectiveWorkId,
        transport,
        files: allFiles,
        activeFile,
        activeJuan: juanData,
        activeRawText: juanRawText,
        query: searchQuery,
        isKaozhen,
    });
    const images = useChapterImages(reader.resolveImages, activeFile);

    const toc = useMemo(
        () => buildJuanToc(index, allFiles, matchStates, titles, convert),
        [index, allFiles, matchStates, titles, convert],
    );

    /*
     * 目录抽屉顶上是跨卷搜索。原先搜索框与 205 个卷号（四庫總目）横铺在正文上方，
     * 后来挪进左侧栏；现在连同目录一起收进可收起的侧栏 / 抽屉。
     */
    const tocHeader = (
        <input
            type="search"
            className="bim-rd-toc-search"
            placeholder={isKaozhen ? '搜索全部章节…' : '搜索全部卷…'}
            aria-label={isKaozhen ? '搜索全部章节' : '搜索全部卷'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
        />
    );

    const unit = isKaozhen ? '章' : index.juan_metadata && Object.values(index.juan_metadata).some(m => m.vol_label) ? '冊' : '卷';
    const position = activeFile ? juanLabel(activeFile, index, titles, convert).position : undefined;

    /* 工具条：书名链到作品页；作者行取作品数据（缺就不显示，不编造） */
    const buildUrl = useBidUrl();
    const titleText = reader.title ?? (index.title ? convert(index.title) : undefined);
    const titleNode = titleText && effectiveWorkId && onNavigate ? (
        <a
            href={buildUrl(effectiveWorkId)}
            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(effectiveWorkId); }}
            title="查看作品"
        >{titleText}</a>
    ) : titleText;
    const authors = useWorkAuthors(effectiveWorkId, transport);
    const byline = authors.length > 0
        ? convert(authors.slice(0, 2).map(a => `${a.dynasty ? `〔${a.dynasty}〕` : ''}${a.name}${a.role ? ` ${a.role}` : ' 撰'}`).join('、'))
        : undefined;

    return (
        <ReaderShell
            className={className}
            style={style}
            title={titleNode}
            subtitle={reader.subtitle ?? convert(isKaozhen ? '考證' : '整理本')}
            byline={byline}
            current={activeFile ? juanLabel(activeFile, index, titles, convert).label : undefined}
            workLinkToggle={!isKaozhen && !!onNavigate && !!juanData?.sections.some(x => x.work_id)}
            toc={toc}
            tocCaption={`目录 · ${allFiles.length} ${convert(unit)}`}
            tocHeader={tocHeader}
            activeKey={activeFile}
            onSelect={handleSelectFile}
            images={images.images}
            imagesLoading={images.loading}
            renderImageOverlay={reader.renderImageOverlay}
            imagePanel={reader.imagePanel}
            prefs={prefs}
            onPrefsChange={setPrefs}
            paragraphToggle={!isKaozhen && canParagraphize(juanRawText)}
            allowVertical={reader.allowVertical}
        >
            {juanLoading ? (
                <LoadingDots />
            ) : juanData ? (
                <JuanReading
                    key={activeFile ?? ''}
                    juan={juanData}
                    rawText={juanRawText}
                    positionLabel={position}
                    index={index}
                    searchQuery={searchQuery}
                    onNavigate={onNavigate}
                    transport={transport}
                    workLabelCache={workLabelCacheRef}
                    prefs={prefs}
                />
            ) : activeFile ? (
                <div className="bim-rd-state">无法加载这一卷</div>
            ) : null}

            {index.references && index.references.length > 0 && (
                <section className="bim-rd-refs">
                    <h2>{convert('參考文獻')}</h2>
                    <ol>
                        {index.references.map((ref, i) => (
                            <li key={i}>
                                {ref.url
                                    ? <a className="bim-rd-link" href={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}</a>
                                    : <span>{ref.title}</span>}
                                {ref.author && <span>，{ref.author}</span>}
                                {ref.note && <span>。{ref.note}</span>}
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </ReaderShell>
    );
};
