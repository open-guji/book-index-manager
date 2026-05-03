import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { CollatedEditionIndex, CollatedJuan, CollatedSection, JuanGroup, TextQualityGrade } from '../types';
import { TEXT_QUALITY_LABELS, TEXT_QUALITY_CRITERIA, TEXT_QUALITY_COLORS } from '../types';
import type { IndexStorage } from '../storage/types';
import { useConvert } from '../i18n';
import { LoadingDots } from './common/LoadingDots';
import { Tooltip } from './common/Tooltip';
import { useBidUrl } from '../core/bid-url';

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
}

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
function normSectionType(t: unknown): string {
    if (typeof t !== 'string') return '';
    return TYPE_T2S[t] ?? t;
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
    return _searchNormalizer ?? ((s: string) => s);
}

function normalizeForSearch(s: string, normalizer: Normalizer): string {
    return normalizer(s).toLowerCase();
}

// ── 高亮 ──

const HIGHLIGHT_BG = '#fff59d';

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

const SECTION_TYPE_COLORS: Record<string, string> = {
    '类': '#8e6f3e',
    '书': '#c0392b',
    '序': '#1a5276',
    '结语': '#7d6608',
};

const KAOZHEN_TYPE_COLORS: Record<string, string> = {
    '考证': '#5d6d7e',
};

// ── 子组件 ──

