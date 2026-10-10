import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { PageWarpData } from './GujiWarpCanvas';
import { bim } from '../../styles/tokens';
import { EntityMark, useEntitySummaryLoader } from '../EntityText/EntityText';
import { ENTITY_TEXT_CSS } from '../EntityText/entity-text-css';
import type { EntitySpan } from '../../core/entity-annotations';
import { useI18n } from '../../i18n';
import { PAGE_INDICATOR_Y_RANGE, type BookTitleStyle } from './prefs';
import { transformMark, type MarkOpts, type QuoteStyle } from './marks';
import type { EntitySummaryLoader, EntitySummaryTransport } from '../EntityText/summary';

export interface PunctEntry {
  /** 缺省时按 `<anchor>#<序号>` 补 */
  id?: string;
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
  /** 繁简转换（显示用）：只换显示的字，格位锚点、选区、实体对位都不受影响。不传＝原字 */
  convert?: (s: string) => string;
  /** 要求把某页滚到视口顶部（书影翻页时带正文）；`nonce` 变了才触发，同页重复点也会再滚一次 */
  scrollToPage?: { page: number; nonce: number } | null;
  /**
   * 实体标注（`adaptEntityJson` 的结果，须带 `anchor`）：按逐字 id 对位，画专名线／书名号，已收录的出摘要卡与条目链接。
   * 不传或空数组＝不画。
   */
  entities?: readonly EntitySpan[];
  /** 取摘要用的数据源（同详情页的 transport） */
  entityTransport?: EntitySummaryTransport;
  loadEntitySummary?: EntitySummaryLoader;
  /** 条目链接；默认 `/item/<id>` */
  buildEntityHref?: (id: string) => string;
  /** 站内跳转（宿主在这里 `preventDefault` 后走自己的路由）；不传则按 href 整页跳 */
  onEntityNavigate?: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
  /** 是否画分叶分割线（「第 N 葉」）；false＝连续阅读，DOM 里不出现分割元素。缺省 true */
  pageBreaks?: boolean;
  /**
   * 页指示头在视口高度的位置（0.1–0.9）。传了（且传了 `onVisiblePageChange`）就在正文左缘画一个可拖的小三角，
   * 书影对应的页由指示头所在的那一行决定；不传＝不画，参考线仍是视口顶部以下 120px（旧行为）。
   */
  pageIndicatorY?: number;
  /** 指示头拖完（松手）或键盘微调后的新位置，已夹在允许范围内；宿主把它写回偏好 */
  onPageIndicatorYChange?: (y: number) => void;
  /** 引号样式（只改显示）。三个显示偏好都不传＝标点原样（旧行为） */
  quoteStyle?: QuoteStyle;
  /** 书名标法：`wavy` 画波浪线并隐去《》〈〉；`bracket` 显示书名号、不画波浪线 */
  bookTitleStyle?: BookTitleStyle;
  /** 书名是否标注：false＝波浪线与书名号都不标（隐去《》〈〉；书名实体也应由宿主筛掉） */
  showWorks?: boolean;
}

const defaultHref = (id: string) => `/item/${encodeURIComponent(id)}`;

/** 一段里连续属于同一实体的字归成一组（实体跨段、跨页时按段切开，各段各画各的线） */
/**
 * 挂在同一个字上的标点按 pos 分前后：pos=before 的在字之前（如《 挂在书名首字前），其余在字之后。
 * 分段符（kind=break）不在此列，由调用方单独处理。
 */
export function splitPuncts(list: PunctEntry[]): { before: PunctEntry[]; after: PunctEntry[] } {
  const marks = list.filter((p) => p.kind !== 'break');
  return { before: marks.filter((p) => p.pos === 'before'), after: marks.filter((p) => p.pos !== 'before') };
}

function groupByEntity<T extends { charData: { id: string } }>(
  chars: T[],
  entityOfChar: Map<string, EntitySpan>,
): { entity: EntitySpan | null; chars: T[] }[] {
  const runs: { entity: EntitySpan | null; chars: T[] }[] = [];
  for (const c of chars) {
    const ent = entityOfChar.get(c.charData.id) ?? null;
    const last = runs[runs.length - 1];
    if (last && last.entity === ent) last.chars.push(c);
    else runs.push({ entity: ent, chars: [c] });
  }
  return runs;
}

