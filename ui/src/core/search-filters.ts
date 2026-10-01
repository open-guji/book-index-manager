/**
 * 搜索页 v4 的筛选（overview#298）：朝代、部类、资源、存佚四组。
 *
 * 筛选状态是一个结构化对象（`SearchFilters`），三处用它：
 *   - 页面 URL（`filtersToParams` / `filtersFromParams`：可分享、可后退）；
 *   - 存储层（web 的 Meili 代理）——`buildMeiliFilter` 把它拼成代理认的受限 filter 串；
 *   - 结果栏的「已选」小标签。
 * 库本身不发请求；只有 transport 实现了对应参数才会生效（其余 storage 忽略）。
 *
 * 数据口径：朝代取 `dynasty`（撰人朝代）、部类取 `classification`（四部一级）、存佚取 `loss_status`，
 * 值都是繁体（索引里就是繁体：「經部」「西漢」），所以这里的值写繁体，界面显示时再转当前字形。
 */
import type { IndexType } from '../types';

export type LossStatusKey = 'extant' | 'partially_extant' | 'lost';

/** 排序键（代理认的 sort 参数）：'' ＝ 按相关度（默认）；年代由早到晚／由晚到早；书名按拼音 */
export type SearchSort = '' | 'era:asc' | 'era:desc' | 'title:asc' | 'title:desc';

export interface SearchFilters {
    /** 朝代分组（DYNASTY_GROUPS 的 key），多选，组内各朝代取并集 */
    dynasty: string[];
    /** 部类（CLASSIFICATIONS 的 value；'' ＝ 未分類），多选 */
    classification: string[];
    hasImage: boolean;
    hasText: boolean;
    hasCollated: boolean;
    /** 存佚，单选；'' ＝ 不限 */
    loss: '' | LossStatusKey;
    /** 排序（不算「筛选」：不计入已选个数，「清除全部筛选」也不动它） */
    sort: SearchSort;
}

export const EMPTY_FILTERS: SearchFilters = {
    dynasty: [], classification: [], hasImage: false, hasText: false, hasCollated: false, loss: '', sort: '',
};

/** 哪些类型的索引可排序（丛编没有年代与拼音字段）；与代理 SORT_INDEXES 一致 */
export const SORTABLE_TYPES: ReadonlySet<IndexType> = new Set<IndexType>(['work', 'book', 'entity']);

/** 有没有需要交给存储层的搜索选项（筛选或排序） */
export function hasSearchOptions(f: SearchFilters): boolean {
    return hasActiveFilters(f) || !!f.sort;
}

/** 这类索引该带的 sort 参数（不可排序的类返回 undefined） */
export function sortFor(type: IndexType, f: SearchFilters): SearchSort | undefined {
    return f.sort && SORTABLE_TYPES.has(type) ? f.sort : undefined;
}

/**
 * 朝代分组（设计稿「搜索页 v2」的 7 项）。key 是显示名（繁体）；values 是索引里 `dynasty` 的实际取值。
 * 取值按已知数据与惯例列出，新出现的取值需补进来；「宋」组含遼金，「唐」组含隋與五代（设计稿没有单列）。
 */
export const DYNASTY_GROUPS: { key: string; values: string[] }[] = [
    { key: '漢', values: ['漢', '西漢', '東漢'] },
    { key: '魏晉南北朝', values: ['三國魏', '三國蜀', '三國吳', '三國', '晉', '西晉', '東晉', '南朝宋', '南朝齊', '南朝梁', '南朝陳', '北魏', '東魏', '西魏', '北齊', '北周'] },
    { key: '唐', values: ['隋', '唐', '五代', '前蜀', '後蜀', '南唐'] },
    { key: '宋', values: ['宋', '北宋', '南宋', '宋末元初', '遼', '金'] },
    { key: '元', values: ['元', '元末明初'] },
    { key: '明', values: ['明', '明末清初'] },
    { key: '清', values: ['清'] },
];

/** 部类：value 即索引里 `classification` 的值；'' ＝ 未分類（代理把 `= ""` 改写成 IS EMPTY）。
 *  界面上 '' 一项取字典 searchPage.unclassified，其余 label 是数据，走 convert */
export const CLASSIFICATIONS: { value: string; label: string }[] = [
    { value: '經部', label: '經部' },
    { value: '史部', label: '史部' },
    { value: '子部', label: '子部' },
    { value: '集部', label: '集部' },
    { value: '', label: '未分類' },
];

/** 存佚选项；label 留作对外 API，界面文字取字典 searchPage.loss[value || 'all'] */
export const LOSS_OPTIONS: { value: '' | LossStatusKey; label: string }[] = [
    { value: '', label: '全部' },
    { value: 'extant', label: '存' },
    { value: 'partially_extant', label: '殘' },
    { value: 'lost', label: '佚' },
];

/**
 * 各类索引上能筛哪些字段——与代理（edge-functions/api/search.js 的 FILTER_FIELDS）一致。
 * 某类不支持已选的任何一个字段，这一类就没有可比较的结果：不查它、结果按 0 条算。
 */
export const FILTER_SUPPORT: Record<IndexType, ReadonlySet<keyof SearchFilters>> = {
    work: new Set(['dynasty', 'classification', 'hasImage', 'hasText', 'hasCollated', 'loss']),
    book: new Set(['dynasty', 'hasImage', 'hasText']),
    collection: new Set(),
    entity: new Set(['dynasty']),
};

/** 已选的筛选项个数（多选各值、布尔各一、存佚一） */
export function countActiveFilters(f: SearchFilters): number {
    return f.dynasty.length + f.classification.length + (f.hasImage ? 1 : 0) + (f.hasText ? 1 : 0) + (f.hasCollated ? 1 : 0) + (f.loss ? 1 : 0);
}

