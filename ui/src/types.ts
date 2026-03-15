/** 资源类型 */
export type ResourceType = 'text' | 'image' | 'text+image' | 'physical';

/** 覆盖信息 */
export interface CoverageInfo {
    level: number;
    ranges: string;
}

/** 统一资源条目 */
export interface ResourceEntry {
    id: string;
    name: string;
    url: string;
    type: ResourceType;
    root_type?: 'catalog' | 'search';
    structure?: string[];
    coverage?: CoverageInfo;
    details?: string;
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
    path?: string;
}

/** 分页结果 */
export interface PageResult<T> {
    entries: T[];
    total: number;
    page: number;
    pageSize: number;
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

/** 卷册数 */
export interface VolumeCount {
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
    publication_info?: PublicationInfo;
    current_location?: LocationInfo;
    volume_count?: VolumeCount;
    page_count?: PageCount;
    resources?: ResourceEntry[];
}

/** Book 详情 */
export interface BookDetailData extends BaseDetailData {
    type: 'book';
    work_id?: string;
    contained_in?: string[];
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
}

/** 统一详情数据类型 */
export type IndexDetailData = BookDetailData | CollectionDetailData | WorkDetailData;
