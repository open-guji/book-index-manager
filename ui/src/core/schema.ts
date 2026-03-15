/**
 * Schema 验证和 URL→ID 提取
 * 翻译自 Python book_index_manager.schema
 */

import type { ResourceEntry } from '../types';

/** Well-known domain → id mapping */
const DOMAIN_ID_MAP: Record<string, string> = {
    'wikisource': 'wikisource',
    'shidianguji': 'shidianguji',
    'archive': 'archive',
    'ctext': 'ctext',
    'nlc': 'nlc',
    'read.nlc': 'nlc',
    'db.sido': 'sido',
    'guji.artx': 'guji-artx',
    'digital.library': 'digital-library',
};

const VALID_TYPES = new Set(['text', 'image', 'text+image', 'physical']);
const VALID_ROOT_TYPES = new Set(['catalog', 'search']);
const PUBLIC_SUFFIXES = new Set(['com', 'org', 'net', 'cn', 'edu', 'gov', 'io', 'jp', 'tw', 'hk']);

/**
 * 从 URL 的域名中提取简短标识符
 */
export function extractIdFromUrl(url: string): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname;

        // Try well-known mappings first
        for (const [pattern, idVal] of Object.entries(DOMAIN_ID_MAP)) {
            if (hostname.includes(pattern)) return idVal;
        }

        // Generic: take second-level domain
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            const meaningful = parts.filter(p => !PUBLIC_SUFFIXES.has(p) && p.length > 2);
            if (meaningful.length > 0) return meaningful[meaningful.length - 1];
            return parts[parts.length - 2];
        }
        return hostname;
    } catch {
        return '';
    }
}

/**
 * 验证 ResourceEntry，返回错误列表（空则合法）
 */
export function validateResource(entry: ResourceEntry): string[] {
    const errors: string[] = [];
    if (!entry.name) errors.push('name is required');
    if (!VALID_TYPES.has(entry.type)) errors.push(`invalid type '${entry.type}', must be one of ${[...VALID_TYPES].join(', ')}`);
    if (entry.root_type && !VALID_ROOT_TYPES.has(entry.root_type)) errors.push(`invalid root_type '${entry.root_type}'`);
    if (entry.type !== 'physical' && !entry.url) errors.push('url is required for non-physical resources');
    return errors;
}
