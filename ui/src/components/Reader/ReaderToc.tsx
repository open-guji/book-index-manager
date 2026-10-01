/**
 * 阅读器目录（卷 / 章）。
 *
 * 宋史 496 卷、四庫總目 205 卷：若每一项都进 Tab 序列，键盘读者要按几百下才到正文。
 * 这里用「游走 tabindex」：整个目录只有当前卷一项可 Tab 到，其余用 ↑↓ / Home / End 移动，
 * Enter / 空格选中。分组标题是 <button aria-expanded>。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReaderTocItem } from './types';
import { useI18n } from '../../i18n/use-i18n';

function containsKey(item: ReaderTocItem, key: string | null): boolean {
    if (!key) return false;
    if (item.key === key) return true;
    return !!item.children?.some(c => containsKey(c, key));
}

const Chevron = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

function TocGroup({ item, activeKey, onSelect, tabKey }: {
    item: ReaderTocItem;
    activeKey: string | null;
    onSelect: (key: string) => void;
    tabKey: string | null;
}) {
    const hasActive = containsKey(item, activeKey);
    const [expanded, setExpanded] = useState(hasActive || !!item.defaultExpanded);
    useEffect(() => { if (hasActive) setExpanded(true); }, [hasActive]);
    useEffect(() => { if (item.defaultExpanded) setExpanded(true); }, [item.defaultExpanded]);
    return (
        <li>
            <button
                type="button"
                className="bim-rd-ti bim-rd-ti-group"
                aria-expanded={expanded}
                data-rd-toc-key={item.key}
                tabIndex={tabKey === item.key ? 0 : -1}
                onClick={() => setExpanded(e => !e)}
            >
                <Chevron />
                <span>{item.label}</span>
                {item.hint != null && <span className="bim-rd-hint">{item.hint}</span>}
            </button>
            {expanded && (
                <TocList items={item.children!} activeKey={activeKey} onSelect={onSelect} tabKey={tabKey} />
            )}
        </li>
    );
}

function TocList({ items, activeKey, onSelect, tabKey }: {
    items: ReaderTocItem[];
    activeKey: string | null;
    onSelect: (key: string) => void;
    tabKey: string | null;
}) {
    return (
        <ul>
            {items.map(it => it.children && it.children.length > 0 ? (
                <TocGroup key={it.key} item={it} activeKey={activeKey} onSelect={onSelect} tabKey={tabKey} />
            ) : (
                <li key={it.key}>
                    <button
                        type="button"
                        className="bim-rd-ti"
                        aria-current={it.key === activeKey ? 'true' : undefined}
                        disabled={it.disabled}
                        data-rd-toc-key={it.key}
                        tabIndex={tabKey === it.key ? 0 : -1}
                        onClick={() => onSelect(it.key)}
                    >
                        <span>{it.label}</span>
                        {it.hint != null && <span className="bim-rd-hint">{it.hint}</span>}
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** 第一个可 Tab 到的键：当前卷；当前卷藏在收起的分组里时退到该分组 */
function firstTabKey(items: ReaderTocItem[], activeKey: string | null): string | null {
    for (const it of items) {
        if (it.key === activeKey) return it.key;
        if (containsKey(it, activeKey)) return it.key; // 分组本身；展开后下面再细化
    }
    return items[0]?.key ?? null;
}

export function ReaderToc({ items, activeKey, onSelect, label: labelProp }: {
    items: ReaderTocItem[];
    activeKey: string | null;
    onSelect: (key: string) => void;
    label?: string;
}) {
    const { t } = useI18n();
    const label = labelProp ?? t('reader.toc');
    const ref = useRef<HTMLDivElement>(null);
    /** 当前可 Tab 到的那一项（随方向键移动） */
    const [focusKey, setFocusKey] = useState<string | null>(null);

    // 选中项变了：可 Tab 项回到当前卷
    useEffect(() => { setFocusKey(null); }, [activeKey]);

    const tabKey = useMemo(() => {
        if (focusKey) return focusKey;
        // 当前卷若已渲染出来（所在分组展开）就用它，否则用外层分组
        return activeKey ?? firstTabKey(items, activeKey);
    }, [focusKey, activeKey, items]);

    /*
     * 每次渲染后校正：恰有一项 tabindex=0。tabKey 对应的按钮不存在（藏在收起的分组里）时
     * 退到外层分组。直接改 DOM 是因为分组展开/收起不经过这一层的 state。
     */
    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        const btns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-rd-toc-key]'));
        if (btns.length === 0) return;
        const want = btns.find(b => b.dataset.rdTocKey === tabKey)
            ?? btns.find(b => b.dataset.rdTocKey === firstTabKey(items, activeKey))
            ?? btns.find(b => !b.disabled)
            ?? btns[0];
        for (const b of btns) b.tabIndex = b === want ? 0 : -1;
    });

    // 当前卷滚进目录可视区（只滚目录自己，不动页面）
    useEffect(() => {
        const root = ref.current;
        const scroller = root?.closest('.bim-rd-toc') as HTMLElement | null;
        if (!root || !scroller || !activeKey) return;
        const el = Array.from(root.querySelectorAll<HTMLElement>('[data-rd-toc-key]')).find(b => b.dataset.rdTocKey === activeKey);
        if (!el) return;
        const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        if (top < scroller.scrollTop + 80 || top > scroller.scrollTop + scroller.clientHeight - 40) {
            scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 3);
        }
    }, [activeKey]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        const root = ref.current;
        if (!root) return;
        const btns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-rd-toc-key]')).filter(b => !b.disabled);
        const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
        let next = cur;
        if (e.key === 'ArrowDown') next = Math.min(btns.length - 1, cur + 1);
        else if (e.key === 'ArrowUp') next = Math.max(0, cur - 1);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = btns.length - 1;
        if (next < 0 || next === cur) return;
        e.preventDefault();
        const b = btns[next];
        for (const x of btns) x.tabIndex = -1;
        b.tabIndex = 0;
        b.focus();
        setFocusKey(b.dataset.rdTocKey ?? null);
    }, []);

    return (
        <div ref={ref} role="navigation" aria-label={label} onKeyDown={onKeyDown}>
            <TocList items={items} activeKey={activeKey} onSelect={onSelect} tabKey={tabKey} />
        </div>
    );
}
