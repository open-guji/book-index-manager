/**
 * Transport-only entry point (no React dependencies)
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
    VolumeCount,
    PageCount,
    BaseDetailData,
    BookDetailData,
    CollectionDetailData,
    WorkDetailData,
    IndexDetailData,
} from './types';

// Transport
export type { IndexTransport } from './transport/types';
export { GithubTransport } from './transport/github-transport';
export type { GithubTransportConfig } from './transport/github-transport';
export { HttpTransport } from './transport/http-transport';
