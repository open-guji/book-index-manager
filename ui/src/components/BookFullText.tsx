import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { BookFullTextIndex } from '../types';
import type { IndexStorage } from '../storage/types';
import { ReaderLayout, renderInterlinear } from './detail/primitives';
import { useConvert } from '../i18n';
import { buildParagraphBlocks, useReadingMode } from '../core/paragraphize';
import { LocaleToggle } from './LocaleToggle';

interface BookFullTextProps {
    /** 全文目录（外部可注入，避免重复请求） */
    index?: BookFullTextIndex;
    bookId: string;
    transport: IndexStorage;
    /** 当前活动章节 key（受控）。不带扩展名的文件 stem，例如 "001"。 */
    activeChapter?: string | null;
    onChapterChange?: (chapter: string | null) => void;
}

/**
 * 归一化章节 key：去掉 `.md` 扩展名。
 *   "001.md" → "001"
 *   "001"    → "001"
 * 用于章节匹配与 URL ↔ 文件名互转。
 */
function normalizeChapterKey(s: string): string {
    return s.replace(/\.md$/, '');
}

const CHAPTER_HEADING_STYLE: Record<number, React.CSSProperties> = {
    1: { fontSize: 19, fontWeight: 700, margin: '18px 0 10px' },
    2: { fontSize: 18, fontWeight: 600, margin: '16px 0 8px' },
    3: { fontSize: 17, fontWeight: 600, margin: '14px 0 6px' },
};

/**
 * 章节正文渲染。mode='line'（条目分行，现状）保持原样一整块 pre-wrap 展示；
 * mode='paragraph'（自然段聚合）按 core/paragraphize.ts 的体裁规则拼段。
 * 两种模式都过 renderInterlinear／convert——此前本组件未接夹注渲染，
 * 公羊傳这类傳文即长夹注的文本会直出尖括号，顺带在这里接上。
 */
