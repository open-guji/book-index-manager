import React, { useState, useCallback } from 'react';
import { IndexBrowser } from './IndexBrowser';
import { IndexDetail } from './IndexDetail';
import { CollectionCatalog } from './CollectionCatalog';
import { CollatedEdition } from './CollatedEdition';
import { HomePage } from './HomePage';
import type { RecommendedItem } from './HomePage';
import type { IndexStorage } from '../storage/types';
import type { IndexEntry, IndexDetailData, ResourceCatalog, CollatedEditionIndex } from '../types';
import { useT, useConvert } from '../i18n';

export interface IndexAppProps {
    transport: IndexStorage;
    /** 隐藏模式切换指示器 */
    hideModeIndicator?: boolean;
    /** 点击条目时的自定义处理（若提供则不显示右侧详情面板） */
    onEntryClick?: (entry: IndexEntry) => void;
    /** 首页推荐条目 */
    recommendedIds?: RecommendedItem[];
}

/**
 * 完整的索引浏览应用：左侧导航 + 右侧详情。
 * 从 demo app (main.tsx) 提取，可直接嵌入任何 React 应用。
 */
export const IndexApp: React.FC<IndexAppProps> = ({
    transport,
    hideModeIndicator = true,
    onEntryClick: externalEntryClick,
    recommendedIds,
}) => {
    const t = useT();
    const { convert } = useConvert();
    const [selectedEntry, setSelectedEntry] = useState<IndexEntry | null>(null);
    const [detailData, setDetailData] = useState<IndexDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('detail');
    const [catalogList, setCatalogList] = useState<ResourceCatalog[]>([]);
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
        if (!transport.getCollectionCatalogs && !transport.getCollectionCatalog) {
            setCatalogList([]);
            return;
        }
        setCatalogLoading(true);
        try {
            if (transport.getCollectionCatalogs) {
                const catalogs = await transport.getCollectionCatalogs(id);
                setCatalogList(catalogs || []);
            } else if (transport.getCollectionCatalog) {
                const catalog = await transport.getCollectionCatalog(id);
                if (catalog) {
                    setCatalogList([{ resource_id: '', data: catalog }]);
                } else {
                    setCatalogList([]);
                }
            }
        } catch {
            setCatalogList([]);
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
        setCatalogList([]);
        setCollatedIndex(null);
        setActiveTab('detail');
        setDetailLoading(true);
        try {
            const data = await transport.getItem(entry.id);
            if (data) {
                setDetailData(data as unknown as IndexDetailData);
                if (data.type === 'collection') {
                    loadCatalog(entry.id);
                } else if (data.type === 'work' && data.has_collated) {
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
        setCatalogList([]);
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
                } else if (data.type === 'work' && data.has_collated) {
                    loadCollated(id);
                }
            }
        } catch (err) {
            console.error('导航失败:', err);
        } finally {
            setDetailLoading(false);
        }
    }, [transport, loadCatalog, loadCollated]);

    const showTabs = (detailData?.type === 'collection' && (catalogList.length > 0 || catalogLoading)) ||
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
                                    {t.detailTab.basicInfo}
                                </button>
                                {detailData.type === 'collection' && catalogLoading && catalogList.length === 0 && (
                                    <button
                                        onClick={() => {}}
                                        style={tabBtnStyle(false)}
                                    >
                                        {t.detailTab.catalog}<span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.6 }}>...</span>
                                    </button>
                                )}
                                {detailData.type === 'collection' && catalogList.map((cat) => (
                                    <button
                                        key={cat.resource_id}
                                        onClick={() => setActiveTab(`catalog:${cat.resource_id}`)}
                                        style={tabBtnStyle(activeTab === `catalog:${cat.resource_id}`)}
                                    >
                                        {cat.short_name ? `${convert(cat.short_name)}${t.detailTab.catalogSuffix}` : t.detailTab.collectionCatalog}
                                    </button>
                                ))}
                                {detailData.type === 'work' && (collatedIndex || collatedLoading) && (
                                    <button
                                        onClick={() => setActiveTab('collated')}
                                        style={tabBtnStyle(activeTab === 'collated')}
                                    >
                                        {t.detailTab.collatedEdition}
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
                            ) : activeTab.startsWith('catalog:') ? (
                                <CollectionCatalog
                                    data={catalogList.find(c => `catalog:${c.resource_id}` === activeTab)?.data}
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
                    <HomePage
                        transport={transport}
                        onNavigate={handleNavigate}
                        recommendedIds={recommendedIds}
                    />
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
