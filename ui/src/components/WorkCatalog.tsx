import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { useBidUrl } from '../core/bid-url';
import { bim } from '../styles/tokens';

/** 四库总目等分类目录数据 */
interface CatalogBook {
    title: string;
    volumes?: string;
    author?: string;
    summary?: string;
    work_id?: string;
}

interface CatalogCategory {
    name: string;
    volumes?: string;
    subcategories?: CatalogCategory[];
    books?: {
        zhulu?: CatalogBook[];
        cunmu?: CatalogBook[];
    };
    stats?: { zhulu?: number; cunmu?: number };
}

interface CatalogDivision {
    name: string;
    categories: CatalogCategory[];
}

interface CatalogData {
    title: string;
    total_volumes?: number;
    divisions: CatalogDivision[];
    stats?: { zhulu?: number; cunmu?: number; total?: number; categories?: number };
}

export interface WorkCatalogProps {
    data: CatalogData;
    source?: string;
    onNavigate?: (id: string) => void;
    className?: string;
    style?: React.CSSProperties;
}

export const WorkCatalog: React.FC<WorkCatalogProps> = ({
    data,
    onNavigate,
    className,
    style,
}) => {
    const { t, convert } = useI18n();
    const [expandedDiv, setExpandedDiv] = useState<string | null>(data.divisions[0]?.name ?? null);
    const [expandedCat, setExpandedCat] = useState<string | null>(null);

    return (
        <div className={className} style={style}>
            {/* 标题和统计 */}
            <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: bim('fg'), margin: '0 0 8px' }}>
                    {convert(data.title)}
                </h2>
                {data.stats && (
                    <div style={{ fontSize: '13px', color: bim('desc-fg'), display: 'flex', gap: '16px' }}>
                        {data.total_volumes != null && <span>{t('catalog.totalVolumes')} <strong>{data.total_volumes}</strong> {t('unit.juan')}</span>}
                        {data.stats.zhulu != null && <span>{t('catalogPage.zhulu')} <strong>{data.stats.zhulu}</strong> {t('unit.bu')}</span>}
                        {data.stats.cunmu != null && <span>{t('catalogPage.cunmu')} <strong>{data.stats.cunmu}</strong> {t('unit.bu')}</span>}
                        {data.stats.categories != null && <span>{t('catalogPage.categoriesN', { n: data.stats.categories })}</span>}
                    </div>
                )}
            </div>

            {/* 四部 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.divisions.map(div => (
                    <DivisionSection
                        key={div.name}
                        division={div}
                        expanded={expandedDiv === div.name}
                        onToggle={() => setExpandedDiv(expandedDiv === div.name ? null : div.name)}
                        expandedCat={expandedCat}
                        onCatToggle={cat => setExpandedCat(expandedCat === cat ? null : cat)}
                        onNavigate={onNavigate}
                    />
                ))}
            </div>
        </div>
    );
};

const DivisionSection: React.FC<{
    division: CatalogDivision;
    expanded: boolean;
    onToggle: () => void;
    expandedCat: string | null;
    onCatToggle: (cat: string) => void;
    onNavigate?: (id: string) => void;
}> = ({ division, expanded, onToggle, expandedCat, onCatToggle, onNavigate }) => {
    const { t, convert } = useI18n();
    const totalBooks = division.categories.reduce((sum, c) => {
        const s = c.stats || { zhulu: 0, cunmu: 0 };
        return sum + (s.zhulu || 0) + (s.cunmu || 0);
    }, 0);

    return (
        <div style={{
            border: `1px solid ${bim('widget-border')}`,
            borderRadius: '6px',
            overflow: 'hidden',
        }}>
            <button
                onClick={onToggle}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: 'none',
                    background: expanded ? `color-mix(in srgb, ${bim('primary')} 6%, transparent)` : bim('bg'),
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: bim('fg'),
                    textAlign: 'left',
                }}
            >
                <span>{convert(division.name)}</span>
                <span style={{ fontSize: '12px', fontWeight: 400, color: bim('desc-fg') }}>
                    {t('catalogPage.divisionStat', { cats: division.categories.length, books: totalBooks })}
                    <span style={{ marginLeft: '8px' }}>{expanded ? '▲' : '▼'}</span>
                </span>
            </button>
            {expanded && (
                <div style={{ padding: '4px 0' }}>
                    {division.categories.map(cat => {
                        const catKey = `${division.name}/${cat.name}`;
                        return (
                            <CategorySection
                                key={cat.name}
                                category={cat}
                                expanded={expandedCat === catKey}
                                onToggle={() => onCatToggle(catKey)}
                                onNavigate={onNavigate}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const CategorySection: React.FC<{
    category: CatalogCategory;
    expanded: boolean;
    onToggle: () => void;
    onNavigate?: (id: string) => void;
}> = ({ category, expanded, onToggle, onNavigate }) => {
    const { t, convert } = useI18n();
    const zhulu = category.books?.zhulu || [];
    const cunmu = category.books?.cunmu || [];
    const total = (category.stats?.zhulu || zhulu.length) + (category.stats?.cunmu || cunmu.length);

    return (
        <div>
            <button
                onClick={onToggle}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 14px 6px 28px',
                    border: 'none',
                    background: expanded ? bim('input-bg') : 'transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: bim('fg'),
                    textAlign: 'left',
                }}
            >
                <span style={{ fontWeight: 500 }}>
                    {convert(category.name)}
                    {category.volumes && (
                        <span style={{ fontSize: '11px', color: bim('desc-fg'), marginLeft: '8px', fontWeight: 400 }}>
                            {t('catalogPage.categoryJuan', { n: convert(category.volumes) })}
                        </span>
                    )}
                </span>
                <span style={{ fontSize: '11px', color: bim('desc-fg') }}>
                    {t('catalogPage.booksN', { n: total })} {expanded ? '▲' : '▼'}
                </span>
            </button>
            {expanded && (zhulu.length > 0 || cunmu.length > 0) && (
                <div style={{ padding: '4px 14px 8px 42px' }}>
                    {zhulu.length > 0 && (
                        <BookList label={t('catalogPage.zhulu')} books={zhulu} onNavigate={onNavigate} />
                    )}
                    {cunmu.length > 0 && (
                        <BookList label={t('catalogPage.cunmu')} books={cunmu} onNavigate={onNavigate} />
                    )}
                </div>
            )}
        </div>
    );
};

const BookList: React.FC<{
    label: string;
    books: CatalogBook[];
    onNavigate?: (id: string) => void;
}> = ({ label, books, onNavigate }) => {
    const { t, convert } = useI18n();
    const buildUrl = useBidUrl();
    const [showAll, setShowAll] = useState(books.length <= 20);
    const displayed = showAll ? books : books.slice(0, 10);

    return (
        <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: bim('desc-fg'), marginBottom: '4px', fontWeight: 500 }}>
                {label} ({books.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {displayed.map((book, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '13px', lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 500, color: bim('fg') }}>
                            {book.work_id && onNavigate ? (
                                <a
                                    href={buildUrl(book.work_id)}
                                    onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onNavigate(book.work_id!); }}
                                    style={{ color: 'inherit', textDecoration: 'none', borderBottom: `1px dashed ${bim('link-fg')}` }}
                                >
                                    {convert(book.title)}
                                </a>
                            ) : convert(book.title)}
                        </span>
                        {book.volumes && (
                            <span style={{ fontSize: '11px', color: bim('desc-fg') }}>{convert(book.volumes)}</span>
                        )}
                        {book.author && (
                            <span style={{ fontSize: '11px', color: bim('desc-fg') }}>{convert(book.author).slice(0, 20)}</span>
                        )}
                    </div>
                ))}
            </div>
            {!showAll && (
                <button
                    onClick={() => setShowAll(true)}
                    style={{
                        marginTop: '4px',
                        padding: '2px 12px',
                        fontSize: '11px',
                        color: bim('primary'),
                        background: 'transparent',
                        border: `1px solid ${bim('widget-border')}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                    }}
                >
                    {t('catalogPage.expandAllN', { n: books.length })}
                </button>
            )}
        </div>
    );
};
