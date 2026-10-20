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
  /** point 点号与成对标号／break 分段符／heading 标题符（spec/04 v0.2 §4.2） */
  kind?: 'point' | 'break' | 'heading';
  pos?: 'after' | 'before';
  /** 只用于标题符：目录名 */
  label?: string;
  /** 只用于标题符：false＝正文排成标题但不进目录 */
  toc?: boolean;
}

export interface GujiTextViewerProps {
  pageData: PageWarpData;
  pages?: { page: number; label?: string; columns: PageWarpData['columns'] }[];
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
   * 要求把某字（格位 key，一般是标题首字）所在的段滚到视口顶部（点目录里的标题）；`nonce` 变了才触发。
   * 那个字还没渲染出来（换章、数据在路上）就等它出来再滚，每个 nonce 只滚一次。
   */
  scrollToAnchor?: { anchor: string; nonce: number } | null;
  /** 视口参考线所在的标题变了（标题首字的格位 key；参考线在第一个标题之上时为 null）。目录据此高亮当前标题 */
  onVisibleHeadingChange?: (anchor: string | null) => void;
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
  /** 已不再调用（0.60.0 起条目页一律在新标签页打开，不打断阅读）；保留只为兼容旧宿主 */
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
 * 分段符（kind=break）、标题符（kind=heading）不在此列，由调用方单独处理。
 */
export function splitPuncts(list: PunctEntry[]): { before: PunctEntry[]; after: PunctEntry[] } {
  const marks = list.filter((p) => p.kind == null || p.kind === 'point');
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
  scrollToAnchor,
  onVisibleHeadingChange,
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
  const reflow = useMemo(() => {
    // 若传入了全卷多页数据，则组织为多页流；否则使用单页数据
    const allPagesData: { page: number; label?: string; columns: (typeof pageData.columns) }[] =
      pages && pages.length > 0
        ? pages
        : [{ page: parseInt(pageData.page_id.split(':')[1] || '1', 10), columns: pageData.columns }];

    // 行首空格数有“本书常态”：四庫總目自校本几乎每列都有 lead_blank=2（版框上沿的留白），不是另起一段。
    // 全章有字列里出现最多的 lead_blank 是底线；比底线高（抬头、平抬）的列是敬称提行，不算段落版式（overview#527）。
    const leadCount = new Map<number, number>();
    for (const pData of allPagesData) for (const col of pData.columns) {
      if (col.chars.length > 0 && !col.raised) leadCount.set(col.lead_blank || 0, (leadCount.get(col.lead_blank || 0) || 0) + 1);
    }
    let baseLead = 0;
    let bestCount = -1;
    for (const [v, n] of leadCount) if (n > bestCount || (n === bestCount && v < baseLead)) { baseLead = v; bestCount = n; }
    const elevated = (col: { raised?: number; lead_blank?: number }) => !!col.raised || (col.lead_blank || 0) < baseLead;

    // 无字页（只有书影的书脊签、封面签条等）不进正文
    const built: ReflowPage[] = allPagesData.filter((pData) => pData.columns.some((c) => c.chars.length > 0)).map((pData) => {
      const sortedCols = [...pData.columns].sort((a, b) => a.col - b.col);
      const paragraphs: ReflowParagraph[] = [];
      let currentChars: ReflowChar[] = [];
      // 段首字带标题符的段是标题（spec/04 v0.2 §4.2：标题到下一个分段符为止）
      const pushPara = () => {
        const h = headingOf(punctMap.get(currentChars[0].charData.id));
        paragraphs.push({
          id: `para-p${pData.page}-${paragraphs.length}`,
          chars: currentChars,
          ...(h ? { heading: { level: h.mark.length, anchor: currentChars[0].charData.id, ...(h.toc === false ? { toc: false } : {}) } } : {}),
        });
        currentChars = [];
      };
      // 本页第一个字前有分段符或标题符：原件在这里另起一段，分叶线关时不与上一页末段相并
      let leadStarts = false;
      // 空列（kind: blank）没有字：记下个数，挂到后面第一个有字的列首字上；页尾的空列记在 trailingBlank
      let pendingBlank = 0;
      // 本页最后一个非提行列的行首空格数：下一页首列与它比，缩进相同就是同一段接着写
      let tailLead: number | undefined;

      for (const col of sortedCols) {
        if (col.chars.length === 0) {
          if (col.kind === 'blank') pendingBlank++;
          continue;
        }
        // 列的版式字段（抬头格数、行首空格数、前面的空列）挂在本列首字上；全缺省则不带
        const start: ReflowColStart | undefined = (col.raised || col.lead_blank || pendingBlank)
          ? { raised: col.raised, leadBlank: col.lead_blank, blankBefore: pendingBlank }
          : undefined;
        pendingBlank = 0;
        if (!elevated(col)) tailLead = col.lead_blank || 0;
        let first = true;
        for (const ch of col.chars) {
          // 大多数字不挂标点：共用空数组，不给 3 万个字各建三个数组（手机首帧，GUJI-628 P2）
          const here = punctMap.get(ch.id);
          const { before: beforePuncts, after: afterPuncts } = here ? splitPuncts(here) : NO_SPLIT;
          const hasBreak = !!here && here.some((p) => p.kind === 'break' && p.pos !== 'before');
          // 标题符：在本字之前结束上一段（分段符只锚段末字之后，pos=before 的不认）
          if (here && here.some((p) => p.kind === 'heading')) {
            if (currentChars.length > 0) pushPara();
            else if (paragraphs.length === 0) leadStarts = true;
          }

          currentChars.push({
            charData: ch,
            col: col.col,
            beforePuncts,
            afterPuncts,
            ...(first && start ? { start } : {}),
          });
          first = false;

          // 遇到自然段分段符 (guji-punct 中的 break 标记)
          if (hasBreak) pushPara();
        }
      }

      // 页尾剩下的字没有 break 收尾：句子可能跨页接着写（pageBreaks 关时与下一页首段合并，overview#527）
      const endsOpen = currentChars.length > 0;
      if (endsOpen) pushPara();

      return {
        page: pData.page,
        paragraphs,
        endsOpen,
        ...(tailLead !== undefined ? { tailLead } : {}),
        ...(leadStarts ? { leadStarts } : {}),
        ...(pData.label ? { label: pData.label } : {}),
        ...(pendingBlank > 0 ? { trailingBlank: pendingBlank } : {}),
      };
    });
    // 分叶分割线关＝连续阅读：页尾无 break 收尾的末段与下一页首段并成一段，句子跨页不断（overview#527）。
    // 字 id 不变；并入上一页 <section> 渲染的字记在 mergedOwner（选中集合要按渲染位置分桶），
    // 下一页的页锚点改指它的首字（leadFirstId）。下一页首字带抬头／行首空格／前置空列时是原件的另起一段，不并。
    const mergedOwner = new Map<string, number>();
    if (!pageBreaks) {
      // 下一页首列另起一段的版式：前有空列，或比上一页末尾正文列缩得更深（如进入低格的案语）。
      // 抬头／平抬是敬称提行，句子照常接着写，不算另起一段；缩进与上一页相同（总叙整段低一格）也照并。
      let open = null as { para: ReflowParagraph; owner: number; tailLead: number } | null;
      for (const pg of built) {
        const lead = pg.paragraphs[0];
        const s0 = lead?.chars[0]?.start;
        const s0Lead = s0?.leadBlank || 0;
        const indentStarts = !!s0 && !s0.raised && s0Lead >= baseLead && s0Lead > (open?.tailLead ?? baseLead);
        const startsParagraph = !!pg.leadStarts || !!s0?.blankBefore || indentStarts;
        const wouldOrphanBlank = pg.paragraphs.length === 1 && !!pg.trailingBlank;
        if (open && lead && !startsParagraph && !wouldOrphanBlank) {
          for (const c of lead.chars) mergedOwner.set(c.charData.id, open.owner);
          open.para.chars = open.para.chars.concat(lead.chars);
          pg.leadFirstId = lead.chars[0].charData.id;
          pg.paragraphs = pg.paragraphs.slice(1);
        }
        if (pg.endsOpen && !pg.trailingBlank) {
          const last = pg.paragraphs[pg.paragraphs.length - 1];
          if (last) open = { para: last, owner: pg.page, tailLead: pg.tailLead ?? open?.tailLead ?? baseLead };
          // 整页都并走了（pg 没有段）：敞口仍在上一页那一段上，只更新末尾缩进
          else if (open && pg.tailLead !== undefined) open.tailLead = pg.tailLead;
        } else {
          open = null;
        }
      }
    }
    // 首段并进上一页的页：它的首字 id → 页号（渲染时给那个字标 data-page-start，页锚点一次 querySelectorAll 就能取齐）
    const pageStarts = new Map<string, number>();
    for (const pg of built) if (pg.leadFirstId) pageStarts.set(pg.leadFirstId, pg.page);
    return { pages: built, mergedOwner, pageStarts };
  }, [pages, pageData, punctMap, pageBreaks]);
  const reflowPages = reflow.pages;
  const reflowRef = useRef(reflowPages);
  reflowRef.current = reflowPages;

  // ── 分批渲染（GUJI-632）──
  // 一章动辄 3 万字、近 200 页：一次全挂上，手机上主线程一卡近 10 秒。先渲染开头约 FIRST_BATCH_CHARS 字，
  // 其余在空闲时每批约 BATCH_CHARS 字往后补；要跳到还没渲染的页（锚点、书影翻页、点书影的字）就先补到那一页。
  // 字数不到首批的章（单测样例、短章）一次渲染完，与改前一致。
  const pageCharCounts = useMemo(
    () => reflowPages.map((pg) => pg.paragraphs.reduce((n, para) => n + para.chars.length, 0)),
    [reflowPages],
  );
  const pagesWithin = useCallback((from: number, budget: number) => {
    let i = from, sum = 0;
    while (i < pageCharCounts.length && (i === from || sum + pageCharCounts[i] <= budget)) sum += pageCharCounts[i++];
    return i;
  }, [pageCharCounts]);
  // 同一章（首字与页数相同）宿主重取数据、换标点显隐、分叶线开关时不回到首批，已渲染的页数照旧
  const chapterSig = `${reflowPages.length}:${reflowPages[0]?.paragraphs[0]?.chars[0]?.charData.id ?? ''}`;
  const [batch, setBatch] = useState(() => ({ sig: chapterSig, n: pagesWithin(0, FIRST_BATCH_CHARS) }));
  let shownCount = batch.n;
  if (batch.sig !== chapterSig) {
    shownCount = pagesWithin(0, FIRST_BATCH_CHARS);
    setBatch({ sig: chapterSig, n: shownCount });
  }
  shownCount = Math.min(shownCount, reflowPages.length);
  const allShown = shownCount >= reflowPages.length;
  useEffect(() => {
    if (allShown) return;
    const idle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
      if (w.requestIdleCallback) { const h = w.requestIdleCallback(cb, { timeout: 300 }); return () => w.cancelIdleCallback?.(h); }
      const t = setTimeout(cb, 16);
      return () => clearTimeout(t);
    };
    return idle(() => setBatch((b) => (b.sig === chapterSig ? { sig: b.sig, n: Math.max(b.n, pagesWithin(b.n, BATCH_CHARS)) } : b)));
  }, [allShown, shownCount, chapterSig, pagesWithin]);
  /** 让第 page 页（扫描页号）及其后一页进入渲染；已在渲染范围内就什么也不做 */
  const ensurePageShown = useCallback((page: number) => {
    const idx = reflowRef.current.findIndex((pg) => pg.page >= page);
    const need = (idx < 0 ? reflowRef.current.length : idx) + 2;
    setBatch((b) => (b.n >= need ? b : { ...b, n: need }));
  }, []);
  const shownPages = allShown ? reflowPages : reflowPages.slice(0, shownCount);

