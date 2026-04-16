/**
 * BidLink: handles bid:\\ protocol links in Markdown format.
 * Port of Python book_index_manager.bid_link
 *
 * Format: [Title](bid:\\ID)
 */

import type { IndexType } from '../types';
import { base36Encode, smartDecode, decodeIdString } from '../id';

export class BidLink {
    static readonly PROTOCOL = 'bid:\\\\';
    static readonly PREFIX = 'bid:\\\\';

    readonly title: string;
    readonly idStr: string;
    readonly idInt: bigint;

    private _type: IndexType | null = null;

    constructor(idVal: string | bigint, title: string = '') {
        this.title = title;

        if (typeof idVal === 'string') {
            if (idVal.startsWith(BidLink.PREFIX)) {
                idVal = idVal.slice(BidLink.PREFIX.length);
            }
            this.idStr = idVal;
            try {
                this.idInt = smartDecode(idVal);
            } catch {
                this.idInt = 0n;
            }
        } else {
            this.idInt = idVal;
            this.idStr = base36Encode(idVal);
        }

        if (this.idInt > 0n) {
            try {
                const components = decodeIdString(this.idStr);
                this._type = components.type;
            } catch {
                // ignore
            }
        }
    }

    get type(): IndexType | null {
        return this._type;
    }

    getIcon(): string {
        if (this._type === null) return '';
        if (this._type === 'book') return '📖 ';
        if (this._type === 'collection') return '📚 ';
        if (this._type === 'work') return '📜 ';
        return '';
    }

    render(withIcon: boolean = false): string {
        const icon = withIcon ? this.getIcon() : '';
        return `[${icon}${this.title}](${BidLink.PREFIX}${this.idStr})`;
    }

    static parseFromLink(markdownLink: string): BidLink | null {
        const match = markdownLink.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
            const title = match[1];
            const url = match[2];
            if (url.startsWith(BidLink.PREFIX)) {
                const idPart = url.slice(BidLink.PREFIX.length);
                return new BidLink(idPart, title);
            }
        }
        return null;
    }

    static isBidLink(url: string): boolean {
        return url.startsWith(BidLink.PREFIX);
    }
}
