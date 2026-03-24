import React, { useState, useCallback, useRef } from 'react';
import type {
    IndexType, IndexDetailData, ResourceEntry, DownloadProgress,
    RelationData, RelatedEntity, EntityOption, SourceItem,
    AdditionalWork, IndexedByEntry,
} from '../types';
import type { IndexStorage } from '../storage/types';
import { Section } from './common/Section';
import { FormInput } from './common/FormInput';
import { FormTextArea } from './common/FormTextArea';
import { Badge } from './common/Badge';
import { SmartBidInput } from './SmartBidInput';
import { ResourceEditor } from './ResourceEditor';
import { SourceEditor, parseSourceString, stringifySources } from './SourceEditor';
import { RelationPanel } from './RelationPanel';
import { EntitySelector } from './EntitySelector';
import { CreateEntityDialog } from './CreateEntityDialog';
import { EntityPickerDialog } from './EntityPickerDialog';

export interface IndexEditorProps {
    /** 元数据 */
    data: IndexEditorData;
    /** 数据变化回调 */
    onChange: (data: IndexEditorData) => void;
    /** 保存回调 */
    onSave: () => void;
    /** Transport（用于搜索实体等） */
    transport?: IndexStorage;
    /** 查看关联实体 */
    onNavigate?: (id: string, type: IndexType) => void;
    /** 删除回调 */
    showDelete?: boolean;
    onDelete?: () => void;
    /** AI 功能（VS Code 注入，Web 不传则不显示） */
    onAskAI?: (section: string) => void;
    /** 额外的 section 操作按钮 */
    renderSectionActions?: (section: string) => React.ReactNode;
    /** 下载资源回调 */
    onDownloadResource?: (index: number, url: string) => void;
    /** 下载状态 */
    downloadStatuses?: Record<number, DownloadProgress>;
    /** 关联关系数据 */
    relations?: RelationData;
    /** 关联关系变更回调 */
    onRelationsChange?: (relations: RelationData) => void;
}

/** 编辑器数据格式 */
export interface IndexEditorData {
    id: string;
    title: string;
    type: IndexType;
    author?: string;
    dynasty?: string;
    holder?: string;
    pages?: string;
    firstImage?: string;
    description?: string;
    resources?: ResourceEntry[];
    sources?: string;
    provenance?: string;
    otherEditions?: string;
    notes?: string;
    // 结构化字段
    additional_works?: AdditionalWork[];
    indexed_by?: IndexedByEntry[];
    // 关联字段
    workId?: string;
    workName?: string;
    collectionId?: string;
    collection?: string;
    parentWorkId?: string;
    parentWorkName?: string;
    parentCollectionId?: string;
}

const TYPE_COLORS: Record<IndexType, string> = { work: '#4caf50', collection: '#2196f3', book: '#ff9800' };
const TYPE_LABELS: Record<IndexType, string> = { work: '作品', collection: '丛书', book: '书籍' };
const TYPE_ICONS: Record<IndexType, string> = { work: '📜', collection: '📚', book: '📖' };

