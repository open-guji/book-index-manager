/** 资源类型 */
export type ResourceType = 'text' | 'image' | 'text+image' | 'physical';

/** 覆盖信息 */
export interface CoverageInfo {
    level: number;
    ranges: string;
}

/** 资源元数据 key → 中文显示名 */
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

/** 统一资源条目 */
export interface ResourceEntry {
    id: string;
    name: string;
    short_name?: string;
    url: string;
    type: ResourceType;
    root_type?: 'catalog' | 'search';
    structure?: string[];
    coverage?: CoverageInfo;
    details?: string;
    /** 结构化元数据 */
    metadata?: Record<string, string>;
}

/** 索引类型 */
export type IndexType = 'book' | 'work' | 'collection';

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
    /** 别名列表 */
    additional_titles?: string[];
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
    /** 各类型的总匹配数（不限于返回条数） */
    totalWorks: number;
    totalBooks: number;
    totalCollections: number;
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

/** 作者信息 */
export interface AuthorInfo {
    name: string;
    role?: string;
    dynasty?: string;
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

/** 页数 */
export interface PageCount {
    number?: number;
    description?: string;
}

/** 详情基础数据 */
export interface BaseDetailData {
    id: string;
    title: string;
    type: IndexType;
    description?: DescriptionInfo;
    authors?: AuthorInfo[];
    additional_titles?: string[];
    additional_works?: AdditionalWork[];
    indexed_by?: IndexedByEntry[];
    publication_info?: PublicationInfo;
    current_location?: LocationInfo;
    juan_count?: JuanCount;
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
    edition?: string;
    work_id?: string;
    contained_in?: ContainedInEntry[];
    location_history?: LocationInfo[];
    related_books?: string[];
}

/** Collection 详情 */
export interface CollectionDetailData extends BaseDetailData {
    type: 'collection';
    contained_in?: string[];
    history?: string[];
    books?: string[];
}

/** Work 详情 */
export interface WorkDetailData extends BaseDetailData {
    type: 'work';
    parent_works?: string[];
    parent_work?: { id: string; title: string };
    books?: string[];
    related_works?: { id: string; title: string; relation?: 'part_of' | 'has_part' }[];
}

/** 统一详情数据类型 */
export type IndexDetailData = BookDetailData | CollectionDetailData | WorkDetailData;

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

// ── 资料来源类型 ──

// ── 丛编目录 (volume_book_mapping) ──

/** 丛编分部 */
export interface VolumeSection {
    name: string;
    volume_range: [number, number];
}

/** 丛编目录中的书目条目 */
export interface VolumeBookEntry {
    title: string;
    book_id: string | null;
    work_id: string | null;
    volumes: number[];
    section: string;
    sub_items?: string[];
}

/** 丛编目录统计 */
export interface VolumeBookStats {
    processed_volumes: number;
    total_books: number;
    matched_works: number;
    unmatched_works: number;
}

/** 丛编目录数据 (volume_book_mapping.json) */
export interface VolumeBookMapping {
    collection_id: string;
    title: string;
    source?: string;
    total_volumes: number;
    sections: VolumeSection[];
    stats: VolumeBookStats;
    books: VolumeBookEntry[];
    volume_index: Record<string, string[]>;
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
    level: number;
    type: '部' | '类' | '书' | '其他';
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
    work_id?: string | null;
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

/** 整理本索引（卷列表） */
export interface CollatedEditionIndex {
    work_id: string;
    total_juan: number;
    juan_files: string[];
    juan_groups?: JuanGroup[];
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
