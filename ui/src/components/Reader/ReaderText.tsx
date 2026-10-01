/**
 * 阅读器正文渲染：整理本的 md 原文与全文章节共用一套。
 *
 * - 条目分行（现状）：一行一段，`#`/`##`/`###` 为标题，整行 `**…**` 加粗
 * - 自然段：按 core/paragraphize.ts 的体裁规则把条目拼成段（W7）
 * - 夹注走 renderInterlinear，guji-markdown 0.2.0 行内写法按目录声明开启
 * - `:::table` 块（全文目录声明 guji-table-v1 / guji-markdown ≥ 0.2.0）渲染成表格
 * - 专名线：书名号内文字加波浪线，书名号隐去但保留在 DOM 里（复制出来仍带《》）
 *
 * 繁简转换在拼好的整段字符串上做一次（见 `useConvertedText`），表格格子也跟着转；
 * 渲染层只管排版，不再逐段调用 convert。
 */
import React, { useMemo } from 'react';
import { renderInterlinear } from '../detail/primitives';
import type { InterlinearOptions } from '../detail/primitives';
import { GujiTable } from '../detail/GujiTable';
import { splitFullTextTables } from '../../core/guji-table';
import { buildParagraphBlocks, detectGenre, type ReadingMode } from '../../core/paragraphize';
import { useConvert } from '../../i18n';
import { useI18n } from '../../i18n/use-i18n';
import type { TFunction } from '../../i18n/translate';

/** 纯文本片段 → 节点（高亮等由调用方注入） */
export type TextRenderer = (s: string) => React.ReactNode;

const identity: TextRenderer = s => s;

/**
 * 专名线：`《書名》` → 波浪线。书名号放进屏幕阅读器可读、视觉隐藏的 span，
 * 复制粘贴仍是《書名》。书名号不成对的片段原样输出。
 */
export function renderProperNames(text: string, renderText: TextRenderer = identity): React.ReactNode {
    if (text.indexOf('《') < 0) return renderText(text);
    const out: React.ReactNode[] = [];
    const re = /《([^《》\n]+)》/g;
    let last = 0;
    let k = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(<React.Fragment key={k++}>{renderText(text.slice(last, m.index))}</React.Fragment>);
        out.push(
            <span key={k++} className="bim-rd-pn">
                <span className="bim-rd-sr">《</span>{renderText(m[1])}<span className="bim-rd-sr">》</span>
            </span>,
        );
        last = m.index + m[0].length;
    }
    if (last === 0) return renderText(text);
    if (last < text.length) out.push(<React.Fragment key={k++}>{renderText(text.slice(last))}</React.Fragment>);
    return out;
}

export interface InlineOptions {
    /** 高亮等纯文本处理（夹注内外都会调用） */
    renderText?: TextRenderer;
    /** 专名线 */
    properNames?: boolean;
    /** guji-markdown 0.2.0 行内写法 */
    gujiMarkdown?: boolean;
    /** 闕文／組字提示用的字典（组件里传 useI18n().t）；不传按繁体 */
    t?: TFunction;
}

/** 一段行内文字：夹注 → 专名线 → 高亮，由外到内 */
export function renderReaderInline(text: string, opts: InlineOptions = {}): React.ReactNode {
    const base = opts.renderText ?? identity;
    const leaf: TextRenderer = opts.properNames ? s => renderProperNames(s, base) : base;
    const io: InterlinearOptions | undefined = opts.gujiMarkdown ? { gujiMarkdown: true, t: opts.t } : undefined;
    return renderInterlinear(text, leaf, io);
}

/** 行内 `**粗体**` */
function renderBold(text: string, inline: (s: string) => React.ReactNode, keyPrefix: React.Key): React.ReactNode {
    if (text.indexOf('**') < 0) return inline(text);
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, j) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? <strong key={`${keyPrefix}-${j}`}>{inline(part.slice(2, -2))}</strong>
            : <React.Fragment key={`${keyPrefix}-${j}`}>{inline(part)}</React.Fragment>,
    );
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const COMMENT_LINE_RE = /^\s*<!--.*-->\s*$/;

/**
 * 去掉跨行的 HTML 注释（整理本 md 开头的生成说明）。单行的 `<!-- pN -->`
 * 留给 paragraphize 当分页界，逐行渲染时再跳过。
 */
export function stripBlockComments(text: string): string {
    return text.replace(/<!--[\s\S]*?-->/g, m => (m.includes('\n') ? '' : m));
}

/** 标题层级 → 外观层级：md 的 # 是卷名，在阅读器里已经是 h1 之下 */
function headingLevel(level: number): 2 | 3 | 4 {
    return level <= 1 ? 2 : level === 2 ? 3 : 4;
}

type HeadingTag = 'h2' | 'h3' | 'h4';

/**
 * 标题标签不跳级（INT Q5 heading-order）：阅读器的 h1 是卷名，正文第一个标题最多 h2，
 * 之后每个最多比上一个深一级；外观仍按 md 原层级，走 `bim-rd-hl{2,3,4}`。
 * 如全文章节去掉 `##` 卷名后直接是 `###` 小节、整理本整行粗体条目，原来都是 h1 下直接 h3。
 */
function headingLeveler(): (mdLevel: number) => { Tag: HeadingTag; className: string } {
    let prev = 1;
    return (mdLevel: number) => {
        const look = headingLevel(mdLevel);
        const lv = Math.min(look, prev + 1) as 2 | 3 | 4;
        prev = lv;
        return { Tag: `h${lv}` as HeadingTag, className: `bim-rd-hl${look}` };
    };
}