/** 将文件名转为显示名 */
function juanDisplayName(f: string): string {
    const name = f.replace('.json', '');
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

function JuanButton({ file, isActive, onSelect, meta, matchState }: {
    file: string; isActive: boolean; onSelect: (f: string) => void;
    meta?: { vol_label?: string };
    matchState?: JuanMatchState;
}) {
    const disabled = matchState === 0;
    const loading = matchState === 'loading';
    const hasMatch = typeof matchState === 'number' && matchState > 0;
    const displayName = juanDisplayName(file);
    const showVolLabel = !!meta?.vol_label && !displayName.includes(meta.vol_label);

    return (
        <button
            onClick={() => { if (!disabled) onSelect(file); }}
            disabled={disabled}
            style={{
                padding: '3px 8px',
                border: isActive
                    ? '1px solid var(--bim-primary, #8e6f3e)'
                    : disabled
                        ? '1px dashed var(--bim-widget-border, #e0e0e0)'
                        : '1px solid var(--bim-widget-border, #e0e0e0)',
                borderRadius: '3px',
                background: isActive
                    ? 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 10%, transparent)'
                    : hasMatch
                        ? `${HIGHLIGHT_BG}40`
                        : 'transparent',
                color: isActive
                    ? 'var(--bim-primary, #8e6f3e)'
                    : disabled
                        ? 'var(--bim-desc-fg, #bbb)'
                        : 'var(--bim-fg, #333)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 400,
                lineHeight: 1.4,
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {displayName}
            {showVolLabel && (
                <span style={{
                    marginLeft: '5px',
                    fontSize: '11px',
                    fontWeight: 400,
                    color: 'var(--bim-desc-fg, #999)',
                }}>
                    ({meta!.vol_label}冊)
                </span>
            )}
            {hasMatch && (
                <span style={{
                    marginLeft: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#b78900',
                }}>
                    {matchState}
                </span>
            )}
            {loading && (
                <span style={{
                    marginLeft: '5px',
                    fontSize: '11px',
                    color: 'var(--bim-desc-fg, #aaa)',
                }}>
                    …
                </span>
            )}
        </button>
    );
}

function groupContainsFile(group: JuanGroup, file: string): boolean {
    if (group.files.includes(file)) return true;
    return !!group.children?.some(c => groupContainsFile(c, file));
}

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

function JuanGroupNav({ group, activeFile, onSelect, depth = 0, juanMeta, matchStates }: {
    group: JuanGroup; activeFile: string | null; onSelect: (f: string) => void; depth?: number;
    juanMeta?: Record<string, { vol_label?: string }>;
    matchStates: Record<string, JuanMatchState>;
}) {
    const hasActive = groupContainsFile(group, activeFile || '');
    const groupState = groupMatchState(group, matchStates);
    const groupHasMatch = typeof groupState === 'number' && groupState > 0;
    const groupNoMatch = groupState === 0;
    const [expanded, setExpanded] = useState(hasActive || groupHasMatch);
    const count = groupFileCount(group);
    const hasChildren = !!group.children?.length;

    useEffect(() => {
        if (hasActive) setExpanded(true);
    }, [hasActive]);

    useEffect(() => {
        if (groupHasMatch) setExpanded(true);
    }, [groupHasMatch]);

    // 叶子分组且只有1个文件：直接渲染为按钮，不需要展开层级
    if (group.files.length === 1 && !hasChildren) {
        const f = group.files[0];
        const isActive = activeFile === f;
        const ms = matchStates[f];
        const disabled = ms === 0;
        const loading = ms === 'loading';
        const hasMatch = typeof ms === 'number' && ms > 0;
        return (
            <button
                onClick={() => { if (!disabled) onSelect(f); }}
                disabled={disabled}
                style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    margin: '2px 0',
                    marginLeft: `${8 + depth * 16}px`,
                    border: isActive
                        ? '1px solid var(--bim-primary, #8e6f3e)'
                        : disabled
                            ? '1px dashed var(--bim-widget-border, #e0e0e0)'
                            : '1px solid var(--bim-widget-border, #e0e0e0)',
                    borderRadius: '3px',
                    background: isActive
                        ? 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 10%, transparent)'
                        : hasMatch
                            ? `${HIGHLIGHT_BG}40`
                            : 'transparent',
                    color: isActive
                        ? 'var(--bim-primary, #8e6f3e)'
                        : disabled
                            ? 'var(--bim-desc-fg, #bbb)'
                            : 'var(--bim-fg, #333)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: isActive ? 600 : 400,
                    lineHeight: 1.4,
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                {group.label}
                {hasMatch && (
                    <span style={{ marginLeft: '5px', fontSize: '11px', fontWeight: 600, color: '#b78900' }}>{ms}</span>
                )}
                {loading && (
                    <span style={{ marginLeft: '5px', fontSize: '11px', color: 'var(--bim-desc-fg, #aaa)' }}>…</span>
                )}
            </button>
        );
    }

    return (
        <div style={{ marginBottom: depth === 0 ? '4px' : '2px' }}>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: depth === 0 ? '4px 8px' : '2px 8px',
                    paddingLeft: `${8 + depth * 16}px`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: depth === 0 ? '13px' : '12px',
                    fontWeight: depth === 0 ? 600 : 500,
                    color: hasActive
                        ? 'var(--bim-primary, #8e6f3e)'
                        : groupNoMatch
                            ? 'var(--bim-desc-fg, #bbb)'
                            : 'var(--bim-fg, #333)',
                    opacity: groupNoMatch ? 0.6 : 1,
                }}
            >
                <span style={{
                    fontSize: '9px',
                    transition: 'transform 0.15s',
                    transform: expanded ? 'rotate(90deg)' : 'none',
                    display: 'inline-block',
                }}>&#9654;</span>
                <span>{group.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--bim-desc-fg, #999)' }}>
                    ({count})
                </span>
                {groupHasMatch && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#b78900' }}>
                        匹配 {groupState}
                    </span>
                )}
                {groupState === 'loading' && (
                    <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #aaa)' }}>…</span>
                )}
            </div>
            {expanded && (
                <>
                    {/* 直属文件 */}
                    {group.files.length > 0 && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px',
                            padding: `4px 0 4px ${24 + depth * 16}px`,
                        }}>
                            {group.files.map(f => (
                                <JuanButton key={f} file={f} isActive={activeFile === f} onSelect={onSelect} meta={juanMeta?.[f]} matchState={matchStates[f]} />
                            ))}
                        </div>
                    )}
                    {/* 子分组 */}
                    {hasChildren && group.children!.map((child, i) => (
                        <JuanGroupNav key={i} group={child} activeFile={activeFile} onSelect={onSelect} depth={depth + 1} juanMeta={juanMeta} matchStates={matchStates} />
                    ))}
                </>
            )}
        </div>
    );
}

function JuanNav({
    files,
    groups,
    activeFile,
    onSelect,
    juanMeta,
    matchStates,
}: {
    files: string[] | undefined;
    groups?: JuanGroup[];
    activeFile: string | null;
    onSelect: (file: string) => void;
    juanMeta?: Record<string, { vol_label?: string }>;
    matchStates: Record<string, JuanMatchState>;
}) {
    const fileList = files || [];

    // 有分组信息时按分组显示
    if (groups && groups.length > 0) {
        return (
            <div style={{ marginBottom: '16px' }}>
                {groups.map((g, i) => (
                    <JuanGroupNav key={i} group={g} activeFile={activeFile} onSelect={onSelect} juanMeta={juanMeta} matchStates={matchStates} />
                ))}
            </div>
        );
    }

    if (fileList.length === 0) return null;

    // 无分组时平铺显示
    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginBottom: '16px',
            maxHeight: '120px',
            overflow: 'auto',
            padding: '4px 0',
        }}>
            {fileList.map(f => (
                <JuanButton key={f} file={f} isActive={activeFile === f} onSelect={onSelect} meta={juanMeta?.[f]} matchState={matchStates[f]} />
            ))}
        </div>
    );
}

