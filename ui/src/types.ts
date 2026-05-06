/** 资源原子类型 */
export type ResourceTypeAtom = 'text' | 'image' | 'physical';

/** 资源类型（旧版兼容：可单值或组合）。新数据应用 `types: ResourceTypeAtom[]` */
export type ResourceType = ResourceTypeAtom | 'text+image';

/**
 * 归一化资源条目的类型为原子类型数组。
 * 优先读 `types`（新格式），回退到 `type`（旧格式）。
 * 'text+image' 会被拆分为 ['text', 'image']。
 */
export function getResourceTypes(entry: { type?: ResourceType; types?: ResourceTypeAtom[] }): ResourceTypeAtom[] {
    if (entry.types && entry.types.length > 0) return entry.types;
    if (!entry.type) return [];
    if (entry.type === 'text+image') return ['text', 'image'];
    return [entry.type as ResourceTypeAtom];
}

/** 检测是否包含某种类型（兼容新旧格式） */
export function hasResourceType(entry: { type?: ResourceType; types?: ResourceTypeAtom[] }, atom: ResourceTypeAtom): boolean {
    return getResourceTypes(entry).includes(atom);
}

/** 整理本文本质量等级 */
export type TextQualityGrade = 'published' | 'fine' | 'rough' | 'ocr';

/** enum → 繁体中文 badge 文字 */
export const TEXT_QUALITY_LABELS: Record<TextQualityGrade, string> = {
    published: '出版',
    fine: '精校',
    rough: '粗校',
    ocr: '機器識別',
};

/** enum → 错误率判定标准（tooltip 显示） */
export const TEXT_QUALITY_CRITERIA: Record<TextQualityGrade, string> = {
    published: '達到出版、學術研究標準，錯誤率在萬分之一以內',
    fine: '通讀無障礙，錯誤率在百分之一以內',
    rough: '保證文意基本正確，錯誤率在百分之三以內',
    ocr: '保持大意和結構，錯誤率在百分之十以內',
};

/** enum → 主题色 */
export const TEXT_QUALITY_COLORS: Record<TextQualityGrade, string> = {
    published: '#1b5e20',
    fine: '#2e7d32',
    rough: '#1565c0',
    ocr: '#e65100',
};

/** 覆盖信息 */
export interface CoverageInfo {
    level: number;
    ranges: string;
}

/**
 * 资源元数据 key → 中文显示名
 * @deprecated 使用 `useT().metadata` 代替，支持繁简切换
 */
export const RESOURCE_METADATA_LABELS: Record<string, string> = {
    edition: '版本',
    version: '修订版本',
    quality: '资源质量',
    check_type: '校对',
    image_source: '影像来源',
    team: '所属团队',
    publisher: '出版社',
    year: '出版年份',
    format: '格式',
    note: '备注',
    total_page: '页数',
    paragraph_count: '段落数',
    has_translation: '翻译',
};

/** 资源分册条目 */
export interface ResourceVolume {
    volume: number;
    url?: string;
    status?: 'found' | 'missing' | string;
    label?: string;
    /** 分组标签（如所属 Work 标题），用于展开视图中按组分小节展示 */
    group?: string;
    /** 分组对应的 entity id（如 Work id），渲染为内部链接 */
    group_id?: string;
    /** 允许数据源携带额外 URL 字段（tw_url, wiki_url 等） */
    [key: string]: unknown;
}

/** 统一资源条目 */
export interface ResourceEntry {
    id: string;
    name: string;
    short_name?: string;
    url: string;
    /** @deprecated 使用 types。保留作向后兼容读取。 */
    type?: ResourceType;
    /** 资源类型数组（自由组合）。优先于 type。 */
    types?: ResourceTypeAtom[];
    root_type?: 'catalog' | 'search';
    structure?: string[];
    coverage?: CoverageInfo;
    details?: string;
    /** 结构化元数据 */
    metadata?: Record<string, string>;
    /** 分册信息（可选） */
    volumes?: ResourceVolume[];
    /** 预期册数 */
    expected_volumes?: number;
    /** 色彩模式：黑白 / 彩色 */
    color_mode?: 'bw' | 'color';
    /** 来源标注（如"來源：臺灣華文電子書庫"） */
    source_label?: string;
}

/** 索引类型 */
export type IndexType = 'book' | 'work' | 'collection' | 'entity';

