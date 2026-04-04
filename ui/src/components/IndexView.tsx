/**
 * IndexView — 统一的索引条目详情组件
 *
 * 合并 IndexDetail（只读）和 IndexEditor（编辑）为一个组件，
 * 通过 mode prop 切换显示模式。
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type {
    IndexType, IndexDetailData, ResourceEntry, DownloadProgress,
    RelationData, AdditionalWork, IndexedByEntry,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { IndexDetail } from './IndexDetail';
import type { IndexDetailProps } from './IndexDetail';
import { IndexEditor } from './IndexEditor';
import type { IndexEditorData, IndexEditorProps } from './IndexEditor';
import { useT } from '../i18n';

// ── 数据转换 ──

/** IndexDetailData (结构化) → IndexEditorData (扁平化) */
export function detailToEditor(data: IndexDetailData): IndexEditorData {
    const author = data.authors?.[0]?.name || '';
    const dynasty = data.publication_info?.year || '';
    const holder = data.current_location?.name || '';
    const pages = data.page_count?.number
        ? String(data.page_count.number)
        : data.page_count?.description || '';
    const description = typeof data.description === 'object' && data.description !== null
        ? data.description.text || ''
        : '';

    const result: IndexEditorData = {
        id: data.id,
        title: data.title,
        type: data.type,
        author,
        dynasty,
        holder,
        pages,
        description,
        resources: data.resources,
        additional_works: data.additional_works,
        indexed_by: data.indexed_by,
    };

    // Work 特有字段
    if (data.type === 'work') {
        const w = data as any;
        // 从 related_works 中提取 part_of 关系
        if (Array.isArray(w.related_works)) {
            const partOf = w.related_works.find((r: any) => r.relation === 'part_of');
            if (partOf) {
                result.parentWorkId = partOf.id;
                result.parentWorkName = partOf.title;
            }
        }
    }

    // Book 特有字段
    if (data.type === 'book') {
        const b = data as any;
        result.workId = b.work_id;
        if (Array.isArray(b.contained_in) && b.contained_in.length > 0) {
            result.collectionId = b.contained_in[0]?.id;
        }
    }

    return result;
}

/** IndexEditorData (扁平化) → partial IndexDetailData (结构化) */
export function editorToDetail(data: IndexEditorData): IndexDetailData {
    const base: any = {
        id: data.id,
        title: data.title,
        type: data.type,
        description: data.description ? { text: data.description } : undefined,
        authors: data.author ? [{ name: data.author }] : undefined,
        publication_info: data.dynasty ? { year: data.dynasty } : undefined,
        current_location: data.holder ? { name: data.holder } : undefined,
        page_count: data.pages ? { number: parseInt(data.pages) || 0, description: data.pages } : undefined,
        resources: data.resources,
        additional_works: data.additional_works,
        indexed_by: data.indexed_by,
    };

    if (data.type === 'work') {
        if (data.parentWorkId) {
            base.related_works = [{ id: data.parentWorkId, title: data.parentWorkName || '', relation: 'part_of' }];
        }
    }

    if (data.type === 'book') {
        base.work_id = data.workId;
        if (data.collectionId) {
            base.contained_in = [{ id: data.collectionId }];
        }
    }

    return base as IndexDetailData;
}

// ── IndexView Props ──

export interface IndexViewProps {
    /** 数据（直接传入） */
    data?: IndexDetailData;
    /** 条目 ID（配合 transport 自动加载） */
    id?: string;
    /** 数据传输层 */
    transport?: IndexStorage;

    /** 显示模式：'view' 只读，'edit' 编辑 */
    mode?: 'view' | 'edit';
    /** 模式切换回调（提供此回调时显示切换按钮） */
    onModeChange?: (mode: 'view' | 'edit') => void;

    // ── 编辑回调（edit 模式） ──
    onChange?: (data: IndexEditorData) => void;
    onSave?: () => void;
    onDelete?: () => void;

    // ── 通用回调 ──
    onNavigate?: (id: string, type?: IndexType) => void;
    renderLink?: (id: string, label?: string) => React.ReactNode;

