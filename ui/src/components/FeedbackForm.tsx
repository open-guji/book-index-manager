import React, { useState, useRef, useEffect } from 'react';
import type { FeedbackType, FeedbackData } from './FeedbackDialog';
import { bim } from '../styles/tokens';
import { useI18n } from '../i18n';

export interface FeedbackFormProps {
    onSubmit: (data: FeedbackData) => Promise<void>;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

/** 文字（标签、占位提示）取字典 feedback.submitType / feedback.placeholder */
const TYPE_OPTIONS: { value: FeedbackType; icon: string }[] = [
    { value: 'bug', icon: '🐛' },
    { value: 'resource', icon: '📚' },
    { value: 'suggestion', icon: '💡' },
    { value: 'contact', icon: '🤝' },
];

export const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmit }) => {
    const { t } = useI18n();
    const [type, setType] = useState<FeedbackType>('bug');
    const [content, setContent] = useState('');
    const [contact, setContact] = useState('');
    const [state, setState] = useState<SubmitState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (type) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [type]);

    const handleSubmit = async () => {
        if (!type || !content.trim()) return;
        setState('submitting');
        setErrorMsg('');
        try {
            await onSubmit({ type, content: content.trim(), ...(contact.trim() ? { contact: contact.trim() } : {}) });
            setState('success');
            setContent('');
            setContact('');
            setType('bug');
        } catch (e) {
            setState('error');
            setErrorMsg(e instanceof Error ? e.message : t('feedback.submitFailedRetry'));
        }
    };

    const canSubmit = type && content.trim() && state !== 'submitting';

    if (state === 'success') {
        return (
            <div style={wrapperStyle}>
                <div style={successStyle}>
                    <span>✓ {t('feedback.thanks')}</span>
                    <button onClick={() => setState('idle')} style={linkBtnStyle}>{t('feedback.continueSubmit')}</button>
                </div>
            </div>
        );
    }

    return (
        <div style={wrapperStyle}>
            {/* Type selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
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
                disabled={state === 'submitting'}
                style={{
                    ...textareaStyle,
                }}
            />

            {/* 选填联系方式：只给站方看，公开列表不显示（后端剔除） */}
            <input
                type="text"
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder={t('feedback.contactPlaceholder')}
                maxLength={200}
                disabled={state === 'submitting'}
                aria-label={t('feedback.contactLabel')}
                style={contactInputStyle}
            />

            {/* Footer: char count + error + submit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: bim('desc-fg') }}>
                    {content.length} / 2000
                </span>
                <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{
                        ...submitBtnStyle,
                        opacity: canSubmit ? 1 : 0.6,
                        cursor: canSubmit ? 'pointer' : 'not-allowed',
                    }}
                >
                    {state === 'submitting' ? t('feedback.submitting') : t('feedback.submit')}
                </button>
            </div>

            {state === 'error' && (
                <div style={errorStyle}>{errorMsg}</div>
            )}
        </div>
    );
};

// --- Styles ---

const wrapperStyle: React.CSSProperties = {
    padding: '16px',
    border: `1px solid ${bim('widget-border')}`,
    borderRadius: '8px',
    background: bim('input-bg'),
};

const typeBtnStyle: React.CSSProperties = {
    padding: '8px 16px', fontSize: '13px',
    border: `1px solid ${bim('widget-border')}`,
    borderRadius: '6px', background: 'transparent',
    color: bim('fg'), cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'border-color 0.2s, background 0.2s',
};

const typeBtnActiveStyle: React.CSSProperties = {
    borderColor: bim('primary'),
    background: bim('list-active-bg'),
    color: bim('primary'), fontWeight: 500,
};

const textareaStyle: React.CSSProperties = {
    width: '100%', minHeight: '100px', padding: '10px 12px',
    fontSize: '14px', lineHeight: '1.6',
    border: `1px solid ${bim('input-border')}`, borderRadius: '6px',
    background: bim('bg'), color: bim('input-fg'),
    outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
};

const submitBtnStyle: React.CSSProperties = {
    padding: '6px 20px', fontSize: '13px', border: 'none', borderRadius: '6px',
    background: bim('primary'), color: bim('primary-fg'),
    fontWeight: 500,
};

const successStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '12px',
    color: bim('success'), fontSize: '14px',
};

const linkBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: bim('primary'),
    cursor: 'pointer', fontSize: '13px', textDecoration: 'underline',
};

const errorStyle: React.CSSProperties = {
    fontSize: '13px', color: bim('danger'),
    padding: '8px 12px', background: bim('danger-bg'),
    borderRadius: '4px', marginTop: '8px',
};

const contactInputStyle: React.CSSProperties = {
    width: '100%', marginTop: '8px', padding: '8px 12px',
    fontSize: '13px',
    border: `1px solid ${bim('input-border')}`, borderRadius: '6px',
    background: bim('bg'), color: bim('input-fg'),
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
