import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { CollatedEditionIndex, CollatedJuan, CollatedSection, JuanGroup } from '../types';
import type { IndexStorage } from '../storage/types';
import { useConvert } from '../i18n';
import { LoadingDots } from './common/LoadingDots';

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

// ── 样式常量 ──

const SECTION_TYPE_COLORS: Record<string, string> = {
    '部': '#2471a3',
    '类': '#8e6f3e',
    '书': '#c0392b',
    '其他': '#717171',
};

const KAOZHEN_TYPE_COLORS: Record<string, string> = {
    '考証': '#5d6d7e',
    '考证': '#5d6d7e',
    '序論': '#1a5276',
    '序论': '#1a5276',
    '按語': '#7d6608',
    '按语': '#7d6608',
    '亡佚': '#922b21',
    '重出': '#6c3483',
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

function JuanButton({ file, isActive, onSelect }: {
    file: string; isActive: boolean; onSelect: (f: string) => void;
}) {
    return (
        <button
            onClick={() => onSelect(file)}
            style={{
                padding: '3px 8px',
                border: isActive
                    ? '1px solid var(--bim-primary, #8e6f3e)'
                    : '1px solid var(--bim-widget-border, #e0e0e0)',
                borderRadius: '3px',
                background: isActive
                    ? 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 10%, transparent)'
                    : 'transparent',
                color: isActive
                    ? 'var(--bim-primary, #8e6f3e)'
                    : 'var(--bim-fg, #333)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 400,
                lineHeight: 1.4,
            }}
        >
            {juanDisplayName(file)}
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

function JuanGroupNav({ group, activeFile, onSelect, depth = 0 }: {
    group: JuanGroup; activeFile: string | null; onSelect: (f: string) => void; depth?: number;
}) {
    const hasActive = groupContainsFile(group, activeFile || '');
    const [expanded, setExpanded] = useState(hasActive);
    const count = groupFileCount(group);
    const hasChildren = !!group.children?.length;

    useEffect(() => {
        if (hasActive) setExpanded(true);
    }, [hasActive]);

    // 叶子分组且只有1个文件：直接渲染为按钮，不需要展开层级
    if (group.files.length === 1 && !hasChildren) {
        const f = group.files[0];
        const isActive = activeFile === f;
        return (
            <button
                onClick={() => onSelect(f)}
                style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    margin: '2px 0',
                    marginLeft: `${8 + depth * 16}px`,
                    border: isActive
                        ? '1px solid var(--bim-primary, #8e6f3e)'
                        : '1px solid var(--bim-widget-border, #e0e0e0)',
                    borderRadius: '3px',
                    background: isActive
                        ? 'color-mix(in srgb, var(--bim-primary, #8e6f3e) 10%, transparent)'
                        : 'transparent',
                    color: isActive
                        ? 'var(--bim-primary, #8e6f3e)'
                        : 'var(--bim-fg, #333)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: isActive ? 600 : 400,
                    lineHeight: 1.4,
                }}
            >
                {group.label}
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
                    color: hasActive ? 'var(--bim-primary, #8e6f3e)' : 'var(--bim-fg, #333)',
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
                                <JuanButton key={f} file={f} isActive={activeFile === f} onSelect={onSelect} />
                            ))}
                        </div>
                    )}
                    {/* 子分组 */}
                    {hasChildren && group.children!.map((child, i) => (
                        <JuanGroupNav key={i} group={child} activeFile={activeFile} onSelect={onSelect} depth={depth + 1} />
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
}: {
    files: string[] | undefined;
    groups?: JuanGroup[];
    activeFile: string | null;
    onSelect: (file: string) => void;
}) {
    const fileList = files || [];

    // 有分组信息时按分组显示
    if (groups && groups.length > 0) {
        return (
            <div style={{ marginBottom: '16px' }}>
                {groups.map((g, i) => (
                    <JuanGroupNav key={i} group={g} activeFile={activeFile} onSelect={onSelect} />
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
                <JuanButton key={f} file={f} isActive={activeFile === f} onSelect={onSelect} />
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

function BookSection({ section, onNavigate }: { section: CollatedSection; onNavigate?: (id: string) => void }) {
    const { convert } = useConvert();
    const [expanded, setExpanded] = useState(false);
    const hasSummary = !!section.summary;
    const hasComment = !!section.comment;
    const hasAdditionalComment = !!section.additional_comment;
    const hasLongContent = !!(section.content && section.content.length > 60);
    const hasContent = hasSummary || hasComment || hasAdditionalComment || hasLongContent;
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
                        {section.book_title ? `《${convert(section.book_title)}》` : convert(section.title)}
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
                                {convert(section.author_info || section.author)}
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
                            {convert(preview)}
                        </div>
                    )}
                </div>
                {section.edition && (
                    <span style={{
                        fontSize: '11px',
                        color: 'var(--bim-desc-fg, #aaa)',
                    }}>
                        {convert(section.edition)}
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
                        href={`/book-index?id=${section.work_id}`}
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
                            {convert(section.author_info)}
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
                            }}>{convert(section.summary)}</p>
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
                            }}>{convert(section.comment)}</p>
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
                            }}>{convert(section.additional_comment)}</p>
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
                        }}>{convert(section.content)}</p>
                    )}
                </div>
            )}
        </div>
    );
}