    // ── 可选功能（edit 模式） ──
    onAskAI?: (section: string) => void;
    renderSectionActions?: (section: string) => React.ReactNode;
    onDownloadResource?: (index: number, url: string) => void;
    downloadStatuses?: Record<number, DownloadProgress>;
    relations?: RelationData;
    onRelationsChange?: (relations: RelationData) => void;

    // ── 布局 ──
    headerExtra?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const IndexView: React.FC<IndexViewProps> = (props) => {
    const {
        data: dataProp,
        id,
        transport,
        mode: modeProp = 'view',
        onModeChange,
        onChange,
        onSave,
        onDelete,
        onNavigate,
        renderLink,
        onAskAI,
        renderSectionActions,
        onDownloadResource,
        downloadStatuses,
        relations,
        onRelationsChange,
        headerExtra,
        className,
        style,
    } = props;

    const t = useT();
    const [internalMode, setInternalMode] = useState(modeProp);
    const mode = onModeChange ? modeProp : internalMode;

    // 同步外部 mode 变化
    useEffect(() => {
        if (modeProp !== internalMode) {
            setInternalMode(modeProp);
        }
    }, [modeProp]);

    const handleModeToggle = useCallback(() => {
        const newMode = mode === 'view' ? 'edit' : 'view';
        if (onModeChange) {
            onModeChange(newMode);
        } else {
            setInternalMode(newMode);
        }
    }, [mode, onModeChange]);

    // 加载数据（当提供 id + transport 时）
    const [loadedData, setLoadedData] = useState<IndexDetailData | null>(null);
    useEffect(() => {
        if (id && transport) {
            transport.getItem(id).then(item => {
                if (item) setLoadedData(item as unknown as IndexDetailData);
            });
        }
    }, [id, transport]);

    const detailData = dataProp || loadedData;

    // 为编辑模式准备 editorData
    const editorData = useMemo(() => {
        if (!detailData) return null;
        return detailToEditor(detailData);
    }, [detailData]);

    // 模式切换按钮
    const modeToggle = (onModeChange || !dataProp) ? (
        <button
            onClick={handleModeToggle}
            style={{
                padding: '4px 12px',
                fontSize: '12px',
                border: '1px solid var(--bim-widget-border, #d0d0d0)',
                borderRadius: '4px',
                background: mode === 'edit' ? 'var(--bim-accent-bg, #1976d2)' : 'transparent',
                color: mode === 'edit' ? '#fff' : 'var(--bim-fg, #333)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
            }}
            title={mode === 'view' ? '切换到编辑模式' : '切换到查看模式'}
        >
            {mode === 'view' ? '✏️ 编辑' : '👁 查看'}
        </button>
    ) : null;

    const combinedHeaderExtra = (
        <>
            {modeToggle}
            {headerExtra}
        </>
    );

    if (!detailData && !editorData) {
        return <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>加载中...</div>;
    }

    // ── View 模式 ──
    if (mode === 'view') {
        return (
            <IndexDetail
                data={detailData!}
                transport={transport}
                onNavigate={onNavigate ? (id) => onNavigate(id) : undefined}
                renderLink={renderLink}
                headerExtra={combinedHeaderExtra}
                className={className}
                style={style}
            />
        );
    }

    // ── Edit 模式 ──
    if (!editorData) {
        return <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>无数据</div>;
    }

    return (
        <div className={className} style={style}>
            {/* 编辑模式 header：模式切换 */}
            {combinedHeaderExtra && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0', gap: '8px' }}>
                    {combinedHeaderExtra}
                </div>
            )}
            <IndexEditor
                data={editorData}
                onChange={onChange || (() => {})}
                onSave={onSave || (() => {})}
                transport={transport}
                onNavigate={onNavigate}
                showDelete={!!onDelete}
                onDelete={onDelete}
                onAskAI={onAskAI}
                renderSectionActions={renderSectionActions}
                onDownloadResource={onDownloadResource}
                downloadStatuses={downloadStatuses}
                relations={relations}
                onRelationsChange={onRelationsChange}
            />
        </div>
    );
};
