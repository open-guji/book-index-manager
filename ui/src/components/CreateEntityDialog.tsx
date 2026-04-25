import React, { useState, useEffect, useRef } from 'react';
import type { IndexType } from '../types';

export interface CreateEntityDialogProps {
    isOpen: boolean;
    entityType: IndexType;
    relationField: string;
    inheritData?: {
        title?: string;
        author?: string;
        dynasty?: string;
        workId?: string;
        collectionId?: string;
        parentWorkId?: string;
        parentCollectionId?: string;
    };
    onConfirm: (name: string, inheritData: Record<string, unknown>) => void;
    onCancel: () => void;
}

const TYPE_LABELS: Record<IndexType, string> = { work: '作品', book: '书籍', collection: '丛编', entity: '人物' };
const TYPE_ICONS: Record<IndexType, string> = { work: '📜', book: '📖', collection: '📚', entity: '👤' };

export const CreateEntityDialog: React.FC<CreateEntityDialogProps> = ({
    isOpen, entityType, relationField, inheritData, onConfirm, onCancel,
}) => {
    const [name, setName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName(inheritData?.title || '');
            setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 100);
        }
    }, [isOpen, inheritData?.title]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && name.trim()) handleConfirm();
        else if (e.key === 'Escape') onCancel();
    };

    const handleConfirm = () => {
        if (!name.trim()) return;
        onConfirm(name.trim(), { ...inheritData, title: name.trim() });
    };

    if (!isOpen) return null;

    const getDialogTitle = () => {
        switch (relationField) {
            case 'parentWorkId': return '创建父作品';
            case 'workId': return '创建所属作品';
            case 'collectionId': return '创建所属丛编';
            case 'parentCollectionId': return '创建父丛编';
            case 'childWork': return '创建子作品';
            case 'childBook': case 'siblingBook': return '创建书籍';
            case 'childCollection': return '创建子丛编';
            default: return `创建新${TYPE_LABELS[entityType]}`;
        }
    };

    return (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div style={dialogStyle} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{TYPE_ICONS[entityType]}</span><span>{getDialogTitle()}</span>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--bim-fg, #333)' }}>
                        {entityType === 'work' ? '作品名' : entityType === 'collection' ? '丛编名' : '书名'}
                        <span style={{ color: 'var(--bim-danger, #f44336)', marginLeft: '4px' }}>*</span>
                    </label>
                    <input ref={inputRef} type="text" value={name} onChange={e => setName(e.target.value)}
                        onKeyDown={handleKeyDown} placeholder={`请输入${TYPE_LABELS[entityType]}名称...`} style={inputStyle} />
                </div>

                {(inheritData?.author || inheritData?.dynasty) && (
                    <div style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', background: 'var(--bim-input-bg, #fff)', padding: '8px 12px', borderRadius: '4px', marginBottom: '16px' }}>
                        <div style={{ marginBottom: '4px', fontWeight: 500 }}>将继承以下信息：</div>
                        {inheritData?.author && <div>作者: {inheritData.author}</div>}
                        {inheritData?.dynasty && <div>朝代/年份: {inheritData.dynasty}</div>}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                    <button onClick={handleConfirm} disabled={!name.trim()} style={{
                        ...confirmBtnStyle,
                        opacity: name.trim() ? 1 : 0.6,
                        cursor: name.trim() ? 'pointer' : 'not-allowed',
                    }}>创建</button>
                </div>
            </div>
        </div>
    );
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
    background: 'var(--bim-bg, #fff)', border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '8px', padding: '20px', width: '100%', maxWidth: 'min(500px, calc(100vw - 32px))',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: '14px',
    border: '1px solid var(--bim-input-border, #ccc)', borderRadius: '4px',
    background: 'var(--bim-input-bg, #fff)', color: 'var(--bim-input-fg, #333)',
    outline: 'none', boxSizing: 'border-box',
};

const cancelBtnStyle: React.CSSProperties = {
    padding: '8px 16px', fontSize: '13px', border: '1px solid var(--bim-widget-border, #e0e0e0)',
    borderRadius: '4px', background: 'transparent', color: 'var(--bim-fg, #333)', cursor: 'pointer',
};

const confirmBtnStyle: React.CSSProperties = {
    padding: '8px 16px', fontSize: '13px', border: 'none', borderRadius: '4px',
    background: 'var(--bim-primary, #0078d4)', color: 'var(--bim-primary-fg, #fff)',
};
