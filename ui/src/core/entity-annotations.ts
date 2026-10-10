/**
 * 正文实体标注：entity.json 的读入适配 + 区间切分（overview#389 E1）。
 *
 * 组件（`components/EntityText`）只认本文件的 `EntitySpan`，不直接读 entity.json。
 * entity.json 的格式（A1，overview#385）定稿前，以 open-guji-cv
 * `open_guji_cv/render/entity_extract.py` 的 `build_entity_json()` 输出（guji-entity v0.1）为准：
 *
 * ```json
 * { "$schema": "https://open-guji.org/schema/entity/v0.1.json", "version": "0.1.0",
 *   "book_id": "...", "volume": 1,
 *   "entities": [{
 *     "id": "e0001", "type": "work" | "people" | "place" | "office" | "dynasty" | "other",
 *     "text": "史記",
 *     "anchor": { "start": "1:2:3", "end": "1:2:4" },
 *     "span": { "start_offset": 12, "end_offset": 14 },
 *     "target": { "status": "matched" | "new_candidate" | "external",
 *                 "entity_id": "...", "canonical_name": "...", "href": "book-index://Work/<id>" },
 *     "confidence": 0.9, "source": "llm:qwen-plus" }] }
 * ```
 *
 * `span` 是可选缓存（guji-format spec/05），`anchor` 才是权威定位：没有 `span` 的条目照收，只按 anchor 对位。
 * 注意 `span` 的偏移是**纯字**下标（底本去掉标点、空白、《》/ 标记后的字序，end 不含），
 * 不是带标点正文的下标——组件用 `offsets="plain"` 时会按 `isCountedChar` 换算。
 * A1 定稿后只改 `adaptEntityJson` / `isCountedChar` 这一层。
 */

/** 实体类别。`work` 画书名号（波浪线），其余画专名线（直线） */
export type EntityKind = 'work' | 'person' | 'place' | 'office' | 'dynasty' | 'reign' | 'other';

/** 组件使用的实体区间 */
export interface EntitySpan {
    /** 标注自身的 id（entity.json 里的 e0001 之类），用作 React key */
    key: string;
    kind: EntityKind;
    /**
     * 起点偏移（含）。规范里 `span` 只是可选缓存（guji-format spec/05）：条目没带 `span` 时为 undefined，
     * 这样的条目只能按 `anchor` 对位（`GujiTextViewer` 就是这么用的）；按偏移切分的 `segmentEntities`／`remapPlainOffsets` 会跳过它。
     */
    start?: number;
    /** 终点偏移（不含）；同 `start`，没带 `span` 时为 undefined */
    end?: number;
    /** 标注原文，用于校对偏移 */
    text?: string;
    /** 已对上的站内条目 id（base36）；没有表示未收录，只画线不链接 */
    targetId?: string;
    /** 条目规范名（卡片标题的后备） */
    canonicalName?: string;
    /** 置信度 0–1 */
    confidence?: number;
    /**
     * 逐字锚点（对读用）：起止字 id（含），格式 `<页>:<列>:<格>`。有它就不依赖 `start/end` 偏移，
     * 直接按字 id 对位到对读正文，不受标点、缺字、夹注影响。规范里它是必有的权威定位。
     */
    anchor?: { start: string; end: string };
}

const KIND_MAP: Record<string, EntityKind> = {
    work: 'work',
    book: 'work',
    people: 'person',
    person: 'person',
    place: 'place',
    office: 'office',
    dynasty: 'dynasty',
    reign: 'reign',
};

function toKind(raw: unknown): EntityKind {
    return (typeof raw === 'string' && KIND_MAP[raw]) || 'other';
}

/**
 * `book-index://Work/<id>`、`book-index://Entity/<id>`、`bid:\\<id>`、裸 id → 站内 id。
 * 认不出返回 null。
 */