/** Entity subtype（人物 / 地名 / 朝代 / 匿名 / 集体编撰） */
export type EntitySubtype = 'people' | 'place' | 'dynasty' | 'anonymous' | 'collective';

/** 别名分类（基于 CBDB ALTNAME_CODES，简化为我方枚举） */
export type AltNameType = '字' | '號' | '諡號' | '賜號' | '別名' | '常用名' | '簡體'
    | '本名' | '稱號' | '行第' | '小名' | '小字' | '俗姓' | '俗名'
    | '廟號' | '尊號' | '法號' | '道號' | '年號' | string;

/** 人物别名 */
export interface AltName {
    name: string;
    type?: AltNameType;
}

/** Entity.works[i] —— 反向引用作品 */
export interface EntityWorkRef {
    work_id: string;
    role?: string;
}

/** Entity.external_ids —— 外部数据库引用 */
export interface ExternalIds {
    cbdb_id?: number;
    cbdb_match?: string;
    cbdb_source?: string;
}

/** 索引状态 */
export type IndexStatus = 'draft' | 'official';

/** 索引条目（列表显示用） */
export interface IndexEntry {
    id: string;
    title: string;
    type: IndexType;
    isDraft?: boolean;
    author?: string;
    dynasty?: string;
    role?: string;
    path?: string;
    /** Work 别名列表 */
    additional_titles?: string[];
    /** Book 附载篇目 */
    attached_texts?: string[];
    /** 版本 */
    edition?: string;
    /** 卷数 */
    juan_count?: number;
    /** 是否有文字资源 */
    has_text?: boolean;
    /** 是否有图片资源 */
    has_image?: boolean;
    /** 是否有整理本 */
    has_collated?: boolean;
    /** 作品子类型：poem / article / book（默认）；对 entity 表示 EntitySubtype */
    subtype?: string;
    /** Entity 主名（type='entity' 时使用） */
    primary_name?: string;
    /** Entity 生年 */
    birth_year?: number;
    /** Entity 卒年 */
    death_year?: number;
    /** Entity 关联的 CBDB ID */
    cbdb_id?: number;
}

/** 分页结果 */
export interface PageResult<T> {
    entries: T[];
    total: number;
    page: number;
    pageSize: number;
}

/** 统一搜索结果（按类型分组） */
export interface GroupedSearchResult {
    works: IndexEntry[];
    books: IndexEntry[];
    collections: IndexEntry[];
    entities?: IndexEntry[];
    /** 各类型的总匹配数（不限于返回条数） */
    totalWorks: number;
    totalBooks: number;
    totalCollections: number;
    totalEntities?: number;
}

