import React, { useState, useCallback } from 'react';
import { IndexBrowser } from './IndexBrowser';
import { IndexDetail } from './IndexDetail';
import type { IndexTransport } from '../transport/types';
import type { IndexEntry, IndexDetailData } from '../types';

export interface IndexAppProps {
    transport: IndexTransport;
    /** 隐藏模式切换指示器 */
    hideModeIndicator?: boolean;
    /** 点击条目时的自定义处理（若提供则不显示右侧详情面板） */
    onEntryClick?: (entry: IndexEntry) => void;
}

/**
 * 完整的索引浏览应用：左侧导航 + 右侧详情。
 * 从 demo app (main.tsx) 提取，可直接嵌入任何 React 应用。
 */
export const IndexApp: React.FC<IndexAppProps> = ({
    transport,
    hideModeIndicator = true,
    onEntryClick: externalEntryClick,
}) => {
    const [selectedEntry, setSelectedEntry] = useState<IndexEntry | null>(null);
    const [detailData, setDetailData] = useState<IndexDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const handleEntryClick = useCallback(async (entry: IndexEntry) => {
        if (externalEntryClick) {
            externalEntryClick(entry);
            return;
        }
        setSelectedEntry(entry);
        setDetailData(null);
        setDetailLoading(true);
        try {
            const data = await transport.getItem(entry.id);
            if (data) {
                setDetailData(data as unknown as IndexDetailData);
            }
        } catch (err) {
            console.error('加载详情失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, externalEntryClick]);

    const handleNavigate = useCallback(async (id: string) => {
        setDetailData(null);
        setDetailLoading(true);
        try {
            const data = await transport.getItem(id);
            if (data) {
                setDetailData(data as unknown as IndexDetailData);
                setSelectedEntry({
                    id,
                    title: (data.title as string) || id,
                    type: (data.type as any) || 'book',
                });
            }
        } catch (err) {
            console.error('导航失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport]);

    return (
        <div style={{
            display: 'flex',
            height: '100%',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
            background: 'var(--bim-bg, #f5f5f5)',
            color: 'var(--bim-fg, #333)',
        }}>
            {/* 左侧：浏览器面板 */}
            <div style={{
                width: '420px',
                flexShrink: 0,
                borderRight: '1px solid var(--bim-widget-border, #e0e0e0)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bim-input-bg, #fff)',
                overflow: 'hidden',
            }}>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <IndexBrowser
                        transport={transport}
                        onEntryClick={handleEntryClick}
                        hideModeIndicator={hideModeIndicator}
                    />
                </div>
            </div>

            {/* 右侧：详情面板 */}
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bim-bg, #f5f5f5)' }}>
                {detailLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <span style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>加载中...</span>
                    </div>
                ) : detailData ? (
                    <div style={{ padding: '32px 48px', maxWidth: '900px' }}>
                        <IndexDetail
                            data={detailData}
                            transport={transport}
                            onNavigate={handleNavigate}
                        />
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        height: '100%',
                        color: 'var(--bim-desc-fg, #717171)',
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
                        <h2 style={{ margin: '0 0 8px', fontWeight: 400, fontSize: '18px' }}>古籍索引浏览器</h2>
                        <p style={{ margin: 0, fontSize: '14px' }}>
                            从左侧选择一个条目查看详情
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
