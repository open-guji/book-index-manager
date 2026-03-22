import React, { useState, useCallback } from 'react';
import { IndexBrowser } from './IndexBrowser';
import { IndexDetail } from './IndexDetail';
import { CollectionCatalog } from './CollectionCatalog';
import { CollatedEdition } from './CollatedEdition';
import type { IndexStorage } from '../storage/types';
import type { IndexEntry, IndexDetailData, CeBookMapping, CollatedEditionIndex } from '../types';

export interface IndexAppProps {
    transport: IndexStorage;
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
    const [activeTab, setActiveTab] = useState<'detail' | 'catalog' | 'collated'>('detail');
    const [catalogData, setCatalogData] = useState<CeBookMapping | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [collatedIndex, setCollatedIndex] = useState<CollatedEditionIndex | null>(null);
    const [collatedLoading, setCollatedLoading] = useState(false);

    const loadCollated = useCallback(async (id: string) => {
        if (!transport.getCollatedEditionIndex) {
            setCollatedIndex(null);
            return;
        }
        setCollatedLoading(true);
        try {
            const idx = await transport.getCollatedEditionIndex(id);
            setCollatedIndex(idx);
        } catch {
            setCollatedIndex(null);
        } finally {
            setCollatedLoading(false);
        }
    }, [transport]);

    const loadCatalog = useCallback(async (id: string) => {
        if (!transport.getCollectionCatalog) {
            setCatalogData(null);
            return;
        }
        setCatalogLoading(true);
        try {
            const catalog = await transport.getCollectionCatalog(id);
            setCatalogData(catalog);
        } catch {
            setCatalogData(null);
        } finally {
            setCatalogLoading(false);
        }
    }, [transport]);

    const handleEntryClick = useCallback(async (entry: IndexEntry) => {
        if (externalEntryClick) {
            externalEntryClick(entry);
            return;
        }
        setSelectedEntry(entry);
        setDetailData(null);
        setCatalogData(null);
        setCollatedIndex(null);
        setActiveTab('detail');
        setDetailLoading(true);
        try {
            const data = await transport.getItem(entry.id);
            if (data) {
                setDetailData(data as unknown as IndexDetailData);
                if (data.type === 'collection') {
                    loadCatalog(entry.id);
                } else if (data.type === 'work') {
                    loadCollated(entry.id);
                }
            }
        } catch (err) {
            console.error('加载详情失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, externalEntryClick, loadCatalog, loadCollated]);

    const handleNavigate = useCallback(async (id: string) => {
        setDetailData(null);
        setCatalogData(null);
        setCollatedIndex(null);
        setActiveTab('detail');
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
                if (data.type === 'collection') {
                    loadCatalog(id);
                } else if (data.type === 'work') {
                    loadCollated(id);
                }
            }
        } catch (err) {
            console.error('导航失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, loadCatalog, loadCollated]);

    const showTabs = (detailData?.type === 'collection' && (catalogData || catalogLoading)) ||
                     (detailData?.type === 'work' && (collatedIndex || collatedLoading));

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
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bim-bg, #f5f5f5)', display: 'flex', flexDirection: 'column' }}>
                {detailLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <span style={{ color: 'var(--bim-desc-fg, #717171)', fontSize: '14px' }}>加载中...</span>
                    </div>
                ) : detailData ? (
                    <>
                        {/* Tab 栏 */}
                        {showTabs && (
                            <div style={{
                                display: 'flex',
                                gap: '0',
                                borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                                padding: '0 48px',
                                background: 'var(--bim-input-bg, #fff)',
                                flexShrink: 0,
                            }}>
                                <button
                                    onClick={() => setActiveTab('detail')}
                                    style={tabBtnStyle(activeTab === 'detail')}
                                >
                                    基本信息
                                </button>
                                {detailData.type === 'collection' && (catalogData || catalogLoading) && (
                                    <button
                                        onClick={() => setActiveTab('catalog')}
                                        style={tabBtnStyle(activeTab === 'catalog')}
                                    >
                                        丛编目录
                                        {catalogLoading && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>}
                                    </button>
                                )}
                                {detailData.type === 'work' && (collatedIndex || collatedLoading) && (
                                    <button
                                        onClick={() => setActiveTab('collated')}
                                        style={tabBtnStyle(activeTab === 'collated')}
                                    >
                                        整理本
                                        {collatedLoading && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>}
                                    </button>
                                )}
                            </div>
                        )}
                        <div style={{ padding: '32px 48px', maxWidth: '900px', flex: 1, overflow: 'auto' }}>
                            {activeTab === 'detail' ? (
                                <IndexDetail
                                    data={detailData}
                                    transport={transport}
                                    onNavigate={handleNavigate}
                                />
                            ) : activeTab === 'catalog' ? (
                                <CollectionCatalog
                                    data={catalogData || undefined}
                                    onNavigate={handleNavigate}
                                />
                            ) : activeTab === 'collated' ? (
                                <CollatedEdition
                                    index={collatedIndex || undefined}
                                    workId={detailData.id}
                                    transport={transport}
                                    onNavigate={handleNavigate}
                                />
                            ) : null}
                        </div>
                    </>
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

function tabBtnStyle(active: boolean): React.CSSProperties {
    return {
        padding: '10px 16px',
        border: 'none',
        borderBottom: active ? '2px solid var(--bim-primary, #0078d4)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--bim-primary, #0078d4)' : 'var(--bim-desc-fg, #717171)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
    };
}