function SectionTypeBadge({ type }: { type: string }) {
    const color = SECTION_TYPE_COLORS[type] || '#717171';
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
            {type}
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
        const c = convert(s);
        return highlightQuery ? renderHighlighted(c, highlightQuery, normalizer) : c;
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
    const preview = !expanded && hasLongContent ? section.content!.replace(/\n/g, ' ').slice(0, 80) + '…' : null;

    return (
        <div style={{
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
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
                    background: 'var(--bim-input-bg, #fff)',
                }}
            >
                {hasContent && (
                    <span style={{
                        fontSize: '9px',
                        color: 'var(--bim-desc-fg, #717171)',
                        transition: 'transform 0.15s',
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        display: 'inline-block',
                        flexShrink: 0,
                    }}>&#9654;</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--bim-fg, #1a1a1a)',
                    }}>
                        {section.book_title ? <>《{hl(section.book_title)}》</> : hl(section.title)}
                        {section.n_juan != null && (
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 400,
                                color: 'var(--bim-desc-fg, #999)',
                                marginLeft: '6px',
                            }}>
                                {toChineseNumeral(section.n_juan)}卷
                            </span>
                        )}
                        {(section.author_info || section.author) && (
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 400,
                                color: 'var(--bim-desc-fg, #999)',
                                marginLeft: '8px',
                            }}>
                                {hl(section.author_info || section.author)}
                            </span>
                        )}
                    </span>
                    {!expanded && preview && (
                        <div style={{
                            fontSize: '12px',
                            color: 'var(--bim-desc-fg, #999)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '2px',
                        }}>
                            {hl(preview)}
                        </div>
                    )}
                </div>
                {section.edition && (
                    <span style={{
                        fontSize: '11px',
                        color: 'var(--bim-desc-fg, #aaa)',
                    }}>
                        {hl(section.edition)}
                    </span>
                )}
                {section.tag && (
                    <span style={{
                        fontSize: '11px',
                        color: '#e74c3c',
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
                            color: 'var(--bim-link-fg, #0066cc)',
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
                    borderTop: '1px solid var(--bim-widget-border, #f0f0f0)',
                    background: 'var(--bim-bg, #fafafa)',
                }}>
                    {section.author_info && (
                        <div style={{
                            fontSize: '13px',
                            color: 'var(--bim-desc-fg, #717171)',
                            marginBottom: '8px',
                        }}>
                            {hl(section.author_info)}
                        </div>
                    )}
                    {section.summary && (
                        <div style={{
                            marginBottom: '8px',
                            padding: '10px 14px',
                            borderLeft: '3px solid var(--bim-primary, #8e6f3e)',
                            background: 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 4%, transparent)',
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--bim-desc-fg, #717171)',
                                marginBottom: '4px',
                                letterSpacing: '1px',
                            }}>提要</div>
                            <p style={{
                                fontSize: '13px',
                                color: 'var(--bim-fg, #333)',
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
                            borderLeft: '3px solid var(--bim-desc-fg, #aaa)',
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--bim-desc-fg, #717171)',
                                marginBottom: '4px',
                                letterSpacing: '1px',
                            }}>按語</div>
                            <p style={{
                                fontSize: '13px',
                                color: 'var(--bim-fg, #555)',
                                lineHeight: 1.8,
                                margin: 0,
                                fontStyle: 'italic',
                            }}>{hl(section.comment)}</p>
                        </div>
                    )}
                    {section.additional_comment && (
                        <div style={{
                            padding: '8px 14px',
                            borderLeft: '3px solid var(--bim-desc-fg, #ccc)',
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--bim-desc-fg, #717171)',
                                marginBottom: '4px',
                                letterSpacing: '1px',
                            }}>附按</div>
                            <p style={{
                                fontSize: '13px',
                                color: 'var(--bim-fg, #555)',
                                lineHeight: 1.8,
                                margin: 0,
                                fontStyle: 'italic',
                            }}>{hl(section.additional_comment)}</p>
                        </div>
                    )}
                    {hasLongContent && !hasSummary && !hasComment && !hasAdditionalComment && (
                        <p style={{
                            fontSize: '13px',
                            color: 'var(--bim-fg, #333)',
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
        const c = convert(s);
        return highlightQuery ? renderHighlighted(c, highlightQuery, normalizer) : c;
    };
    const [expanded, setExpanded] = useState(false);
    const hasContent = !!section.content;

    return (
        <div style={{ padding: '12px 0 6px' }}>
            <div
                onClick={() => hasContent && setExpanded(!expanded)}
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
                    color: 'var(--bim-fg, #1a1a1a)',
                }}>
                    {hl(section.title)}
                </span>
                {hasContent && (
                    <span style={{
                        fontSize: '9px',
                        color: 'var(--bim-desc-fg, #999)',
                        transition: 'transform 0.15s',
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        display: 'inline-block',
                    }}>&#9654;</span>
                )}
            </div>
            {expanded && hasContent && (
                <div style={{
                    marginTop: '8px',
                    padding: '10px 14px',
                    borderLeft: `3px solid ${SECTION_TYPE_COLORS[section.type] || '#717171'}40`,
                    borderRadius: '0 4px 4px 0',
                    background: 'var(--bim-bg, #fafafa)',
                }}>
                    <p style={{
                        fontSize: '13px',
                        color: 'var(--bim-fg, #333)',
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

function OtherSection({ section, highlightQuery = '' }: { section: CollatedSection; highlightQuery?: string }) {
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    if (!section.content && !section.title) return null;
    const rawText = convert((section.content || section.title || '').replace(/\n{2,}/g, '\n'));
    const text: React.ReactNode = highlightQuery ? renderHighlighted(rawText, highlightQuery, normalizer) : rawText;
    const typeColor = SECTION_TYPE_COLORS[section.type] || '#717171';
    // 序/结语：带左边框、类型标签，与"书"条目区分
    const isLabeled = normSectionType(section.type) === '序' || normSectionType(section.type) === '结语';
    return (
        <div style={{
            padding: isLabeled ? '10px 12px' : '6px 0',
            margin: isLabeled ? '8px 0' : undefined,
            fontSize: '13px',
            color: 'var(--bim-desc-fg, #555)',
            lineHeight: 1.8,
            whiteSpace: 'pre-line',
            borderLeft: isLabeled ? `3px solid ${typeColor}40` : undefined,
            background: isLabeled ? 'var(--bim-bg, #fafafa)' : undefined,
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
                    {section.type}
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
        const c = convert(s);
        return highlightQuery ? renderHighlighted(c, highlightQuery, normalizer) : c;
    };
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        if (highlightQuery) setExpanded(true);
    }, [highlightQuery]);
    const typeKey = section.type;
    const typeColor = KAOZHEN_TYPE_COLORS[typeKey] || '#717171';
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
        ? (section.content!.length > 80 ? section.content!.slice(0, 80) + '……' : null)
        : null;

    return (
        <div style={{
            borderBottom: '1px solid var(--bim-widget-border, #f0f0f0)',
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
                {hasContent && (
                    <span style={{
                        fontSize: '9px',
                        color: 'var(--bim-desc-fg, #aaa)',
                        marginTop: '5px',
                        transition: 'transform 0.15s',
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        display: 'inline-block',
                        flexShrink: 0,
                    }}>&#9654;</span>
                )}
                <div style={{ flex: 1 }}>
                    <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--bim-fg, #1a1a1a)',
                        lineHeight: 1.6,
                    }}>
                        {section.header_line ? hl(section.header_line) : hl(section.title)}
                    </span>
                    {/* 折叠时的内容预览 */}
                    {!expanded && preview && (
                        <p style={{
                            margin: '4px 0 0',
                            fontSize: '12px',
                            color: 'var(--bim-desc-fg, #aaa)',
                            lineHeight: 1.7,
                        }}>
                            {hl(preview)}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {/* 单作品：标题行右侧显示链接 */}
                    {workIds.length === 1 && onNavigate && (
                        <a
                            href={buildUrl(workIds[0])}
                            onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onNavigate(workIds[0]); }}
                            style={{
                                fontSize: '11px',
                                color: 'var(--bim-link-fg, #0066cc)',
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
                            color: 'var(--bim-link-fg, #0066cc)',
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
                                    color: 'var(--bim-link-fg, #0066cc)',
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
                    background: 'var(--bim-bg, #fafafa)',
                }}>
                    <p style={{
                        fontSize: '13px',
                        color: 'var(--bim-fg, #333)',
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
                            borderTop: '1px solid var(--bim-widget-border, #eee)',
                            fontSize: '12px',
                            color: 'var(--bim-desc-fg, #717171)',
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
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    const q = searchQuery.trim();

    const filteredSections = useMemo(() => {
        if (!q) return juan.sections;
        return juan.sections.filter(s => sectionMatches(s, q, true, normalizer));
    }, [juan.sections, q, normalizer]);

    const totalCount = juan.sections.filter(s => normSectionType(s.type) === '考证').length;
    const sectionCount = filteredSections.filter(s => normSectionType(s.type) === '考证').length;

    return (
        <div>
            {/* 章标题 */}
            <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '12px',
                marginBottom: '4px',
            }}>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--bim-fg, #1a1a1a)',
                    margin: 0,
                }}>
                    {convert(juan.title)}
                </h3>
                <span style={{
                    fontSize: '12px',
                    color: 'var(--bim-desc-fg, #999)',
                    marginLeft: 'auto',
                }}>
                    {q ? `${sectionCount} / ${totalCount} 條` : `${totalCount} 條`}
                </span>
            </div>
            {juan.source_url && (
                <div style={{ marginBottom: '12px' }}>
                    <a
                        href={juan.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '11px',
                            color: 'var(--bim-desc-fg, #aaa)',
                            textDecoration: 'underline',
                            textDecorationColor: 'var(--bim-widget-border, #ddd)',
                            textUnderlineOffset: '2px',
                        }}
                    >
                        原文來源
                    </a>
                </div>
            )}

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
                    color: 'var(--bim-desc-fg, #999)',
                    fontSize: '13px',
                }}>
                    无匹配结果
                </div>
            )}
        </div>
    );
}

/** 原文模式：直接渲染 md 文本（逐行处理标题和粗体） */
function MdTextView({ text, highlightQuery = '' }: { text: string; highlightQuery?: string }) {
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    const hl = (s: string): React.ReactNode => {
        const c = convert(s);
        return highlightQuery ? renderHighlighted(c, highlightQuery, normalizer) : c;
    };
    const lines = text.split('\n');
    return (
        <div style={{ fontSize: '15px', lineHeight: 2.2, color: 'var(--bim-fg, #333)', textAlign: 'justify' }}>
            {lines.map((line, i) => {
                if (line.startsWith('# ')) {
                    return <h2 key={i} style={{ fontSize: '17px', fontWeight: 700, margin: '16px 0 8px' }}>{hl(line.slice(2))}</h2>;
                }
                if (line.startsWith('## ')) {
                    return <h3 key={i} style={{ fontSize: '16px', fontWeight: 600, margin: '14px 0 6px' }}>{hl(line.slice(3))}</h3>;
                }
                if (line.startsWith('### ')) {
                    return <h4 key={i} style={{ fontSize: '15px', fontWeight: 600, margin: '12px 0 4px' }}>{hl(line.slice(4))}</h4>;
                }
                if (!line.trim()) {
                    const prevEmpty = i > 0 && !lines[i - 1].trim();
                    return prevEmpty ? null : <div key={i} style={{ height: '0.5em' }} />;
                }
                // 处理行内 **粗体**
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                    <p key={i} style={{ margin: '6px 0', textIndent: '2em', whiteSpace: 'pre-wrap' }}>
                        {parts.map((part, j) =>
                            part.startsWith('**') && part.endsWith('**')
                                ? <strong key={j}>{hl(part.slice(2, -2))}</strong>
                                : <React.Fragment key={j}>{hl(part)}</React.Fragment>
                        )}
                    </p>
                );
            })}
        </div>
    );
}

/** 原文模式：将 sections 渲染为连续文本 */
function RawTextView({ sections, onNavigate, highlightQuery = '' }: { sections: CollatedSection[]; onNavigate?: (id: string) => void; highlightQuery?: string }) {
    const { convert } = useConvert();
    const buildUrl = useBidUrl();
    const normalizer = useSearchNormalizer();
    const hl = (s: string | undefined | null): React.ReactNode => {
        if (!s) return '';
        const c = convert(s);
        return highlightQuery ? renderHighlighted(c, highlightQuery, normalizer) : c;
    };
    // Group sections by 类
    const groups: { category: string; categoryContent?: string; items: CollatedSection[] }[] = [];
    let current: { category: string; categoryContent?: string; items: CollatedSection[] } | null = null;

    for (const s of sections) {
        if (normSectionType(s.type) === '类') {
            if (current) groups.push(current);
            current = { category: s.title, categoryContent: s.content || undefined, items: [] };
        } else if (normSectionType(s.type) === '书') {
            if (!current) current = { category: '', items: [] };
            current.items.push(s);
        } else if (normSectionType(s.type) === '序' || normSectionType(s.type) === '结语') {
            if (!current) current = { category: '', items: [] };
            current.items.push(s);
            // 结语意味着类结束
            if (normSectionType(s.type) === '结语') {
                groups.push(current);
                current = null;
            }
        }
    }
    if (current) groups.push(current);

    return (
        <div style={{ fontSize: '15px', lineHeight: 2.2, color: 'var(--bim-fg, #333)', textAlign: 'justify' }}>
            {groups.map((g, gi) => (
                <div key={gi} style={{ marginBottom: '20px' }}>
                    {g.category && (
                        <h4 style={{ fontSize: '15px', fontWeight: 600, margin: '16px 0 8px', color: 'var(--bim-fg, #1a1a1a)' }}>
                            {hl(g.category)}
                            {g.categoryContent && (
                                <span style={{ fontWeight: 400, fontSize: '14px', marginLeft: '8px', color: 'var(--bim-desc-fg, #717171)' }}>
                                    {hl(g.categoryContent)}
                                </span>
                            )}
                        </h4>
                    )}
                    {g.items.map((s, si) => {
                        if (normSectionType(s.type) === '序' || normSectionType(s.type) === '结语') {
                            return <p key={si} style={{ margin: '12px 0', textIndent: '2em' }}>{hl(s.content || '')}</p>;
                        }
                        return (
                            <p key={si} style={{ margin: '8px 0', textIndent: '2em', whiteSpace: 'pre-line' }}>
                                {onNavigate && s.work_id ? (
                                    <a
                                        href={buildUrl(s.work_id)}
                                        onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onNavigate(s.work_id!); }}
                                        style={{ color: 'var(--bim-fg, #333)', textDecoration: 'underline', textDecorationColor: 'var(--bim-widget-border, #ddd)', textUnderlineOffset: '3px', cursor: 'pointer' }}
                                        title={convert(s.title)}
                                    >
                                        <strong>{hl(s.title)}</strong>
                                    </a>
                                ) : (
                                    <strong>{hl(s.title)}</strong>
                                )}
                                {s.content && hl(s.content)}
                            </p>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function JuanContent({
    juan,
    rawText,
    searchQuery,
    onNavigate,
}: {
    juan: CollatedJuan;
    rawText?: string | null;
    searchQuery: string;
    onNavigate?: (id: string) => void;
}) {
    const { convert } = useConvert();
    const normalizer = useSearchNormalizer();
    const [viewMode, setViewMode] = useState<'catalog' | 'raw'>('catalog');
    const q = searchQuery.trim();

    // 目录模式：过滤；原文模式：保持完整内容，仅做高亮
    const catalogSections = useMemo(() => {
        if (!q) return juan.sections;
        return juan.sections.filter(s => sectionMatches(s, q, false, normalizer));
    }, [juan.sections, q, normalizer]);

    const bookCount = juan.sections.filter(s => normSectionType(s.type) === '书').length;
    const poemCount = juan.sections.filter(s => normSectionType(s.type) === '诗').length;
    const matchedCount = q ? catalogSections.filter(s => normSectionType(s.type) === '书' || normSectionType(s.type) === '诗').length : null;

    return (
        <div>
            {/* 卷标题 + 模式切换 */}
            <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '12px',
                marginBottom: '12px',
            }}>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--bim-fg, #1a1a1a)',
                    margin: 0,
                }}>
                    {convert(juan.title)}
                </h3>
                <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
                    {(['catalog', 'raw'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            style={{
                                padding: '2px 8px',
                                fontSize: '11px',
                                border: '1px solid var(--bim-widget-border, #ddd)',
                                borderRadius: mode === 'catalog' ? '3px 0 0 3px' : '0 3px 3px 0',
                                background: viewMode === mode ? 'var(--bim-primary, #8e6f3e)' : 'var(--bim-input-bg, #fff)',
                                color: viewMode === mode ? '#fff' : 'var(--bim-desc-fg, #999)',
                                cursor: 'pointer',
                            }}
                        >
                            {mode === 'catalog' ? '目錄' : '原文'}
                        </button>
                    ))}
                </div>
                <span style={{
                    fontSize: '12px',
                    color: 'var(--bim-desc-fg, #999)',
                    marginLeft: 'auto',
                }}>
                    {matchedCount != null
                        ? `${matchedCount} / ${poemCount > 0 ? `${poemCount} 首` : `${bookCount} 部書`}`
                        : (poemCount > 0 ? `${poemCount} 首` : `${bookCount} 部书`)}
                </span>
            </div>

            {/* 原文模式：完整内容 + 高亮 */}
            {viewMode === 'raw' && (
                rawText
                    ? <MdTextView text={rawText} highlightQuery={q} />
                    : <RawTextView sections={juan.sections} onNavigate={onNavigate} highlightQuery={q} />
            )}

            {/* 目录模式：仅显示匹配条目 + 高亮 */}
            {viewMode === 'catalog' && catalogSections.map((section, i) => {
                if (normSectionType(section.type) === '书' || normSectionType(section.type) === '诗') {
                    return <BookSection key={i} section={section} onNavigate={onNavigate} highlightQuery={q} />;
                }
                if (normSectionType(section.type) === '类') {
                    return <CategoryHeader key={i} section={section} highlightQuery={q} />;
                }
                return <OtherSection key={i} section={section} highlightQuery={q} />;
            })}

            {viewMode === 'catalog' && catalogSections.length === 0 && (
                <div style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: 'var(--bim-desc-fg, #999)',
                    fontSize: '13px',
                }}>
                    无匹配结果
                </div>
            )}
        </div>
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

    // 把当前 active 卷塞入缓存
    useEffect(() => {
        if (activeFile && activeJuan) {
            cacheRef.current.set(activeFile, { juan: activeJuan, rawText: activeRawText });
        }
    }, [activeFile, activeJuan, activeRawText]);

    // workId 切换 → 清空缓存与状态
    useEffect(() => {
        cacheRef.current.clear();
        setMatchStates({});
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
    }, [query, workId, transport, files.join(','), computeMatch, normalizer]);

    return { matchStates };
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

    // 如果外部传了 activeJuan 就用外部的，否则用内部状态
    const activeFile = externalActiveJuan ?? internalActiveFile;
    const setActiveFile = useCallback((file: string | null) => {
        setInternalActiveFile(file);
        onJuanChange?.(file);
    }, [onJuanChange]);

    const index = indexProp || indexData;

    // 当外部 indexProp 到达时，清除内部 loading 状态
    useEffect(() => {
        if (indexProp) {
            setLoading(false);
            setError(null);
        }
    }, [indexProp]);

    // 加载卷列表
    useEffect(() => {
        if (indexProp || !workId || !transport?.getCollatedEditionIndex) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        transport.getCollatedEditionIndex(workId).then(result => {
            if (cancelled) return;
            if (!result) {
                setError('未找到整理本数据');
            } else {
                setIndexData(result);
                // 默认选第一卷（仅当外部没有指定时）
                const firstFile = getFirstFile(result);
                if (!externalActiveJuan && firstFile) {
                    setActiveFile(firstFile);
                }
            }
        }).catch(err => {
            if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [indexProp, workId, transport, externalActiveJuan, setActiveFile]);

    // 自动选第一卷（当 index 可用且尚未选择时）
    useEffect(() => {
        const idx = indexProp || indexData;
        if (idx && !activeFile) {
            const firstFile = getFirstFile(idx);
            if (firstFile) setActiveFile(firstFile);
        }
    }, [indexProp, indexData, activeFile, setActiveFile]);

    const effectiveWorkId = workId || index?.work_id;

    // 加载单卷
    const loadJuan = useCallback(async (file: string) => {
        if (!effectiveWorkId || !transport?.getCollatedJuan) return;
        setJuanLoading(true);
        setJuanData(null);
        setJuanRawText(null);
        try {
            const [data, rawText] = await Promise.all([
                transport.getCollatedJuan(effectiveWorkId, file),
                transport.getCollatedJuanText?.(effectiveWorkId, file) ?? Promise.resolve(null),
            ]);
            setJuanData(data);
            setJuanRawText(rawText);
        } catch {
            setJuanData(null);
            setJuanRawText(null);
        } finally {
            setJuanLoading(false);
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
                <div style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '13px' }}>
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
                color: 'var(--bim-desc-fg, #717171)',
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
    />;
};

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
}> = ({
    className, style, index, allFiles, isKaozhen, effectiveWorkId, transport,
    activeFile, handleSelectFile, juanData, juanRawText, juanLoading,
    searchQuery, setSearchQuery, onNavigate, workLabelCacheRef,
}) => {
    const { matchStates } = useCrossJuanSearch({
        workId: effectiveWorkId,
        transport,
        files: allFiles,
        activeFile,
        activeJuan: juanData,
        activeRawText: juanRawText,
        query: searchQuery,
        isKaozhen,
    });

    return (
        <div className={className} style={style}>
            {/* 搜索框（最上方） */}
            <div style={{ marginBottom: '12px' }}>
                <input
                    type="text"
                    placeholder={isKaozhen ? '搜索全部章节（条目、考证内容）...' : '搜索全部册（书名、作者、正文）...'}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        maxWidth: '420px',
                        padding: '6px 10px',
                        border: '1px solid var(--bim-input-border, #ccc)',
                        borderRadius: '4px',
                        background: 'var(--bim-input-bg, #fff)',
                        color: 'var(--bim-input-fg, #333)',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* 头部：卷数 + 质量等级同一行 */}
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: 'var(--bim-desc-fg, #717171)' }}>
                <div>
                    {isKaozhen ? (
                        <>
                            {index.target_source && (
                                <span>考證對象：<strong style={{ color: 'var(--bim-fg, #333)' }}>{index.target_source}</strong>　</span>
                            )}
                            共 <strong style={{ color: 'var(--bim-fg, #333)' }}>{allFiles.length}</strong> 章
                        </>
                    ) : (
                        <span>共 <strong style={{ color: 'var(--bim-fg, #333)' }}>{index.total_juan}</strong> 卷</span>
                    )}
                </div>
                {index.text_quality && (() => {
                    const grade = normalizeTextQualityGrade(index.text_quality.grade);
                    if (!grade) return null;
                    return (
                        <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>文本質量：</span>
                            <Tooltip content={TEXT_QUALITY_CRITERIA[grade]}>
                                <span
                                    style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        lineHeight: '16px',
                                        textAlign: 'center',
                                        borderRadius: '3px',
                                        fontWeight: 600,
                                        fontSize: '12px',
                                        color: '#fff',
                                        background: TEXT_QUALITY_COLORS[grade],
                                        cursor: 'help',
                                    }}
                                >{TEXT_QUALITY_LABELS[grade]}</span>
                            </Tooltip>
                            {index.text_quality.source_note && (
                                <span style={{ marginLeft: '4px' }}>— {index.text_quality.source_note}</span>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* 卷/章导航 */}
            <JuanNav
                files={allFiles}
                groups={index.juan_groups}
                activeFile={activeFile}
                onSelect={handleSelectFile}
                juanMeta={index.juan_metadata}
                matchStates={matchStates}
            />

            {/* 卷内容 */}
            {juanLoading ? (
                <LoadingDots />
            ) : juanData ? (
                isKaozhen ? (
                    <KaozhenContent
                        juan={juanData}
                        searchQuery={searchQuery}
                        onNavigate={onNavigate}
                        transport={transport}
                        workLabelCache={workLabelCacheRef}
                    />
                ) : (
                    <JuanContent
                        juan={juanData}
                        rawText={juanRawText}
                        searchQuery={searchQuery}
                        onNavigate={onNavigate}
                    />
                )
            ) : activeFile ? (
                <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--bim-desc-fg, #999)',
                    fontSize: '13px',
                }}>
                    选择一卷查看内容
                </div>
            ) : null}

            {/* 参考文献 */}
            {index.references && index.references.length > 0 && (
                <div style={{
                    marginTop: '32px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--bim-widget-border, #eee)',
                }}>
                    <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--bim-desc-fg, #aaa)',
                        marginBottom: '8px',
                        letterSpacing: '2px',
                    }}>
                        參考文獻
                    </div>
                    {index.references.map((ref, i) => (
                        <div key={i} style={{
                            fontSize: '12px',
                            color: 'var(--bim-desc-fg, #999)',
                            lineHeight: 1.8,
                            paddingLeft: '12px',
                        }}>
                            <span>{i + 1}. </span>
                            {ref.url ? (
                                <a
                                    href={ref.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        color: 'var(--bim-desc-fg, #999)',
                                        textDecoration: 'underline',
                                        textDecorationColor: 'var(--bim-widget-border, #ddd)',
                                        textUnderlineOffset: '2px',
                                    }}
                                >
                                    {ref.title}
                                </a>
                            ) : (
                                <span>{ref.title}</span>
                            )}
                            {ref.author && (
                                <span>，{ref.author}</span>
                            )}
                            {ref.note && (
                                <span>。{ref.note}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