  // 每页的占位高度估计（content-visibility: auto 的 contain-intrinsic-size）：屏幕外的页不排版、不绘制，
  // 滚过一次后浏览器记住真实高度（auto）。每页只带自己的字数、段数（不变的 CSS 变量），每行字数与行高挂在容器的
  // CSS 变量上，由 calc() 折算——量到行宽后改容器变量即可，不重渲染任何一页。
  // 量在浏览器画完这一帧之后：挂载当下读 clientWidth 会强制同步排版刚提交的整批正文（首帧多出近 100ms，GUJI-632）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        const c = containerRef.current;
        const para = c?.querySelector<HTMLElement>('.guji-reflow-paragraph');
        if (!c || !para) return;
        const cs = getComputedStyle(para);
        const fs = parseFloat(cs.fontSize);
        const w = para.clientWidth;
        if (!(fs > 0) || !(w > 0)) return;
        const lh = parseFloat(cs.lineHeight);
        c.style.setProperty('--gtv-cpl', String(Math.max(8, Math.floor(w / fs))));
        c.style.setProperty('--gtv-lh', `${Math.round(lh > 0 ? lh : fs * 2)}px`);
      }, 0);
    });
    return () => { cancelAnimationFrame(raf); if (timer) clearTimeout(timer); };
  }, [chapterSig]);

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
  const latest = useRef({ onCharClick, onCharHover, onSelectionChange, onVisiblePageChange, onEntityNavigate, onVisibleHeadingChange });
  latest.current = { onCharClick, onCharHover, onSelectionChange, onVisiblePageChange, onEntityNavigate, onVisibleHeadingChange };

  const handlers = useMemo<PageHandlers>(() => ({
    click: (id) => { pageLockUntil.current = Date.now() + 1200; latest.current.onCharClick?.(id); },
    enter: (id) => latest.current.onCharHover?.(id),
    leave: () => latest.current.onCharHover?.(null),
    // 点专名里的字＝照常点字（高亮书影），不跳条目。条目页一律在新标签页打开，不打断阅读：
    // Ctrl／⌘／Shift 点击交给浏览器（新标签／新窗口），键盘回车自己开新标签页
    navigate: (id, e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      if (e.detail === 0) window.open(e.currentTarget.href, '_blank', 'noopener');
    },
  }), []);

  // 每页只收到落在本页的选中字；没变的页拿到同一个 Set，memo 才挡得住
  const selectedByPage = useSelectedByPage(selectedCharIds, reflow.mergedOwner);

  // 字 id → 元素：悬停、点书影定位都要按 id 找字，不再每次在 3 万个节点里 querySelector（GUJI-630）。
  // 懒建；查不到或元素已脱离文档（换章、重排）就重建一次，同一份排版只重建一次
  // 已渲染的页数也算进「同一份排版」：分批渲染每补一批，DOM 里就多出一批字
  const shownRef = useRef(shownCount);
  shownRef.current = shownCount;
  const charEls = useRef<{ for: unknown; n: number; map: Map<string, HTMLElement> } | null>(null);
  const charEl = useCallback((id: string): HTMLElement | null => {
    const cached = charEls.current;
    const hit = cached?.map.get(id);
    if (hit && hit.isConnected) return hit;
    if (cached && cached.for === reflowRef.current && cached.n === shownRef.current && !hit) return null;
    const c = containerRef.current;
    if (!c) return null;
    const map = new Map<string, HTMLElement>();
    c.querySelectorAll<HTMLElement>('span[data-char-id]').forEach((el) => { map.set(el.getAttribute('data-char-id')!, el); });
    charEls.current = { for: reflowRef.current, n: shownRef.current, map };
    return map.get(id) ?? null;
  }, []);

  // 悬停（含从书影那边反过来悬停）：直接改那一个字的 class，不经 React 重渲染
  const hoverEl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    hoverEl.current?.classList.remove('is-hovered');
    hoverEl.current = null;
    if (!hoveredCharId) return;
    const el = charEl(hoveredCharId);
    if (el) { el.classList.add('is-hovered'); hoverEl.current = el; }
  }, [hoveredCharId, charEl]);

  // 字的点击、悬停委托在正文容器上：不给 3 万个字各挂三个回调（GUJI-630）
  const hoverId = useRef<string | null>(null);
  const charIdAt = (target: EventTarget | null): string | null => {
    const el = target instanceof Element ? target.closest('span[data-char-id]') : null;
    return el && containerRef.current?.contains(el) ? el.getAttribute('data-char-id') : null;
  };
  const onContainerClick = (e: React.MouseEvent) => {
    const id = charIdAt(e.target);
    if (id) handlers.click(id);
  };
  const onContainerOver = (e: React.MouseEvent) => {
    const id = charIdAt(e.target);
    if (id === hoverId.current) return;
    hoverId.current = id;
    if (id) handlers.enter(id);
    else handlers.leave();
  };
  const onContainerLeave = () => {
    if (hoverId.current === null) return;
    hoverId.current = null;
    handlers.leave();
  };

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
      // 探针点用字的文本节点起点 (text,0)，不能用 (span,0)：浏览器拖选的端点落在文本节点里，
      // (span,0) 在树序上早于 (text,0)，会让选区起点所在的首字被判成「在选区之前」而漏掉（overview#528）。
      const probe = (el: HTMLElement): Node => el.firstChild ?? el;
      // 第一个起点不早于选区起点的字
      let lo = 0, hi = spans.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (range.comparePoint(probe(spans[m]), 0) < 0) lo = m + 1; else hi = m; }
      const first = lo;
      // 最后一个起点不晚于选区终点的字
      hi = spans.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (range.comparePoint(probe(spans[m]), 0) <= 0) lo = m + 1; else hi = m; }
      let last = lo - 1;
      // 终点恰在某字 (text,0)＝该字一个笔画都没选上，不算
      if (last >= first && range.endOffset === 0 && range.endContainer === probe(spans[last])) last--;
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

  // 3. 点击底本书影时，自动平滑滚动对应文字到可见区（字所在页还没渲染就先补到那一页，渲染出来再滚，每次选中只滚一次）
  const selScrolled = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (selectedCharIds.size !== 1 || selScrolled.current === selectedCharIds) return;
    const firstId = Array.from(selectedCharIds)[0];
    const el = charEl(firstId);
    if (el) {
      selScrolled.current = selectedCharIds;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } else {
      const page = parseInt(firstId.split(':')[0], 10);
      if (!isNaN(page)) ensurePageShown(page);
    }
  }, [selectedCharIds, shownCount, charEl, ensurePageShown]);

  /** 页的位置锚点：一般是该页的 <section>；首段并入了上一页（分叶线关）时是该页的第一个字 */
  const pageAnchor = (page: number): HTMLElement | null => {
    const c = containerRef.current;
    if (!c) return null;
    const lead = reflowPages.find((pg) => pg.page === page)?.leadFirstId;
    if (lead) return c.querySelector<HTMLElement>(`span[data-char-id="${lead}"]`);
    return c.querySelector<HTMLElement>(`[data-page-section="${page}"]`);
  };

  // 书影翻页 → 正文滚到该页开头。锁住滚动联动，免得滚动途中被上一页抢回书影页
  const scrollNonce = scrollToPage?.nonce;
  const pageScrollDone = useRef<number | null>(null);
  useEffect(() => {
    if (!scrollToPage || pageScrollDone.current === scrollToPage.nonce) return;
    const el = pageAnchor(scrollToPage.page);
    if (!el) {
      // 那一页还没渲染（分批渲染）：先补到那一页，下一轮再滚；本章根本没有这一页时什么也不做
      if (!allShown && reflowPages.some((pg) => pg.page >= scrollToPage.page)) ensurePageShown(scrollToPage.page);
      return;
    }
    pageScrollDone.current = scrollToPage.nonce;
    pageLockUntil.current = Date.now() + 800;
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollNonce, shownCount]);

  // 目录点标题 → 正文滚到该段开头，书影跟到该页。字还没渲染出来就等下一次（换章时数据后到）
  const anchorDone = useRef<number | null>(null);
  useEffect(() => {
    if (!scrollToAnchor || anchorDone.current === scrollToAnchor.nonce) return;
    const c = containerRef.current;
    const ch = c?.querySelector<HTMLElement>(`span[data-char-id="${cssEscape(scrollToAnchor.anchor)}"]`);
    if (!ch) {
      const page = parseInt(scrollToAnchor.anchor.split(':')[0], 10);
      if (!allShown && !isNaN(page)) ensurePageShown(page);
      return;
    }
    anchorDone.current = scrollToAnchor.nonce;
    const block = ch.closest<HTMLElement>('.guji-reflow-paragraph') ?? ch;
    pageLockUntil.current = Date.now() + 800;
    block.scrollIntoView({ behavior: 'auto', block: 'start' });
    const page = parseInt(scrollToAnchor.anchor.split(':')[0], 10);
    if (!isNaN(page)) latest.current.onVisiblePageChange?.(page);
  }, [scrollToAnchor, reflowPages, shownCount, allShown, ensurePageShown]);

  // 页指示头：位置（视口高度比例）。拖动中用本地值，松手才通知宿主写偏好
  const hasVisibleCb = !!onVisiblePageChange || !!onVisibleHeadingChange;
  const indicatorOn = !!onVisiblePageChange && typeof pageIndicatorY === 'number';
  const [dragY, setDragY] = useState<number | null>(null);
  const effectiveY = clampIndicatorY(dragY ?? pageIndicatorY ?? 0);
  const refYRef = useRef<number | null>(null); // 当前参考线所在的视口高度比例；null＝旧行为（顶部以下 120px）
  refYRef.current = indicatorOn ? effectiveY : null;
  const updatePageRef = useRef<() => void>(() => {});

  // 4. 滚动监听：侦测视口参考线（指示头所在行，缺省顶部以下 120px）所在的页并通知外层。
  //    rAF 节流＋对已排好序的页做二分，每帧只读十来个页的位置
  useEffect(() => {
    if (!hasVisibleCb) return;
    // 页框（每页的 <section>）与「首段并进上一页」的页的首字，一次取齐：逐页 querySelector 是「页数 × DOM 大小」，
    // 分批渲染每补一批都要重来一遍（GUJI-632）
    const sectionEls = new Map<string, HTMLElement>();
    const startEls = new Map<string, HTMLElement>();
    containerRef.current?.querySelectorAll<HTMLElement>('[data-page-section],[data-page-start]').forEach((el) => {
      const sec = el.getAttribute('data-page-section');
      if (sec !== null) sectionEls.set(sec, el);
      else startEls.set(el.getAttribute('data-page-start')!, el);
    });
    const boxes: HTMLElement[] = [];
    const boxPages: number[] = [];
    for (const pg of shownPages) {
      const box = sectionEls.get(String(pg.page));
      if (box) { boxes.push(box); boxPages.push(pg.page); }
    }
    if (boxes.length === 0) return;
    // 标题段按所在页框分组（文档序）
    const boxIndex = new Map(boxes.map((b, i) => [b, i] as const));
    const headingsBy: HTMLElement[][] = boxes.map(() => []);
    let headingCount = 0;
    containerRef.current?.querySelectorAll<HTMLElement>('.guji-reflow-heading:not([data-heading-toc="0"])').forEach((h) => {
      const i = boxIndex.get(h.closest<HTMLElement>('[data-page-section]')!);
      if (i !== undefined) { headingsBy[i].push(h); headingCount++; }
    });
    let lastHeading: string | null | undefined;
    let raf = 0;
    // 屏幕外页框里的内容被跳过排版（content-visibility: auto），读里面元素（标题、并页首字）的位置会强制当场排版那一页，
    // 一次滚动帧读十来个就是几十毫秒。所以二分只读页框外框；精确判断只在参考线所在的页框里做——它就在视口里，本来就排好了
    const update = () => {
      raf = 0;
      if (Date.now() < pageLockUntil.current) return;
      const top = (el: HTMLElement) => el.getBoundingClientRect().top;
      // 没有布局（容器被隐藏、display:none、jsdom）时所有位置都是 0，二分会选中最后一页，把读者甩到末页；
      // 首尾两页框位置相同＝没有可用的位置信息，这一帧不判
      if (boxes.length > 1 && top(boxes[0]) === top(boxes[boxes.length - 1])) return;
      const y = refYRef.current === null ? 120 : refYRef.current * window.innerHeight;
      // 参考线所在的页框：最后一个顶边不低于参考线的（页是自上而下排的）
      let lo = 0, hi = boxes.length - 1;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (top(boxes[m]) <= y) lo = m; else hi = m - 1;
      }
      const aboveAll = top(boxes[0]) > y;
      // 后面几页的首段并进了这个页框（分叶线关）：它们的首字已过参考线，就算到那一页
      let page = boxPages[lo];
      for (let j = lo + 1; j < boxes.length; j++) {
        const st = startEls.get(String(boxPages[j]));
        if (!st || !boxes[lo].contains(st) || top(st) > y) break;
        page = boxPages[j];
      }
      if (headingCount > 0 && latest.current.onVisibleHeadingChange) {
        // 参考线所在的标题＝最后一个顶边不低于参考线的标题：先看本页框，没有就是前面最近一个页框的最后一个标题
        let found: HTMLElement | null = null;
        if (!aboveAll) {
          const here = headingsBy[lo];
          for (let k = here.length - 1; k >= 0 && !found; k--) if (top(here[k]) <= y) found = here[k];
          for (let i = lo - 1; i >= 0 && !found; i--) if (headingsBy[i].length > 0) found = headingsBy[i][headingsBy[i].length - 1];
        }
        const a = found ? headingAnchorOf(found) : null;
        if (a !== lastHeading) { lastHeading = a; latest.current.onVisibleHeadingChange(a); }
      }
      latest.current.onVisiblePageChange?.(page);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    updatePageRef.current = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    // 留到下一帧再判：当场读位置会强制同步排版刚提交的那批正文（换章时是整个首批，近 50ms，GUJI-632）。
    // 起始书影页已按「第一个有字的页」定好，晚一帧判不影响显示
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); updatePageRef.current = () => {}; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVisibleCb, reflowPages, shownCount]);
  // 指示头挪动（拖动、键盘、偏好变了）：不等滚动，立刻按新参考线重判一次页
  useEffect(() => { if (indicatorOn) updatePageRef.current(); }, [indicatorOn, effectiveY]);

  return (
    <div
      ref={containerRef}
      className="guji-text-pane-content"
      onClick={onContainerClick}
      onMouseOver={onContainerOver}
      onMouseLeave={onContainerLeave}
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
        {shownPages.map((pGroup, idx) => (
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
            charCount={pageCharCounts[idx] ?? 0}
            pageStarts={reflow.pageStarts}
          />
        ))}
      </div>
    </div>
  );
};

