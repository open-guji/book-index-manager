/** 阅读器（整理本 / 全文共用）的公开出口 */
export { ReaderShell, flattenToc } from './ReaderShell';
export type { ReaderShellProps, PanelState } from './ReaderShell';
export { ReaderToc } from './ReaderToc';
export { ImagePanel } from './ImagePanel';
export { ReaderMdText, renderReaderInline, renderProperNames, canParagraphize } from './ReaderText';
export { useReaderPrefs, DEFAULT_READER_PREFS, FONT_SIZE_STEPS } from './prefs';
export type { ReaderPrefs, ProperNameMode, QuoteStyle, BookTitleStyle, ReaderScriptMode } from './prefs';
export { READER_CSS } from './reader-css';
export { readerVersionOptionLabel, pickReaderVersion } from './versions';
export type {
    ReaderCharBox,
    ReaderPageImage,
    ReaderImageResolver,
    ReaderResolveContext,
    ReaderImageOverlay,
    ReaderTocItem,
    ReaderWritingMode,
    ReaderVersion,
    ReaderReportContext,
} from './types';

// 古籍透视矫正与图文对读 (Guji Warp & Interactive Reader)
export { GujiWarpCanvas } from './GujiWarpCanvas';
export type { PageWarpData, CharGeometry, ColumnGeometry, BanxinData, GujiWarpCanvasProps } from './GujiWarpCanvas';
export { GujiTextViewer } from './GujiTextViewer';
export type { PunctEntry, GujiTextViewerProps } from './GujiTextViewer';
export { StripWarpRenderer } from './StripWarpRenderer';
export type { StripTransform } from './StripWarpRenderer';
export { GujiInteractiveReader } from './GujiInteractiveReader';
export type { GujiInteractiveReaderProps } from './GujiInteractiveReader';
export { useChapterWarpData } from './useChapterWarpData';
export type { ReaderWarpResolver } from './useChapterWarpData';
export type { ReaderEntityResolver } from './useChapterEntities';
