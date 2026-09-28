import React, { useState } from 'react';
import { FeedbackDialog } from './FeedbackDialog';
import type { FeedbackData } from './FeedbackDialog';
import { bim } from '../styles/tokens';

export interface FeedbackButtonProps {
    onSubmit: (data: FeedbackData) => Promise<void>;
    position?: { bottom?: number; right?: number };
    /** 反馈列表链接，提交成功后展示 */
    feedbackListUrl?: string;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({
    onSubmit,
    position = { bottom: 24, right: 24 },
    feedbackListUrl,
}) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                style={{
                    ...fabStyle,
                    bottom: position.bottom,
                    right: position.right,
                }}
                aria-label="反馈"
                title="反馈"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            </button>
            <FeedbackDialog isOpen={open} onClose={() => setOpen(false)} onSubmit={onSubmit} feedbackListUrl={feedbackListUrl} />
        </>
    );
};

const fabStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 900,
    width: '48px',
    height: '48px',
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
