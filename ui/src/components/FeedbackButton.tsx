import React, { useEffect, useState } from 'react';
import { FeedbackDialog } from './FeedbackDialog';
import type { FeedbackData } from './FeedbackDialog';
import { bim } from '../styles/tokens';

/**
 * 浮钮挂载期间写到 <html> 上的 CSS 变量：浮钮占掉的底部高度（bottom + 按钮高 + 间隙）。
 * 宿主给正文容器的 padding-bottom 引用 --bim-feedback-fab-offset（回退值填 0px），
 * 右下角的正文就不会被浮钮盖住；浮钮隐藏或卸载时变量移除，留白随之归零。
 */
export const FEEDBACK_FAB_OFFSET_VAR = '--bim-feedback-fab-offset';

const FAB_SIZE = 48;
const FAB_GAP = 16;

export interface FeedbackButtonProps {
    onSubmit: (data: FeedbackData) => Promise<void>;
    position?: { bottom?: number; right?: number };
    /** 反馈列表链接，提交成功后展示 */
    feedbackListUrl?: string;
    /**
     * 隐藏浮钮（不卸载组件，已打开的反馈对话框不受影响）。
     * 宿主在移动端菜单 / 抽屉打开时传 true。
     */
    hidden?: boolean;
    /**
     * 浮钮层级。默认取 --bim-feedback-fab-z（40），低于页面抽屉、弹层（本包对话框为 1000）。
     */
    zIndex?: number;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({
    onSubmit,
    position = { bottom: 24, right: 24 },
    feedbackListUrl,
    hidden = false,
    zIndex,
}) => {
    const [open, setOpen] = useState(false);
    const bottom = position.bottom ?? 24;

    useEffect(() => {
        if (hidden || typeof document === 'undefined') return;
        const root = document.documentElement;
        root.style.setProperty(FEEDBACK_FAB_OFFSET_VAR, `calc(${bottom + FAB_SIZE + FAB_GAP}px + env(safe-area-inset-bottom, 0px))`);
        return () => { root.style.removeProperty(FEEDBACK_FAB_OFFSET_VAR); };
    }, [hidden, bottom]);

    return (
        <>
            {!hidden && (
                <button
                    type="button"
                    className="bim-feedback-fab"
                    onClick={() => setOpen(true)}
                    style={{
                        ...fabStyle,
                        zIndex: zIndex ?? bim('feedback-fab-z'),
                        bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
                        right: position.right,
                    }}
                    aria-label="反馈"
                    title="反馈"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                </button>
            )}
            <FeedbackDialog isOpen={open} onClose={() => setOpen(false)} onSubmit={onSubmit} feedbackListUrl={feedbackListUrl} />
        </>
    );
};

const fabStyle: React.CSSProperties = {
    position: 'fixed',
    width: `${FAB_SIZE}px`,
    height: `${FAB_SIZE}px`,
    borderRadius: '50%',
    border: 'none',
    background: bim('primary'),
    color: bim('primary-fg'),
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: bim('shadow-fab'),
    transition: 'transform 0.2s, box-shadow 0.2s',
};
