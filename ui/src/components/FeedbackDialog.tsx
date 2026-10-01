import React, { useState, useEffect, useRef } from 'react';
import { bim } from '../styles/tokens';
import { useI18n } from '../i18n';

// 提交端可选的四类；服务端另有 'other'（仅后台改类型用，G-23 第二批）。
// 'contact'（想参与）服务端永不公开。
export type FeedbackType = 'bug' | 'resource' | 'suggestion' | 'contact';

export interface FeedbackData {
    type: FeedbackType;
    content: string;
    /** 选填联系方式（邮箱等）。仅站方可见：后端公开读会剔除此字段 */
    contact?: string;
}

export interface FeedbackDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: FeedbackData) => Promise<void>;
    /** 反馈列表链接，提交成功后展示 */
    feedbackListUrl?: string;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

/** 文字（标签、占位提示）取字典 feedback.submitType / feedback.placeholder */
const TYPE_OPTIONS: { value: FeedbackType; icon: string }[] = [
    { value: 'bug', icon: '🐛' },
    { value: 'resource', icon: '📚' },
    { value: 'suggestion', icon: '💡' },
    { value: 'contact', icon: '🤝' },
];

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose, onSubmit, feedbackListUrl }) => {
    const { t } = useI18n();
    const [type, setType] = useState<FeedbackType | null>(null);
    const [content, setContent] = useState('');
    const [contact, setContact] = useState('');
    const [state, setState] = useState<SubmitState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setType(null);
            setContent('');
            setContact('');
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
            await onSubmit({ type, content: content.trim(), ...(contact.trim() ? { contact: contact.trim() } : {}) });
            setState('success');
        } catch (e) {
            setState('error');
            setErrorMsg(e instanceof Error ? e.message : t('feedback.submitFailedRetry'));
        }
    };

    if (!isOpen) return null;

    const canSubmit = type && content.trim() && state !== 'submitting';

    return (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={dialogStyle} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={headerStyle}>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{t('feedback.title')}</span>
                    <button onClick={onClose} style={closeBtnStyle} aria-label={t('feedback.close')}>✕</button>
                </div>

                {state === 'success' ? (
                    <div style={successStyle}>
                        <span style={{ fontSize: '32px' }}>✓</span>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>{t('feedback.thanks')}</div>
                        {feedbackListUrl && (
                            <a href={feedbackListUrl} style={{ fontSize: '13px', color: bim('primary'), marginTop: '8px' }}>
                                {t('feedback.viewList')}
                            </a>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Type selector */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                            {TYPE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setType(opt.value)}
                                    style={{
                                        ...typeBtnStyle,
                                        ...(type === opt.value ? typeBtnActiveStyle : {}),
                                    }}
                                >
                                    <span>{opt.icon}</span> {t(`feedback.submitType.${opt.value}`)}
                                </button>
                            ))}
                        </div>

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder={type ? t(`feedback.placeholder.${type}`) : t('feedback.chooseTypeFirst')}
                            maxLength={2000}
                            disabled={!type || state === 'submitting'}
                            style={{
                                ...textareaStyle,
                                opacity: type ? 1 : 0.6,
                            }}
                        />

                        {/* 选填联系方式：只给站方看，公开列表不显示（后端剔除） */}
                        <input
                            type="text"
                            value={contact}
                            onChange={e => setContact(e.target.value)}
                            placeholder={t('feedback.contactPlaceholder')}
                            maxLength={200}
                            disabled={!type || state === 'submitting'}
                            aria-label={t('feedback.contactLabel')}
                            style={contactInputStyle}
                        />

                        {/* Character count */}
                        <div style={{ fontSize: '12px', color: bim('desc-fg'), textAlign: 'right', marginBottom: '12px' }}>
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
                                {state === 'submitting' ? t('feedback.submitting') : t('feedback.submitFeedback')}
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
    background: bim('backdrop'), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
    background: bim('bg'), border: `1px solid ${bim('widget-border')}`,
    borderRadius: '8px', padding: '20px', width: '450px', maxWidth: '90vw',
    boxShadow: bim('shadow-dialog'),
};

const headerStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px',
};

const closeBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer',
    color: bim('desc-fg'), padding: '4px 8px', borderRadius: '4px',
};

const typeBtnStyle: React.CSSProperties = {
    flex: '1 1 calc(50% - 4px)', padding: '10px 12px', fontSize: '13px', border: `1px solid ${bim('widget-border')}`,
    borderRadius: '6px', background: bim('input-bg'), color: bim('fg'),
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    transition: 'border-color 0.2s, background 0.2s',
};

const typeBtnActiveStyle: React.CSSProperties = {
    borderColor: bim('primary'), background: bim('list-active-bg'),
    color: bim('primary'), fontWeight: 500,
};

const textareaStyle: React.CSSProperties = {
    width: '100%', minHeight: '120px', padding: '10px 12px', fontSize: '14px', lineHeight: '1.6',
    border: `1px solid ${bim('input-border')}`, borderRadius: '6px',
    background: bim('input-bg'), color: bim('input-fg'),
    outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
};

const submitBtnStyle: React.CSSProperties = {
    padding: '8px 24px', fontSize: '14px', border: 'none', borderRadius: '6px',
    background: bim('primary'), color: bim('primary-fg'),
    fontWeight: 500,
};

const successStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    padding: '32px 0', color: bim('success'),
};

const errorStyle: React.CSSProperties = {
    fontSize: '13px', color: bim('danger'),
    padding: '8px 12px', background: bim('danger-bg'), borderRadius: '4px', marginBottom: '12px',
};

const contactInputStyle: React.CSSProperties = {
    width: '100%', marginTop: '8px', padding: '8px 12px',
    fontSize: '13px',
    border: `1px solid ${bim('input-border')}`, borderRadius: '6px',
    background: bim('bg'), color: bim('input-fg'),
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
