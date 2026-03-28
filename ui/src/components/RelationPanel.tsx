import React, { useState } from 'react';
import type { IndexType, RelatedEntity } from '../types';
import { useT } from '../i18n';

export interface RelationPanelProps {
    entityType: IndexType;
    entityId: string;
    entityTitle: string;
    parentWork?: RelatedEntity;
    parentCollection?: RelatedEntity;
    belongsToWork?: RelatedEntity;
    belongsToCollection?: RelatedEntity;
    childWorks?: RelatedEntity[];
    childCollections?: RelatedEntity[];
    containedBooks?: RelatedEntity[];
    siblingBooks?: RelatedEntity[];
    onLinkEntity: (relationField: string, entityType: IndexType) => void;
    onUnlinkEntity: (relationField: string) => void;
    onViewEntity: (entity: RelatedEntity) => void;
    onCreateAndLink: (relationField: string, entityType: IndexType, inheritData?: Record<string, unknown>) => void;
    onSaveRelations?: () => void;
}

export const RelationPanel: React.FC<RelationPanelProps> = ({
    entityType, entityId, entityTitle,
    parentWork, parentCollection, belongsToWork, belongsToCollection,
    childWorks, childCollections, containedBooks, siblingBooks,
    onLinkEntity, onUnlinkEntity, onViewEntity, onCreateAndLink, onSaveRelations,
}) => {
    const t = useT();

    return (
        <div style={{
            background: 'var(--bim-bg, #fff)',
            border: '1px solid var(--bim-widget-border, #e0e0e0)',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '12px',
        }}>
            <div style={{
                fontSize: '14px', fontWeight: 600, marginBottom: '16px', paddingBottom: '8px',
                borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔗</span><span>{t.section.relations}</span>
                </div>
                {onSaveRelations && (
                    <button onClick={onSaveRelations} style={saveBtnStyle}>{t.action.save}</button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {entityType === 'book' && (
                    <>
                        <RelationSection direction="up" title={t.relation.belongsToWork} entity={belongsToWork}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('workId')}
                            onLink={() => onLinkEntity('workId', 'work')}
                            onCreate={() => onCreateAndLink('workId', 'work', { title: entityTitle })}
                            linkLabel={t.action.linkExisting} createLabel={t.action.createAndLink}
                            notLinkedLabel={t.relation.notLinked} viewLabel={t.action.viewEntity} unlinkLabel={t.action.unlink} />
                        <RelationSection direction="up" title={t.relation.containedInCollection} entity={belongsToCollection}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('collectionId')}
                            onLink={() => onLinkEntity('collectionId', 'collection')}
                            onCreate={() => onCreateAndLink('collectionId', 'collection', { title: entityTitle })}
                            linkLabel={t.action.linkExisting} createLabel={t.action.createAndLink}
                            notLinkedLabel={t.relation.notLinked} viewLabel={t.action.viewEntity} unlinkLabel={t.action.unlink} />
                        {belongsToWork && siblingBooks && siblingBooks.length > 0 && (
                            <RelationListSection direction="horizontal" title={`${t.relation.siblingVersions} (${siblingBooks.length})`}
                                entities={siblingBooks} onView={onViewEntity}
                                onAdd={() => onCreateAndLink('siblingBook', 'book', { workId: belongsToWork.id })} addLabel={t.relation.addVersionForWork}
                                noneLabel={t.relation.none} expandMoreLabel={t.action.expandMore} />
                        )}
                    </>
                )}

                {entityType === 'work' && (
                    <>
                        <RelationSection direction="up" title={t.relation.parentWork} entity={parentWork}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('parentWorkId')}
                            onLink={() => onLinkEntity('parentWorkId', 'work')}
                            onCreate={() => onCreateAndLink('parentWorkId', 'work')}
                            linkLabel={t.action.linkExisting} createLabel={t.action.createAndLink}
                            notLinkedLabel={t.relation.notLinked} viewLabel={t.action.viewEntity} unlinkLabel={t.action.unlink} />
                        {childWorks && childWorks.length > 0 && (
                            <RelationListSection direction="down" title={`${t.relation.childWorks} (${childWorks.length})`}
                                entities={childWorks} onView={onViewEntity}
                                onAdd={() => onCreateAndLink('childWork', 'work', { parentWorkId: entityId })} addLabel={t.action.addSubWork}
                                noneLabel={t.relation.none} expandMoreLabel={t.action.expandMore} />
                        )}
                        {childCollections && childCollections.length > 0 && (
                            <RelationListSection direction="down" title={`${t.relation.collectionImpl} (${childCollections.length})`}
                                entities={childCollections} onView={onViewEntity}
                                onAdd={() => onCreateAndLink('childCollection', 'collection', { workId: entityId })} addLabel={t.action.addCollectionImpl}
                                noneLabel={t.relation.none} expandMoreLabel={t.action.expandMore} />
                        )}
                        <RelationListSection direction="down"
                            title={`${t.relation.allVersions} (${containedBooks?.length ?? 0})`}
                            entities={containedBooks || []} onView={onViewEntity}
                            onAdd={() => onCreateAndLink('childBook', 'book', { workId: entityId })} addLabel={t.action.addVersion}
                            noneLabel={t.relation.none} expandMoreLabel={t.action.expandMore} />
                    </>
                )}

                {entityType === 'collection' && (
                    <>
                        <RelationSection direction="up" title={t.relation.correspondingWork} entity={belongsToWork}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('workId')}
                            onLink={() => onLinkEntity('workId', 'work')}
                            onCreate={() => onCreateAndLink('workId', 'work', { title: entityTitle })}
                            linkLabel={t.action.linkExisting} createLabel={t.action.createAndLink}
                            notLinkedLabel={t.relation.notLinked} viewLabel={t.action.viewEntity} unlinkLabel={t.action.unlink} />
                        <RelationSection direction="up" title={t.relation.parentCollection} entity={parentCollection}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('parentCollectionId')}
                            onLink={() => onLinkEntity('parentCollectionId', 'collection')}
                            onCreate={() => onCreateAndLink('parentCollectionId', 'collection')}
                            linkLabel={t.action.linkExisting} createLabel={t.action.createAndLink}
                            notLinkedLabel={t.relation.notLinked} viewLabel={t.action.viewEntity} unlinkLabel={t.action.unlink} />
                        <RelationListSection direction="down"
                            title={`${t.relation.childCollections} (${childCollections?.length ?? 0})`}
                            entities={childCollections || []} onView={onViewEntity}
                            onAdd={() => onCreateAndLink('childCollection', 'collection', { parentCollectionId: entityId })} addLabel={t.action.addSubCollection}
                            noneLabel={t.relation.none} expandMoreLabel={t.action.expandMore} />
                        <RelationListSection direction="down"
                            title={`${t.relation.containedBooks} (${containedBooks?.length ?? 0})`}
                            entities={containedBooks || []} onView={onViewEntity}
                            onAdd={() => onCreateAndLink('childBook', 'book', { collectionId: entityId })} addLabel={t.action.addBook}
                            noneLabel={t.relation.none} expandMoreLabel={t.action.expandMore} />
                    </>
                )}
            </div>
        </div>
    );
};

