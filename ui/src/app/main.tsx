import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { IndexBrowser } from '../components/IndexBrowser';
import { IndexDetail } from '../components/IndexDetail';
import { GithubStorage } from '../storage/github-storage';
import type { IndexStorage } from '../storage/types';
import type { IndexEntry, IndexDetailData } from '../types';
import '../styles/variables.css';

// ── 数据源 ──

function createStorage(): IndexStorage {
    return new GithubStorage({
        org: 'open-guji',
        repos: {
            draft: 'book-index-draft',
            official: 'book-index',
        },
    });
}

// ── 主应用 ──

function App() {
    const [transport] = useState<IndexStorage>(() => createStorage());
    const [selectedEntry, setSelectedEntry] = useState<IndexEntry | null>(null);
    const [detailData, setDetailData] = useState<IndexDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const handleEntryClick = useCallback(async (entry: IndexEntry) => {
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
    }, [transport]);

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
            height: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
            background: 'var(--bim-bg, #f5f5f5)',
            color: 'var(--bim-fg, #333)',
        }}>
            {/* 左侧：浏览器面板 */}
            {sidebarOpen && (
                <div style={{
                    width: '420px',
                    flexShrink: 0,
                    borderRight: '1px solid var(--bim-widget-border, #e0e0e0)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bim-input-bg, #fff)',
                    overflow: 'hidden',
                }}>
                    {/* 工具栏 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 20px',
                        borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                        fontSize: '12px',
                        color: 'var(--bim-desc-fg, #717171)',
                    }}>
                        <span>古籍索引</span>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            title="收起侧栏"
                            style={{
                                marginLeft: 'auto',
                                padding: '2px 6px',
                                border: 'none',
                                borderRadius: '3px',
                                background: 'transparent',
                                color: 'var(--bim-desc-fg, #717171)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                lineHeight: 1,
                            }}
                        >
                            ◀
                        </button>
                    </div>
                    {/* 浏览器 */}
                    <div style={{ flex: 1, overflow: 'auto' }}>
                        <IndexBrowser
                            transport={transport}
                            onEntryClick={handleEntryClick}
                            hideModeIndicator
                        />
                    </div>
                </div>
            )}

            {/* 右侧：详情面板 */}
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bim-bg, #f5f5f5)', position: 'relative' }}>
                {!sidebarOpen && (
                    <button
                        onClick={() => setSidebarOpen(true)}
                        title="展开侧栏"
                        style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            zIndex: 10,
                            padding: '6px 10px',
                            border: '1px solid var(--bim-widget-border, #e0e0e0)',
                            borderRadius: '4px',
                            background: 'var(--bim-input-bg, #fff)',
                            color: 'var(--bim-fg, #333)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                        }}
                    >
                        ▶ 索引
                    </button>
                )}
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
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
