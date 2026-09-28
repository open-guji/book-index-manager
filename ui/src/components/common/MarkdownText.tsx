import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConvert } from '../../i18n';
import { bim } from '../../styles/tokens';

export interface MarkdownTextProps {
    text: string;
    /** 关闭加粗（**…** 渲染成普通文本，appendix 场景用） */
    plainStrong?: boolean;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * GFM 自动链接会把紧跟在网址后的全角标点（`）」』。，` 等）吞进 URL。
 * 裸网址（链接文字 === href）遇到第一个全角标点就截断，余下的当普通文字接在链接后面。
 */
const FULLWIDTH_PUNCT = /[）」』】》〉”’。，、；：！？…（「『【《〈“‘]/;

export function splitAutolinkTail(href: string): [string, string] {
    const i = href.search(FULLWIDTH_PUNCT);
    if (i < 0) return [href, ''];
    // 标点是 URL 里 percent-encoded 之外的原样字符，只可能是误吞的正文
    return [href.slice(0, i), href.slice(i)];
}

const baseComponents: Components = {
    p: ({ children }) => <p style={{ margin: '0 0 0.5em' }}>{children}</p>,
    ul: ({ children }) => <ul style={{ margin: '0 0 0.5em', paddingLeft: '1.4em' }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ margin: '0 0 0.5em', paddingLeft: '1.6em' }}>{children}</ol>,
    li: ({ children }) => <li style={{ marginBottom: '2px' }}>{children}</li>,
    a: ({ href, children }) => {
        let url = href;
        let tail = '';
        let label: React.ReactNode = children;
        // 裸网址（GFM autolink literal）：链接文字就是 href（href 里的非 ASCII 已被百分号编码）
        if (href && typeof children === 'string' && (children === href || children === safeDecode(href))) {
            const [head, rest] = splitAutolinkTail(children);
            if (rest) {
                url = encodeURI(head);
                label = head;
                tail = rest;
            }
        }
        return (
            <>
                <a href={url} target={url?.startsWith('http') ? '_blank' : undefined}
                   rel={url?.startsWith('http') ? 'noopener noreferrer' : undefined}
                   style={{ color: bim('link') }}>
                    {label}
                </a>
                {tail}
            </>
        );
    },
    code: ({ children }) => (
        <code style={{
            background: bim('bg-subtle'),
            padding: '1px 4px',
            borderRadius: 3,
            fontSize: '0.92em',
        }}>{children}</code>
    ),
};

function safeDecode(s: string): string {
    try { return decodeURI(s); } catch { return s; }
}

const plainStrongComponents: Components = {
    ...baseComponents,
    strong: ({ children }) => <>{children}</>,
};

export const MarkdownText: React.FC<MarkdownTextProps> = ({ text, plainStrong, style, className }) => {
    const { convert } = useConvert();
    const components = plainStrong ? plainStrongComponents : baseComponents;
    return (
        <div className={className} style={style}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {convert(text)}
            </ReactMarkdown>
        </div>
    );
};
