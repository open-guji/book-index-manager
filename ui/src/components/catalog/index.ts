// 古籍总目（N4a）：分类树 + 作品卡片网格 + 页面组合；数据契约类型在 ../../types
export { CatalogPage } from './CatalogPage';
export type { CatalogPageProps } from './CatalogPage';
export { CatalogTree } from './CatalogTree';
export type { CatalogTreeProps } from './CatalogTree';
export { WorkCardGrid, WorkCard, WorkRow, CatalogPager, defaultWorkLink } from './WorkCardGrid';
export type { WorkCardGridProps, CatalogPagerProps } from './WorkCardGrid';
export { CATALOG_CSS, CATALOG_NARROW_QUERY } from './catalog-css';
export {
    CATALOG_ALL_ID, CATALOG_UNCLASSIFIED_ID, CATALOG_PAGE_SIZE,
    buildCatalogTree, findCatalogPath, catalogTotal, catalogPageCount, paginationItems,
    classificationPath, catalogNodeIdOf, catalogNodeIdsOf,
    toCatalogWorkCard, compareCatalogCards,
} from './model';
export type { ClassificRow, CatalogWorkSource } from './model';
