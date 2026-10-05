export { EntityText, defaultEntityHref } from './EntityText';
export type { EntityTextProps } from './EntityText';
export { ENTITY_TEXT_CSS } from './entity-text-css';
export { summaryFromItem, summaryFromEntry, transportSummaryLoader } from './summary';
export type { EntitySummary, EntitySummaryLoader, EntitySummaryTransport } from './summary';
export {
    adaptEntityJson,
    bookIndexUriToId,
    remapPlainOffsets,
    segmentEntities,
    isCountedChar,
} from '../../core/entity-annotations';
export type { EntityKind, EntitySpan, EntitySegment } from '../../core/entity-annotations';
