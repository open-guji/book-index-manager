import React, { useState, useEffect, useRef } from 'react';

export type FeedbackType = 'bug' | 'resource';

export interface FeedbackData {
    type: FeedbackType;
    content: string;
}

export interface FeedbackDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: FeedbackData) => Promise<void>;
    /** 反馈列表链接，提交成功后展示 */
    feedbackListUrl?: string;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: string; placeholder: string }[] = [
    { value: 'bug', label: '反馈错误', icon: '🐛', placeholder: '请描述您发现的错误，包括页面位置和具体内容' },
    { value: 'resource', label: '添加资源', icon: '📚', placeholder: '请提供完整资源链接和简要版本说明' },
];

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose, onSubmit, feedbackListUrl }) => {
    const [type, setType] = useState<FeedbackType | null>(null);
    const [content, setContent] = useState('');
    const [state, setState] = useState<SubmitState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setType(null);
            setContent('');
            setState('idle');
            setErrorMsg('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (type) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [type]);

    useEffect(() => {
        if (state === 'success') {
            const timer = setTimeout(onClose, 2000);
            return () => clearTimeout(timer);
        }
    }, [state, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    const handleSubmit = async () => {
        if (!type || !content.trim()) return;
        setState('submitting');
        setErrorMsg('');
        try {
            await onSubmit({ type, content: content.trim() });
            setState('success');
        } catch (e) {
            setState('error');
            setErrorMsg(e instanceof Error ? e.message : '提交失败，请稍后重试');
        }
    };

    if (!isOpen) return null;

    const canSubmit = type && content.trim() && state !== 'submitting';
    const selectedOption = TYPE_OPTIONS.find(o => o.value === type);

    return (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={dialogStyle} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={headerStyle}>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>反馈</span>
                    <button onClick={onClose} style={closeBtnStyle} aria-label="关闭">✕</button>
                </div>

                {state === 'success' ? (
                    <div style={successStyle}>
                        <span style={{ fontSize: '32px' }}>✓</span>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>感谢您的反馈！</div>
                        {feedbackListUrl && (
                            <a href={feedbackListUrl} style={{ fontSize: '13px', color: 'var(--bim-primary, #2563eb)', marginTop: '8px' }}>
                                查看反馈列表 →
                            </a>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Type selector */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {TYPE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setType(opt.value)}
                                    style={{
                                        ...typeBtnStyle,
                                        ...(type === opt.value ? typeBtnActiveStyle : {}),
                                    }}
                                >
                                    <span>{opt.icon}</span> {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder={selectedOption?.placeholder || '请先选择反馈类型'}
                            maxLength={2000}
                            disabled={!type || state === 'submitting'}
                            style={{
                                ...textareaStyle,
                                opacity: type ? 1 : 0.6,
                            }}
                        />

                        {/* Character count */}
                        <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #999)', textAlign: 'right', marginBottom: '12px' }}>
                            {content.length} / 2000
                        </div>

                        {/* Error message */}
                        {state === 'error' && (
                            <div style={errorStyle}>{errorMsg}</div>
                        )}

                        {/* Submit button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                style={{
                                    ...submitBtnStyle,
                                    opacity: canSubmit ? 1 : 0.6,
                                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {state === 'submitting' ? '提交中...' : '提交反馈'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// --- Styles ---

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
    background: 'var(--bim-bg, #fff)', border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '8px', padding: '20px', width: '450px', maxWidth: '90vw',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
};

const headerStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px',
};

const closeBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer',
    color: 'var(--bim-desc-fg, #999)', padding: '4px 8px', borderRadius: '4px',
};

const typeBtnStyle: React.CSSProperties = {
    flex: 1, padding: '10px 12px', fontSize: '13px', border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '6px', background: 'var(--bim-input-bg, #fff)', color: 'var(--bim-fg, #333)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    transition: 'border-color 0.2s, background 0.2s',
};

const typeBtnActiveStyle: React.CSSProperties = {
    borderColor: 'var(--bim-primary, #0078d4)', background: 'var(--bim-list-active-bg, #e8f0fe)',
    color: 'var(--bim-primary, #0078d4)', fontWeight: 500,
};

const textareaStyle: React.CSSProperties = {
    width: '100%', minHeight: '120px', padding: '10px 12px', fontSize: '14px', lineHeight: '1.6',
    border: '1px solid var(--bim-input-border, #ccc)', borderRadius: '6px',
    background: 'var(--bim-input-bg, #fff)', color: 'var(--bim-input-fg, #333)',
    outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
};

const submitBtnStyle: React.CSSProperties = {
    padding: '8px 24px', fontSize: '14px', border: 'none', borderRadius: '6px',
    background: 'var(--bim-primary, #0078d4)', color: 'var(--bim-primary-fg, #fff)',
    fontWeight: 500,
};

const successStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    padding: '32px 0', color: 'var(--bim-success, #4caf50)',
};

const errorStyle: React.CSSProperties = {
    fontSize: '13px', color: 'var(--bim-danger, #f44336)',
    padding: '8px 12px', background: 'rgba(244,67,54,0.08)', borderRadius: '4px', marginBottom: '12px',
};
