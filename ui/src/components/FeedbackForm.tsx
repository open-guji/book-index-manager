import React, { useState, useRef, useEffect } from 'react';
import type { FeedbackType, FeedbackData } from './FeedbackDialog';

export interface FeedbackFormProps {
    onSubmit: (data: FeedbackData) => Promise<void>;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: string; placeholder: string }[] = [
    { value: 'bug', label: '反馈错误', icon: '🐛', placeholder: '请描述您发现的错误，包括页面位置和具体内容' },
    { value: 'resource', label: '添加资源', icon: '📚', placeholder: '请提供完整资源链接和简要版本说明' },
];

export const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmit }) => {
    const [type, setType] = useState<FeedbackType>('bug');
    const [content, setContent] = useState('');
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
            await onSubmit({ type, content: content.trim() });
            setState('success');
            setContent('');
            setType('bug');
        } catch (e) {
            setState('error');
            setErrorMsg(e instanceof Error ? e.message : '提交失败，请稍后重试');
        }
    };

    const canSubmit = type && content.trim() && state !== 'submitting';
    const selectedOption = TYPE_OPTIONS.find(o => o.value === type);

    if (state === 'success') {
        return (
            <div style={wrapperStyle}>
                <div style={successStyle}>
                    <span>✓ 感谢您的反馈！</span>
                    <button onClick={() => setState('idle')} style={linkBtnStyle}>继续提交</button>
                </div>
            </div>
        );
    }

    return (
        <div style={wrapperStyle}>
            {/* Type selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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
                disabled={state === 'submitting'}
                style={{
                    ...textareaStyle,
                }}
            />

            {/* Footer: char count + error + submit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #999)' }}>
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
                    {state === 'submitting' ? '提交中...' : '提交'}
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
    border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '8px',
    background: 'var(--bim-input-bg, #fff)',
};

const typeBtnStyle: React.CSSProperties = {
    padding: '8px 16px', fontSize: '13px',
    border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '6px', background: 'transparent',
    color: 'var(--bim-fg, #333)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'border-color 0.2s, background 0.2s',
};

const typeBtnActiveStyle: React.CSSProperties = {
    borderColor: 'var(--bim-primary, #0078d4)',
    background: 'var(--bim-list-active-bg, #e8f0fe)',
    color: 'var(--bim-primary, #0078d4)', fontWeight: 500,
};

const textareaStyle: React.CSSProperties = {
    width: '100%', minHeight: '100px', padding: '10px 12px',
    fontSize: '14px', lineHeight: '1.6',
    border: '1px solid var(--bim-input-border, #ccc)', borderRadius: '6px',
    background: 'var(--bim-bg, #fff)', color: 'var(--bim-input-fg, #333)',
    outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
};

const submitBtnStyle: React.CSSProperties = {
    padding: '6px 20px', fontSize: '13px', border: 'none', borderRadius: '6px',
    background: 'var(--bim-primary, #0078d4)', color: 'var(--bim-primary-fg, #fff)',
    fontWeight: 500,
};

const successStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '12px',
    color: 'var(--bim-success, #4caf50)', fontSize: '14px',
};

const linkBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--bim-primary, #0078d4)',
    cursor: 'pointer', fontSize: '13px', textDecoration: 'underline',
};

const errorStyle: React.CSSProperties = {
    fontSize: '13px', color: 'var(--bim-danger, #f44336)',
    padding: '8px 12px', background: 'rgba(244,67,54,0.08)',
    borderRadius: '4px', marginTop: '8px',
};
