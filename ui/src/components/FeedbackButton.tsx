import React, { useState } from 'react';
import { FeedbackDialog } from './FeedbackDialog';
import type { FeedbackData } from './FeedbackDialog';

export interface FeedbackButtonProps {
    onSubmit: (data: FeedbackData) => Promise<void>;
    position?: { bottom?: number; right?: number };
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({
    onSubmit,
    position = { bottom: 24, right: 24 },
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
            <FeedbackDialog isOpen={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />
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
    background: 'var(--bim-primary, #0078d4)',
    color: 'var(--bim-primary-fg, #fff)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    transition: 'transform 0.2s, box-shadow 0.2s',
};
