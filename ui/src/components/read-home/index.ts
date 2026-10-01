// 阅读首页（overview#308 C 块）：推荐题签卡、史志书架、专题分组、名著版本卡、四部方块、年代带、单篇诗文
export {
    ReadHomeView, ReadSection, ReadStats, ReadPicks, ReadShelf, ReadTopicGroup, ReadTopics, ReadFamousWorks,
    ReadSibu, ReadPeriodBand, ReadPieces, READ_HOME_SECTION_IDS,
} from './ReadHome';
export type { ReadHomeViewProps } from './ReadHome';
export { READ_HOME_CSS, READ_HOME_NARROW_QUERY } from './read-home-css';
export {
    READ_PERIOD_LABELS, DEFAULT_READ_HOME_LINKS, withDefaultLinks, firstAuthorText, authorsLine, shelfColumns, spineHeight,
    periodLevel, PERIOD_NARROW_SHARE, fmtCount,
} from './model';
export type {
    ReadCard, ReadPick, ReadTopic, ReadTopicItem, ReadFamous, ReadFamousItem, ReadBu, ReadPeriod, ReadPieceAuthor,
    ReadSections, ReadHomeLinks,
} from './model';
