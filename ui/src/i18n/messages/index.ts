/**
 * 按区域分的字典登记处。新区域：messages/ 下建文件、defineMessages，再在这里登记一行。
 */
import type { Locale } from '../types';
import type { MessageSet } from './define';
import { common } from './common';
import { detail } from './detail';
import { bookPage } from './book-page';
import { workPage } from './work-page';
import { collectionPage } from './collection-page';
import { entityPage } from './entity-page';
import { reader } from './reader';
import { collated } from './collated';
import { metaHome } from './meta-home';
import { readHome } from './read-home';
import { catalogPage } from './catalog-page';
import { searchPage } from './search-page';
import { feedback } from './feedback';
import { lineage } from './lineage';

export const NAMESPACES = {
    common,
    detail,
    bookPage,
    workPage,
    collectionPage,
    entityPage,
    reader,
    collated,
    metaHome,
    readHome,
    catalogPage,
    searchPage,
    feedback,
    lineage,
} satisfies Record<string, MessageSet<unknown>>;

export type NamespaceMessages = { [K in keyof typeof NAMESPACES]: (typeof NAMESPACES)[K]['zh-Hant'] };

export function namespaceMessages(locale: Locale): NamespaceMessages {
    const out = {} as Record<string, unknown>;
    for (const [k, set] of Object.entries(NAMESPACES)) out[k] = (set as MessageSet<unknown>)[locale];
    return out as NamespaceMessages;
}

export { defineMessages } from './define';
export type { MessageSet, Shape, DeepPartial } from './define';