/** 分批渲染：首批与之后每批大约多少字（GUJI-632）。首批要盖住第一屏（手机上约 4 屏）；每批在 CPU 降速 4–6 倍下约 0.3 秒 */
const FIRST_BATCH_CHARS = 1800;
const BATCH_CHARS = 800;

/**
 * 一页的占位高度（contain-intrinsic-size）：字数 ÷ 每行字数 ＝ 行数，每段末行与段距约 1.4 行，加分叶线 64px。
 * 本页字数（--gtv-pc）、段数（--gtv-pp）写在 section 上，每行字数（--gtv-cpl）与行高（--gtv-lh）写在正文容器上（量到前用缺省）
 */
const INTRINSIC_SIZE = 'auto calc((var(--gtv-pc) / var(--gtv-cpl, 30) + var(--gtv-pp) * 1.4) * var(--gtv-lh, 44px) + 64px)';

const NO_SELECTION: ReadonlySet<string> = new Set();
const NO_PUNCT: PunctEntry[] = [];
const NO_SPLIT: { before: PunctEntry[]; after: PunctEntry[] } = { before: NO_PUNCT, after: NO_PUNCT };

interface PageHandlers {
  click: (id: string) => void;
  enter: (id: string) => void;
  leave: () => void;
  navigate: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/** 选中字按页分桶；内容没变的页复用上次的 Set（身份不变，memo 的页就不重渲染） */
function useSelectedByPage(selected: ReadonlySet<string>, mergedOwner: ReadonlyMap<string, number>): Map<number, ReadonlySet<string>> {
  const prev = useRef<Map<number, ReadonlySet<string>>>(new Map());
  return useMemo(() => {
    const buckets = new Map<number, Set<string>>();
    selected.forEach((id) => {
      const page = mergedOwner.get(id) ?? parseInt(id.split(':')[0], 10); // 并进上一页段里的字按渲染位置分桶
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
  }, [selected, mergedOwner]);
}

/** 列的版式字段，挂在本列首字上（spec/02 §4.3） */
type ReflowColStart = { raised?: number; leadBlank?: number; blankBefore: number };
type ReflowChar = { charData: PageWarpData['columns'][0]['chars'][0]; col: number; beforePuncts: PunctEntry[]; afterPuncts: PunctEntry[]; start?: ReflowColStart };
/** `heading`：本段是标题（段首字带标题符），`level` 是 `#` 的个数，`anchor` 是段首字的格位 key */
type ReflowParagraph = { id: string; chars: ReflowChar[]; heading?: ReflowHeading };
/** `toc: false`＝副题行：排成标题，但不进目录、不参与「当前标题」 */
type ReflowHeading = { level: number; anchor: string; toc?: false };
type ReflowPage = {
  page: number;
  /** 版心叶次；有则页码处优先显示 */
  label?: string;
  paragraphs: ReflowParagraph[];
  /** 页尾的空列数 */
  trailingBlank?: number;
  /** 页尾剩下的字没有 break 收尾（句子可能跨页） */
  endsOpen?: boolean;
  /** 本页首段已并入上一页时，本页第一个字的 id（页锚点用它，不用 <section>） */
  leadFirstId?: string;
  /** 本页最后一个非提行（非抬头、非平抬）列的行首空格数 */
  tailLead?: number;
  /** 本页第一个字前有分段符（pos=before）或标题符：原件在此另起一段，分叶线关时也不并入上一页末段 */
  leadStarts?: boolean;
};

/** 一个字上的标题符（spec/04 v0.2 §4.2）；没有返回 undefined */
function headingOf(list: PunctEntry[] | undefined): PunctEntry | undefined {
  return list?.find((p) => p.kind === 'heading' && /^#{1,6}$/.test(p.mark));
}

/** 标题段元素 → 标题首字的格位 key */
function headingAnchorOf(el: HTMLElement): string | null {
  return el.getAttribute('data-heading-anchor');
}

/** 格位 key 放进属性选择器（key 只含数字、冒号、负号、a／b，仍按 CSS 规则转义以防万一） */
function cssEscape(v: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&');
}

/** 空列：一格宽的空位（不占文本，复制不出字符） */
function BlankCols({ n }: { n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <span key={i} className="guji-text-blank-col" aria-hidden="true" data-blank-col="" />)}</>;
}

/** 一段的字逐个转繁简：整段转换后字数不变就按位取，否则（含多码点字、转换改了字数）退回逐字转换 */
export function convertChars(chars: string[], convert: (s: string) => string): string[] {
  const whole = Array.from(convert(chars.join('')));
  if (whole.length === chars.length && chars.every((c) => Array.from(c).length === 1)) return whole;
  return chars.map((c) => convert(c));
}

/** 一段：普通段是 <p>；标题段是 <h2>～<h6>（第 1 级标题用 h2，h1 留给章名） */
function ReflowBlock({ heading, children }: { heading?: ReflowHeading; children: React.ReactNode }) {
  if (!heading) return <p className="guji-reflow-paragraph">{children}</p>;
  const Tag = `h${Math.min(6, heading.level + 1)}` as 'h2';
  return (
    <Tag
      className={`guji-reflow-paragraph guji-reflow-heading guji-reflow-h${heading.level}`}
      data-heading-anchor={heading.anchor}
      data-heading-level={heading.level}
      data-heading-toc={heading.toc === false ? '0' : undefined}
    >
      {children}
    </Tag>
  );
}

/** 一页正文。memo：翻页、悬停、选中别页的字都不会让它重渲染 */
const PageSection = React.memo(function PageSection({
  pGroup, first, pageBreaks, markOpts, plainBooks, selected, entityOfChar, entityLoader, convert, buildHref, handlers, charCount, pageStarts,
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
  /** 本页字数（占位高度估计用） */
  charCount: number;
  /** 首段并进上一页的页：首字 id → 页号 */
  pageStarts: ReadonlyMap<string, number>;
}) {
  // 字 id → 显示字（繁简）。逐段整体转换以保住词组（髮／發 等），长度对不上才退回逐字
  const shown = useMemo(() => {
    const m = new Map<string, string>();
    if (!convert) return m;
    for (const para of pGroup.paragraphs) {
      // 规范层（overview#525）：有 convert（通行繁體／簡體档）时，该位有人审过的 norm 就先用它代替原字，再整段转换；
      // 没有 convert＝原字档，忽略 norm。该位没有 norm 条目时与改前完全一致（照旧走 convert 里的全局异体字表）
      const chars = convertChars(para.chars.map((c) => c.charData.norm ?? c.charData.char), convert);
      para.chars.forEach((c, i) => m.set(c.charData.id, chars[i]));
    }
    return m;
  }, [pGroup, convert]);
  const show = (ch: { id: string; char: string }) => shown.get(ch.id) ?? ch.char;
  const { t } = useI18n();
  // 外挂标点：按显示偏好改写（引号样式、隐去书名号）；改完为空的不出节点。没传偏好＝原样
  const punct = (p: PunctEntry) => {
    const mark = markOpts ? transformMark(p.mark, markOpts) : p.mark;
    return mark ? <span key={p.id} className="guji-text-punct" data-punct-id={p.id}>{mark}</span> : null;
  };
  return (
    <section
      data-page-section={pGroup.page}
      className="guji-page-section"
      style={{
        position: 'relative', scrollMarginTop: 96, contentVisibility: 'auto', containIntrinsicSize: INTRINSIC_SIZE,
        ['--gtv-pc' as string]: charCount, ['--gtv-pp' as string]: pGroup.paragraphs.length,
      } as React.CSSProperties}
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
          {/* 版心叶次（label）优先；没有再用扫描页号 */}
          <span
            style={{ padding: '0 12px', fontWeight: 500 }}
            data-page-label={pGroup.label}
            title={pGroup.label ? `${pGroup.page}` : undefined}
          >第 {pGroup.label ?? pGroup.page} 葉</span>
          <div style={{ flex: 1, height: '1px', background: bim('rule') }} />
        </div>
      )}

      {pGroup.paragraphs.map((para, pi) => (
        <ReflowBlock key={para.id} heading={para.heading}>
          {groupByEntity(para.chars, entityOfChar).map((run, ri) => {
            const nodes = run.chars.map(({ charData: ch, beforePuncts: allBefore, afterPuncts: allPuncts, start }, ci) => {
              // 专名线不画到首字前、末字后的标点上：实体首字的前置标点、末字的后置标点放到链接外面
              const isFirstOfEntity = !!run.entity && ci === 0;
              const isLastOfEntity = !!run.entity && ci === run.chars.length - 1;
              const beforePuncts = isFirstOfEntity ? [] : allBefore;
              const afterPuncts = isLastOfEntity ? [] : allPuncts;
              return (
                <React.Fragment key={ch.id}>
                  {start && start.blankBefore > 0 && <BlankCols n={start.blankBefore} />}
                  {beforePuncts.map(punct)}
                  <span
                    data-char-id={ch.id}
                    data-page-start={pageStarts.get(ch.id)}
                    className={`guji-text-char${selected.has(ch.id) ? ' is-selected' : ''}${ch.sub ? ' is-sub' : ''}${ch.lane === 'solo' ? ' is-solo' : ''}${ch.lacuna ? ' is-lacuna' : ''}${ch.lacuna && ch.guess_c ? ' has-guess' : ''}${ch.guess ? ' is-guess' : ''}${ch.zi ? ' is-zi' : ''}${start?.raised ? ' is-raised' : ''}`}
                    data-raised={start?.raised || undefined}
                    data-guji-guess={ch.lacuna && ch.guess_c ? ch.guess_c : undefined}
                    title={ch.lacuna ? (ch.guess_c ? t('reader.lacunaGuess', { guess: convert ? convert(ch.guess_c) : ch.guess_c }) : t('detail.lacuna')) : ch.zi ? t('detail.composedChar', { label: ch.zi }) : ch.guess ? t('reader.charGuess') : undefined}
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
                  cardNewTab
                  renderText={() => nodes}
                  hoverDelayMs={250}
                />
                {tail}
              </React.Fragment>
            );
          })}
          {pi === pGroup.paragraphs.length - 1 && pGroup.trailingBlank ? <BlankCols n={pGroup.trailingBlank} /> : null}
        </ReflowBlock>
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
/** 箭头与正文框左缘的间距 */
const INDICATOR_GAP = 4;

/**
 * 页指示头：固定在视口里、正文框左缘外的细线箭头（→），指向它所在的那一行。
 * 书影显示的页码以它所在的行为准。可拖（鼠标、触屏）、可聚焦后用上下键微调（Shift 大步）；
 * 不盖在正文上，也不挡正文的选字——只有箭头本身接收指针。
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
  const selfRef = useRef<HTMLDivElement>(null);
  const lastY = useRef(y);
  lastY.current = y;

  // 箭头放在正文框（阅读器的 .bim-rd-col；单独用时是本组件外框）外面、紧贴左缘。
  // 书影栏晚一拍才展开、正文框随之右移，所以不只在挂载时量：正文框尺寸一变（ResizeObserver）和窗口改大小都重算
  const place = useCallback(() => {
    // 从箭头自己的节点往上找：子组件的 layout effect 跑在父组件 ref 挂上之前，挂载时 containerRef 还是 null
    // （旧版因此总量到 0，箭头一直贴在视口最左边）
    const c = selfRef.current?.parentElement ?? containerRef.current;
    const box = c?.closest<HTMLElement>('.bim-rd-col') ?? c;
    const rect = box?.getBoundingClientRect();
    setLeft(Math.max(0, (rect?.left ?? 0) - INDICATOR_SIZE - INDICATOR_GAP));
  }, [containerRef]);
  useLayoutEffect(() => {
    window.addEventListener('resize', place);
    const c = selfRef.current?.parentElement ?? containerRef.current;
    const box = c?.closest<HTMLElement>('.bim-rd-col') ?? c;
    // 书影栏展开时正文框可能只挪位置、不变大小：看正文栏（.bim-rd-text，宽度会变）而不只看正文框
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place()) : null;
    for (const el of [box, c?.closest<HTMLElement>('.bim-rd-text'), c?.closest<HTMLElement>('.bim-rd-body')]) if (el) ro?.observe(el);
    // 挂载时不当场量：layout effect 里读位置会在首帧前强制排版刚挂上的整批正文（手机 6× 降速约 280ms）。
    // ResizeObserver 开始观察后，在浏览器排完这一帧、绘制之前会回调一次，那时量不额外排版，也不闪；没有它才当场量
    if (!ro) place();
    return () => { window.removeEventListener('resize', place); ro?.disconnect(); };
  }, [place, containerRef]);

  const fracOf = (clientY: number) => clampIndicatorY(clientY / Math.max(1, window.innerHeight));

  return (
    <div
      ref={selfRef}
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
        touchAction: 'none', // 触屏上拖箭头不滚页面
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: bim('meta-fg'),
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
    >
      {/* 细线箭头 →：指向「书影所示的这一行」；颜色取说明文字的淡色，悬停、聚焦时加深（见 reader-css） */}
      <svg width={INDICATOR_SIZE} height={INDICATOR_SIZE} viewBox="0 0 16 16" aria-hidden="true" focusable="false"
        fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8h11M9 4l4 4-4 4" />
      </svg>
    </div>
  );
}