export const IndexEditor: React.FC<IndexEditorProps> = ({
    data, onChange, onSave, transport, onNavigate,
    showDelete, onDelete, onAskAI, renderSectionActions,
    onDownloadResource, downloadStatuses,
    relations, onRelationsChange,
}) => {
    // 实体选择器状态
    const [selectorOpen, setSelectorOpen] = useState(false);
    const [selectorType, setSelectorType] = useState<IndexType>('work');
    const [selectorField, setSelectorField] = useState('');
    const [selectorTitle, setSelectorTitle] = useState('');
    const [searchResults, setSearchResults] = useState<EntityOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // 创建实体对话框
    const [createOpen, setCreateOpen] = useState(false);
    const [createType, setCreateType] = useState<IndexType>('work');
    const [createField, setCreateField] = useState('');
    const [createInheritData, setCreateInheritData] = useState<Record<string, unknown> | undefined>();

    // 通用实体选择器
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerCallback, setPickerCallback] = useState<((entity: EntityOption) => void) | null>(null);
    const [recentEntities, setRecentEntities] = useState<EntityOption[]>([]);
    const entitySearchResolveRef = useRef<((results: EntityOption[]) => void) | null>(null);

    const entityType = data.type;
    const isWork = entityType === 'work';
    const isCollection = entityType === 'collection';
    const isBook = entityType === 'book';

    const handleChange = useCallback((field: keyof IndexEditorData, value: unknown) => {
        onChange({ ...data, [field]: value });
    }, [data, onChange]);

    // ── 关联关系处理 ──
    const handleLinkEntity = useCallback((relationField: string, targetType: IndexType) => {
        setSelectorField(relationField);
        setSelectorType(targetType);
        const label = TYPE_LABELS[targetType];
        setSelectorTitle(`选择要关联的${label}`);
        setSearchResults([]);
        setSelectorOpen(true);
    }, []);

    const handleUnlinkEntity = useCallback((relationField: string) => {
        if (transport?.unlinkEntity) {
            transport.unlinkEntity(data.id, relationField);
        }
    }, [transport, data.id]);

    const handleViewEntity = useCallback((entity: RelatedEntity) => {
        onNavigate?.(entity.id, entity.type);
    }, [onNavigate]);

    const handleCreateAndLink = useCallback((relationField: string, targetType: IndexType, inheritData?: Record<string, unknown>) => {
        const enhanced = { ...inheritData, author: inheritData?.author || data.author, dynasty: inheritData?.dynasty || data.dynasty };
        setCreateType(targetType);
        setCreateField(relationField);
        setCreateInheritData(enhanced);
        setCreateOpen(true);
    }, [data.author, data.dynasty]);

    const handleConfirmCreate = useCallback((name: string, inheritData: Record<string, unknown>) => {
        if (transport?.createAndLink) {
            transport.createAndLink(data.id, createField, { type: createType, title: name, inheritData });
        }
        setCreateOpen(false);
    }, [transport, data.id, createField, createType]);

    const handleSearch = useCallback((query: string) => {
        if (!query.trim()) { setSearchResults([]); return; }
        setIsSearching(true);
        if (transport?.searchEntities) {
            transport.searchEntities(query, selectorType).then(results => {
                setSearchResults(results);
                setIsSearching(false);
            }).catch(() => { setSearchResults([]); setIsSearching(false); });
        }
    }, [transport, selectorType]);

    const handleSelectEntity = useCallback((entity: EntityOption) => {
        if (transport?.linkEntity) {
            transport.linkEntity(data.id, selectorField, entity.id);
        }
        setSelectorOpen(false);
    }, [transport, data.id, selectorField]);

    const handleSaveRelations = useCallback(() => {
        onSave();
    }, [onSave]);

    // 通用实体选择器
    const handleOpenEntityPicker = useCallback((callback: (entity: EntityOption) => void) => {
        setPickerCallback(() => callback);
        setPickerOpen(true);
        if (transport?.getRecentEntities) {
            transport.getRecentEntities().then(setRecentEntities).catch(() => {});
        }
    }, [transport]);

    const handleEntitySearch = useCallback((query: string, _type: IndexType | 'all'): Promise<EntityOption[]> => {
        if (transport?.searchEntities) {
            return transport.searchEntities(query, _type === 'all' ? undefined : _type);
        }
        return Promise.resolve([]);
    }, [transport]);

    const handleEntityPickerSelect = useCallback((entity: EntityOption) => {
        if (transport?.addRecentEntity) {
            transport.addRecentEntity(entity);
        }
        setRecentEntities(prev => [entity, ...prev.filter(e => e.id !== entity.id)].slice(0, 10));
        pickerCallback?.(entity);
        setPickerOpen(false);
        setPickerCallback(null);
    }, [transport, pickerCallback]);

    return (
        <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '24px', borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)', paddingBottom: '16px',
            }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{TYPE_ICONS[entityType]}</span>
                    <span>{data.title || '未命名'}</span>
                    <Badge>{data.id}</Badge>
                    <Badge color={TYPE_COLORS[entityType]}>{TYPE_LABELS[entityType]}</Badge>
                </h1>
            </div>

            {/* 基本信息 */}
            <Section title="📊 基本信息" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('基本信息') : undefined}
                extraButtons={renderSectionActions?.('基本信息')}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <SmartBidInput
                        label={isWork ? '作品名 (Work Title)' : isCollection ? '丛书名 (Collection Title)' : '书名 (Book Title)'}
                        value={data.title} onChange={v => handleChange('title', v)} />
                    {isBook && (
                        <SmartBidInput label="所属作品 (Work)" value={data.workName || ''} onChange={v => handleChange('workName', v)} />
                    )}
                    <FormInput label="作者 (Author)" value={data.author || ''} onChange={v => handleChange('author', v)} />
                    <FormInput label="朝代/年份 (Dynasty/Year)" value={data.dynasty || ''} onChange={v => handleChange('dynasty', v)} />
                    {(isBook || isCollection) && (
                        <SmartBidInput label="收录于 (Collection)" value={data.collection || ''} onChange={v => handleChange('collection', v)} />
                    )}
                    {(isBook || isCollection) && (
                        <FormInput label="现藏于 (Holder)" value={data.holder || ''} onChange={v => handleChange('holder', v)} />
                    )}
                    {(isBook || isCollection) && (
                        <FormInput label={isBook ? '页数 (Pages)' : '册数 (Volumes)'} value={data.pages || ''} onChange={v => handleChange('pages', v)} />
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <FormInput label="首页图片 (First Image URL)" value={data.firstImage || ''} onChange={v => handleChange('firstImage', v)} />
                    </div>
                </div>
            </Section>

            {/* 描述 */}
            <Section title="📝 介绍 (Description)" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('介绍') : undefined}>
                <FormTextArea value={data.description || ''} onChange={v => handleChange('description', v)} placeholder="简要介绍..." />
            </Section>

            {/* 附属作品 */}
            {(data.additional_works?.length || 0) > 0 && (
                <Section title="📑 附属作品 (Additional Works)" onSave={onSave}>
                    <AdditionalWorksEditor
                        items={data.additional_works || []}
                        onChange={items => handleChange('additional_works', items)}
                    />
                </Section>
            )}

            {/* 收录于 */}
            <Section title="📖 收录于 (Indexed By)" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('收录于') : undefined}>
                <IndexedByEditor
                    items={data.indexed_by || []}
                    onChange={items => handleChange('indexed_by', items)}
                />
            </Section>

            {/* 文字资源 */}
            <Section title="📝 文字资源 (Text Resources)" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('资源') : undefined}>
                <ResourceEditor
                    items={data.resources || []}
                    onChange={(items: ResourceEntry[]) => handleChange('resources', items)}
                    onDownload={onDownloadResource}
                    downloadStatuses={downloadStatuses}
                    filterType="text"
                />
            </Section>

            {/* 图片资源 */}
            <Section title="🖼️ 图片资源 (Image Resources)" onSave={onSave}>
                <ResourceEditor
                    items={data.resources || []}
                    onChange={(items: ResourceEntry[]) => handleChange('resources', items)}
                    onDownload={onDownloadResource}
                    downloadStatuses={downloadStatuses}
                    filterType="image"
                />
            </Section>

            {/* 资料来源 */}
            <Section title="📚 资料来源 (Sources)" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('资料来源') : undefined}>
                <SourceEditor
                    items={parseSourceString(data.sources || '')}
                    onChange={(items: SourceItem[]) => handleChange('sources', stringifySources(items))}
                    onOpenEntityPicker={handleOpenEntityPicker}
                />
            </Section>

            {/* 收藏历史 */}
            {(isBook || isCollection) && (
                <Section title="📜 收藏历史 (Provenance)" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('收藏历史') : undefined}>
                    <FormTextArea value={data.provenance || ''} onChange={v => handleChange('provenance', v)} placeholder="该资源的流传与收藏记录..." />
                </Section>
            )}

            {/* 其他版本 */}
            {isBook && (
                <Section title="📚 其他版本 (Other Editions)" onSave={onSave} onAskAI={onAskAI ? () => onAskAI('其他版本') : undefined}>
                    <FormTextArea value={data.otherEditions || ''} onChange={v => handleChange('otherEditions', v)} placeholder="相关版本的 ID..." />
                </Section>
            )}

            {/* 关联关系 */}
            <RelationPanel
                entityType={entityType}
                entityId={data.id}
                entityTitle={data.title}
                parentWork={relations?.parentWork}
                parentCollection={relations?.parentCollection}
                belongsToWork={relations?.belongsToWork}
                belongsToCollection={relations?.belongsToCollection}
                childWorks={relations?.childWorks}
                childCollections={relations?.childCollections}
                containedBooks={relations?.containedBooks}
                siblingBooks={relations?.siblingBooks}
                onLinkEntity={handleLinkEntity}
                onUnlinkEntity={handleUnlinkEntity}
                onViewEntity={handleViewEntity}
                onCreateAndLink={handleCreateAndLink}
                onSaveRelations={handleSaveRelations}
            />

            {/* 危险区域 */}
            {showDelete && onDelete && (
                <div style={{
                    marginTop: '40px', padding: '16px',
                    border: '1px solid rgba(244,67,54,0.13)', background: 'rgba(244,67,54,0.03)', borderRadius: '4px',
                }}>
                    <div style={{ color: 'var(--bim-danger, #f44336)', fontWeight: 600, marginBottom: '8px' }}>
                        危险区域 (Danger Zone)
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--bim-desc-fg, #717171)', marginBottom: '12px' }}>
                        从索引库中永久删除该实体的所有元数据文件。
                    </p>
                    <button onClick={onDelete} style={{
                        padding: '8px 16px', fontSize: '13px',
                        border: '1px solid var(--bim-danger, #f44336)',
                        borderRadius: '4px', background: 'transparent',
                        color: 'var(--bim-danger, #f44336)', cursor: 'pointer',
                    }}>
                        删除该实体 (Delete Entity)
                    </button>
                </div>
            )}

            {/* 对话框 */}
            <EntitySelector
                isOpen={selectorOpen} entityType={selectorType} title={selectorTitle}
                onSelect={handleSelectEntity} onCancel={() => setSelectorOpen(false)}
                onCreate={() => { setSelectorOpen(false); handleCreateAndLink(selectorField, selectorType); }}
                searchResults={searchResults} onSearch={handleSearch} isLoading={isSearching}
                excludeId={data.id}
            />

            <CreateEntityDialog
                isOpen={createOpen} entityType={createType} relationField={createField}
                inheritData={createInheritData as any}
                onConfirm={handleConfirmCreate} onCancel={() => setCreateOpen(false)}
            />

            <EntityPickerDialog
                isOpen={pickerOpen} title="选择书籍/作品" filterType="all"
                recentEntities={recentEntities} excludeId={data.id}
                onSelect={handleEntityPickerSelect}
                onCancel={() => { setPickerOpen(false); setPickerCallback(null); }}
                onSearch={handleEntitySearch}
            />
        </div>
    );
};