export function bookIndexUriToId(uri: string | null | undefined): string | null {
    if (!uri) return null;
    const s = uri.trim();
    const m = /^book-index:\/\/(?:[A-Za-z]+\/)*([0-9A-Za-z]+)\/?$/.exec(s);
    if (m) return m[1];
    const bid = /^bid:\\{1,2}([0-9A-Za-z]+)$/.exec(s);
    if (bid) return bid[1];
    if (/^[0-9A-Za-z]+$/.test(s)) return s;
    return null;
}

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v ? v : undefined;
}

/** 有偏移的区间（按偏移切分用） */
type OffsetSpan = EntitySpan & { start: number; end: number };
const hasOffsets = (s: EntitySpan): s is OffsetSpan => s.start !== undefined && s.end !== undefined;

/**
 * entity.json（整份对象，或直接给 entities 数组）→ EntitySpan[]，按起点排序（无偏移的排在最后，保持文件内顺序）。
 * 定位二选一即收：`anchor` 起止格位都有（权威），或 `span` 偏移合法（缓存，无 anchor 时按偏移）。
 * 两者都没有、或只有不合法偏移的条目丢弃，不抛错。`span` 缺失不再丢整条（规范里它是可选缓存）；
 * 有 anchor 而 span 不合法时，丢偏移、留条目。
 */
export function adaptEntityJson(raw: unknown): EntitySpan[] {
    const list: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { entities?: unknown }).entities)
            ? (raw as { entities: unknown[] }).entities
            : [];
    const out: EntitySpan[] = [];
    list.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        const e = item as Record<string, unknown>;
        const span = (e.span ?? {}) as Record<string, unknown>;
        const target = (e.target ?? {}) as Record<string, unknown>;
        const start = num(span.start_offset) ?? num(e.start_offset);
        const end = num(span.end_offset) ?? num(e.end_offset);
        const offsetsOk = start !== undefined && end !== undefined && start >= 0 && end > start;
        const anchorRaw = (e.anchor ?? {}) as Record<string, unknown>;
        const aStart = str(anchorRaw.start);
        const aEnd = str(anchorRaw.end);
        const hasAnchor = !!(aStart && aEnd);
        if (!offsetsOk && !hasAnchor) return;
        const status = str(target.status);
        const targetId = status === undefined || status === 'matched'
            ? (bookIndexUriToId(str(target.entity_id)) ?? bookIndexUriToId(str(target.href)) ?? undefined)
            : undefined;
        out.push({
            ...(aStart && aEnd ? { anchor: { start: aStart, end: aEnd } } : {}),
            key: str(e.id) ?? `e${i}`,
            kind: toKind(e.type),
            ...(offsetsOk ? { start, end } : {}),
            text: str(e.text),
            targetId,
            canonicalName: str(target.canonical_name),
            confidence: num(e.confidence),
        });
    });
    // 有偏移的按起点排（同起点长的在前）；无偏移的（只有 anchor）排后面，数组排序稳定，保持文件内顺序
    return out.sort((a, b) => {
        if (!hasOffsets(a) || !hasOffsets(b)) return Number(!hasOffsets(a)) - Number(!hasOffsets(b));
        return a.start - b.start || b.end - a.end;
    });
}

/**
 * 纯字计数规则：与 entity_extract.py 剥离的字符集一致——空白、常用标点、《》/<> 不计数。
 */
const UNCOUNTED = new Set(Array.from('《》/<>\r\n\t 　，。、；：？！「」『』（）…—·'));
export function isCountedChar(ch: string): boolean {
    return !UNCOUNTED.has(ch);
}

/**
 * 纯字偏移 → 正文下标。`plainBase` 是本段正文第一个计数字在全卷纯字序里的位置
 * （正文只是整卷的一段时用）。落在本段以外的区间丢弃。
 */
export function remapPlainOffsets(text: string, spans: readonly EntitySpan[], plainBase = 0): EntitySpan[] {
    // pos[k] = 第 k 个计数字在 text 里的下标；末尾补 text.length 作终点哨兵
    const pos: number[] = [];
    const chars = Array.from(text);
    let u = 0;
    for (const ch of chars) {
        if (isCountedChar(ch)) pos.push(u);
        u += ch.length;
    }
    const out: EntitySpan[] = [];
    for (const s of spans) {
        if (!hasOffsets(s)) continue;
        const a = s.start - plainBase;
        const b = s.end - plainBase;
        if (a < 0 || b > pos.length || b <= a) continue;
        const lastIdx = pos[b - 1];
        const lastLen = text.codePointAt(lastIdx)! > 0xffff ? 2 : 1;
        out.push({ ...s, start: pos[a], end: lastIdx + lastLen });
    }
    return out;
}

