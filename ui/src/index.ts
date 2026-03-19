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
    RelatedEntity,
    RelationData,
    EntityOption,
    CreateEntityParams,
    SourceItem,
    AdditionalTitle,
    IndexedByEntry,
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
export { LocalTransport } from './transport/local-transport';
export type { LocalTransportConfig } from './transport/local-transport';

// Core
export type { FileSystem } from './core/filesystem';
export { BookIndexStorage } from './core/storage';
export type { IndexFile, IndexFileEntry } from './core/storage';
export { IdGenerator } from './core/id-generator';
export { extractIdFromUrl, validateResource } from './core/schema';

// Components - Existing
export { ResourceEditor } from './components/ResourceEditor';
export { ResourceList } from './components/ResourceList';
export { IndexBrowser } from './components/IndexBrowser';
export { IndexDetail } from './components/IndexDetail';
export type { IndexDetailProps } from './components/IndexDetail';
export { IndexApp } from './components/IndexApp';
export type { IndexAppProps } from './components/IndexApp';
export { ModeIndicator } from './components/ModeIndicator';

// Components - Editor
export { IndexEditor } from './components/IndexEditor';
export type { IndexEditorProps, IndexEditorData } from './components/IndexEditor';
export { SmartBidInput } from './components/SmartBidInput';
export { SourceEditor, parseSourceString, stringifySources } from './components/SourceEditor';
export { RelationPanel } from './components/RelationPanel';
export { EntitySelector } from './components/EntitySelector';
export { CreateEntityDialog } from './components/CreateEntityDialog';
export { EntityPickerDialog } from './components/EntityPickerDialog';

// Common UI components
export { Section } from './components/common/Section';
export { FormInput } from './components/common/FormInput';
export { FormTextArea } from './components/common/FormTextArea';
export { Badge } from './components/common/Badge';