// ── 附属作品编辑器 ──

function AdditionalWorksEditor({ items, onChange }: {
    items: AdditionalWork[];
    onChange: (items: AdditionalWork[]) => void;
}) {
    const update = (index: number, field: keyof AdditionalWork, value: unknown) => {
        const next = items.map((item, i) => i === index ? { ...item, [field]: value } : item);
        onChange(next);
    };
    const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
    const add = () => onChange([...items, { book_title: '' }]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <FormInput label="书名" value={item.book_title} onChange={v => update(i, 'book_title', v)} />
                    <div style={{ width: '100px' }}>
                        <FormInput label="卷数" value={item.n_juan != null ? String(item.n_juan) : ''} onChange={v => update(i, 'n_juan', v ? parseInt(v, 10) || undefined : undefined)} />
                    </div>
                    <button onClick={() => remove(i)} style={{
                        padding: '4px 8px', fontSize: '12px', border: '1px solid #ddd',
                        borderRadius: '4px', background: 'transparent', cursor: 'pointer', color: '#999',
                        marginTop: '18px',
                    }}>✕</button>
                </div>
            ))}
            <button onClick={add} style={{
                padding: '6px 12px', fontSize: '12px', border: '1px dashed #ccc',
                borderRadius: '4px', background: 'transparent', cursor: 'pointer', color: '#666',
                alignSelf: 'flex-start',
            }}>+ 添加附属作品</button>
        </div>
    );
}