/** 区间内（去掉不计数字符后）是否与标注原文一致 */
function matchesText(text: string, s: OffsetSpan): boolean {
    if (!s.text) return true;
    const got = Array.from(text.slice(s.start, s.end)).filter(isCountedChar).join('');
    return got === s.text;
}

/** 偏移对不上原文时，在附近找最近的一处原文；找不到返回 null */
function relocate(text: string, s: OffsetSpan, window: number): OffsetSpan | null {
    if (!s.text) return null;
    let best = -1;
    let from = Math.max(0, s.start - window);
    const limit = s.start + window;
    while (from <= limit) {
        const i = text.indexOf(s.text, from);
        if (i < 0 || i > limit) break;
        if (best < 0 || Math.abs(i - s.start) < Math.abs(best - s.start)) best = i;
        from = i + 1;
    }
    return best < 0 ? null : { ...s, start: best, end: best + s.text.length };
}

/** 切分后的一段：普通文字，或一个实体 */
export type EntitySegment =
    | { type: 'text'; text: string; start: number }
    | { type: 'entity'; text: string; start: number; span: EntitySpan };

/**
 * 正文 + 区间 → 顺序片段。
 * - 越界的区间截到正文范围内；
 * - 偏移与 `text` 字段对不上时在 ±`relocateWindow` 字内找原文，找不到丢弃；
 * - 区间重叠时保留先开始（同起点取更长）的，后面与之重叠的丢弃。
 */
export function segmentEntities(text: string, spans: readonly EntitySpan[], relocateWindow = 16): EntitySegment[] {
    const fixed: OffsetSpan[] = [];
    for (const raw of spans) {
        if (!hasOffsets(raw)) continue; // 只有 anchor 的条目无法按偏移切正文
        let s: OffsetSpan | null = { ...raw, start: Math.max(0, raw.start), end: Math.min(text.length, raw.end) };
        if (s.end <= s.start || !matchesText(text, s)) s = relocate(text, raw, relocateWindow);
        if (s) fixed.push(s);
    }
    fixed.sort((a, b) => a.start - b.start || b.end - a.end);

    const out: EntitySegment[] = [];
    let cursor = 0;
    for (const s of fixed) {
        if (s.start < cursor) continue;
        if (s.start > cursor) out.push({ type: 'text', text: text.slice(cursor, s.start), start: cursor });
        out.push({ type: 'entity', text: text.slice(s.start, s.end), start: s.start, span: s });
        cursor = s.end;
    }
    if (cursor < text.length) out.push({ type: 'text', text: text.slice(cursor), start: cursor });
    return out;
}

/** 专名号三档：关（不画）／精简（人名、地名、朝代）／完整（再加官职、年号、其它） */
export type ProperNameMode = 'off' | 'lite' | 'full';

const KINDS_BY_MODE: Record<ProperNameMode, readonly EntityKind[]> = {
    off: [],
    lite: ['person', 'place', 'dynasty'],
    full: ['person', 'place', 'dynasty', 'office', 'reign', 'other'],
};

/** 按专名号档位筛实体；书名（work）只看 showWorks（缺省 true），与档位无关。返回新数组，保持原顺序，不改入参。 */
export function filterEntitiesByMode(
    spans: readonly EntitySpan[],
    mode: ProperNameMode,
    opts?: { showWorks?: boolean },
): EntitySpan[] {
    const showWorks = opts?.showWorks !== false;
    const keep = new Set<EntityKind>(KINDS_BY_MODE[mode]);
    return spans.filter((s) => (s.kind === 'work' ? showWorks : keep.has(s.kind)));
}