/** 「自然段」对这段文字是否有意义（体裁判得清才有），用来决定工具条上显不显示开关 */
export function canParagraphize(text: string | null | undefined): boolean {
    if (!text) return false;
    return detectGenre(stripBlockComments(text)) !== 'unknown';
}

/**
 * 原文段首已自带两个全角空格「　　」（及以上）的段落：不再加 text-indent，免得叠成四格（overview#339）。
 * 文本不动，由阅读器判断；只有一格或没有空格的段落照旧缩进两字。全角空格不被 HTML 折叠，原样显示即是缩进。
 */
export function hasOwnIndent(text: string): boolean {
    return /^\u3000{2}/.test(text);
}

const indentClass = (text: string): string | undefined => (hasOwnIndent(text) ? 'bim-rd-noindent' : undefined);

/**
 * md 正文（不含表格）。`dropTitle` 为真时去掉开头与卷名相同的 `#` 标题——
 * 卷名已经在阅读器的 h1 上了。
 */
export function ReaderMdBlocks({ text, mode, inline, dropTitle }: {
    text: string;
    mode: ReadingMode;
    inline: (s: string) => React.ReactNode;
    dropTitle?: string;
}) {
    const clean = stripBlockComments(text);
    const dropped = (level: number, t: string, index: number) =>
        !!dropTitle && index <= 1 && level <= 2 && t.trim() === dropTitle.trim();

    const level = headingLeveler();

    if (mode === 'paragraph' && detectGenre(clean) !== 'unknown') {
        const blocks = buildParagraphBlocks(clean);
        return (
            <>
                {blocks.map((b, i) => {
                    if (b.kind === 'heading') {
                        if (dropped(b.level ?? 1, b.text, i)) return null;
                        const { Tag, className } = level(b.level ?? 1);
                        return <Tag key={i} className={className}>{inline(b.text)}</Tag>;
                    }
                    return <p key={i} className={indentClass(b.text)}>{renderBold(b.text, inline, i)}</p>;
                })}
            </>
        );
    }

    const lines = clean.split('\n');
    let seenContent = 0;
    return (
        <>
            {lines.map((line, i) => {
                const m = line.match(HEADING_RE);
                if (m) {
                    const idx = seenContent++;
                    if (dropped(m[1].length, m[2], idx)) return null;
                    const { Tag, className } = level(m[1].length);
                    return <Tag key={i} className={className}>{inline(m[2])}</Tag>;
                }
                if (!line.trim()) {
                    /*
                     * 空行：散文、语录（一段一行、段间空行）本来就一行一个 <p>，不再加空隙；
                     * 目录体（多行一块、块间空行，如按页分块）块与块之间留一个小间隔。
                     */
                    const multi = i >= 2 && !!lines[i - 1].trim() && !!lines[i - 2].trim()
                        && !HEADING_RE.test(lines[i - 1]) && !HEADING_RE.test(lines[i - 2]);
                    return multi ? <div key={i} className="bim-rd-gap" aria-hidden="true" /> : null;
                }
                if (COMMENT_LINE_RE.test(line)) return null;
                seenContent++;
                const bold = /^\*\*[^*]+\*\*\s*$/.test(line.trim());
                if (bold) {
                    // 整行粗体是条目标题；与 paragraphize 的判法一致（level 3）
                    const { Tag, className } = level(3);
                    return <Tag key={i} className={className}>{inline(line.trim().slice(2, -2))}</Tag>;
                }
                return <p key={i} className={indentClass(line)}>{renderBold(line, inline, i)}</p>;
            })}
        </>
    );
}

/** 繁简转换整段做一次；locale 或原文不变就不重算 */
export function useConvertedText(text: string | null | undefined): string {
    const { convert } = useConvert();
    return useMemo(() => (text ? convert(text) : ''), [text, convert]);
}

/**
 * 全文章节 / 整理本原文的完整正文。
 *
 * `tables` 为真时先切出 `:::table` 块（目录声明 guji-table-v1 或 guji-markdown ≥ 0.2.0 的书），
 * 块外的文字仍按分行 / 自然段排。
 */
export function ReaderMdText({ text, mode, tables = false, gujiMarkdown = false, properNames = false, renderText, dropTitle }: {
    text: string;
    mode: ReadingMode;
    tables?: boolean;
    gujiMarkdown?: boolean;
    properNames?: boolean;
    renderText?: TextRenderer;
    dropTitle?: string;
}) {
    const converted = useConvertedText(text);
    const { t, convert } = useI18n();
    const inline = (s: string) => renderReaderInline(s, { renderText, properNames, gujiMarkdown, t });
    const io: InterlinearOptions | undefined = gujiMarkdown ? { gujiMarkdown: true, t } : undefined;
    const title = dropTitle ? convert(dropTitle) : undefined;

    if (!tables || converted.indexOf(':::') < 0) {
        return <ReaderMdBlocks text={converted} mode={mode} inline={inline} dropTitle={title} />;
    }
    return (
        <>
            {splitFullTextTables(converted).map((seg, i) =>
                seg.type === 'table'
                    ? <GujiTable key={i} table={seg.table} opts={io} />
                    : <ReaderMdBlocks key={i} text={seg.text} mode={mode} inline={inline} dropTitle={i === 0 ? title : undefined} />,
            )}
        </>
    );
}
