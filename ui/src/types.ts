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
