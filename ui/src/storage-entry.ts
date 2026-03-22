/**
 * Storage-only entry point (no React dependencies)
 * 用于 Next.js Server Component / SSG 等不支持 React hooks 的环境
 */

// Types
export type {
    ResourceType,
    CoverageInfo,
    ResourceEntry,
    IndexType,
    IndexStatus,
    IndexEntry,
    PageResult,
    LoadOptions,
    IndexSource,
    SyncConfig,
    DescriptionInfo,
    AuthorInfo,
    PublicationInfo,
    LocationInfo,
    JuanCount,
    PageCount,
    BaseDetailData,
    BookDetailData,
    CollectionDetailData,
    WorkDetailData,
    IndexDetailData,
    RelatedEntity,
    RelationData,
    EntityOption,
    CreateEntityParams,
    SourceItem,
} from './types';

// Storage
export type { IndexStorage } from './storage/types';
export { GithubStorage } from './storage/github-storage';
export type { GithubStorageConfig } from './storage/github-storage';
export { LocalStorage } from './storage/local-storage';
export type { LocalStorageConfig } from './storage/local-storage';

// Core
export type { FileSystem } from './core/filesystem';
export { BookIndexManager } from './core/manager';
export { BookIndexStorage } from './core/storage';
export type { IndexFile, IndexFileEntry } from './core/storage';
export { IdGenerator } from './core/id-generator';
export { extractIdFromUrl, validateResource } from './core/schema';
export { BidLink } from './core/bid-link';
export { BookIndexError, StorageError, IdGenerationError, ConfigError, MigrationError } from './core/exceptions';
