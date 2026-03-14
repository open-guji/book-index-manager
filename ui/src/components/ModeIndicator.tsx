import React from 'react';
import type { IndexSource, SyncConfig } from '../types';

export interface ModeIndicatorProps {
    indexSource: IndexSource;
    syncConfig?: SyncConfig;
    variant?: 'index-browser' | 'project-info';
    onSwitchMode?: () => void;
    onToggleDraft?: () => void;
    onConfigurePath?: () => void;
    onSelectFolder?: () => void;
}

/**
 * 模式指示器
 * 显示和切换本地模式/同步模式、draft/official 切换
 */
export const ModeIndicator: React.FC<ModeIndicatorProps> = ({
    indexSource,
    syncConfig,
    variant = 'index-browser',
    onSwitchMode,
    onToggleDraft,
    onConfigurePath,
    onSelectFolder,
}) => {
    const isLocal = indexSource === 'local';
    const isDraft = syncConfig?.isDraft ?? true;
    const folderPath = syncConfig?.repoPath || '';
    const shortName = folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : '';

    const buttonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        border: 'none',
        background: 'var(--bim-primary-soft, #0078d415)',
        color: 'var(--bim-primary, #0078d4)',
    };

    const hoverHandlers = {
        onMouseOver: (e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.opacity = '0.8',
        onMouseOut: (e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.opacity = '1',
    };

    const draftToggle = (
        <div
            onClick={onToggleDraft}
            title={`点击切换到 ${isDraft ? 'official' : 'draft'} 仓库`}
            style={{
                ...buttonStyle,
                background: isDraft ? 'var(--bim-warning, #ff9800)' : 'var(--bim-success, #4caf50)',
                color: 'white',
            }}
            {...hoverHandlers}
        >
            <span>{isDraft ? '📝' : '📚'}</span>
            <span>{isDraft ? 'draft' : 'official'}</span>
        </div>
    );

    if (variant === 'index-browser') {
        if (isLocal) {
            return (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {draftToggle}
                    <div
                        onClick={onSwitchMode}
                        title="点击切换到同步模式"
                        style={buttonStyle}
                        {...hoverHandlers}
                    >
                        <span>📁</span>
                        <span>本地模式</span>
                        <span style={{ opacity: 0.6, marginLeft: '4px' }}>⇄</span>
                    </div>
                    <div
                        onClick={onSelectFolder}
                        title={folderPath || '选择本地文件夹'}
                        style={{ ...buttonStyle, paddingLeft: '8px', paddingRight: '8px' }}
                        {...hoverHandlers}
                    >
                        <span>📂</span>
                        {shortName && <span style={{ fontSize: '11px', opacity: 0.9 }}>{shortName}</span>}
                    </div>
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {draftToggle}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div onClick={onSwitchMode} title="点击切换到本地模式" style={buttonStyle} {...hoverHandlers}>
                        <span>🌐</span>
                        <span>同步模式:</span>
                        <span style={{ opacity: 0.6, marginLeft: '4px' }}>⇄</span>
                    </div>
                    <div
                        onClick={onConfigurePath}
                        title={shortName || '配置同步路径'}
                        style={{ ...buttonStyle, background: 'transparent', padding: '6px', fontSize: '12px' }}
                        {...hoverHandlers}
                    >
                        <span>⚙️</span>
                    </div>
                </div>
            </div>
        );
    }

    // project-info variant
    return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <div
                onClick={onSwitchMode}
                title={isLocal ? '点击切换到 GitHub 同步模式' : '点击切换到本地模式'}
                style={buttonStyle}
                {...hoverHandlers}
            >
                <span>{isLocal ? '📁' : '🌐'}</span>
                <span>{isLocal ? '本地模式' : 'GitHub 同步'}</span>
                <span style={{ opacity: 0.6 }}>⇄</span>
            </div>
            {isLocal && (
                <div
                    onClick={onSelectFolder}
                    title={folderPath || '选择本地文件夹'}
                    style={{ ...buttonStyle, paddingLeft: '8px', paddingRight: '8px', minWidth: folderPath ? '100px' : 'auto', justifyContent: 'space-between' }}
                    {...hoverHandlers}
                >
                    <span>📂</span>
                    {shortName && <span style={{ fontSize: '11px', opacity: 0.9 }}>{shortName}</span>}
                </div>
            )}
            {!isLocal && shortName && (
                <div
                    style={{ ...buttonStyle, background: '#2196f3', color: 'white', cursor: 'default' }}
                    title={folderPath}
                >
                    <span>📂</span>
                    <span style={{ fontSize: '11px' }}>{shortName}</span>
                </div>
            )}
        </div>
    );
};
