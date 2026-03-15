import React, { useState } from 'react';
import type { IndexType, RelatedEntity } from '../types';

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
                    <span>🔗</span><span>关联关系</span>
                </div>
                {onSaveRelations && (
                    <button onClick={onSaveRelations} style={saveBtnStyle}>保存</button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {entityType === 'book' && (
                    <>
                        <RelationSection direction="up" title="所属作品 (Work)" entity={belongsToWork}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('workId')}
                            onLink={() => onLinkEntity('workId', 'work')}
                            onCreate={() => onCreateAndLink('workId', 'work', { title: entityTitle })} />
                        <RelationSection direction="up" title="收录于丛编 (Collection)" entity={belongsToCollection}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('collectionId')}
                            onLink={() => onLinkEntity('collectionId', 'collection')}
                            onCreate={() => onCreateAndLink('collectionId', 'collection', { title: entityTitle })} />
                        {belongsToWork && siblingBooks && siblingBooks.length > 0 && (
                            <RelationListSection direction="horizontal" title={`同作品其他版本 (${siblingBooks.length})`}
                                entities={siblingBooks} onView={onViewEntity}
                                onAdd={() => onCreateAndLink('siblingBook', 'book', { workId: belongsToWork.id })} addLabel="为此作品添加新版本" />
                        )}
                    </>
                )}

                {entityType === 'work' && (
                    <>
                        <RelationSection direction="up" title="父作品 (Parent Work)" entity={parentWork}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('parentWorkId')}
                            onLink={() => onLinkEntity('parentWorkId', 'work')}
                            onCreate={() => onCreateAndLink('parentWorkId', 'work')} />
                        {childWorks && childWorks.length > 0 && (
                            <RelationListSection direction="down" title={`子作品 (${childWorks.length})`}
                                entities={childWorks} onView={onViewEntity}
                                onAdd={() => onCreateAndLink('childWork', 'work', { parentWorkId: entityId })} addLabel="添加子作品" />
                        )}
                        {childCollections && childCollections.length > 0 && (
                            <RelationListSection direction="down" title={`丛编实现 (${childCollections.length})`}
                                entities={childCollections} onView={onViewEntity}
                                onAdd={() => onCreateAndLink('childCollection', 'collection', { workId: entityId })} addLabel="添加丛编实现" />
                        )}
                        <RelationListSection direction="down"
                            title={`所有版本 (${containedBooks?.length ?? 0})`}
                            entities={containedBooks || []} onView={onViewEntity}
                            onAdd={() => onCreateAndLink('childBook', 'book', { workId: entityId })} addLabel="添加新版本" />
                    </>
                )}

                {entityType === 'collection' && (
                    <>
                        <RelationSection direction="up" title="对应作品 (Work)" entity={belongsToWork}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('workId')}
                            onLink={() => onLinkEntity('workId', 'work')}
                            onCreate={() => onCreateAndLink('workId', 'work', { title: entityTitle })} />
                        <RelationSection direction="up" title="父丛编 (Parent Collection)" entity={parentCollection}
                            onView={onViewEntity} onUnlink={() => onUnlinkEntity('parentCollectionId')}
                            onLink={() => onLinkEntity('parentCollectionId', 'collection')}
                            onCreate={() => onCreateAndLink('parentCollectionId', 'collection')} />
                        <RelationListSection direction="down"
                            title={`子丛编 (${childCollections?.length ?? 0})`}
                            entities={childCollections || []} onView={onViewEntity}
                            onAdd={() => onCreateAndLink('childCollection', 'collection', { parentCollectionId: entityId })} addLabel="添加子丛编" />
                        <RelationListSection direction="down"
                            title={`包含书籍 (${containedBooks?.length ?? 0})`}
                            entities={containedBooks || []} onView={onViewEntity}
                            onAdd={() => onCreateAndLink('childBook', 'book', { collectionId: entityId })} addLabel="添加书籍" />
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
}> = ({ direction, title, entity, onView, onUnlink, onLink, onCreate }) => {
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
                        <ActionBtn onClick={() => onView(entity)} title="查看">👁️</ActionBtn>
                        <ActionBtn onClick={onUnlink} title="解除关联" danger>✕</ActionBtn>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '8px', background: 'var(--bim-bg, #fff)', borderRadius: '4px', color: 'var(--bim-desc-fg, #717171)', fontSize: '12px', textAlign: 'center' }}>
                    (未关联)
                </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <SmallBtn onClick={onLink}>+ 关联现有</SmallBtn>
                <SmallBtn onClick={onCreate} primary>+ 创建并关联</SmallBtn>
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
}> = ({ direction, title, entities, onView, onAdd, addLabel }) => {
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
                            展开更多 ({entities.length - 5} 项)
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ padding: '8px', background: 'var(--bim-bg, #fff)', borderRadius: '4px', color: 'var(--bim-desc-fg, #717171)', fontSize: '12px', textAlign: 'center' }}>
                    (暂无)
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
