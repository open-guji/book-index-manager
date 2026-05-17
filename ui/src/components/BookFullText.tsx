import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { BookFullTextIndex } from '../types';
import type { IndexStorage } from '../storage/types';

interface BookFullTextProps {
    /** 全文目录（外部可注入，避免重复请求） */
    index?: BookFullTextIndex;
    bookId: string;
    transport: IndexStorage;
    /** 当前活动章节文件名（受控，e.g. "第001.md"） */
    activeChapter?: string | null;
    onChapterChange?: (chapter: string | null) => void;
}

/**
 * Book 全文 viewer：左侧章节列表 + 右侧 markdown 渲染。
 *
 * 数据来源：Book/<id>/full_text/index.json + 第NNN.md。
 * 设计参考 CollatedEdition 但极简化（小说连续叙事，无 sections 结构化）。
 */
export const BookFullText: React.FC<BookFullTextProps> = ({
    index: indexProp,
    bookId,
    transport,
    activeChapter: activeChapterProp,
    onChapterChange,
}) => {
    const [index, setIndex] = useState<BookFullTextIndex | null>(indexProp ?? null);
    const [internalChapter, setInternalChapter] = useState<string | null>(null);
    const activeChapter = activeChapterProp !== undefined ? activeChapterProp : internalChapter;
    const setActiveChapter = useCallback((c: string | null) => {
        if (onChapterChange) onChapterChange(c);
        else setInternalChapter(c);
    }, [onChapterChange]);

    const [chapterText, setChapterText] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);

    // 同步外部 index prop
    useEffect(() => {
        if (indexProp) setIndex(indexProp);
    }, [indexProp]);

    // 内部 fallback：直接调 transport
    useEffect(() => {
        if (indexProp) return;
        if (!bookId || !transport.getBookFullTextIndex) return;
        let cancelled = false;
        transport.getBookFullTextIndex(bookId).then(r => {
            if (!cancelled) setIndex(r);
        });
        return () => { cancelled = true; };
    }, [bookId, transport, indexProp]);

    // 默认选第一章
    useEffect(() => {
        if (!index || index.chapters.length === 0) return;
        if (!activeChapter) {
            setActiveChapter(index.chapters[0].file);
        }
    }, [index, activeChapter, setActiveChapter]);

    // 加载选中章节的 markdown
    useEffect(() => {
        if (!bookId || !activeChapter || !transport.getBookFullTextChapter) return;
        let cancelled = false;
        setTextLoading(true);
        setChapterText(null);
        transport.getBookFullTextChapter(bookId, activeChapter)
            .then(txt => { if (!cancelled) setChapterText(txt); })
            .catch(() => { if (!cancelled) setChapterText(null); })
            .finally(() => { if (!cancelled) setTextLoading(false); });
        return () => { cancelled = true; };
    }, [bookId, activeChapter, transport]);

    const currentChapterMeta = useMemo(() => {
        if (!index || !activeChapter) return null;
        return index.chapters.find(c => c.file === activeChapter) ?? null;
    }, [index, activeChapter]);

    if (!index) {
        return <div style={{ padding: 24, color: 'var(--bim-desc-fg, #999)' }}>加载全文目录…</div>;
    }

    if (index.chapters.length === 0) {
        return <div style={{ padding: 24, color: 'var(--bim-desc-fg, #999)' }}>全文目录为空</div>;
    }

    return (
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 400 }}>
            {/* 左侧：章节列表 */}
            <aside style={{
                flex: '0 0 240px',
                maxHeight: 'calc(100vh - 200px)',
                overflowY: 'auto',
                borderRight: '1px solid var(--bim-border, #e5e5e5)',
                paddingRight: 12,
            }}>
                <div style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    color: 'var(--bim-desc-fg, #888)',
                    borderBottom: '1px solid var(--bim-border, #e5e5e5)',
                    marginBottom: 8,
                }}>
                    {index.version_label} · 共 {index.total_chapters} {index.chapters.length === 1 ? '章' : '章'}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {index.chapters.map(ch => {
                        const isActive = ch.file === activeChapter;
                        return (
                            <li key={ch.file}>
                                <button
                                    onClick={() => setActiveChapter(ch.file)}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '6px 12px',
                                        background: isActive ? 'var(--bim-primary-bg, #fdf4f4)' : 'transparent',
                                        border: 'none',
                                        borderLeft: isActive ? '3px solid var(--bim-primary, #8B0000)' : '3px solid transparent',
                                        color: isActive ? 'var(--bim-primary, #8B0000)' : 'var(--bim-fg, #2c2c2c)',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {ch.title}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </aside>

            {/* 右侧：正文 */}
            <main style={{
                flex: 1,
                maxHeight: 'calc(100vh - 200px)',
                overflowY: 'auto',
                paddingLeft: 8,
            }}>
                {currentChapterMeta && (
                    <header style={{
                        marginBottom: 16,
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--bim-border, #e5e5e5)',
                    }}>
                        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--bim-fg, #2c2c2c)' }}>
                            {currentChapterMeta.title}
                        </h2>
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--bim-desc-fg, #888)' }}>
                            来源：<a href={index.source.url} target="_blank" rel="noreferrer"
                                style={{ color: 'var(--bim-primary, #8B0000)' }}>
                                {index.source.name}
                            </a>
                            {index.source.license && <> · {index.source.license}</>}
                        </div>
                    </header>
                )}

                {textLoading && (
                    <div style={{ color: 'var(--bim-desc-fg, #999)' }}>加载中…</div>
                )}

                {!textLoading && chapterText && (
                    <article style={{
                        fontSize: 16,
                        lineHeight: 1.9,
                        color: 'var(--bim-fg, #2c2c2c)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: '"Songti SC", "Source Han Serif", "Noto Serif CJK SC", serif',
                    }}>
                        {/* 去掉首行 ## 标题（已在 header 显示），其余原样展示 */}
                        {chapterText.replace(/^##\s+[^\n]+\n+/, '')}
                    </article>
                )}

                {!textLoading && !chapterText && (
                    <div style={{ color: 'var(--bim-desc-fg, #999)' }}>无法加载章节内容</div>
                )}
            </main>
        </div>
    );
};
