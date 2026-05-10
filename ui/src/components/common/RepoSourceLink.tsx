import React from 'react';

export interface RepoSourceLinkProps {
    /** 目标 URL（如 GitHub blob/tree 链接） */
    href: string;
    /** 鼠标悬浮提示文案；默认「在 GitHub 查看本条目源文件」 */
    label?: string;
    /** 图标尺寸（像素），默认 16 */
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 指向开源数据源文件的 GitHub icon 链接。
 * 库内不感知具体仓库，由调用方传入 href。
 */
export const RepoSourceLink: React.FC<RepoSourceLinkProps> = ({
    href,
    label = '在 GitHub 查看本条目源文件',
    size = 16,
    className,
    style,
}) => {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            aria-label={label}
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size + 8,
                height: size + 8,
                borderRadius: 4,
                color: 'var(--bim-desc-fg, #717171)',
                textDecoration: 'none',
                transition: 'color 120ms, background 120ms',
                ...style,
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--bim-fg, #1a1a1a)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--bim-desc-fg, #717171)';
            }}
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
            >
                <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
        </a>
    );
};
