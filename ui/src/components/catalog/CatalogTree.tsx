/**
 * 古籍总目分类树（经史子集四级 + 「未分類」）。
 *
 * 键盘：照 N5a ReaderToc 的「游走 tabindex」——整棵树只有一项可 Tab 到（当前节点），
 * 其余用 ↑↓ / Home / End 移动，→ 展开 / 进子级，← 收起 / 回父级，Enter / 空格选中。
 * 结构按 WAI-ARIA tree：li[role=treeitem] 带 aria-level / aria-expanded / aria-selected，
 * 子级是 ul[role=group]。
 *
 * 展开状态是本组件的内部 state，初值由 selectedId 推出（其祖先链展开）——
 * 服务端与客户端首帧一致。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogNode } from '../../types';
import { useConvert } from '../../i18n';
import { CATALOG_ALL_ID, catalogTotal, findCatalogPath } from './model';

export interface CatalogTreeProps {
    tree: CatalogNode[];
    /** 当前节点；空或 CATALOG_ALL_ID 表示「全部」 */
    selectedId?: string | null;
    onSelect: (id: string) => void;
    /** 顶部「全部」行的文字；传 null 不显示这一行。默认「全部」 */
    allLabel?: string | null;
    /** 树的无障碍名称 */
    label?: string;
}

const Chevron = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

interface VisibleItem { id: string; parentId: string | null; hasChildren: boolean; firstChildId: string | null }

/** 当前可见（祖先都展开）的节点，按显示顺序 */
function visibleItems(tree: CatalogNode[], expanded: Set<string>, allRow: boolean): VisibleItem[] {
    const out: VisibleItem[] = [];
    if (allRow) out.push({ id: CATALOG_ALL_ID, parentId: null, hasChildren: false, firstChildId: null });
    const walk = (nodes: CatalogNode[], parentId: string | null) => {
        for (const n of nodes) {
            const kids = n.children?.length ? n.children : null;
            out.push({ id: n.id, parentId, hasChildren: !!kids, firstChildId: kids ? kids[0].id : null });
            if (kids && expanded.has(n.id)) walk(kids, n.id);
        }
    };
    walk(tree, null);
    return out;
}

