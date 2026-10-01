/**
 * 阅读首页（overview#308）的数据契约与纯函数。
 *
 * 数据由网站构建期生成（kaiyuanguji-web `nextjs/scripts/build-read-index.mjs` → `current/read/sections.json`），
 * 组件只收 props、不取数。字段要改先在 overview#308 上通知网站一侧。
 */

/** 阅读首页的一张卡（Work 或 Book） */
export interface ReadCard {
    id: string;
    title: string;
    /** 版本名（Book 的 edition） */
    edition?: string;
    juan?: number | string;
    authors?: { name: string; dynasty?: string }[];
    /** 有整理本（首页不显示这个区分，只留作排序） */
    collated?: true;
    classification?: string[];
    /** 年代段 key，见 READ_PERIOD_LABELS */
    period?: string;
    /** 作品子类：article／poem／chapter；书不写 */
    subtype?: string;
    /** 站内文本数：作品自身的版本数＋同 work_id 的 Book 数 */
    text_count?: number;
    /** Book 所属的 Work */
    work_id?: string;
}

/** 推荐阅读 */
export interface ReadPick extends ReadCard {
    blurb?: string;
    /** 题签短名（竖排），缺省取书名 */
    slip?: string;
    /** 作品类型标签（小說、詩選……） */
    type_label?: string;
}

export interface ReadTopicItem extends ReadCard {
    /** 所志朝代（史志书架按它分栏） */
    period_of?: string;
    /** 正史原志（书架上画实色） */
    orig?: true;
}

/** 专题分组；shelf＝画成书脊架（史志目录） */
export interface ReadTopic {
    key: string;
    label: string;
    shelf?: true;
    items: ReadTopicItem[];
}

export interface ReadFamousItem {
    id: string;
    /** 版本短名（甲戌本、容與堂本） */
    short: string;
    title: string;
    edition?: string;
}

/** 名著与版本：一部作品一张卡，按版本系统分行 */
export interface ReadFamous {
    title: string;
    authors?: string;
    work_id?: string;
    text_count: number;
    systems: { label: string; items: ReadFamousItem[] }[];
}

/** 四部方块 */
export interface ReadBu {
    id: string;
    label: string;
    count: number;
    children_total: number;
    top: { id: string; label: string; count: number }[];
}

export interface ReadPeriod {
    key: string;
    label: string;
    count: number;
}

export interface ReadPieceAuthor {
    name: string;
    dynasty?: string;
    count: number;
    items: ReadCard[];
}

/** current/read/sections.json */
export interface ReadSections {
    counts: { readable: number; works: number; books: number; pieces: number };
    picks: ReadPick[];
    topics: ReadTopic[];
    famous: ReadFamous[];
    bu: ReadBu[];
    unclassified: number;
    periods: ReadPeriod[];
    period_unknown: number;
    pieces: { count: number; authors: ReadPieceAuthor[] };
}

/** 年代段 key → 显示名（与网站 build-read-index 的 READ_PERIODS 同序） */
export const READ_PERIOD_LABELS: Record<string, string> = {
    xianqin: '先秦',
    qinhan: '秦漢',
    weijin: '魏晉南北朝',
    suitang: '隋唐五代',
    song: '宋',
    liaojinyuan: '遼金元',
    ming: '明',
    qing: '清',
    modern: '近現代',
};

/** 首页各处链接的地址，宿主定（组件不管路由） */
export interface ReadHomeLinks {
    /** 打开阅读 */
    read: (id: string) => string;
    /** 分类节点页 */
    node?: (nodeId: string) => string;
    /** 年代分页 */
    period?: (key: string) => string;
    /** 作品页 */
    work?: (id: string) => string;
    /** 某作者的全部单篇；不给就不出「全部 →」 */
    author?: (name: string) => string;
}

export const DEFAULT_READ_HOME_LINKS: Required<Omit<ReadHomeLinks, 'author'>> = {
    read: (id) => `/read/${encodeURIComponent(id)}`,
    node: (id) => `/read?node=${encodeURIComponent(id)}`,
    period: (key) => `/read?period=${encodeURIComponent(key)}`,
    work: (id) => `/item/${encodeURIComponent(id)}`,
};

export function withDefaultLinks(links?: Partial<ReadHomeLinks>): Required<Omit<ReadHomeLinks, 'author'>> & Pick<ReadHomeLinks, 'author'> {
    return { ...DEFAULT_READ_HOME_LINKS, ...(links ?? {}) } as Required<Omit<ReadHomeLinks, 'author'>> & Pick<ReadHomeLinks, 'author'>;
}

/** 第一作者「朝代 名」（行内小字用） */
export function firstAuthorText(c: Pick<ReadCard, 'authors'>): string {
    const a = c.authors?.find((x) => x?.name);
    if (!a) return '';
    return a.dynasty ? `${a.dynasty} ${a.name}` : a.name;
}

/** 作者行「〔朝代〕甲、乙」 */
export function authorsLine(c: Pick<ReadCard, 'authors'>): string {
    const list = (c.authors ?? []).filter((a) => a?.name);
    return list.map((a) => (a.dynasty ? `〔${a.dynasty}〕${a.name}` : a.name)).join('　');
}

/**
 * 书架分栏：按 period_of 出现的先后分组（策展文件里已按所志朝代排好），没写 period_of 的归到「其他」。
 */
export function shelfColumns(items: ReadTopicItem[]): { label: string; items: ReadTopicItem[] }[] {
    const cols: { label: string; items: ReadTopicItem[] }[] = [];
    const byLabel = new Map<string, { label: string; items: ReadTopicItem[] }>();
    for (const it of items) {
        const label = it.period_of?.trim() || '其他';
        let col = byLabel.get(label);
        if (!col) {
            col = { label, items: [] };
            byLabel.set(label, col);
            cols.push(col);
        }
        col.items.push(it);
    }
    return cols;
}

/** 书脊高度（px）：随书名字数增长，有个下限，避免整排一样高 */
export function spineHeight(title: string): number {
    return Math.max(150, Array.from(title).length * 18 + 44);
}

/**
 * 年代带每段的深浅档（0–4）：按与最大段的比例分 5 档。
 * 只给 5 档而不是连续色阶，是为了让每档的字色都过对比度：0–3 档浅底配墨字，4 档深底配纸色字。
 */
export function periodLevel(count: number, max: number): number {
    if (max <= 0 || count <= 0) return 0;
    const r = count / max;
    return r < 0.15 ? 0 : r < 0.35 ? 1 : r < 0.6 ? 2 : r < 0.85 ? 3 : 4;
}

/** 年代带：占比太小的段只放首字（全称在无障碍名称与 title 里） */
export const PERIOD_NARROW_SHARE = 0.04;

/** 千分位 */
export function fmtCount(n: number): string {
    return n.toLocaleString('en-US');
}
