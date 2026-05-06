import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConvert } from '../../i18n';

export interface MarkdownTextProps {
    text: string;
    /** 关闭加粗（**…** 渲染成普通文本，appendix 场景用） */
    plainStrong?: boolean;
    style?: React.CSSProperties;
    className?: string;
}

const baseComponents: Components = {
    p: ({ children }) => <p style={{ margin: '0 0 0.5em' }}>{children}</p>,
    ul: ({ children }) => <ul style={{ margin: '0 0 0.5em', paddingLeft: '1.4em' }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ margin: '0 0 0.5em', paddingLeft: '1.6em' }}>{children}</ol>,
    li: ({ children }) => <li style={{ marginBottom: '2px' }}>{children}</li>,
    a: ({ href, children }) => (
        <a href={href} target={href?.startsWith('http') ? '_blank' : undefined}
           rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
           style={{ color: 'var(--bim-link, #1976d2)' }}>
            {children}
        </a>
    ),
    code: ({ children }) => (
        <code style={{
            background: 'var(--bim-bg-subtle, #f4f4f4)',
            padding: '1px 4px',
            borderRadius: 3,
            fontSize: '0.92em',
        }}>{children}</code>
    ),
};

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