export function hasActiveFilters(f: SearchFilters): boolean {
    return countActiveFilters(f) > 0;
}

/** 已选的是哪些字段（用于判断某类索引支不支持） */
export function activeFilterFields(f: SearchFilters): (keyof SearchFilters)[] {
    const out: (keyof SearchFilters)[] = [];
    if (f.dynasty.length) out.push('dynasty');
    if (f.classification.length) out.push('classification');
    if (f.hasImage) out.push('hasImage');
    if (f.hasText) out.push('hasText');
    if (f.hasCollated) out.push('hasCollated');
    if (f.loss) out.push('loss');
    return out;
}

/** 这类索引能不能带着当前筛选查（不能＝直接 0 条，不发请求） */
export function typeSupportsFilters(type: IndexType, f: SearchFilters): boolean {
    const ok = FILTER_SUPPORT[type];
    return activeFilterFields(f).every(field => ok.has(field));
}

const q = (s: string) => JSON.stringify(s);

/**
 * 拼成代理认的受限 filter 串（`字段 = "值"`、`字段 IN [...]`、布尔、`AND`）。
 * 没有可拼的条件返回 ''；这类索引不支持已选字段返回 null（调用方按 0 条处理）。
 * 「未分類」发 `classification = ""`（代理会改写成 IS EMPTY）。
 */
export function buildMeiliFilter(f: SearchFilters, type: IndexType): string | null {
    if (!typeSupportsFilters(type, f)) return null;
    const parts: string[] = [];
    if (f.dynasty.length) {
        const values = Array.from(new Set(f.dynasty.flatMap(k => DYNASTY_GROUPS.find(g => g.key === k)?.values ?? [])));
        if (values.length === 1) parts.push(`dynasty = ${q(values[0])}`);
        else if (values.length > 1) parts.push(`dynasty IN [${values.map(q).join(', ')}]`);
    }
    if (f.classification.length) {
        parts.push(f.classification.length === 1
            ? `classification = ${q(f.classification[0])}`
            : `classification IN [${f.classification.map(q).join(', ')}]`);
    }
    if (f.hasImage) parts.push('has_image = true');
    // 「有文本」过渡：works 先只查 has_text（只有整理本的作品会漏），等代理／索引给出 has_text OR has_collated 的写法再换（overview#322）
    if (f.hasText) parts.push('has_text = true');
    if (f.hasCollated) parts.push('has_collated = true');
    if (f.loss) parts.push(`loss_status = ${q(f.loss)}`);
    return parts.join(' AND ');
}

// ── URL 往返（键名短而稳定，便于分享）：dy=漢,唐  cls=史部,   img=1  txt=1  col=1  loss=lost ──

const KEYS = { dynasty: 'dy', classification: 'cls', hasImage: 'img', hasText: 'txt', hasCollated: 'col', loss: 'loss', sort: 'sort' } as const;
/** URL 里代表「未分類」的值（空串在 URL 里容易丢，用一个占位词） */
const UNCLASSIFIED = '_';

export function filtersToParams(f: SearchFilters, params: URLSearchParams = new URLSearchParams()): URLSearchParams {
    for (const k of Object.values(KEYS)) params.delete(k);
    if (f.dynasty.length) params.set(KEYS.dynasty, f.dynasty.join(','));
    if (f.classification.length) params.set(KEYS.classification, f.classification.map(v => v || UNCLASSIFIED).join(','));
    if (f.hasImage) params.set(KEYS.hasImage, '1');
    if (f.hasText) params.set(KEYS.hasText, '1');
    if (f.hasCollated) params.set(KEYS.hasCollated, '1');
    if (f.loss) params.set(KEYS.loss, f.loss);
    if (f.sort) params.set(KEYS.sort, f.sort);
    return params;
}

/** 认不出的值一律丢掉（被改坏的链接也不该让页面报错） */
export function filtersFromParams(params: { get(name: string): string | null }): SearchFilters {
    const list = (name: string) => (params.get(name) ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const groupKeys = new Set(DYNASTY_GROUPS.map(g => g.key));
    const classValues = new Set(CLASSIFICATIONS.map(c => c.value));
    const loss = params.get(KEYS.loss);
    return {
        dynasty: Array.from(new Set(list(KEYS.dynasty).filter(k => groupKeys.has(k)))),
        classification: Array.from(new Set(list(KEYS.classification).map(v => (v === UNCLASSIFIED ? '' : v)).filter(v => classValues.has(v)))),
        hasImage: params.get(KEYS.hasImage) === '1',
        // 用户 10-01：页面上不再分「全文／整理本」，统一叫「文本」，筛选合成一个「有文本」；旧链接的 col=1 并进来
        hasText: params.get(KEYS.hasText) === '1' || params.get(KEYS.hasCollated) === '1',
        hasCollated: false,
        loss: loss === 'extant' || loss === 'partially_extant' || loss === 'lost' ? loss : '',
        sort: (['era:asc', 'era:desc', 'title:asc', 'title:desc'] as const).find(k => k === params.get(KEYS.sort)) ?? '',
    };
}

/** 两组筛选是否相同（用来判断要不要重新搜索） */
export function sameFilters(a: SearchFilters, b: SearchFilters): boolean {
    return JSON.stringify([a.dynasty.slice().sort(), a.classification.slice().sort(), a.hasImage, a.hasText, a.hasCollated, a.loss, a.sort])
        === JSON.stringify([b.dynasty.slice().sort(), b.classification.slice().sort(), b.hasImage, b.hasText, b.hasCollated, b.loss, b.sort]);
}
