import React, { useEffect, useRef, useMemo } from 'react';
import { PageWarpData } from './GujiWarpCanvas';
import { bim } from '../../styles/tokens';

export interface PunctEntry {
  id: string;
  anchor: string;
  pre_char?: string;
  mark: string;
  kind?: 'point' | 'break' | 'range';
  pos?: 'after' | 'before';
}

export interface GujiTextViewerProps {
  pageData: PageWarpData;
  pages?: { page: number; columns: PageWarpData['columns'] }[];
  punctuations?: PunctEntry[];
  selectedCharIds: Set<string>;
  hoveredCharId?: string | null;
  onSelectionChange?: (charIds: string[]) => void;
  onCharClick?: (charId: string) => void;
  onCharHover?: (charId: string | null) => void;
  mode?: 'vertical' | 'horizontal';
  showPunctuation?: boolean;
  onVisiblePageChange?: (page: number) => void;
}

export const GujiTextViewer: React.FC<GujiTextViewerProps> = ({
  pageData,
  pages,
  punctuations = [],
  selectedCharIds,
  hoveredCharId,
  onSelectionChange,
  onCharClick,
  onCharHover,
  mode = 'horizontal',
  showPunctuation = true,
  onVisiblePageChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 标点索引表: anchor -> PunctEntry[]
  const punctMap = useMemo(() => {
    const map = new Map<string, PunctEntry[]>();
    if (!showPunctuation) return map;
    for (const p of punctuations) {
      const list = map.get(p.anchor) || [];
      list.push(p);
      map.set(p.anchor, list);
    }
    return map;
  }, [punctuations, showPunctuation]);

  // 1. 横排自然段构建 (支持多页流式段落，遵循 guji-markdown reflow 与 guji-punct break 规范)
  const reflowPages = useMemo(() => {
    // 若传入了全卷多页数据，则组织为多页流；否则使用单页数据
    const allPagesData: { page: number; columns: (typeof pageData.columns) }[] =
      pages && pages.length > 0
        ? pages
        : [{ page: parseInt(pageData.page_id.split(':')[1] || '1', 10), columns: pageData.columns }];

    return allPagesData.map((pData) => {
      const sortedCols = [...pData.columns].sort((a, b) => a.col - b.col);
      const paragraphs: {
        id: string;
        chars: {
          charData: (typeof pageData.columns)[0]['chars'][0];
          col: number;
          afterPuncts: PunctEntry[];
        }[];
      }[] = [];

      let currentChars: {
        charData: (typeof pageData.columns)[0]['chars'][0];
        col: number;
        afterPuncts: PunctEntry[];
      }[] = [];

      for (const col of sortedCols) {
        for (const ch of col.chars) {
          const afterPuncts = (punctMap.get(ch.id) || []).filter((p) => p.kind !== 'break');
          const hasBreak = (punctMap.get(ch.id) || []).some((p) => p.kind === 'break');

          currentChars.push({
            charData: ch,
            col: col.col,
            afterPuncts,
          });

          // 遇到自然段分段符 (guji-punct 中的 break 标记)
          if (hasBreak) {
            paragraphs.push({
              id: `para-p${pData.page}-${paragraphs.length}`,
              chars: currentChars,
            });
            currentChars = [];
          }
        }
      }

      if (currentChars.length > 0) {
        paragraphs.push({
          id: `para-p${pData.page}-${paragraphs.length}`,
          chars: currentChars,
        });
      }

      return {
        page: pData.page,
        paragraphs,
      };
    });
  }, [pages, pageData, punctMap]);

  // 2. 选区变化监听 (跨标点、跨段落、跨页原生划词，100% 保持坐标映射)
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

      const container = containerRef.current;
      if (!container) return;

      const range = sel.getRangeAt(0);
      const common = range.commonAncestorContainer;
      const targetNode = common.nodeType === 3 ? common.parentElement : (common as HTMLElement);
      if (!targetNode || !container.contains(targetNode)) return;

      // 核心算法：只提取带有 data-char-id 的实体文字节点，自动忽略标点与段落换行容器
      const spans = container.querySelectorAll<HTMLSpanElement>('span[data-char-id]');
      const selected: string[] = [];

      spans.forEach((span) => {
        try {
          if (sel.containsNode(span, true)) {
            const cid = span.getAttribute('data-char-id');
            if (cid) selected.push(cid);
          }
        } catch {
          // ignore
        }
      });

      if (selected.length > 0) {
        onSelectionChange?.(selected);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [onSelectionChange]);

  // 3. 点击底本书影时，自动平滑滚动对应文字到可见区
  useEffect(() => {
    if (selectedCharIds.size === 1) {
      const firstId = Array.from(selectedCharIds)[0];
      const el = containerRef.current?.querySelector(`span[data-char-id="${firstId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [selectedCharIds]);

  // 4. 滚动监听：侦测当前视口最上方的页码并通知外层
  useEffect(() => {
    if (!onVisiblePageChange) return;

    const updateVisiblePage = () => {
      const sections = containerRef.current?.querySelectorAll<HTMLElement>('[data-page-section]');
      if (!sections || sections.length === 0) return;

      // 视口参考线：顶部以下 120px 处
      const targetY = 120;
      let currentVisible = -1;

      // 寻找覆盖 targetY 的段落页码，若都未覆盖则选择离 targetY 最近的页面
      let minDistance = Infinity;

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const rect = sec.getBoundingClientRect();
        const pNum = parseInt(sec.getAttribute('data-page-section') || '', 10);
        if (isNaN(pNum)) continue;

        if (rect.top <= targetY && rect.bottom >= targetY) {
          currentVisible = pNum;
          break;
        }

        const dist = Math.abs(rect.top - targetY);
        if (dist < minDistance) {
          minDistance = dist;
          currentVisible = pNum;
        }
      }

      if (currentVisible !== -1) {
        onVisiblePageChange(currentVisible);
      }
    };

    window.addEventListener('scroll', updateVisiblePage, { passive: true });
    // 初始化调用一次
    updateVisiblePage();

    return () => {
      window.removeEventListener('scroll', updateVisiblePage);
    };
  }, [onVisiblePageChange, reflowPages]);

  return (
    <div
      ref={containerRef}
      className="guji-text-pane-content"
    >
      <div className="guji-text-reflow-view">
        {reflowPages.map((pGroup, idx) => (
          <section
            key={`page-sec-${pGroup.page}`}
            data-page-section={pGroup.page}
            className="guji-page-section"
            style={{ position: 'relative' }}
          >
            {/* 页间分隔与页码标牌（首页若无前置内容可紧凑显示） */}
            {idx > 0 && (
              <div
                className="guji-page-divider"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '2rem 0 1.2rem',
                  color: bim('meta-fg'),
                  fontSize: '0.82rem',
                  letterSpacing: '0.08em',
                  userSelect: 'none',
                }}
              >
                <div style={{ flex: 1, height: '1px', background: bim('rule') }} />
                <span style={{ padding: '0 12px', fontWeight: 500 }}>第 {pGroup.page} 葉</span>
                <div style={{ flex: 1, height: '1px', background: bim('rule') }} />
              </div>
            )}

            {pGroup.paragraphs.map((para) => (
              <p
                key={para.id}
                className="guji-reflow-paragraph"
              >
                {para.chars.map(({ charData: ch, col, afterPuncts }) => {
                  const isSelected = selectedCharIds.has(ch.id);
                  const isHovered = hoveredCharId === ch.id;

                  return (
                    <React.Fragment key={ch.id}>
                      <span
                        data-char-id={ch.id}
                        onClick={() => onCharClick?.(ch.id)}
                        onMouseEnter={() => onCharHover?.(ch.id)}
                        onMouseLeave={() => onCharHover?.(null)}
                        className={`guji-text-char ${isSelected ? 'is-selected' : ''} ${
                          isHovered ? 'is-hovered' : ''
                        } ${ch.sub ? 'is-sub' : ''}`}
                        title={`[第${pGroup.page}葉·第${col}列·第${ch.slot || ch.pos}字] ${ch.char}`}
                      >
                        {ch.char}
                      </span>
                      {/* 外挂注入标点 (不带 data-char-id，对底本坐标完全透明) */}
                      {afterPuncts.map((p) => (
                        <span
                          key={p.id}
                          className="guji-text-punct"
                          data-punct-id={p.id}
                        >
                          {p.mark}
                        </span>
                      ))}
                    </React.Fragment>
                  );
                })}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
