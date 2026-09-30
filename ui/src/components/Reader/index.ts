/** 阅读器（整理本 / 全文共用）的公开出口 */
export { ReaderShell, flattenToc } from './ReaderShell';
export type { ReaderShellProps, PanelState } from './ReaderShell';
export { ReaderToc } from './ReaderToc';
export { ImagePanel } from './ImagePanel';
export { ReaderMdText, renderReaderInline, renderProperNames, canParagraphize } from './ReaderText';
export { useReaderPrefs, DEFAULT_READER_PREFS, FONT_SIZE_STEPS } from './prefs';
export type { ReaderPrefs } from './prefs';
export { READER_CSS } from './reader-css';
export { readerVersionsFromFullText, readerVersionOptionLabel, pickReaderVersion } from './versions';
export type {
    ReaderCharBox,
    ReaderPageImage,
    ReaderImageResolver,
    ReaderImageOverlay,
    ReaderTocItem,
    ReaderWritingMode,
    ReaderVersion,
    ReaderReportContext,
} from './types';
