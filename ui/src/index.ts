// Types
export type {
    ResourceType,
    CoverageInfo,
    ResourceEntry,
    ResourceVolume,
    IndexType,
    IndexStatus,
    IndexEntry,
    PageResult,
    GroupedSearchResult,
    LoadOptions,
    DownloadStatus,
    DownloadProgress,
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
    AdditionalWork,
    IndexedByEntry,
    VolumeBookMapping,
    VolumeBookEntry,
    VolumeDetail,
    VolumeSection,
    VolumeBookStats,
    CollatedSection,
    CollatedJuan,
    CollatedEditionIndex,
    ResourceCatalog,
    ResourceImportStatus,
    ResourceImportType,
    ResourceProgressItem,
    ResourceProgress,
    RecommendedEntry,
    RecommendedGroup,
    RecommendedData,
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

// Storage
export type { IndexStorage } from './storage/types';
export { GithubStorage } from './storage/github-storage';
export type { GithubStorageConfig } from './storage/github-storage';
export { LocalStorage } from './storage/local-storage';
export type { LocalStorageConfig } from './storage/local-storage';
export { BundleStorage } from './storage/bundle-storage';
export type { BundleStorageConfig } from './storage/bundle-storage';

// Core
export type { FileSystem } from './core/filesystem';
export { BookIndexManager } from './core/manager';
export { BookIndexStorage } from './core/storage';
export type { IndexFile, IndexFileEntry } from './core/storage';
export { IdGenerator } from './core/id-generator';
export { extractIdFromUrl, validateResource } from './core/schema';
export { BidLink } from './core/bid-link';
export { BookIndexError, StorageError, IdGenerationError, ConfigError, MigrationError } from './core/exceptions';
export { normalizeCatalog } from './core/normalize-catalog';

// Components - Existing
export { ResourceEditor } from './components/ResourceEditor';
export { ResourceList } from './components/ResourceList';
export { IndexBrowser } from './components/IndexBrowser';
export { IndexDetail } from './components/IndexDetail';
export type { IndexDetailProps } from './components/IndexDetail';
export { IndexApp } from './components/IndexApp';
export type { IndexAppProps } from './components/IndexApp';
export { HomePage } from './components/HomePage';
export type { HomePageProps, RecommendedItem } from './components/HomePage';
export { SearchInput } from './components/SearchInput';
export type { SearchInputProps } from './components/SearchInput';
export { ModeIndicator } from './components/ModeIndicator';
export { CollectionCatalog } from './components/CollectionCatalog';
export type { CollectionCatalogProps } from './components/CollectionCatalog';
export { CollatedEdition } from './components/CollatedEdition';
export { WorkCatalog } from './components/WorkCatalog';
export type { WorkCatalogProps } from './components/WorkCatalog';
export type { CollatedEditionProps } from './components/CollatedEdition';

// Components - Editor
export { IndexEditor } from './components/IndexEditor';
export type { IndexEditorProps, IndexEditorData } from './components/IndexEditor';
export { SmartBidInput } from './components/SmartBidInput';
export { SourceEditor, parseSourceString, stringifySources } from './components/SourceEditor';
export { RelationPanel } from './components/RelationPanel';
export { EntitySelector } from './components/EntitySelector';
export { CreateEntityDialog } from './components/CreateEntityDialog';
export { EntityPickerDialog } from './components/EntityPickerDialog';
export { FeedbackDialog } from './components/FeedbackDialog';
export type { FeedbackDialogProps, FeedbackData, FeedbackType } from './components/FeedbackDialog';
export { FeedbackButton } from './components/FeedbackButton';
export type { FeedbackButtonProps } from './components/FeedbackButton';
export { FeedbackList } from './components/FeedbackList';
export type { FeedbackListProps, FeedbackItem } from './components/FeedbackList';

// i18n
export { LocaleProvider } from './i18n/provider';
export type { LocaleProviderProps } from './i18n/provider';
export { useT, useConvert, formatTemplate, LocaleContext } from './i18n';
export type { Locale, LocaleMessages, LocaleContextValue } from './i18n';

// Common UI components
export { Section } from './components/common/Section';
export { FormInput } from './components/common/FormInput';
export { FormTextArea } from './components/common/FormTextArea';
export { Badge } from './components/common/Badge';
export { LocaleToggle } from './components/LocaleToggle';
export type { LocaleToggleProps } from './components/LocaleToggle';