// ── 子组件 ──

const RelationSection: React.FC<{
    direction: 'up' | 'down' | 'horizontal';
    title: string;
    entity?: RelatedEntity;
    onView: (entity: RelatedEntity) => void;
    onUnlink: () => void;
    onLink: () => void;
    onCreate: () => void;
    linkLabel: string;
    createLabel: string;
    notLinkedLabel: string;
    viewLabel: string;
    unlinkLabel: string;
}> = ({ direction, title, entity, onView, onUnlink, onLink, onCreate, linkLabel, createLabel, notLinkedLabel, viewLabel, unlinkLabel }) => {
    const dirColor = direction === 'up' ? '#2196f3' : direction === 'down' ? '#4caf50' : '#ff9800';
    const dirIcon = direction === 'up' ? '\u2B06\uFE0F' : direction === 'down' ? '\u2B07\uFE0F' : '\u2194\uFE0F';

    return (
        <div style={{ border: '1px solid var(--bim-widget-border, #e0e0e0)', borderRadius: '4px', padding: '10px', background: 'var(--bim-input-bg, #fff)' }}>
            <div style={{ fontSize: '12px', color: dirColor, fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{dirIcon}</span><span>{title}</span>
            </div>
            {entity ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--bim-bg, #fff)', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{getTypeIcon(entity.type)}</span>
                        <span style={{ fontWeight: 500 }}>{entity.title}</span>
                        <span style={{ fontSize: '11px', opacity: 0.6 }}>{entity.id}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <ActionBtn onClick={() => onView(entity)} title={viewLabel}>👁️</ActionBtn>
                        <ActionBtn onClick={onUnlink} title={unlinkLabel} danger>✕</ActionBtn>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '8px', background: 'var(--bim-bg, #fff)', borderRadius: '4px', color: 'var(--bim-desc-fg, #717171)', fontSize: '12px', textAlign: 'center' }}>
                    {notLinkedLabel}
                </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <SmallBtn onClick={onLink}>{linkLabel}</SmallBtn>
                <SmallBtn onClick={onCreate} primary>{createLabel}</SmallBtn>
            </div>
        </div>
    );
};

const RelationListSection: React.FC<{
    direction: 'up' | 'down' | 'horizontal';
    title: string;
    entities: RelatedEntity[];
    onView: (entity: RelatedEntity) => void;
    onAdd: () => void;
    addLabel: string;
    noneLabel: string;
    expandMoreLabel: string;
}> = ({ direction, title, entities, onView, onAdd, addLabel, noneLabel, expandMoreLabel }) => {
    const [expanded, setExpanded] = useState(false);
    const dirColor = direction === 'up' ? '#2196f3' : direction === 'down' ? '#4caf50' : '#ff9800';
    const dirIcon = direction === 'up' ? '\u2B06\uFE0F' : direction === 'down' ? '\u2B07\uFE0F' : '\u2194\uFE0F';
    const display = expanded ? entities : entities.slice(0, 5);

    return (
        <div style={{ border: '1px solid var(--bim-widget-border, #e0e0e0)', borderRadius: '4px', padding: '10px', background: 'var(--bim-input-bg, #fff)' }}>
            <div style={{ fontSize: '12px', color: dirColor, fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{dirIcon}</span><span>{title}</span>
            </div>
            {entities.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {display.map(e => (
                        <div key={e.id} onClick={() => onView(e)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--bim-bg, #fff)', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                            <span>{getTypeIcon(e.type)}</span><span>{e.title}</span>
                        </div>
                    ))}
                    {entities.length > 5 && !expanded && (
                        <div onClick={() => setExpanded(true)} style={{ padding: '4px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--bim-link-fg, #0066cc)', cursor: 'pointer' }}>
                            {expandMoreLabel} ({entities.length - 5})
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ padding: '8px', background: 'var(--bim-bg, #fff)', borderRadius: '4px', color: 'var(--bim-desc-fg, #717171)', fontSize: '12px', textAlign: 'center' }}>
                    {noneLabel}
                </div>
            )}
            <div style={{ marginTop: '8px' }}>
                <SmallBtn onClick={onAdd} primary>+ {addLabel}</SmallBtn>
            </div>
        </div>
    );
};

const ActionBtn: React.FC<{ onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }> = ({ onClick, title, danger, children }) => (
    <button onClick={e => { e.stopPropagation(); onClick(); }} title={title}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: '12px', color: danger ? 'var(--bim-danger, #f44336)' : 'inherit', opacity: 0.7 }}>
        {children}
    </button>
);

const SmallBtn: React.FC<{ onClick: () => void; primary?: boolean; children: React.ReactNode }> = ({ onClick, primary, children }) => (
    <button onClick={onClick} style={{
        padding: '4px 10px', fontSize: '11px',
        border: primary ? 'none' : '1px solid var(--bim-widget-border, #e0e0e0)',
        borderRadius: '4px',
        background: primary ? 'var(--bim-primary, #0078d4)' : 'transparent',
        color: primary ? 'var(--bim-primary-fg, #fff)' : 'inherit',
        cursor: 'pointer',
    }}>
        {children}
    </button>
);

function getTypeIcon(type: IndexType): string {
    switch (type) { case 'work': return '📜'; case 'book': return '📖'; case 'collection': return '📚'; }
}

const saveBtnStyle: React.CSSProperties = {
    padding: '4px 12px', fontSize: '12px', border: 'none', borderRadius: '4px',
    background: 'var(--bim-primary, #0078d4)', color: 'var(--bim-primary-fg, #fff)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '4px',
};
