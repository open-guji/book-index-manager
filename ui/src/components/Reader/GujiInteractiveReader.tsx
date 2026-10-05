import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GujiWarpCanvas, PageWarpData } from './GujiWarpCanvas';
import { GujiTextViewer, PunctEntry } from './GujiTextViewer';
import { bim } from '../../styles/tokens';

export interface GujiInteractiveReaderProps {
  pageData: PageWarpData;
  rawImageUrl?: string;
  punctuations?: PunctEntry[];
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 古籍图文对读组件 (GujiInteractiveReader)
 *
 * 集成 WebGL 分带透视矫正底本书影画布与排版文本阅读器，实现：
 * 1. 独立外挂标点 (guji-punct v0.1) 与横排自然段重排 / 竖排原列排版
 * 2. 双叶版心拼接 (本文左侧实体 + 邻页右侧 65% 半透明互补)
 * 3. 毫秒级双向坐标联动：文本划词多选 / 单字点击 / 悬浮 <-> 书影矫正字框
 * 4. 视口黏性滚动与自动定位：书影黏性固定于视口左侧，右侧文本自由滚动，点击字框平滑定位
 */
export const GujiInteractiveReader: React.FC<GujiInteractiveReaderProps> = ({
  pageData,
  rawImageUrl = '/fixtures/vol02_10.png',
  punctuations = [],
  title,
  subtitle,
  onBack,
  className = '',
  style = {},
}) => {
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
  const [mode, setMode] = useState<'vertical' | 'horizontal'>('horizontal');
  const [showPunctuation, setShowPunctuation] = useState<boolean>(true);

  const viewerContainerRef = useRef<HTMLDivElement | null>(null);

  // 划词多选联动
  const handleTextSelection = useCallback((charIds: string[]) => {
    setSelectedCharIds(new Set(charIds));
  }, []);

  // 单字点击联动
  const handleCharClick = useCallback((charId: string) => {
    setSelectedCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) {
        next.delete(charId);
      } else {
        next.clear();
        next.add(charId);
      }
      return next;
    });

    // 平滑滚动文本到视口
    if (viewerContainerRef.current) {
      const el = viewerContainerRef.current.querySelector(`[data-char-id="${charId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, []);

  const handleClearSelection = () => {
    setSelectedCharIds(new Set());
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  };

  const resolvedPunct = punctuations.length > 0 
    ? punctuations 
    : (pageData as any).punctuations || [];

  return (
    <div className={`guji-reader-container ${className}`} style={style}>
      {/* 顶部工具栏 */}
      <header className="guji-reader-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="guji-reader-btn"
              style={{ marginRight: 6 }}
            >
              ‹ 返回
            </button>
          )}
          <span className="guji-reader-title">{title || pageData.title}</span>
          {subtitle && <span style={{ fontSize: '0.85rem', color: bim('meta-fg') }}>{subtitle}</span>}
          <span className="guji-reader-tag">WebGL 客户端透视矫正对读</span>
        </div>

        <div className="guji-reader-actions">
          <span style={{ fontSize: '0.85rem', color: bim('body-fg') }}>
            已选字数: <strong style={{ color: bim('accent') }}>{selectedCharIds.size}</strong>
          </span>

          {selectedCharIds.size > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="guji-reader-btn"
            >
              清除选中
            </button>
          )}

          {/* 标点显隐开关 */}
          <button
            type="button"
            onClick={() => setShowPunctuation((p) => !p)}
            className={`guji-reader-btn ${showPunctuation ? 'active' : ''}`}
            title="独立外挂标点 (guji-punct v0.1)"
          >
            {showPunctuation ? '✓ 标点' : '底本文本'}
          </button>

          {/* 横竖排切换 */}
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'horizontal' ? 'vertical' : 'horizontal'))}
            className="guji-reader-btn primary"
          >
            {mode === 'horizontal' ? '切换竖排' : '切换横排'}
          </button>
        </div>
      </header>

      {/* 主体左右对读分栏 */}
      <div className="guji-reader-body">
        {/* 左侧：WebGL 实时矫正原图书影与精准高亮 (Sticky 保持于视口) */}
        <div className="guji-pane-card" style={{ flex: '1 1 50%', position: 'sticky', top: 0 }}>
          <div className="guji-pane-header">
            <span className="guji-pane-title">
              底本书影 (WebGL 分带透视矫正 + 完整版心)
            </span>
            <span className="guji-pane-hint">点击字框可联动文本定位</span>
          </div>
          <div className="guji-pane-content">
            <GujiWarpCanvas
              imageUrl={rawImageUrl}
              pageData={pageData}
              selectedCharIds={selectedCharIds}
              hoveredCharId={hoveredCharId}
              onCharClick={handleCharClick}
              onCharHover={setHoveredCharId}
            />
          </div>
        </div>

        {/* 右侧：排版文本阅读器 */}
        <div className="guji-pane-card" style={{ flex: '1 1 50%' }} ref={viewerContainerRef}>
          <div className="guji-pane-header">
            <span className="guji-pane-title">
              {mode === 'horizontal'
                ? '排版文本 (横排分段 · 外挂断句标点)'
                : '排版文本 (原刻竖排逐列)'}
            </span>
            <span className="guji-pane-hint">
              支持鼠标跨标点整句划词高亮
            </span>
          </div>
          <GujiTextViewer
            pageData={pageData}
            punctuations={resolvedPunct}
            selectedCharIds={selectedCharIds}
            hoveredCharId={hoveredCharId}
            onSelectionChange={handleTextSelection}
            onCharClick={handleCharClick}
            onCharHover={setHoveredCharId}
            mode={mode}
            showPunctuation={showPunctuation}
          />
        </div>
      </div>
    </div>
  );
};