/** 加载选项 */
export interface LoadOptions {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/** 下载状态 */
export type DownloadStatus = 'idle' | 'downloading' | 'completed' | 'error';

/** 下载进度信息 */
export interface DownloadProgress {
    status: DownloadStatus;
    progress?: number;
    message?: string;
}

/** 索引数据源 */
export type IndexSource = 'local' | 'repo' | 'github';

/** 同步配置 */
export interface SyncConfig {
    parentPath?: string;
    isDraft?: boolean;
    repoPath?: string;
    remoteName?: string;
    remoteUrl?: string;
}

// ── 详情数据类型 ──

/** 描述信息 */
export interface DescriptionInfo {
    text: string;
    sources?: string[];
}

/** 附记条目：长篇补充材料，独立于 description。
 *  与 description 区分：description 简短、用于卡片/搜索摘要、可被多处引用；
 *  appendix 仅在条目详情页展开显示，可放学术备记、翻刻本/续补/版本流变等长篇资料。 */
export interface AppendixEntry {
    /** 附记小节标题（如「孫楷第《通俗小說書目》著錄之未見/已佚別本」） */
    title: string;
    /** 正文 markdown 文本 */
    text: string;
    /** 来源标注（与 DescriptionInfo.sources 同形） */
    sources?: string[];
}

/** 作者信息 */
export interface AuthorInfo {
    name: string;
    role?: string;
    dynasty?: string;
    /** 关联的人物 Entity ID（可点击跳转人物详情页） */
    entity_id?: string;
}

/** 出版信息 */
export interface PublicationInfo {
    year?: string;
    details?: string;
}

/** 位置/机构信息 */
export interface LocationInfo {
    name: string;
    start_date?: string;
    end_date?: string;
    description?: string;
}

/** 卷数 */
export interface JuanCount {
    number?: number;
    description?: string;
}

/** 單個計量單位（卷、回、集、篇、則 等） */
export interface Measure {
    unit: string;
    number: number;
    /** 計量相關備註，如 "每集五回" */
    note?: string;
}

/** 页数 */
export interface PageCount {
    number?: number;
    description?: string;
}

/** 详情基础数据 */
export interface BaseDetailData {
    id: string;
    title: string;
    edition?: string;
    type: IndexType;
    description?: DescriptionInfo;
    /** 长篇附记（详情页展示，不进卡片/搜索摘要） */
    appendix?: AppendixEntry[];
    authors?: AuthorInfo[];
    additional_titles?: (string | { book_title: string })[];
    /** Book 附载篇目 */
    attached_texts?: (string | { book_title: string })[];
    additional_works?: AdditionalWork[];
    indexed_by?: IndexedByEntry[];
    emendated_by?: EmendatedByEntry[];
    publication_info?: PublicationInfo;
    current_location?: LocationInfo;
    juan_count?: JuanCount;
    /** 多維計量（卷、回、集等），適合通俗小說等 */
    measures?: Measure[];
    /** UI 直接展示的計量文本，應與 measures 一致 */
    measure_info?: string;
    page_count?: PageCount;
    resources?: ResourceEntry[];
}

/** 收录关联：书籍被丛编收录的信息 */
export interface ContainedInEntry {
    /** 丛编 ID */
    id: string;
    /** 在丛编中的册号（单册如 9，跨册如 "9-12"） */
    volume_index?: number | string;
}

/** Book 详情 */
export interface BookDetailData extends BaseDetailData {
    type: 'book';
    work_id?: string;
    contained_in?: ContainedInEntry[];
    location_history?: LocationInfo[];
    related_books?: string[];
    /** 版本传承信息（用于版本图） */
    lineage?: BookLineage;
}

/** Collection 详情 */
export interface CollectionDetailData extends BaseDetailData {
    type: 'collection';
    work_id?: string;
    contained_in?: string[];
    history?: string[];
    books?: string[];
    contained_works?: { id: string; title: string; volume_index?: number }[];
}

/** Work 详情 */
export interface WorkDetailData extends BaseDetailData {
    type: 'work';
    parent_works?: string[];
    parent_work?: { id: string; title: string };
    books?: string[];
    related_works?: { id: string; title: string; relation?: 'part_of' | 'has_part' }[];
    /** 版本传承图（多版本作品如红楼梦、十三经等） */
    version_graph?: VersionGraph;
}

/** Entity（人物/地名等）详情
 *  extends BaseDetailData 以兼容现有 data.title / data.description 等访问；
 *  title 在加载时由 primary_name 复制而来。
 */
export interface EntityDetailData extends BaseDetailData {
    type: 'entity';
    subtype: EntitySubtype;
    /** 主显示名（Entity 数据源主键） */
    primary_name: string;
    /** 别名（字、号、諡号等） */
    alt_names?: AltName[];
    /** 朝代标签 */
    dynasty?: string;
    /** 生年（公历） */
    birth_year?: number;
    /** 卒年（公历） */
    death_year?: number;
    /** 关联作品反查 */
    works?: EntityWorkRef[];
    /** 外部数据库引用（CBDB 等） */
    external_ids?: ExternalIds;
    /** 是否草稿 */
    isDraft?: boolean;
}

/** 统一详情数据类型 */
export type IndexDetailData = BookDetailData | CollectionDetailData | WorkDetailData | EntityDetailData;

// ── 关联关系类型 ──

/** 关联实体 */
export interface RelatedEntity {
    id: string;
    title: string;
    type: IndexType;
}

/** 关联关系数据 */
export interface RelationData {
    parentWork?: RelatedEntity;
    parentCollection?: RelatedEntity;
    belongsToWork?: RelatedEntity;
    belongsToCollection?: RelatedEntity;
    childWorks?: RelatedEntity[];
    childCollections?: RelatedEntity[];
    containedBooks?: RelatedEntity[];
    siblingBooks?: RelatedEntity[];
}

// ── 实体搜索/选择类型 ──

/** 实体选项（搜索结果、最近使用等） */
export interface EntityOption {
    id: string;
    title: string;
    edition?: string;
    type: IndexType | string;
    author?: string;
    dynasty?: string;
}

/** 创建实体参数 */
export interface CreateEntityParams {
    type: IndexType;
    title: string;
    inheritData?: Record<string, unknown>;
}

// ── 附属作品信息 ──

/** 附属作品条目（序言、附录、卷图等） */
export interface AdditionalWork {
    book_title: string;
    n_juan?: number;
}

// ── 收录信息 ──

/** 收录条目：记录某部作品被某目录/丛书收录时的信息 */
export interface IndexedByEntry {
    /** 收录来源名称（繁体全名），如"欽定四庫全書總目" */
    source: string;
    /** 收录来源的 Book Index ID */
    source_bid?: string;
    /** 收录时的标题信息，如"《子夏易傳》 十一卷" */
    title_info?: string;
    /** 收录时的作者信息，如"舊本題「卜子夏撰」" */
    author_info?: string;
    /** 收录时的版本信息，如"內府藏本" */
    edition?: string;
    /** 提要/摘要 */
    summary?: string;
    /** 编者评论 */
    comment?: string;
    /** 附加评论 */
    additional_comment?: string;
}

// ── 考证信息 ──

/** 考证条目：记录某部作品被某考证著作校勘/注释时的信息 */
export interface EmendatedByEntry {
    /** 考证来源名称（繁体全名），如"隋書經籍志考證" */
    source: string;
    /** 考证来源的 Book Index ID */
    source_bid?: string;
    /** 考证正文/摘要 */
    summary?: string;
    /** 编者评论 */
    comment?: string;
    /** 附加评论 */
    additional_comment?: string;
}

// ── 资料来源类型 ──

// ── 丛编目录 (volume_book_mapping) ──

/** 丛编分部 */
export interface VolumeSection {
    name: string;
    volume_range: [number, number];
}

/** 册级详细信息（来源 URL、状态等） */
export interface VolumeDetail {
    volume: number;
    status?: string;
    urls?: Record<string, string>;
    file?: string;
}

/** 丛编目录中的书目条目（统一格式，归一化后） */
export interface VolumeBookEntry {
    title: string;
    book_id?: string | null;
    work_id?: string | null;
    /** 册号列表，始终为 number[]（归一化后） */
    volumes: number[];
    /** 册级详细信息（可选） */
    volume_details?: VolumeDetail[];
    section?: string;
    sub_items?: string[];
    edition?: string;
    expected_volumes?: number;
    found_volumes?: number;
    missing_volumes?: number[];
}

/** 丛编目录统计（统一格式，字段均可选） */
export interface VolumeBookStats {
    total_books: number;
    processed_volumes?: number;
    matched_works?: number;
    unmatched_works?: number;
    total_found_volumes?: number;
}

/** 丛编目录数据 (volume_book_mapping.json)，归一化后的统一格式 */
export interface VolumeBookMapping {
    collection_id: string;
    title: string;
    source?: string;
    resource_id?: string;
    resource_name?: string;
    total_volumes: number;
    sections?: VolumeSection[];
    stats: VolumeBookStats;
    books: VolumeBookEntry[];
    volume_index?: Record<string, string[]>;
}

/** 带资源信息的丛编目录 */
export interface ResourceCatalog {
    resource_id: string;
    short_name?: string;
    data: VolumeBookMapping;
}

// ── 整理本 (collated_edition) ──

/** 整理本中的一个 section */
export interface CollatedSection {
    title: string;
    level?: number;
    type: string;  // '书' | '序' | '结语' | '类'（结构标签） | '考证'（考证整理本）
    content?: string;
    edition?: string | null;
    text_status?: string | null;
    book_title?: string;
    n_juan?: number | null;
    additional_titles?: string[] | null;
    summary?: string | null;
    comment?: string | null;
    additional_comment?: string | null;
    author_info?: string | null;
    dynasty?: string | null;
    author?: string | null;
    author_type?: string | null;
    note?: string | null;
    tag?: string | null;
    /** catalog 类型：单个关联作品 ID */
    work_id?: string | null;
    /** kaozhen 类型：关联的作品 ID 列表 */
    work_ids?: string[];
    /** kaozhen 类型：原文标题行 */
    header_line?: string;
    /** AI 生成的备注 */
    ai_note?: string;
}

/** 整理本的一卷数据 */
export interface CollatedJuan {
    title: string;
    page_title?: string;
    source_url?: string;
    sections: CollatedSection[];
}

/** 整理本卷分组 */
export interface JuanGroup {
    label: string;
    files: string[];
    children?: JuanGroup[];
}

/** 整理本参考文献 */
export interface CollatedReference {
    /** 文献标题 */
    title: string;
    /** 作者 */
    author?: string;
    /** URL（网络资源） */
    url?: string;
    /** 备注说明 */
    note?: string;
}

/** 整理本索引（卷列表） */
export interface CollatedEditionIndex {
    /** 整理本类型：catalog（目录志书）| kaozhen（考证） */
    type?: 'catalog' | 'kaozhen';
    work_id: string;
    total_juan?: number;
    juan_files?: string[];
    /** filename → 元数据（如所属源册号），渲染于 tab/button 旁 */
    juan_metadata?: Record<string, { vols?: number[]; vol_label?: string }>;
    juan_groups?: JuanGroup[];
    /** 参考文献 */
    references?: CollatedReference[];
    /** kaozhen: 考证对象（如"漢書藝文志"） */
    target_source?: string;
    target_source_id?: string;
    /** kaozhen: 文本来源说明 */
    text_source?: string;
    /** 文本质量等级 */
    text_quality?: {
        grade: TextQualityGrade;
        /** 文字来源说明 */
        source_note?: string;
    };
    /** 文件列表（替代 juan_files 的详细版） */
    files?: Array<{
        filename: string;
        title: string;
        source_juan?: string;
        sections?: number;
        status?: string;
    }>;
}

/** 资料来源项 */
export interface SourceItem {
    id: string;
    name: string;
    type: 'bookID' | 'url' | '';
    details: string;
    position: string;
    version: string;
    processor_version: string;
}

// ── 资源导入进度 ──

/** 资源导入状态 */
export type ResourceImportStatus = 'todo' | 'in_progress' | 'done';

/** 资源导入类型 */
export type ResourceImportType = 'catalog' | 'collection';

/** 资源导入进度条目 */
export interface ResourceProgressItem {
    id: string;
    name: string;
    /** 版本（如"文淵閣本"、"百衲本"） */
    edition?: string;
    type: ResourceImportType;
    description?: string;
    url?: string;
    /** 关联的叢編 ID */
    collection_id?: string;
    /** 关联的作品 ID */
    work_id?: string;
    total: number;
    imported: number;
    status: ResourceImportStatus;
    priority: number;
    start_date?: string;
    end_date?: string;
    notes?: string;
}

/** 资源导入进度数据 */
export interface ResourceProgress {
    resources: ResourceProgressItem[];
}

// ── 推荐数据 ──

/** 推荐条目（bundle-data 时已用 index 元数据 hydrate，便于免 chunk 渲染） */
export interface RecommendedEntry {
    id: string;
    title: string;
    description?: string;
    type?: IndexType;
    author?: string;
    dynasty?: string;
    role?: string;
    edition?: string;
    has_text?: boolean;
    has_image?: boolean;
    has_collated?: boolean;
    subtype?: string;
    primary_name?: string;
}

/** 推荐分组 */
export interface RecommendedGroup {
    name: string;
    items: RecommendedEntry[];
}

/** 推荐数据 */
export interface RecommendedData {
    groups: RecommendedGroup[];
}

// ── 版本传承图 (lineage / version_graph) ──

/** 版本类别 */
export type LineageCategory = '抄本' | '刻本' | '影印' | '校注' | '排印' | '电子' | string;

/** 版本现存状态 */
export type LineageStatus = 'extant' | 'fragment' | 'lost';

/** 派生关系类型 */
export type LineageRelation =
    | '过录' | '底本' | '参校' | '校改' | '修订' | '翻刻'
    | '配补' | '续补' | '影印' | '校注' | '评点' | '续评' | string;

/** 横向关联类型（兄弟本/同源/互校等） */
export type LineageSiblingRelation = '兄弟本' | '同源' | '互校' | string;

/** 关系信心等级 */
export type LineageConfidence = 'certain' | 'consensus' | 'probable' | 'disputed';

/** ref_type：派生来源是其他 Book 还是假想节点 */
export type LineageRefType = 'book' | 'hypothetical';

/** Book.lineage.derived_from[i] —— 单条派生关系 */
export interface LineageDerivation {
    /** 引用 ID：book_id 或 hypothetical_node.id */
    ref: string;
    ref_type: LineageRefType;
    relation: LineageRelation;
    confidence: LineageConfidence;
    /** 一句话证据：题字、避讳、序言、抄手等 */
    evidence?: string;
    note?: string;
}

/** Book.lineage.related_to[i] —— 横向兄弟本 */
export interface LineageSibling {
    book_id: string;
    relation: LineageSiblingRelation;
    confidence: LineageConfidence;
    evidence?: string;
    note?: string;
}

/** Book.lineage —— 单本书的版本节点信息 */
export interface BookLineage {
    /** 数字年份（用于时间轴/排序） */
    year?: number;
    /** 原始年代表述 */
    year_text?: string;
    /** 年份是否仅为推断 */
    year_uncertain?: boolean;
    category: LineageCategory;
    status: LineageStatus;
    /** 现存范围说明 */
    extant_juan?: string;
    /** 别名 */
    alias?: string[];
    /** 派生关系（可多源） */
    derived_from?: LineageDerivation[];
    /** 横向兄弟本（不是父子） */
    related_to?: LineageSibling[];
    note?: string;
}

/** Work.version_graph.groups[i] —— 分组/泳道 */
export interface VersionGraphGroup {
    id: string;
    label: string;
    /** 颜色（hex） */
    color?: string;
    /** 简要说明（用于版本列表中折叠组的副标题） */
    description?: string;
}

/** Work.version_graph.hypothetical_nodes[i] —— 假想祖本节点 */
export interface VersionGraphHypotheticalNode {
    id: string;
    label: string;
    /** 节点上展示的副标题/描述（如「繁本，早於嘉靖殘本，已佚」）。
     *  与 note（学术依据/长说明）区分：description 紧跟在 label 下方显示。 */
    description?: string;
    year?: number;
    /** 当 year 不明而只有区间时使用 */
    year_range?: [number, number];
    year_uncertain?: boolean;
    group?: string;
    /** 假想节点之间也可有派生关系 */
    derived_from?: LineageDerivation[];
    note?: string;
}

/** Work.version_graph —— 整个作品的版本图元信息 */
export interface VersionGraph {
    /** 详情页是否显示「关系图」tab */
    enabled: boolean;
    title?: string;
    description?: string;
    /** 布局方向：LR=左右，TB=上下 */
    layout?: 'LR' | 'TB';
    groups?: VersionGraphGroup[];
    /** book_id → group_id */
    node_groups?: Record<string, string>;
    /** 假想祖本节点 */
    hypothetical_nodes?: VersionGraphHypotheticalNode[];
    /** Work.books 里但不进图的条目（如待 dedupe 的占位） */
    excluded_books?: string[];
    excluded_reason?: string;
    /** 默认显示的集合 key（对应 collections 字典中的某 key 或 'all'）。
     *  缺省时等同 'all'（不过滤）。 */
    default_collection?: string;
    /** 各集合的元数据。任意 key（如 'core'/'printed'）；'all' 为保留特殊值表示完整。
     *  每个集合可通过 groups 或 book_ids（或两者并集）声明范围；都未指定则与 'all' 同义。 */
    collections?: Record<string, VersionGraphCollection>;
    /** @deprecated 旧字段，等价 `collections.core.book_ids`；保留以兼容旧数据。 */
    core_books?: string[];
    /** @deprecated 旧字段，等价 `collections.core.hypothetical_ids`；保留以兼容旧数据。 */
    core_hypotheticals?: string[];
}

/** 集合定义。可按 group/book_ids 任选其一或并集声明范围。 */
export interface VersionGraphCollection {
    /** UI 上显示的名称（如「核心版本」「刻本」） */
    label: string;
    /** UI 上 tooltip / 描述区显示的说明 */
    description?: string;
    /** 集合包含哪些分组（按 work.version_graph.groups[].id；
     *  集合 = 这些 group 下所有 book + hypothetical 节点的并集） */
    groups?: string[];
    /** 集合精确包含的 book id 列表（与 groups 并集生效） */
    book_ids?: string[];
    /** 集合精确包含的假想节点 id 列表（与 groups 并集生效；
     *  缺省且未指定 groups 时，所有假想节点均纳入） */
    hypothetical_ids?: string[];
}
