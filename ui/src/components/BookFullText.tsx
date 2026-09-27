import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { BookFullTextIndex, WorkFullTextEntry, WorkFullTextIndex } from '../types';
import type { IndexStorage } from '../storage/types';
import { ReaderLayout } from './detail/primitives';
import { renderFullTextBody } from './detail/GujiTable';
import { hasGujiTableNotation } from '../core/guji-table';
import { hasGujiMarkdownV02 } from '../core/guji-inline';

interface BookFullTextProps {
    /** 全文目录（外部可注入，避免重复请求） */
    index?: BookFullTextIndex;
    /** Book id；传了 `workKey` 时是 Work id */
    bookId: string;
    transport: IndexStorage;
    /**
     * Work 全文：一 Work 可有多份，按 `getWorkFullTextList` 给的 key 取其中一份。
     * 传了它就改走 `getWorkFullTextIndex／getWorkFullTextChapter`，渲染与 Book 全文完全相同。
     */
    workKey?: string;
    /** Work 全文候选清单；多于一份时在正文顶部给一个原生下拉切换 */
    versions?: WorkFullTextEntry[];
    onVersionChange?: (key: string) => void;
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

/**
 * 多份全文切换项的显示名。维基同一部书常有几份，version_label／source_name
 * 往往完全相同（老子两份都叫「老子 · 維基文庫」），能区分的只有来源页名——
 * 取 source_url 末段解码（「道德經 (王弼本)」／「老子 (匯校版)」）。
 */
export function workFullTextOptionLabel(v: WorkFullTextEntry): string {
    let page = '';
    if (v.source_url) {
        try {
            const tail = new URL(v.source_url).pathname.split('/').filter(Boolean).pop() ?? '';
            page = decodeURIComponent(tail).replace(/_/g, ' ');
        } catch { /* 坏 URL：不取页名 */ }
    }
    const head = [v.source_name, page || v.version_label].filter(Boolean).join(' · ');
    return head || v.key;
}

const MUTED: React.CSSProperties = { padding: 24, color: 'var(--bim-desc-fg, #999)' };

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
    workKey,
    versions,
    onVersionChange,
}) => {
    const [index, setIndex] = useState<BookFullTextIndex | null>(indexProp ?? null);
    /*
     * 目录取数结果：null 旧版既表示「还在取」又表示「取不到」，于是 404／断网／
     * 没有全文的 Work 都永远停在「加载全文目录…」（宋史 Work 全文即因此卡死）。
     * 现在失败与空各自落到明确的提示。
     */
    const [indexFailed, setIndexFailed] = useState(false);
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

    // 内部 fallback：直接调 transport。取不到（null／抛错／transport 不支持）→ 失败提示，不再转圈
    useEffect(() => {
        if (indexProp) return;
        setIndex(null);
        setIndexFailed(false);
        // Work 目录与 Book 目录同 schema（只是 work_id 代 book_id），渲染只读共有字段
        const fetchIndex: (() => Promise<BookFullTextIndex | WorkFullTextIndex | null>) | null = workKey !== undefined
            ? (transport.getWorkFullTextIndex
                ? () => transport.getWorkFullTextIndex!(bookId, workKey)
                : null)
            : (transport.getBookFullTextIndex
                ? () => transport.getBookFullTextIndex!(bookId)
                : null);
        if (!bookId || !fetchIndex) { setIndexFailed(true); return; }
        let cancelled = false;
        Promise.resolve()
            .then(fetchIndex)
            .then(r => {
                if (cancelled) return;
                if (r) setIndex(r as BookFullTextIndex);
                else setIndexFailed(true);
            })
            .catch(() => { if (!cancelled) setIndexFailed(true); });
        return () => { cancelled = true; };
    }, [bookId, transport, indexProp, workKey]);

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
        if (!bookId || !currentChapterMeta) return;
        const fetchChapter = workKey !== undefined
            ? (transport.getWorkFullTextChapter
                ? (f: string) => transport.getWorkFullTextChapter!(bookId, workKey, f)
                : null)
            : (transport.getBookFullTextChapter
                ? (f: string) => transport.getBookFullTextChapter!(bookId, f)
                : null);
        if (!fetchChapter) return;
        let cancelled = false;
        setTextLoading(true);
        setChapterText(null);
        Promise.resolve(currentChapterMeta.file)
            .then(fetchChapter)
            .then(txt => { if (!cancelled) setChapterText(txt); })
            .catch(() => { if (!cancelled) setChapterText(null); })
            .finally(() => { if (!cancelled) setTextLoading(false); });
        return () => { cancelled = true; };
    }, [bookId, currentChapterMeta, transport, workKey]);

    /* 多份全文切换：沿用最朴素的原生下拉，不另起设计（阅读器 UI 冻结中） */
    const versionSwitcher = versions && versions.length > 1 && onVersionChange ? (
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--bim-desc-fg, #888)' }}>
            <label>
                版本：
                <select
                    value={workKey}
                    onChange={e => onVersionChange(e.target.value)}
                    style={{ fontSize: 13, fontFamily: 'inherit' }}
                >
                    {versions.map(v => (
                        <option key={v.key} value={v.key}>{workFullTextOptionLabel(v)}</option>
                    ))}
                </select>
            </label>
        </div>
    ) : null;

    if (!index) {
        if (indexFailed) {
            return <div style={MUTED}>{versionSwitcher}无法加载全文目录</div>;
        }
        return <div style={MUTED}>{versionSwitcher}加载全文目录…</div>;
    }

    if (index.chapters.length === 0) {
        return <div style={MUTED}>{versionSwitcher}全文目录为空</div>;
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
                {versionSwitcher}
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
                        {/* 去掉首行 ## 标题（已在 header 显示），其余原样展示；
                            夹注（⟨…⟩／<…>）以小字渲染——此前未接，维基全文（如《公羊傳》）的注直出尖括号。
                            目录声明 table_notation: guji-table-v1（或 guji_markdown ≥ 0.2.0）的书，`:::table` 块渲染成表格；
                            声明 guji_markdown ≥ 0.2.0 的书另认组字／阙文／缺字猜测／夹注分行 */}
                        {renderFullTextBody(
                            chapterText.replace(/^##\s+[^\n]+\n+/, ''),
                            hasGujiTableNotation(index) || hasGujiMarkdownV02(index),
                            hasGujiMarkdownV02(index),
                        )}
                    </article>
                )}

                {!textLoading && !chapterText && (
                    <div style={{ color: 'var(--bim-desc-fg, #999)' }}>无法加载章节内容</div>
                )}
            </div>
        </ReaderLayout>
    );
};