export function ChapterBody({ text, mode, convert }: { text: string; mode: 'line' | 'paragraph'; convert: (s: string | undefined | null) => string }) {
    const hl = (s: string): React.ReactNode => renderInterlinear(convert(s));
    const articleStyle: React.CSSProperties = {
        fontSize: 16,
        lineHeight: 1.9,
        color: 'var(--bim-fg, #2c2c2c)',
        wordBreak: 'break-word',
        fontFamily: '"Songti SC", "Source Han Serif", "Noto Serif CJK SC", serif',
    };

    if (mode === 'paragraph') {
        const blocks = buildParagraphBlocks(text);
        return (
            <article style={{ ...articleStyle, whiteSpace: 'normal', textAlign: 'justify' }}>
                {blocks.map((b, i) => {
                    if (b.kind === 'heading') {
                        const level = b.level && b.level <= 3 ? b.level : 3;
                        const Tag: React.ElementType = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
                        return <Tag key={i} style={CHAPTER_HEADING_STYLE[level]}>{hl(b.text)}</Tag>;
                    }
                    return <p key={i} style={{ margin: '8px 0', textIndent: '2em' }}>{hl(b.text)}</p>;
                })}
            </article>
        );
    }

    return (
        <article style={{ ...articleStyle, whiteSpace: 'pre-wrap' }}>
            {hl(text)}
        </article>
    );
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
    const { convert } = useConvert();
    const [readingMode, setReadingMode] = useReadingMode();

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

    // 默认选第一章；若 activeChapter 是老书签 / 无效 URL（找不到对应 chapter），也回退到第一章
    useEffect(() => {
        if (!index || index.chapters.length === 0) return;
        const firstKey = normalizeChapterKey(index.chapters[0].file);
        if (!activeChapter) {
            setActiveChapter(firstKey);
            return;
        }
        const key = normalizeChapterKey(activeChapter);
        const hit = index.chapters.some(c => normalizeChapterKey(c.file) === key);
        if (!hit) setActiveChapter(firstKey);
    }, [index, activeChapter, setActiveChapter]);

    const currentChapterMeta = useMemo(() => {
        if (!index || !activeChapter) return null;
        const key = normalizeChapterKey(activeChapter);
        return index.chapters.find(c => normalizeChapterKey(c.file) === key) ?? null;
    }, [index, activeChapter]);

    // 加载选中章节的 markdown。注意用 index 里登记的真实文件名 (chapter.file)，
    // 不能直接用 activeChapter（可能是 stem，没有扩展名）。
    useEffect(() => {
        if (!bookId || !currentChapterMeta || !transport.getBookFullTextChapter) return;
        let cancelled = false;
        setTextLoading(true);
        setChapterText(null);
        transport.getBookFullTextChapter(bookId, currentChapterMeta.file)
            .then(txt => { if (!cancelled) setChapterText(txt); })
            .catch(() => { if (!cancelled) setChapterText(null); })
            .finally(() => { if (!cancelled) setTextLoading(false); });
        return () => { cancelled = true; };
    }, [bookId, currentChapterMeta, transport]);

    if (!index) {
        return <div style={{ padding: 24, color: 'var(--bim-desc-fg, #999)' }}>加载全文目录…</div>;
    }

    if (index.chapters.length === 0) {
        return <div style={{ padding: 24, color: 'var(--bim-desc-fg, #999)' }}>全文目录为空</div>;
    }

    /*
     * 章节列表交给共用的 ReaderLayout（sticky 侧栏，突破版心），
     * 与整理本同一套骨架。原先这里是自带的 240px flex 侧栏 + 正文
     * 各自 overflowY:auto —— 页面中间出现两条滚动条，浏览器的滚动
     * 位置记忆、Ctrl+F、锚点跳转全部失效（详情页 2026-09 版式重构
     * 已在外层去掉过一次，这里是漏网的一处）。
     */
    const aside = (
        <>
            <div style={{
                padding: '0 8px 8px',
                fontSize: 12.5,
                color: 'var(--bim-desc-fg, #888)',
                borderBottom: '1px solid var(--bim-border, #e5e5e5)',
                marginBottom: 8,
            }}>
                {/* 章数不再写出：下面就是逐章列表，数量一目了然（与整理本同） */}
                {index.version_label}
            </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {index.chapters.map(ch => {
                        const chKey = normalizeChapterKey(ch.file);
                        const isActive = chKey === normalizeChapterKey(activeChapter ?? '');
                        return (
                            <li key={ch.file}>
                                <button
                                    onClick={() => setActiveChapter(chKey)}
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
        </>
    );

    return (
        <ReaderLayout aside={aside}>
            <div>
                {currentChapterMeta && (
                    <header style={{
                        marginBottom: 16,
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--bim-border, #e5e5e5)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--bim-fg, #2c2c2c)' }}>
                                {currentChapterMeta.title}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    {(['line', 'paragraph'] as const).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setReadingMode(m)}
                                            style={{
                                                padding: '2px 8px',
                                                fontSize: '11px',
                                                border: '1px solid var(--bim-widget-border, #ddd)',
                                                borderRadius: m === 'line' ? '3px 0 0 3px' : '0 3px 3px 0',
                                                background: readingMode === m ? 'var(--bim-primary, #8e6f3e)' : 'var(--bim-input-bg, #fff)',
                                                color: readingMode === m ? '#fff' : 'var(--bim-desc-fg, #999)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {m === 'line' ? '條目分行' : '自然段'}
                                        </button>
                                    ))}
                                </div>
                                <LocaleToggle />
                            </div>
                        </div>
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
                    <ChapterBody
                        // 去掉首行 ## 标题（已在 header 显示），其余原样展示
                        text={chapterText.replace(/^##\s+[^\n]+\n+/, '')}
                        mode={readingMode}
                        convert={convert}
                    />
                )}

                {!textLoading && !chapterText && (
                    <div style={{ color: 'var(--bim-desc-fg, #999)' }}>无法加载章节内容</div>
                )}
            </div>
        </ReaderLayout>
    );
};
