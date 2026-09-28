import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { BookFullTextIndex, WorkFullTextEntry, WorkFullTextIndex } from '../types';
import type { IndexStorage } from '../storage/types';
import { hasGujiTableNotation } from '../core/guji-table';
import { hasGujiMarkdownV02 } from '../core/guji-inline';
import { bim } from '../styles/tokens';
import { useConvert } from '../i18n';
import { ReaderShell } from './Reader/ReaderShell';
import type { PanelState } from './Reader/ReaderShell';
import { ReaderMdText, canParagraphize } from './Reader/ReaderText';
import { useReaderPrefs } from './Reader/prefs';
import { useChapterImages } from './Reader/useChapterImages';
import type { ReaderImageOverlay, ReaderImageResolver, ReaderTocItem } from './Reader/types';

export interface BookFullTextProps {
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
    /** 工具条上的书名；缺省用全文目录的 version_label */
    title?: React.ReactNode;
    /** 书名后的小字；缺省「全文」 */
    subtitle?: React.ReactNode;
    /** 按章取书影（每页一张图 + 可选逐字框），URL 由宿主给；不传则书影区收起 */
    resolveImages?: ReaderImageResolver;
    /** 书影上的自定义层（逐字框以外的格式） */
    renderImageOverlay?: ReaderImageOverlay;
    /** 书影区初始状态：auto = 有影像才展开 */
    imagePanel?: PanelState;
    /** 竖排开关（预留） */
    allowVertical?: boolean;
    className?: string;
    style?: React.CSSProperties;
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

const MUTED: React.CSSProperties = { padding: 24, color: bim('desc-fg') };

/**
 * 全文阅读页（Book 全文 / Work 全文）。
 *
 * 数据来源：Book/<id>/full_text/index.json + 第NNN.md（Work 全文见 `workKey`）。
 * 版式交给 Reader/ReaderShell：目录侧栏/抽屉、书影在左、宋体正文，与整理本同一套。
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
    title,
    subtitle,
    resolveImages,
    renderImageOverlay,
    imagePanel,
    allowVertical,
    className,
    style,
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

    const images = useChapterImages(resolveImages, currentChapterMeta ? normalizeChapterKey(currentChapterMeta.file) : null);
    const [prefs, setPrefs] = useReaderPrefs();
    const { convert } = useConvert();

    /* 多份全文切换：原生下拉，外观收成一行小字（阅读页不放按钮） */
    const versionSwitcher = versions && versions.length > 1 && onVersionChange ? (
        <label>
            版本：
            <select value={workKey} onChange={e => onVersionChange(e.target.value)}>
                {versions.map(v => (
                    <option key={v.key} value={v.key}>{workFullTextOptionLabel(v)}</option>
                ))}
            </select>
        </label>
    ) : null;

    if (!index) {
        return (
            <div style={MUTED}>
                {versionSwitcher && <div style={{ marginBottom: 12 }}>{versionSwitcher}</div>}
                {indexFailed ? '无法加载全文目录' : '加载全文目录…'}
            </div>
        );
    }

    if (index.chapters.length === 0) {
        return <div style={MUTED}>{versionSwitcher && <div style={{ marginBottom: 12 }}>{versionSwitcher}</div>}全文目录为空</div>;
    }

    const toc: ReaderTocItem[] = index.chapters.map(ch => ({
        key: normalizeChapterKey(ch.file),
        label: convert(ch.title),
    }));
    const tables = hasGujiTableNotation(index) || hasGujiMarkdownV02(index);
    /* 去掉首行 ## 标题（已在 h1 显示） */
    const body = chapterText ? chapterText.replace(/^##\s+[^\n]+\n+/, '') : null;

    return (
        <ReaderShell
            title={title ?? convert(index.version_label)}
            subtitle={subtitle ?? '全文'}
            toc={toc}
            tocCaption={`目录 · ${index.chapters.length} ${index.chapters.length > 1 ? '卷' : '篇'}`}
            activeKey={activeChapter ? normalizeChapterKey(activeChapter) : null}
            onSelect={setActiveChapter}
            images={images.images}
            imagesLoading={images.loading}
            renderImageOverlay={renderImageOverlay}
            imagePanel={imagePanel}
            prefs={prefs}
            onPrefsChange={setPrefs}
            paragraphToggle={canParagraphize(body)}
            allowVertical={allowVertical}
            className={className}
            style={style}
        >
            {currentChapterMeta && (
                <header>
                    <h1 className="bim-rd-h1">{convert(currentChapterMeta.title)}</h1>
                    <p className="bim-rd-meta">
                        来源 <a className="bim-rd-link" href={index.source.url} target="_blank" rel="noreferrer">
                            {index.source.name}
                        </a>
                        {index.source.license && <><span className="bim-rd-dot" />{index.source.license}</>}
                        {versionSwitcher && <><span className="bim-rd-dot" />{versionSwitcher}</>}
                    </p>
                </header>
            )}

            {textLoading && <div className="bim-rd-state">加载中…</div>}

            {!textLoading && body != null && (
                <article className="bim-rd-prose">
                    {/*
                      * 夹注（⟨…⟩／<…>）以小字渲染；目录声明 table_notation: guji-table-v1
                      * （或 guji_markdown ≥ 0.2.0）的书，`:::table` 块渲染成表格；
                      * 声明 guji_markdown ≥ 0.2.0 的书另认组字／阙文／缺字猜测／夹注分行
                      */}
                    <ReaderMdText
                        text={body}
                        mode={prefs.readingMode}
                        tables={tables}
                        gujiMarkdown={hasGujiMarkdownV02(index)}
                        properNames={prefs.properNames}
                    />
                </article>
            )}

            {!textLoading && !chapterText && <div className="bim-rd-state">无法加载章节内容</div>}
        </ReaderShell>
    );
};
