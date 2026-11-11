import type { IndexType, IndexEntry, PageResult, LoadOptions, GroupedSearchResult, RelationData, EntityOption, CreateEntityParams, VolumeBookMapping, ResourceCatalog, ResourceProgress, RecommendedData } from '../types';
import type { LineageGraph } from '../core/lineage-graph';
import type { TextChapterContent, TextIndex, TextManifest } from '../core/text-model';

/** `_hubs.json`：`{id: {t: 'w'|'c'|'e', title, dyn?}}`——枢纽（入度 > 200 的记录）的名称表 */
export type HubMap = Record<string, { t?: string; title?: string; dyn?: string }>;

/**
 * 索引数据存储接口
 * 隔离本地文件系统 / GitHub 只读等数据源
 */
export interface IndexStorage {
    /** 加载指定类型的条目列表 */
    loadEntries(type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>>;

    /** 搜索条目（按类型） */
    search(query: string, type: IndexType, options: LoadOptions): Promise<PageResult<IndexEntry>>;

    /** 统一搜索（同时搜索所有类型，返回分组结果） */
    searchAll?(query: string, limit?: number, filters?: import('../core/search-filters').SearchFilters): Promise<GroupedSearchResult>;

    /**
     * 声明本实现真正应用了 `search`／`searchAll` 收到的 `filters`（含 sort）。
     * 搜索页 v4（IndexBrowser 的 filtersEnabled）只在它为 true 时才显示筛选栏与排序控件——
     * 包内自带的 DevApi／Bundle／Github／Local 实现不认筛选，不声明就不会显示「筛了但没筛」的结果。
     */
    readonly supportsSearchFilters?: boolean;

    /** 获取单条元数据 */
    getItem(id: string): Promise<Record<string, unknown> | null>;

    /**
     * 枢纽名称表 `_hubs.json`（schema-v2，overview#458）：`{id: {t, title, dyn?}}`。
     * 卡片里 `{id, h:1}` 的枢纽引用没有 title，读者端从这里取名；不提供则显示 ID。
     */
    getHubs?(): Promise<HubMap | null>;

    /** 保存元数据 */
    saveItem(metadata: Record<string, unknown>): Promise<{ id: string; path: string }>;

    /** 删除条目 */
    deleteItem(id: string): Promise<void>;

    /** 生成新 ID */
    generateId(type: IndexType, status: 'draft' | 'official'): Promise<string>;

    /** 获取单个索引条目（从缓存中查找） */
    getEntry?(id: string): Promise<IndexEntry | null>;

    /** 批量获取索引条目（用于 EntityDetail.works 标题查询，避免 N 次请求） */
    getEntriesByIds?(ids: string[]): Promise<(IndexEntry | null)[]>;

    /** 获取所有索引条目（不分页） */
    getAllEntries?(): Promise<IndexEntry[]>;

    // ── 关联关系（可选） ──

    /** 获取实体的关联关系数据 */
    getRelations?(id: string): Promise<RelationData | null>;

    /** 关联两个实体 */
    linkEntity?(sourceId: string, field: string, targetId: string): Promise<void>;

    /** 取消关联 */
    unlinkEntity?(sourceId: string, field: string): Promise<void>;

    /** 创建新实体并立即建立关联 */
    createAndLink?(sourceId: string, field: string, newEntity: CreateEntityParams): Promise<{ id: string }>;

    // ── 实体搜索（可选，为选择器服务） ──

    /** 搜索实体（支持跨类型搜索） */
    searchEntities?(query: string, type?: IndexType | 'all'): Promise<EntityOption[]>;

    /** 获取最近使用的实体 */
    getRecentEntities?(): Promise<EntityOption[]>;

    /** 记录最近使用的实体 */
    addRecentEntity?(entity: EntityOption): Promise<void>;

    // ── 资源目录（可选） ──

    /** 获取资源目录路径（不创建） */
    getAssetDir?(idStr: string): string;

    /** 初始化资源目录，返回路径 */
    initAssetDir?(idStr: string): Promise<string>;

    /** 检查资源目录是否存在 */
    hasAssetDir?(idStr: string): Promise<boolean>;

    // ── 丛编目录（可选） ──

    /** 获取丛编的册-书映射数据（返回所有资源的目录） */
    getCollectionCatalogs?(collectionId: string): Promise<ResourceCatalog[] | null>;

    /** @deprecated 使用 getCollectionCatalogs */
    getCollectionCatalog?(collectionId: string): Promise<VolumeBookMapping | null>;

    // ── 读者反馈（可选）：详情页「反馈」页签走它；没有就退回 `feedbackApiUrl` ──

    /** 某条目的已有反馈 */
    listFeedback?(resourceId: string): Promise<import('../core/feedback-api').FeedbackItem[]>;

    /** 提交一条反馈；失败抛 Error */
    submitFeedback?(data: import('../core/feedback-api').FeedbackSubmission): Promise<void>;

    // ── 阅读文本（新结构，可选；overview#307） ──
    //
    // 整理本与全文合一：一个条目下有 manifest.json 列出的若干份版本（key），每份是按章分的一组 md，
    // 整理本的章另有同名 json。阅读器（TextReader）只认这一套（用户 09-30 定）：没有 manifest 就显示「暂无文本」，
    // 不从上面旧的取数方法合成。

    /** 条目的文本版本清单（`items/<id>/manifest.json`）；旧结构、取不到返回 null */
    getTextManifest?(id: string): Promise<TextManifest | null>;

    /** 一份版本的章目录（`items/<id>/<key>/index.json`） */
    getTextIndex?(id: string, key: string): Promise<TextIndex | null>;

    /**
     * 一章的内容：md 正文（`<key>/<chapter>.txt`）；`opts.json` 为真时另取同名章 json。
     * chapter 是章 key（三位编号，如 `001`）。md、json 都取不到返回 null。
     */
    getChapter?(id: string, key: string, chapter: string, opts?: { json?: boolean }): Promise<TextChapterContent | null>;

    /**
     * 版本目录下一个文本 JSON（对读六件套：`char_file／cord_file／punct_file／entity_file／norm_file／fig_file`，及 `warp_file`）。
     * 文件名取自章条目的声明；取不到返回 null。没有这个方法的存储，阅读器可用 `textFileBase` 退回 `fetch`。
     */
    getTextFile?(id: string, key: string, file: string): Promise<unknown>;

    /** 版本目录下相对路径文件（如 `fig/005/f148-2-14.png`）可直接用的地址；取不到（没有这份文件、不合规）返回 null */
    getTextAssetUrl?(id: string, key: string, rel: string): Promise<string | null>;

    // ── 版本传承（可选） ──

    // ── 专名出处反查（可选；A12，产物 mentions/<id>.json，打包时由 book-text 的专名号派生） ──

    /** 某实体（或 Work）被专名号标出的出处，第 page 页（从 1 起）；没有出处或取不到返回 null */
    getMentions?(id: string, item?: string): Promise<MentionsIndex | MentionsBookChapters | null>;

    /** 千本级作品的版本分页：`books/<workId>/<g>/<n>.json`（Book 卡数组，每页 200，n 从 1 起）；没有该文件返回 null */
    getBookGroupPage?(workId: string, g: string, n: number): Promise<import('../types').DerivedBookCard[] | null>;

    /** 获取版本传承图数据 */
    getLineageGraph?(workId: string): Promise<LineageGraph | null>;

    // ── 资源导入进度（可选） ──

    /** 获取 Work 下的分类目录 */
    getWorkCatalog?(workId: string): Promise<Array<{ source: string; data: unknown }> | null>;

    /** 获取目录书（藝文志、補志等）整理進度 */
    getCatalogProgress?(): Promise<ResourceProgress | null>;

    /** 获取叢編（Collection，影印叢書/館藏目錄）整理進度 */
    getCollectionProgress?(): Promise<ResourceProgress | null>;

    /** @deprecated 用 getCatalogProgress + getCollectionProgress 替代 */
    getResourceProgress?(): Promise<ResourceProgress | null>;

    /** 获取在線資源網站整理進度 */
    getSiteProgress?(): Promise<ResourceProgress | null>;

    /** 获取推荐古籍数据 */
    getRecommended?(): Promise<RecommendedData | null>;

    /** 获取资源类型统计（有图片/文字资源的作品数） */
    getResourceCounts?(): Promise<{ hasText: number; hasImage: number }>;

    /** 获取 Work subtype 细分统计 */
    getSubtypeStats?(): Promise<Record<string, number>>;

    /**
     * 一次性获取索引规模 + 资源 + subtype 统计的轻量元数据。
     *
     * 用于代替 getAllEntries() / loadEntries(t,{page:1,pageSize:1}) ×4 等
     * "为了几个数字下载整个 index" 的场景。BundleStorage 实现读取
     * /data/meta.json（< 1 KB），其它实现可选。
     */
    getCounts?(): Promise<IndexCounts>;
}

export interface IndexCounts {
    works: number;
    books: number;
    collections: number;
    entities: number;
    resourceCounts?: { hasText: number; hasImage: number };
    subtypeStats?: Record<string, number>;
}

/**
 * 专名出处反查（schema mentions/v2，打包时由 book-text 专名号派生）：`getMentions(id)` 取实体的书／章目录与例子。
 * 章里的逐处位置不预生成，阅读页 `#e=<id>` 现场标出。章行太多的热门实体，`books[].chapters` 不内联，
 * 另用 `getMentions(id, item)` 取该书的 `MentionsBookChapters`。
 */
export interface MentionsIndex {
    schema: string;
    entity_id: string;
    total: number;
    /** 章数（所有书合计） */
    chapters: number;
    books: MentionBook[];
    examples: MentionItem[];
}

export interface MentionBook {
    item: string;
    title?: string;
    count: number;
    chapter_count: number;
    chapters?: MentionChapter[];
}

/** 一章：count 处；ids 是该章 entity 文件里实际写的 id（与现行 id 不同时才有），阅读页 `#e=` 用它 */
export interface MentionChapter {
    key: string;
    chapter: string;
    count: number;
    heading?: string;
    ids?: string[];
}

export interface MentionsBookChapters {
    schema: string;
    entity_id: string;
    item: string;
    chapters: MentionChapter[];
}

/** 一处例子：start／end 是格位（页:列:格[ab]），阅读页地址 `/read/<item>[/<key>]/<chapter>#<start>~<end>` */
export interface MentionItem {
    item: string;
    key: string;
    chapter: string;
    start: string;
    end: string;
    text: string;
    heading?: string;
    before: string;
    after: string;
    v?: string;
}