// ── 收录于编辑器 ──

function IndexedByEditor({ items, onChange }: {
    items: IndexedByEntry[];
    onChange: (items: IndexedByEntry[]) => void;
}) {
    const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

    const update = (index: number, field: keyof IndexedByEntry, value: string) => {
        const next = items.map((item, i) => i === index ? { ...item, [field]: value || undefined } : item);
        onChange(next);
    };
    const remove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
        if (expandedIndex === index) setExpandedIndex(null);
    };
    const add = () => {
        onChange([...items, { source: '' }]);
        setExpandedIndex(items.length);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, i) => {
                const isExpanded = expandedIndex === i;
                return (
                    <div key={i} style={{
                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                        borderRadius: '6px', overflow: 'hidden',
                    }}>
                        {/* Header row */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 12px',
                            background: isExpanded ? 'color-mix(in srgb, var(--bim-primary, #0078d4) 5%, transparent)' : 'transparent',
                            cursor: 'pointer',
                        }} onClick={() => setExpandedIndex(isExpanded ? null : i)}>
                            <span style={{
                                fontSize: '10px', color: 'var(--bim-desc-fg, #717171)',
                                transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(90deg)' : 'none',
                            }}>▶</span>
                            <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>
                                {item.source || '(未命名来源)'}
                            </span>
                            {item.source_bid && (
                                <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)' }}>
                                    {item.source_bid}
                                </span>
                            )}
                            <button onClick={e => { e.stopPropagation(); remove(i); }} style={{
                                padding: '2px 6px', fontSize: '11px', border: '1px solid #ddd',
                                borderRadius: '3px', background: 'transparent', cursor: 'pointer', color: '#999',
                            }}>✕</button>
                        </div>
                        {/* Collapsed preview */}
                        {!isExpanded && (item.title_info || item.author_info) && (
                            <div style={{ padding: '0 12px 8px 28px', fontSize: '12px', color: 'var(--bim-desc-fg, #717171)' }}>
                                {item.title_info}{item.title_info && item.author_info && ' — '}{item.author_info}
                            </div>
                        )}
                        {/* Expanded form */}
                        {isExpanded && (
                            <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <FormInput label="来源名称" value={item.source} onChange={v => update(i, 'source', v)} />
                                    <FormInput label="来源 BID" value={item.source_bid || ''} onChange={v => update(i, 'source_bid', v)} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <FormInput label="题名" value={item.title_info || ''} onChange={v => update(i, 'title_info', v)} />
                                    <FormInput label="著者" value={item.author_info || ''} onChange={v => update(i, 'author_info', v)} />
                                </div>
                                <FormInput label="版本" value={item.version || ''} onChange={v => update(i, 'version', v)} />
                                <FormTextArea value={item.summary || ''} onChange={v => update(i, 'summary', v)} placeholder="提要..." />
                                <FormTextArea value={item.comment || ''} onChange={v => update(i, 'comment', v)} placeholder="按語..." />
                                <FormTextArea value={item.additional_comment || ''} onChange={v => update(i, 'additional_comment', v)} placeholder="附按..." />
                            </div>
                        )}
                    </div>
                );
            })}
            <button onClick={add} style={{
                padding: '6px 12px', fontSize: '12px', border: '1px dashed #ccc',
                borderRadius: '4px', background: 'transparent', cursor: 'pointer', color: '#666',
                alignSelf: 'flex-start',
            }}>+ 添加收录来源</button>
        </div>
    );
}
