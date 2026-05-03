import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { IndexEntry, IndexType } from '../types';
import type { IndexStorage } from '../storage/types';
import { useT } from '../i18n';

const HISTORY_KEY = 'bim-search-history';
const MAX_HISTORY = 10;
const MAX_SUGGESTIONS = 8;

// ── Search history ──

function loadSearchHistory(): string[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveSearchTerm(term: string) {
    try {
        const list = loadSearchHistory().filter(t => t !== term);
        list.unshift(term);
        if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

function removeSearchTerm(term: string) {
    try {
        const list = loadSearchHistory().filter(t => t !== term);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

function clearSearchHistory() {
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch { /* ignore */ }
}

// ── Suggestion item type ──

interface SuggestionItem {
    type: 'history' | 'entry';
    text: string;
    entry?: IndexEntry;
}

// ── Component ──

export interface SearchInputProps {
    transport: IndexStorage;
    value: string;
    onChange: (value: string) => void;
    /** Called when user commits a search (Enter or suggestion click) */
    onSearch: (query: string) => void;
    /** Called when user clicks a suggestion entry directly */
    onEntrySelect?: (entry: IndexEntry) => void;
    placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    transport,
    value,
    onChange,
    onSearch,
    onEntrySelect,
    placeholder: placeholderProp,
}) => {
    const t = useT();
    const placeholder = placeholderProp ?? t.search.placeholder;

    const TYPE_LABEL: Record<IndexType, string> = {
        work: t.indexType.work,
        book: t.indexType.book,
        collection: t.indexType.collection,
        entity: t.indexType.entity,
    };

    const [showDropdown, setShowDropdown] = useState(false);
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [history, setHistory] = useState<string[]>(loadSearchHistory);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // IME composition 期间不向上抛 onChange — 否则中文拼音输入还在选字时
    // 上层就 router.push(?q=...) 触发重渲染，把 input 切走，IME 中断。
    const isComposingRef = useRef(false);

    // Update suggestions when value changes — 走 transport.searchAll（worker 索引），
    // 不再拉 23 MB 的 index.json。
    useEffect(() => {
        setActiveIndex(-1);
        const q = value.trim();
        if (!q) {
            setSuggestions(history.map(t => ({ type: 'history' as const, text: t })));
            return;
        }
        if (!transport.searchAll) {
            setSuggestions([]);
            return;
        }
        let cancelled = false;
        const handle = setTimeout(() => {
            transport.searchAll!(q, MAX_SUGGESTIONS).then(grouped => {
                if (cancelled) return;
                const merged: IndexEntry[] = [
                    ...grouped.works,
                    ...grouped.books,
                    ...grouped.collections,
                    ...(grouped.entities ?? []),
                ];
                setSuggestions(merged.slice(0, MAX_SUGGESTIONS).map(entry => ({
                    type: 'entry' as const,
                    text: entry.title || entry.id,
                    entry,
                })));
            }).catch(() => {
                if (!cancelled) setSuggestions([]);
            });
        }, 80);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [value, history, transport]);

    // Click outside to close
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Global `/` shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement !== inputRef.current) {
                const tag = (document.activeElement as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const commitSearch = useCallback((query: string) => {
        if (query.trim()) {
            saveSearchTerm(query.trim());
            setHistory(loadSearchHistory());
        }
        onSearch(query);
        setShowDropdown(false);
    }, [onSearch]);

    const handleSelectSuggestion = useCallback((item: SuggestionItem) => {
        if (item.type === 'history') {
            onChange(item.text);
            commitSearch(item.text);
        } else if (item.entry) {
            if (onEntrySelect) {
                onEntrySelect(item.entry);
                setShowDropdown(false);
            } else {
                onChange(item.text);
                commitSearch(item.text);
            }
        }
    }, [onChange, commitSearch, onEntrySelect]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!showDropdown || suggestions.length === 0) {
            if (e.key === 'Enter') {
                commitSearch(value);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % suggestions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < suggestions.length) {
                    handleSelectSuggestion(suggestions[activeIndex]);
                } else {
                    commitSearch(value);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setShowDropdown(false);
                break;
        }
    }, [showDropdown, suggestions, activeIndex, value, commitSearch, handleSelectSuggestion]);

    const handleRemoveHistory = useCallback((term: string, e: React.MouseEvent) => {
        e.stopPropagation();
        removeSearchTerm(term);
        setHistory(loadSearchHistory());
        setSuggestions(prev => prev.filter(s => !(s.type === 'history' && s.text === term)));
    }, []);

    const handleClearHistory = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        clearSearchHistory();
        setHistory([]);
        setSuggestions([]);
    }, []);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && dropdownRef.current) {
            const items = dropdownRef.current.children;
            if (items[activeIndex]) {
                (items[activeIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const showHistory = !value.trim() && history.length > 0;

    return (
        <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={e => {
                    // IME composition 期间不上抛 — 上层会 router.push 把 input 切走，
                    // 中断中文拼音选字。compositionend 后会再发一次 onChange，那时再上抛。
                    if (isComposingRef.current) return;
                    onChange(e.target.value);
                    setShowDropdown(true);
                }}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={e => {
                    isComposingRef.current = false;
                    // composition 结束时手动上抛一次，因为这次 onChange 已经被守卫吃掉了
                    onChange((e.target as HTMLInputElement).value);
                    setShowDropdown(true);
                }}
                onFocus={() => {
                    setShowDropdown(true);
                }}
                onKeyDown={handleKeyDown}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--bim-input-border, #ccc)',
                    borderRadius: '6px',
                    background: 'var(--bim-input-bg, #fff)',
                    color: 'var(--bim-input-fg, #333)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                }}
            />
            {showDropdown && suggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--bim-input-bg, #fff)',
                        border: '1px solid var(--bim-widget-border, #e0e0e0)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 100,
                        maxHeight: '320px',
                        overflow: 'auto',
                    }}
                >
                    {showHistory && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 12px',
                            fontSize: '11px',
                            color: 'var(--bim-desc-fg, #717171)',
                            borderBottom: '1px solid var(--bim-widget-border, #e0e0e0)',
                        }}>
                            <span>{t.search.history}</span>
                            <button
                                onClick={handleClearHistory}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--bim-desc-fg, #717171)',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    padding: '0 4px',
                                }}
                            >
                                {t.search.clearAll}
                            </button>
                        </div>
                    )}
                    {suggestions.map((item, i) => (
                        <div
                            key={`${item.type}-${item.text}-${i}`}
                            onClick={() => handleSelectSuggestion(item)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: 'var(--bim-fg, #333)',
                                background: i === activeIndex
                                    ? 'var(--bim-list-active-bg, #e8f0fe)'
                                    : 'transparent',
                            }}
                        >
                            <span style={{ fontSize: '12px', opacity: 0.5, width: '16px', textAlign: 'center' }}>
                                {item.type === 'history' ? '🕐' : '🔍'}
                            </span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.text}
                            </span>
                            {item.entry && (
                                <span style={{ fontSize: '11px', color: 'var(--bim-desc-fg, #717171)', flexShrink: 0 }}>
                                    {TYPE_LABEL[item.entry.type]}
                                    {item.entry.edition && ` · ${item.entry.edition}`}
                                    {item.entry.author && ` · ${item.entry.author}`}
                                </span>
                            )}
                            {item.type === 'history' && (
                                <button
                                    onClick={(e) => handleRemoveHistory(item.text, e)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--bim-desc-fg, #717171)',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        padding: '0 2px',
                                        lineHeight: 1,
                                    }}
                                    title={t.action.remove}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
