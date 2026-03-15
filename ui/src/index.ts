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
    DownloadStatus,
    DownloadProgress,
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

// ID encoding/decoding
export {
    base58Encode,
    base58Decode,
    parseId,
    buildId,
    decodeIdString,
    extractType,
    extractStatus,
} from './id';
export type { IdComponents } from './id';

// Transport
export type { IndexTransport } from './transport/types';
export { VscodeTransport } from './transport/vscode-transport';
export { HttpTransport } from './transport/http-transport';
export { GithubTransport } from './transport/github-transport';
export type { GithubTransportConfig } from './transport/github-transport';

// Components
export { ResourceEditor } from './components/ResourceEditor';
export { ResourceList } from './components/ResourceList';
export { IndexBrowser } from './components/IndexBrowser';
export { IndexDetail } from './components/IndexDetail';
export type { IndexDetailProps } from './components/IndexDetail';
export { ModeIndicator } from './components/ModeIndicator';
