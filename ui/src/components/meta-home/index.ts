// 元数据首页（overview#322 C 块）：类型签、最近浏览、历代史志（书架＋著录进度＋同类书目）、四部、丛编、人物时间轴、版本谱系、在线资源、数据与授权
export {
    MetaHomeView, MetaTypeChips, MetaRecentPanel, MetaCatalogTable, MetaRelatedCatalogs, MetaCollectionGroups,
    MetaPeopleTimeline, MetaLineageCards, MetaOnlineSites, MetaDataLicense, useRecentEntries,
    META_HOME_SECTION_IDS, SEVEN_PAVILIONS_KEY,
} from './MetaHome';
export type { MetaHomeViewProps } from './MetaHome';
export { META_HOME_CSS } from './meta-home-css';
export { DEFAULT_META_HOME_LINKS, withMetaLinks, pct, timelineLayout, yearText } from './model';
export type {
    MetaHomeSections, MetaHomeLinks, MetaCatalogProgress, MetaSite, MetaBibliographer, MetaWorkRef,
} from './model';
