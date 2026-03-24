import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { CollatedEditionIndex, CollatedJuan, CollatedSection, JuanGroup } from '../types';
import type { IndexStorage } from '../storage/types';

export interface CollatedEditionProps {
    /** 直接传入卷列表索引 */
    index?: CollatedEditionIndex;
    /** 作品 ID，配合 transport 自动加载 */
    workId?: string;
    /** 数据传输层 */
    transport?: IndexStorage;
    /** 点击关联条目时回调 */
    onNavigate?: (id: string) => void;
    className?: string;
    style?: React.CSSProperties;
}

// ── 样式常量 ──

const SECTION_TYPE_COLORS: Record<string, string> = {
    '部': '#2471a3',
    '类': '#8e6f3e',
    '书': '#c0392b',
    '其他': '#717171',
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
    files: string[];
    groups?: JuanGroup[];
    activeFile: string | null;
    onSelect: (file: string) => void;
}) {
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
            {files.map(f => (
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

function BookSection({ section, onNavigate }: { section: CollatedSection; onNavigate?: (id: string) => void }) {
    const [expanded, setExpanded] = useState(false);
    const hasSummary = !!section.summary;
    const hasComment = !!section.comment;
    const hasAdditionalComment = !!section.additional_comment;
    const hasContent = hasSummary || hasComment || hasAdditionalComment;

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
                <span style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--bim-fg, #1a1a1a)',
                    flex: 1,
                }}>
                    {section.title}
                </span>
                {section.n_juan != null && (
                    <span style={{
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #999)',
                    }}>
                        {section.n_juan}卷
                    </span>
                )}
                {section.version && (
                    <span style={{
                        fontSize: '11px',
                        color: 'var(--bim-desc-fg, #aaa)',
                    }}>
                        {section.version}
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
                    <span
                        onClick={e => { e.stopPropagation(); onNavigate(section.work_id!); }}
                        style={{
                            fontSize: '11px',
                            color: 'var(--bim-link-fg, #0066cc)',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                        title="查看作品"
                    >
                        →作品
                    </span>
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
                            {section.author_info}
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
                            }}>{section.summary}</p>
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
                            }}>{section.comment}</p>
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
                            }}>{section.additional_comment}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CategoryHeader({ section }: { section: CollatedSection }) {
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
                    {section.title}
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
                    }}>{section.content}</p>
                </div>
            )}
        </div>
    );
}

function OtherSection({ section }: { section: CollatedSection }) {
    if (!section.content && !section.title) return null;
    const text = (section.content || section.title || '').replace(/\n{2,}/g, '\n');
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

function JuanContent({
    juan,
    searchQuery,
    onNavigate,
}: {
    juan: CollatedJuan;
    searchQuery: string;
    onNavigate?: (id: string) => void;
}) {
    const filteredSections = useMemo(() => {
        if (!searchQuery.trim()) return juan.sections;
        const q = searchQuery.trim().toLowerCase();
        return juan.sections.filter(s =>
            s.title?.toLowerCase().includes(q) ||
            s.book_title?.toLowerCase().includes(q) ||
            s.author?.toLowerCase().includes(q) ||
            s.author_info?.toLowerCase().includes(q) ||
            s.summary?.toLowerCase().includes(q)
        );
    }, [juan.sections, searchQuery]);

    const bookCount = filteredSections.filter(s => s.type === '书').length;

    return (
        <div>
            {/* 卷标题 */}
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
                    {juan.title}
                </h3>
                {juan.source_url && (
                    <a
                        href={juan.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '12px',
                            color: 'var(--bim-link-fg, #0066cc)',
                            textDecoration: 'none',
                        }}
                    >
                        原文 ↗
                    </a>
                )}
                <span style={{
                    fontSize: '12px',
                    color: 'var(--bim-desc-fg, #999)',
                    marginLeft: 'auto',
                }}>
                    {bookCount} 部书
                </span>
            </div>

            {/* Sections */}
            {filteredSections.map((section, i) => {
                if (section.type === '书') {
                    return <BookSection key={i} section={section} onNavigate={onNavigate} />;
                }
                if (section.type === '部' || section.type === '类') {
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

// ── 主组件 ──

export const CollatedEdition: React.FC<CollatedEditionProps> = ({
    index: indexProp,
    workId,
    transport,
    onNavigate,
    className,
    style,
}) => {
    const [indexData, setIndexData] = useState<CollatedEditionIndex | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [juanData, setJuanData] = useState<CollatedJuan | null>(null);
    const [juanLoading, setJuanLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const index = indexProp || indexData;

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
                // 默认选第一卷
                if (result.juan_files.length > 0) {
                    setActiveFile(result.juan_files[0]);
                }
            }
        }).catch(err => {
            if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [indexProp, workId, transport]);

    // 自动选第一卷（当 indexProp 变化时）
    useEffect(() => {
        if (indexProp && indexProp.juan_files.length > 0 && !activeFile) {
            setActiveFile(indexProp.juan_files[0]);
        }
    }, [indexProp, activeFile]);

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

    return (
        <div className={className} style={style}>
            {/* 头部统计 */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    fontSize: '13px',
                    color: 'var(--bim-desc-fg, #717171)',
                }}>
                    共 <strong style={{ color: 'var(--bim-fg, #333)' }}>{index.total_juan}</strong> 卷
                </div>
            </div>

            {/* 卷导航 */}
            <JuanNav
                files={index.juan_files}
                groups={index.juan_groups}
                activeFile={activeFile}
                onSelect={handleSelectFile}
            />

            {/* 搜索 */}
            <div style={{ marginBottom: '12px' }}>
                <input
                    type="text"
                    placeholder="搜索书名、作者..."
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
                <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--bim-desc-fg, #717171)',
                    fontSize: '13px',
                }}>
                    加载中...
                </div>
            ) : juanData ? (
                <JuanContent
                    juan={juanData}
                    searchQuery={searchQuery}
                    onNavigate={onNavigate}
                />
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
        </div>
    );
};