function CategoryHeader({ section }: { section: CollatedSection }) {
    const { convert } = useConvert();
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
                    {convert(section.title)}
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
                    }}>{convert(section.content!)}</p>
                </div>
            )}
        </div>
    );
}

function OtherSection({ section }: { section: CollatedSection }) {
    const { convert } = useConvert();
    if (!section.content && !section.title) return null;
    const text = convert((section.content || section.title || '').replace(/\n{2,}/g, '\n'));
    return (
        <div style={{
            padding: '6px 0',
            fontSize: '13px',
            color: 'var(--bim-desc-fg, #717171)',
            lineHeight: 1.7,
            whiteSpace: 'pre-line',
        }}>
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
function KaozhenSection({ section, onNavigate, transport, workLabelCache }: {
    section: CollatedSection;
    onNavigate?: (id: string) => void;
    transport?: IndexStorage;
    workLabelCache?: React.RefObject<WorkLabelCache>;
}) {
    const { convert } = useConvert();
    const [expanded, setExpanded] = useState(false);
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
                        {section.header_line ? convert(section.header_line) : convert(section.title)}
                    </span>
                    {/* 折叠时的内容预览 */}
                    {!expanded && preview && (
                        <p style={{
                            margin: '4px 0 0',
                            fontSize: '12px',
                            color: 'var(--bim-desc-fg, #aaa)',
                            lineHeight: 1.7,
                        }}>
                            {convert(preview)}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {/* 单作品：标题行右侧显示链接 */}
                    {workIds.length === 1 && onNavigate && (
                        <a
                            href={`/book-index?id=${workIds[0]}`}
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
                                href={`/book-index?id=${wid}`}
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
                        {convert(section.content!)}
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
                            {convert(section.comment)}
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

    const filteredSections = useMemo(() => {
        if (!searchQuery.trim()) return juan.sections;
        const q = searchQuery.trim().toLowerCase();
        return juan.sections.filter(s =>
            s.title?.toLowerCase().includes(q) ||
            s.content?.toLowerCase().includes(q) ||
            s.comment?.toLowerCase().includes(q)
        );
    }, [juan.sections, searchQuery]);

    const sectionCount = filteredSections.filter(s => s.type === '考証' || s.type === '考证').length;

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
                {sectionCount > 0 && (
                    <span style={{
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #999)',
                        marginLeft: 'auto',
                    }}>
                        {sectionCount} 條
                    </span>
                )}
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
                    <KaozhenSection key={i} section={section} onNavigate={onNavigate} transport={transport} workLabelCache={workLabelCache} />
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

/** 原文模式：将 sections 渲染为连续文本 */
function RawTextView({ sections, onNavigate }: { sections: CollatedSection[]; onNavigate?: (id: string) => void }) {
    const { convert } = useConvert();
    // Group sections by 类
    const groups: { category: string; categoryContent?: string; items: CollatedSection[] }[] = [];
    let current: { category: string; categoryContent?: string; items: CollatedSection[] } | null = null;

    for (const s of sections) {
        if (s.type === '类' || s.type === '门') {
            if (current) groups.push(current);
            current = { category: s.title, categoryContent: s.content || undefined, items: [] };
        } else if (s.type === '书') {
            if (!current) current = { category: '', items: [] };
            current.items.push(s);
        } else if (s.type === '序') {
            if (current) {
                current.items.push(s);
                groups.push(current);
                current = null;
            } else {
                groups.push({ category: '', items: [s] });
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
                            {convert(g.category)}
                            {g.categoryContent && (
                                <span style={{ fontWeight: 400, fontSize: '14px', marginLeft: '8px', color: 'var(--bim-desc-fg, #717171)' }}>
                                    {convert(g.categoryContent)}
                                </span>
                            )}
                        </h4>
                    )}
                    {g.items.map((s, si) => {
                        if (s.type === '序') {
                            return <p key={si} style={{ margin: '12px 0', textIndent: '2em' }}>{convert(s.content || '')}</p>;
                        }
                        // 原文模式：标题+正文连续显示，还原原始文本面貌
                        const fullText = s.content ? s.title + s.content : s.title;
                        return (
                            <p key={si} style={{ margin: '8px 0', textIndent: '2em', whiteSpace: 'pre-line' }}>
                                {onNavigate && s.work_id ? (
                                    <a
                                        href={`/book-index?id=${s.work_id}`}
                                        onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onNavigate(s.work_id!); }}
                                        style={{ color: 'var(--bim-fg, #333)', textDecoration: 'underline', textDecorationColor: 'var(--bim-widget-border, #ddd)', textUnderlineOffset: '3px', cursor: 'pointer' }}
                                        title={convert(s.title)}
                                    >
                                        <strong>{convert(s.title)}</strong>
                                    </a>
                                ) : (
                                    <strong>{convert(s.title)}</strong>
                                )}
                                {s.content && convert(s.content)}
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
    searchQuery,
    onNavigate,
}: {
    juan: CollatedJuan;
    searchQuery: string;
    onNavigate?: (id: string) => void;
}) {
    const { convert } = useConvert();
    const [viewMode, setViewMode] = useState<'catalog' | 'raw'>('catalog');

    const filteredSections = useMemo(() => {
        if (!searchQuery.trim()) return juan.sections;
        const q = searchQuery.trim().toLowerCase();
        return juan.sections.filter(s =>
            s.title?.toLowerCase().includes(q) ||
            s.book_title?.toLowerCase().includes(q) ||
            s.author?.toLowerCase().includes(q) ||
            s.author_info?.toLowerCase().includes(q) ||
            s.summary?.toLowerCase().includes(q) ||
            s.content?.toLowerCase().includes(q)
        );
    }, [juan.sections, searchQuery]);

    const bookCount = filteredSections.filter(s => s.type === '书').length;

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
                    {bookCount} 部书
                </span>
            </div>

            {/* 原文模式 */}
            {viewMode === 'raw' && (
                <RawTextView sections={filteredSections} onNavigate={onNavigate} />
            )}

            {/* 目录模式 */}
            {viewMode === 'catalog' && filteredSections.map((section, i) => {
                if (section.type === '书') {
                    return <BookSection key={i} section={section} onNavigate={onNavigate} />;
                }
                if (section.type === '部' || section.type === '类' || section.type === '门') {
                    return <CategoryHeader key={i} section={section} />;
                }
                return <OtherSection key={i} section={section} />;
            })}

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
        try {
            const data = await transport.getCollatedJuan(effectiveWorkId, file);
            setJuanData(data);
        } catch {
            setJuanData(null);
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
        setSearchQuery('');
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

    return (
        <div className={className} style={style}>
            {/* 头部统计 */}
            <div style={{ marginBottom: '16px' }}>
                {isKaozhen ? (
                    <div style={{ fontSize: '13px', color: 'var(--bim-desc-fg, #717171)' }}>
                        {index.target_source && (
                            <span>考證對象：<strong style={{ color: 'var(--bim-fg, #333)' }}>{index.target_source}</strong>　</span>
                        )}
                        共 <strong style={{ color: 'var(--bim-fg, #333)' }}>{allFiles.length}</strong> 章
                    </div>
                ) : (
                    <div style={{ fontSize: '13px', color: 'var(--bim-desc-fg, #717171)' }}>
                        共 <strong style={{ color: 'var(--bim-fg, #333)' }}>{index.total_juan}</strong> 卷
                    </div>
                )}
            </div>

            {/* 卷/章导航 */}
            <JuanNav
                files={allFiles}
                groups={index.juan_groups}
                activeFile={activeFile}
                onSelect={handleSelectFile}
            />

            {/* 搜索 */}
            <div style={{ marginBottom: '12px' }}>
                <input
                    type="text"
                    placeholder={isKaozhen ? '搜索条目、考证内容...' : '搜索书名、作者...'}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        maxWidth: '320px',
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
