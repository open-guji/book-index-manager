/**
 * 四张详情页共用的小件：署名行、关系名、存佚名、资源类别名。
 */
import React from 'react';
import type { AuthorInfo } from '../../types';
import { useConvert } from '../../i18n';
import { displayAuthorRole } from '../../core/detail-model';
import { BidLink, type RenderLink } from './primitives';

/** related_works.relation → 小一号的浅色文字 */
const RELATION_LABEL: Record<string, string> = {
    part_of: '所屬',
    has_part: '包含',
    contains_text_of: '收錄',
    collected_in: '叢編',
    text_carried_by: '載錄',
    studied_by: '研究',
    studies: '所考',
    preceded_by: '前承',
    followed_by: '後繼',
    derived_from: '衍生',
    has_adaptation: '改編',
    related: '相關',
};

export function relationLabel(r?: string): string {
    if (!r) return RELATION_LABEL.related;
    return RELATION_LABEL[r] ?? r;
}

const LOSS_STATUS: Record<string, string> = {
    extant: '今存',
    fragment: '殘存',
    partial: '殘存',
    lost: '已佚',
    unknown: '未詳',
};

export function lossStatusLabel(s: string): string {
    return LOSS_STATUS[s] ?? s;
}

const KIND: Record<string, string> = {
    text: '全文',
    image: '影印',
    textImage: '圖文',
    physical: '館藏',
};

export function resourceKindLabel(k: string): string {
    return KIND[k] ?? '';
}

/**
 * 署名：〔朝代〕人名 职任，多位作者用全角空格隔开。
 * 朝代用辅助字；有 entity_id 的人名可点到人物页。
 */
export function AuthorByline({ authors, onNavigate, renderLink }: {
    authors?: AuthorInfo[];
    onNavigate?: (id: string) => void;
    renderLink?: RenderLink;
}) {
    const { convert } = useConvert();
    const list = (authors || []).filter(a => a && a.name);
    if (!list.length) return null;
    return (
        <>
            {list.map((a, i) => {
                const role = displayAuthorRole(a.role);
                return (
                    <React.Fragment key={i}>
                        {i > 0 && '　'}
                        {a.dynasty && <span className="bim-d-meta" style={{ fontSize: 'inherit', marginRight: 2 }}>〔{convert(a.dynasty)}〕</span>}
                        {a.entity_id
                            ? <BidLink id={a.entity_id} label={convert(a.name)} onNavigate={onNavigate} renderLink={renderLink} dense />
                            : convert(a.name)}
                        {role && <span style={{ marginLeft: 4 }}>{convert(role)}</span>}
                    </React.Fragment>
                );
            })}
        </>
    );
}
