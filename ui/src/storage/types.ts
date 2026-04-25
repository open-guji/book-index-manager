import type { IndexType, IndexEntry, PageResult, LoadOptions, GroupedSearchResult, RelationData, EntityOption, CreateEntityParams, VolumeBookMapping, ResourceCatalog, CollatedEditionIndex, CollatedJuan, ResourceProgress, RecommendedData } from '../types';

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
    searchAll?(query: string, limit?: number): Promise<GroupedSearchResult>;

    /** 获取单条元数据 */
    getItem(id: string): Promise<Record<string, unknown> | null>;

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

    // ── 整理本（可选） ──

    /** 获取整理本卷列表 */
    getCollatedEditionIndex?(workId: string): Promise<CollatedEditionIndex | null>;

    /** 获取整理本单卷内容 */
    getCollatedJuan?(workId: string, juanFile: string): Promise<CollatedJuan | null>;

    // ── 资源导入进度（可选） ──

    /** 获取 Work 下的分类目录 */
    getWorkCatalog?(workId: string): Promise<Array<{ source: string; data: unknown }> | null>;

    /** 获取叢書目錄整理進度 */
    getResourceProgress?(): Promise<ResourceProgress | null>;

    /** 获取在線資源網站整理進度 */
    getSiteProgress?(): Promise<ResourceProgress | null>;

    /** 获取推荐古籍数据 */
    getRecommended?(): Promise<RecommendedData | null>;

    /** 获取资源类型统计（有图片/文字资源的作品数） */
    getResourceCounts?(): Promise<{ hasText: number; hasImage: number }>;

    /** 获取 Work subtype 细分统计 */
    getSubtypeStats?(): Promise<Record<string, number>>;
}