export function CatalogTree({ tree, selectedId, onSelect, allLabel = '全部', label = '分類' }: CatalogTreeProps) {
    const { convert } = useConvert();
    const ref = useRef<HTMLUListElement>(null);
    const current = selectedId && selectedId !== CATALOG_ALL_ID ? selectedId : null;
    const showAll = allLabel !== null;

    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const s = new Set<string>();
        for (const n of findCatalogPath(tree, current)) s.add(n.id);
        return s;
    });
    // 选中节点变了：展开它的祖先链（不收起用户已展开的）
    useEffect(() => {
        const path = findCatalogPath(tree, current);
        if (!path.length) return;
        setExpanded(prev => {
            if (path.every(n => prev.has(n.id))) return prev;
            const next = new Set(prev);
            for (const n of path) next.add(n.id);
            return next;
        });
    }, [tree, current]);

    const visible = useMemo(() => visibleItems(tree, expanded, showAll), [tree, expanded, showAll]);

    /** 键盘移动到的那一项；null 时退回当前节点 */
    const [focusId, setFocusId] = useState<string | null>(null);
    useEffect(() => { setFocusId(null); }, [selectedId]);

    const selectedRowId = current ?? (showAll ? CATALOG_ALL_ID : null);
    const tabId = useMemo(() => {
        const ids = new Set(visible.map(v => v.id));
        if (focusId && ids.has(focusId)) return focusId;
        if (selectedRowId && ids.has(selectedRowId)) return selectedRowId;
        // 当前节点藏在收起的分组里：退到最近一级可见的祖先
        const anc = findCatalogPath(tree, current).map(n => n.id).filter(x => ids.has(x));
        if (anc.length) return anc[anc.length - 1];
        return visible[0]?.id ?? null;
    }, [visible, focusId, selectedRowId, tree, current]);

    const toggle = useCallback((id: string, open?: boolean) => {
        setExpanded(prev => {
            const has = prev.has(id);
            const want = open ?? !has;
            if (want === has) return prev;
            const next = new Set(prev);
            if (want) next.add(id); else next.delete(id);
            return next;
        });
    }, []);

    const focusItem = useCallback((id: string) => {
        setFocusId(id);
        // 下一帧该项已是 tabIndex=0（可能刚随展开渲染出来）
        requestAnimationFrame(() => {
            const el = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-ct-id]') ?? [])
                .find(e => e.dataset.ctId === id);
            el?.focus();
        });
    }, []);

    const select = useCallback((id: string, hasChildren: boolean) => {
        if (hasChildren) toggle(id, true);
        onSelect(id);
    }, [onSelect, toggle]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-ct-id]');
        if (!target) return;
        const id = target.dataset.ctId!;
        const idx = visible.findIndex(v => v.id === id);
        if (idx < 0) return;
        const item = visible[idx];
        let next: string | null = null;
        switch (e.key) {
            case 'ArrowDown': next = visible[Math.min(visible.length - 1, idx + 1)].id; break;
            case 'ArrowUp': next = visible[Math.max(0, idx - 1)].id; break;
            case 'Home': next = visible[0].id; break;
            case 'End': next = visible[visible.length - 1].id; break;
            case 'ArrowRight':
                if (!item.hasChildren) break;
                if (!expanded.has(id)) toggle(id, true);
                else next = item.firstChildId;
                break;
            case 'ArrowLeft':
                if (item.hasChildren && expanded.has(id)) toggle(id, false);
                else next = item.parentId;
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                select(id, item.hasChildren);
                return;
            default:
                return;
        }
        e.preventDefault();
        if (next && next !== id) focusItem(next);
    }, [visible, expanded, toggle, focusItem, select]);

    const renderNodes = (nodes: CatalogNode[], level: number): React.ReactNode => nodes.map((n, idx) => {
        const kids = n.children?.length ? n.children : null;
        const open = !!kids && expanded.has(n.id);
        const isSel = n.id === current;
        // 顶层最后一个节点（未分類）上方画分隔线；不认 id：网站用 `unclassified`，插件用 `未分類`
        const last = level === 1 && nodes.length > 1 && idx === nodes.length - 1;
        return (
            <li
                key={n.id}
                role="treeitem"
                aria-level={level}
                aria-expanded={kids ? open : undefined}
                aria-selected={isSel}
                tabIndex={tabId === n.id ? 0 : -1}
                data-ct-id={n.id}
                className={last ? 'bim-ct-last' : undefined}
            >
                <div
                    className="bim-ct-row"
                    style={{ ['--bimct-lv' as string]: level - 1 }}
                    onClick={() => { setFocusId(n.id); select(n.id, !!kids); }}
                >
                    <span
                        className="bim-ct-tw"
                        aria-hidden="true"
                        onClick={kids ? e => { e.stopPropagation(); setFocusId(n.id); toggle(n.id); } : undefined}
                    >
                        {kids ? <Chevron /> : null}
                    </span>
                    <span className="bim-ct-lb">{convert(n.label)}</span>
                    <span className="bim-ct-n">{n.count.toLocaleString('en-US')}</span>
                </div>
                {open && (
                    <ul role="group">{renderNodes(kids!, level + 1)}</ul>
                )}
            </li>
        );
    });

    return (
        <ul ref={ref} role="tree" aria-label={convert(label)} className="bim-ct-tree" onKeyDown={onKeyDown}>
            {showAll && (
                <li
                    role="treeitem"
                    aria-level={1}
                    aria-selected={!current}
                    tabIndex={tabId === CATALOG_ALL_ID ? 0 : -1}
                    data-ct-id={CATALOG_ALL_ID}
                >
                    <div className="bim-ct-row" onClick={() => { setFocusId(CATALOG_ALL_ID); onSelect(CATALOG_ALL_ID); }}>
                        <span className="bim-ct-tw" aria-hidden="true" />
                        <span className="bim-ct-lb">{convert(allLabel)}</span>
                        <span className="bim-ct-n">{catalogTotal(tree).toLocaleString('en-US')}</span>
                    </div>
                </li>
            )}
            {renderNodes(tree, 1)}
        </ul>
    );
}
