import React from 'react';
import { renderInterlinear } from './primitives';
import { splitFullTextTables } from '../../core/guji-table';
import type { GujiTable as GujiTableData } from '../../core/guji-table';

/*
 * 表格样式：细边框、表头加底色、窄屏横向滚动。
 * 边框与表头底色取 currentColor 的淡色，亮／暗两种配色下都可读；
 * 消费者可用 `--bim-table-border`／`--bim-table-head-bg` 覆盖。
 */
const WRAP_STYLE: React.CSSProperties = {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    margin: '0.8em 0',
    maxWidth: '100%',
};

const TABLE_STYLE: React.CSSProperties = {
    borderCollapse: 'collapse',
    fontSize: '0.9em',
    lineHeight: 1.6,
    whiteSpace: 'normal',
};

const BORDER = '1px solid var(--bim-table-border, color-mix(in srgb, currentColor 28%, transparent))';

const CELL_STYLE: React.CSSProperties = {
    border: BORDER,
    padding: '4px 8px',
    verticalAlign: 'top',
    textAlign: 'left',
    minWidth: '3em',
};

const HEAD_STYLE: React.CSSProperties = {
    ...CELL_STYLE,
    background: 'var(--bim-table-head-bg, color-mix(in srgb, currentColor 8%, transparent))',
    fontWeight: 600,
};

/** 一个 `:::table` 块；格内夹注照 `renderInterlinear` 以小字渲染 */
export function GujiTable({ table }: { table: GujiTableData }) {
    return (
        <div className="bim-guji-table-wrap" style={WRAP_STYLE}>
            <table className="bim-guji-table" style={TABLE_STYLE}>
                <tbody>
                    {table.rows.map((row, r) => (
                        <tr key={r}>
                            {row.cells.map((cell, c) => {
                                const Tag = row.header ? 'th' : 'td';
                                return (
                                    <Tag
                                        key={c}
                                        colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                                        rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                                        style={row.header ? HEAD_STYLE : CELL_STYLE}
                                    >
                                        {cell.empty ? null : renderInterlinear(cell.text)}
                                    </Tag>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** 整行 `**…**`（如宋史卷215 表前的房名 `**燕王房**`）按加粗显示；只在启用表格写法的书里用 */
function renderBoldLines(text: string): React.ReactNode {
    if (text.indexOf('**') < 0) return renderInterlinear(text);
    const parts = text.split(/(^\*\*[^*\n]+\*\*[ \t]*$)/m);
    return parts.map((p, i) =>
        i % 2 === 1
            ? <strong key={i}>{renderInterlinear(p.trim().slice(2, -2))}</strong>
            : <React.Fragment key={i}>{renderInterlinear(p)}</React.Fragment>,
    );
}

/**
 * 全文章节正文渲染。
 *
 * - `tableNotation` 为假（全文目录未声明 `table_notation: guji-table-v1`）：
 *   与改前完全相同，整章交给 `renderInterlinear`；
 * - 为真：`:::table … :::` 块渲染成表格，块外照旧（外加整行 `**…**` 加粗）。
 */
export function renderFullTextBody(text: string, tableNotation: boolean): React.ReactNode {
    if (!tableNotation) return renderInterlinear(text);
    return splitFullTextTables(text).map((seg, i) =>
        seg.type === 'table'
            ? <GujiTable key={i} table={seg.table} />
            : <React.Fragment key={i}>{renderBoldLines(seg.text)}</React.Fragment>,
    );
}