export const GujiTextViewer: React.FC<GujiTextViewerProps> = ({
  pageData,
  pages,
  punctuations = NO_PUNCT,
  selectedCharIds,
  hoveredCharId,
  onSelectionChange,
  onCharClick,
  onCharHover,
  mode = 'horizontal',
  showPunctuation = true,
  onVisiblePageChange,
  convert,
  scrollToPage,
  entities,
  entityTransport,
  loadEntitySummary,
  buildEntityHref,
  onEntityNavigate,
  pageBreaks = true,
  pageIndicatorY,
  onPageIndicatorYChange,
  quoteStyle,
  bookTitleStyle,
  showWorks,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 点字／划词之后一小段时间内，滚动不改书影页：以读者点的字所在页为准，免得点在页首时被上一页抢回去
  const pageLockUntil = useRef(0);

  // 标点索引表: anchor -> PunctEntry[]
  const punctMap = useMemo(() => {
    const map = new Map<string, PunctEntry[]>();
    if (!showPunctuation) return map;
    punctuations.forEach((raw, i) => {
      // entity／标点 json 里的标点常常没有 id；React key 与 data-punct-id 都要唯一，缺了就按锚点＋序号补
      const p = raw.id ? raw : { ...raw, id: `${raw.anchor}#${i}` };
      const list = map.get(p.anchor) || [];
      list.push(p);
      map.set(p.anchor, list);
    });
    return map;
  }, [punctuations, showPunctuation]);

  // 标点显示：三个显示偏好都没传＝原样（旧行为）；传了任意一个就按 transformMark 改显示
  const markOpts = useMemo<MarkOpts | null>(() => {
    if (quoteStyle === undefined && bookTitleStyle === undefined && showWorks === undefined) return null;
    return { quoteStyle: quoteStyle ?? 'original', hideBookBrackets: bookTitleStyle === 'wavy' || showWorks === false };
  }, [quoteStyle, bookTitleStyle, showWorks]);
  // 书名号标法时书名实体不画波浪线（线与号二选一）
  const plainBooks = bookTitleStyle === 'bracket';

  // 1. 横排自然段构建 (支持多页流式段落，遵循 guji-markdown reflow 与 guji-punct break 规范)
  const reflowPages = useMemo(() => {
    // 若传入了全卷多页数据，则组织为多页流；否则使用单页数据
    const allPagesData: { page: number; columns: (typeof pageData.columns) }[] =
      pages && pages.length > 0
        ? pages
        : [{ page: parseInt(pageData.page_id.split(':')[1] || '1', 10), columns: pageData.columns }];

    // 无字页（只有书影的书脊签、封面签条等）不进正文
    return allPagesData.filter((pData) => pData.columns.some((c) => c.chars.length > 0)).map((pData) => {
      const sortedCols = [...pData.columns].sort((a, b) => a.col - b.col);
      const paragraphs: {
        id: string;
        chars: {
          charData: (typeof pageData.columns)[0]['chars'][0];
          col: number;
          beforePuncts: PunctEntry[];
          afterPuncts: PunctEntry[];
        }[];
      }[] = [];

      let currentChars: {
        charData: (typeof pageData.columns)[0]['chars'][0];
        col: number;
        beforePuncts: PunctEntry[];
        afterPuncts: PunctEntry[];
      }[] = [];

      for (const col of sortedCols) {
        for (const ch of col.chars) {
          const { before: beforePuncts, after: afterPuncts } = splitPuncts(punctMap.get(ch.id) || []);
          const hasBreak = (punctMap.get(ch.id) || []).some((p) => p.kind === 'break');

          currentChars.push({
            charData: ch,
            col: col.col,
            beforePuncts,
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

  // 全卷字序：字 id → 序号（对位实体用）
  const charOrder = useMemo(() => {
    const order: string[] = [];
    for (const pg of reflowPages) for (const para of pg.paragraphs) for (const c of para.chars) order.push(c.charData.id);
    return order;
  }, [reflowPages]);

  // 实体按逐字 id 对位：字 id → 实体（范围内每个字都指向它；重叠时取先出现的、更长的）
  const entityOfChar = useMemo(() => {
    const map = new Map<string, EntitySpan>();
    if (!entities || entities.length === 0) return map;
    const index = new Map(charOrder.map((id, i) => [id, i] as const));
    for (const ent of entities) {
      if (!ent.anchor) continue;
      const a = index.get(ent.anchor.start);
      const b = index.get(ent.anchor.end);
      if (a === undefined || b === undefined || b < a) continue;
      for (let i = a; i <= b; i++) if (!map.has(charOrder[i])) map.set(charOrder[i], ent);
    }
    return map;
  }, [entities, charOrder]);

  const entityLoader = useEntitySummaryLoader(entityTransport, loadEntitySummary);
  const hasEntities = entityOfChar.size > 0;

  // 回调一律走 ref：每页是 memo 组件，回调身份不变才不会因为外层一次 setState 全卷重渲染（3 万个字）
  const latest = useRef({ onCharClick, onCharHover, onSelectionChange, onVisiblePageChange, onEntityNavigate });
  latest.current = { onCharClick, onCharHover, onSelectionChange, onVisiblePageChange, onEntityNavigate };

  const handlers = useMemo<PageHandlers>(() => ({
    click: (id) => { pageLockUntil.current = Date.now() + 1200; latest.current.onCharClick?.(id); },
    enter: (id) => latest.current.onCharHover?.(id),
    leave: () => latest.current.onCharHover?.(null),
    // 点专名里的字＝照常点字（高亮书影），不跳条目；Ctrl／⌘／Shift 点击与键盘回车才进条目页
    navigate: (id, e) => {
      const keyboard = e.detail === 0;
      if (!(keyboard || e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); return; }
      latest.current.onEntityNavigate?.(id, e);
    },
  }), []);

  // 每页只收到落在本页的选中字；没变的页拿到同一个 Set，memo 才挡得住
  const selectedByPage = useSelectedByPage(selectedCharIds);

  // 悬停（含从书影那边反过来悬停）：直接改那一个字的 class，不经 React 重渲染
  const hoverEl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    hoverEl.current?.classList.remove('is-hovered');
    hoverEl.current = null;
    if (!hoveredCharId) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`span[data-char-id="${hoveredCharId}"]`);
    if (el) { el.classList.add('is-hovered'); hoverEl.current = el; }
  }, [hoveredCharId]);

  // 2. 选区变化监听：只取选区两端的字、按文档序二分，不再逐字问「这个字在不在选区里」（3 万次 containsNode 会卡死）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const compute = () => {
      timer = null;
      const sel = window.getSelection();
      const container = containerRef.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) return;
      const range = sel.getRangeAt(0);
      const common = range.commonAncestorContainer;
      const targetNode = common.nodeType === 3 ? common.parentElement : (common as HTMLElement);
      if (!targetNode || !container.contains(targetNode)) return;

      const spans = container.querySelectorAll<HTMLElement>('span[data-char-id]');
      // 第一个起点不早于选区起点的字
      let lo = 0, hi = spans.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (range.comparePoint(spans[m], 0) < 0) lo = m + 1; else hi = m; }
      const first = lo;
      // 最后一个起点不晚于选区终点的字
      hi = spans.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (range.comparePoint(spans[m], 0) <= 0) lo = m + 1; else hi = m; }
      const last = lo - 1;
      if (last < first) return;
      const selected: string[] = [];
      for (let i = first; i <= last; i++) selected.push(spans[i].getAttribute('data-char-id')!);
      if (selected.length > 0) {
        pageLockUntil.current = Date.now() + 1200;
        latest.current.onSelectionChange?.(selected);
      }
    };
    const onSel = () => { if (timer) clearTimeout(timer); timer = setTimeout(compute, 120); };
    document.addEventListener('selectionchange', onSel);
    return () => { document.removeEventListener('selectionchange', onSel); if (timer) clearTimeout(timer); };
  }, []);

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

  // 书影翻页 → 正文滚到该页开头。锁住滚动联动，免得滚动途中被上一页抢回书影页
  const scrollNonce = scrollToPage?.nonce;
  useEffect(() => {
    if (!scrollToPage) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-page-section="${scrollToPage.page}"]`);
    if (!el) return;
    pageLockUntil.current = Date.now() + 800;
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollNonce]);

  // 页指示头：位置（视口高度比例）。拖动中用本地值，松手才通知宿主写偏好
  const hasVisibleCb = !!onVisiblePageChange;
  const indicatorOn = hasVisibleCb && typeof pageIndicatorY === 'number';
  const [dragY, setDragY] = useState<number | null>(null);
  const effectiveY = clampIndicatorY(dragY ?? pageIndicatorY ?? 0);
  const refYRef = useRef<number | null>(null); // 当前参考线所在的视口高度比例；null＝旧行为（顶部以下 120px）
  refYRef.current = indicatorOn ? effectiveY : null;
  const updatePageRef = useRef<() => void>(() => {});

  // 4. 滚动监听：侦测视口参考线（指示头所在行，缺省顶部以下 120px）所在的页并通知外层。
  //    rAF 节流＋对已排好序的页做二分，每帧只读十来个页的位置
  useEffect(() => {
    if (!hasVisibleCb) return;
    const sections = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-page-section]') ?? []);
    if (sections.length === 0) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() < pageLockUntil.current) return;
      const targetY = refYRef.current === null ? 120 : refYRef.current * window.innerHeight;
      // 最后一个顶边不低于参考线的页（页是自上而下排的）
      let lo = 0, hi = sections.length - 1;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (sections[m].getBoundingClientRect().top <= targetY) lo = m; else hi = m - 1;
      }
      const pNum = parseInt(sections[lo].getAttribute('data-page-section') || '', 10);
      if (!isNaN(pNum)) latest.current.onVisiblePageChange?.(pNum);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    updatePageRef.current = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); updatePageRef.current = () => {}; };
  }, [hasVisibleCb, reflowPages]);
  // 指示头挪动（拖动、键盘、偏好变了）：不等滚动，立刻按新参考线重判一次页
  useEffect(() => { if (indicatorOn) updatePageRef.current(); }, [indicatorOn, effectiveY]);

  return (
    <div
      ref={containerRef}
      className="guji-text-pane-content"
    >
      {hasEntities && <style>{ENTITY_TEXT_CSS}</style>}
      {indicatorOn && (
        <PageIndicator
          y={effectiveY}
          containerRef={containerRef}
          onDrag={setDragY}
          onCommit={(y) => { setDragY(null); onPageIndicatorYChange?.(y); }}
        />
      )}
      <div className="guji-text-reflow-view">
        {reflowPages.map((pGroup, idx) => (
          <PageSection
            key={`page-sec-${pGroup.page}`}
            pGroup={pGroup}
            first={idx === 0}
            pageBreaks={pageBreaks}
            markOpts={markOpts}
            plainBooks={plainBooks}
            selected={selectedByPage.get(pGroup.page) ?? NO_SELECTION}
            entityOfChar={entityOfChar}
            entityLoader={entityLoader}
            convert={convert}
            buildHref={buildEntityHref ?? defaultHref}
            handlers={handlers}
          />
        ))}
      </div>
    </div>
  );
};

const NO_SELECTION: ReadonlySet<string> = new Set();
const NO_PUNCT: PunctEntry[] = [];

interface PageHandlers {
  click: (id: string) => void;
  enter: (id: string) => void;
  leave: () => void;
  navigate: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/** 选中字按页分桶；内容没变的页复用上次的 Set（身份不变，memo 的页就不重渲染） */
function useSelectedByPage(selected: ReadonlySet<string>): Map<number, ReadonlySet<string>> {
  const prev = useRef<Map<number, ReadonlySet<string>>>(new Map());
  return useMemo(() => {
    const buckets = new Map<number, Set<string>>();
    selected.forEach((id) => {
      const page = parseInt(id.split(':')[0], 10);
      let set = buckets.get(page);
      if (!set) buckets.set(page, (set = new Set()));
      set.add(id);
    });
    const next = new Map<number, ReadonlySet<string>>();
    buckets.forEach((set, page) => {
      const old = prev.current.get(page);
      const same = old && old.size === set.size && Array.from(set).every((id) => old.has(id));
      next.set(page, same ? old! : set);
    });
    prev.current = next;
    return next;
  }, [selected]);
}

type ReflowPage = {
  page: number;
  paragraphs: {
    id: string;
    chars: { charData: PageWarpData['columns'][0]['chars'][0]; col: number; beforePuncts: PunctEntry[]; afterPuncts: PunctEntry[] }[];
  }[];
};

/** 一段的字逐个转繁简：整段转换后字数不变就按位取，否则（含多码点字、转换改了字数）退回逐字转换 */
export function convertChars(chars: string[], convert: (s: string) => string): string[] {
  const whole = Array.from(convert(chars.join('')));
  if (whole.length === chars.length && chars.every((c) => Array.from(c).length === 1)) return whole;
  return chars.map((c) => convert(c));
}

/** 一页正文。memo：翻页、悬停、选中别页的字都不会让它重渲染 */
const PageSection = React.memo(function PageSection({
  pGroup, first, pageBreaks, markOpts, plainBooks, selected, entityOfChar, entityLoader, convert, buildHref, handlers,
}: {
  pGroup: ReflowPage;
  first: boolean;
  pageBreaks: boolean;
  markOpts: MarkOpts | null;
  plainBooks: boolean;
  selected: ReadonlySet<string>;
  entityOfChar: Map<string, EntitySpan>;
  entityLoader: ReturnType<typeof useEntitySummaryLoader>;
  convert?: (s: string) => string;
  buildHref: (id: string) => string;
  handlers: PageHandlers;
}) {
  // 字 id → 显示字（繁简）。逐段整体转换以保住词组（髮／發 等），长度对不上才退回逐字
  const shown = useMemo(() => {
    const m = new Map<string, string>();
    if (!convert) return m;
    for (const para of pGroup.paragraphs) {
      const chars = convertChars(para.chars.map((c) => c.charData.char), convert);
      para.chars.forEach((c, i) => m.set(c.charData.id, chars[i]));
    }
    return m;
  }, [pGroup, convert]);
  const show = (ch: { id: string; char: string }) => shown.get(ch.id) ?? ch.char;
  // 外挂标点：按显示偏好改写（引号样式、隐去书名号）；改完为空的不出节点。没传偏好＝原样
  const punct = (p: PunctEntry) => {
    const mark = markOpts ? transformMark(p.mark, markOpts) : p.mark;
    return mark ? <span key={p.id} className="guji-text-punct" data-punct-id={p.id}>{mark}</span> : null;
  };
  return (
    <section
      data-page-section={pGroup.page}
      className="guji-page-section"
      style={{ position: 'relative', scrollMarginTop: 96 }}
    >
      {/* 页间分隔与页码标牌（首页若无前置内容可紧凑显示） */}
      {!first && pageBreaks && (
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
        <p key={para.id} className="guji-reflow-paragraph">
          {groupByEntity(para.chars, entityOfChar).map((run, ri) => {
            const nodes = run.chars.map(({ charData: ch, beforePuncts: allBefore, afterPuncts: allPuncts }, ci) => {
              // 专名线不画到首字前、末字后的标点上：实体首字的前置标点、末字的后置标点放到链接外面
              const isFirstOfEntity = !!run.entity && ci === 0;
              const isLastOfEntity = !!run.entity && ci === run.chars.length - 1;
              const beforePuncts = isFirstOfEntity ? [] : allBefore;
              const afterPuncts = isLastOfEntity ? [] : allPuncts;
              return (
                <React.Fragment key={ch.id}>
                  {beforePuncts.map(punct)}
                  <span
                    data-char-id={ch.id}
                    onClick={() => handlers.click(ch.id)}
                    onMouseEnter={() => handlers.enter(ch.id)}
                    onMouseLeave={handlers.leave}
                    className={`guji-text-char${selected.has(ch.id) ? ' is-selected' : ''}${ch.sub ? ' is-sub' : ''}`}
                  >
                    {show(ch)}
                  </span>
                  {/* 外挂注入标点 (不带 data-char-id，对底本坐标完全透明) */}
                  {afterPuncts.map(punct)}
                </React.Fragment>
              );
            });
            if (!run.entity) return <React.Fragment key={`r${ri}`}>{nodes}</React.Fragment>;
            const head = run.chars[0].beforePuncts.map(punct);
            const tail = run.chars[run.chars.length - 1].afterPuncts.map(punct);
            return (
              <React.Fragment key={`${run.entity.key}@${ri}`}>
                {head}
                <EntityMark
                  span={run.entity}
                  label={run.chars.map((c) => show(c.charData)).join('')}
                  hasBrackets
                  plain={plainBooks && run.entity.kind === 'work'}
                  loader={entityLoader}
                  buildHref={buildHref}
                  onNavigate={handlers.navigate}
                  renderText={() => nodes}
                  hoverDelayMs={250}
                />
                {tail}
              </React.Fragment>
            );
          })}
        </p>
      ))}
    </section>
  );
});

/** 指示头位置夹在允许范围内，保留三位小数（写进偏好的值不带浮点尾巴） */
function clampIndicatorY(y: number): number {
  const [lo, hi] = PAGE_INDICATOR_Y_RANGE;
  const v = Number.isFinite(y) ? y : 0.33;
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
}

const INDICATOR_KEY_STEP = 0.02;
const INDICATOR_SIZE = 16;

/**
 * 页指示头：固定在视口里、正文左缘外的小三角（▶），指向它所在的那一行。
 * 书影显示的页码以它所在的行为准。可拖（鼠标、触屏）、可聚焦后用上下键微调（Shift 大步）；
 * 不盖在正文上，也不挡正文的选字——只有三角本身接收指针。
 */
function PageIndicator({ y, containerRef, onDrag, onCommit }: {
  y: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onDrag: (y: number) => void;
  onCommit: (y: number) => void;
}) {
  const { t } = useI18n();
  const [left, setLeft] = useState(0);
  const dragging = useRef(false);
  const lastY = useRef(y);
  lastY.current = y;

  // 三角贴着正文栏的左缘；窗口改大小时重算
  const place = useCallback(() => {
    const view = containerRef.current?.querySelector<HTMLElement>('.guji-text-reflow-view');
    const rect = (view ?? containerRef.current)?.getBoundingClientRect();
    setLeft(Math.max(0, (rect?.left ?? 0) - INDICATOR_SIZE - 2));
  }, [containerRef]);
  useLayoutEffect(() => {
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  const fracOf = (clientY: number) => clampIndicatorY(clientY / Math.max(1, window.innerHeight));

  return (
    <div
      role="slider"
      tabIndex={0}
      className="guji-page-indicator"
      aria-label={t('reader.pageIndicator')}
      aria-orientation="vertical"
      aria-valuemin={Math.round(PAGE_INDICATOR_Y_RANGE[0] * 100)}
      aria-valuemax={Math.round(PAGE_INDICATOR_Y_RANGE[1] * 100)}
      aria-valuenow={Math.round(y * 100)}
      data-indicator-y={y}
      style={{
        position: 'fixed',
        left,
        top: `calc(${y * 100}vh - ${INDICATOR_SIZE / 2}px)`,
        width: INDICATOR_SIZE,
        height: INDICATOR_SIZE,
        zIndex: 20,
        cursor: 'ns-resize',
        touchAction: 'none', // 触屏上拖三角不滚页面
        background: bim('accent'),
        clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
        outline: 'none',
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 无指针捕获的环境照常 */ }
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const v = fracOf(e.clientY);
        lastY.current = v;
        onDrag(v);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        onCommit(fracOf(e.clientY));
      }}
      onPointerCancel={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onCommit(lastY.current);
      }}
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (!dir) return;
        e.preventDefault();
        onCommit(clampIndicatorY(y + dir * (e.shiftKey ? 5 : 1) * INDICATOR_KEY_STEP));
      }}
    />
  );
}
