/**
 * 阅读文本取数（overview#307 C 块）。阅读器只认新结构（用户 09-30 定，规格 §十）：
 *
 *   getManifest(id)              → TextManifest（版本清单，versions[0] 是 default）；没有 manifest 返回 null（显示「暂无文本」）
 *   getIndex(id, key)            → TextIndex（该版本的章目录＋元数据）
 *   getChapter(id, key, chapter) → { md, json }（md 正文；有章 json 的整理本一并取回）
 *
 * 数据来自 transport 的 `getTextManifest／getTextIndex／getChapter`（BundleStorage 自带）。
 * 不从旧目录（collated_edition／full_text）合成 manifest：旧结构的条目没有 manifest，就是「暂无文本」。
 * 这一层只做三件事：条目的 manifest 按 id 缓存（并发也只取一次，取不到不缓存）、key／章校验成路径安全的单段、
 * 取数失败当作没有（不往外抛）。
 */
import type { IndexStorage } from '../storage/types';
import type { TextChapterContent, TextIndex, TextManifest } from './text-model';
import { isSafeSegment } from './text-model';

export interface TextApi {
    getManifest(id: string): Promise<TextManifest | null>;
    getIndex(id: string, key: string): Promise<TextIndex | null>;
    getChapter(id: string, key: string, chapter: string, opts?: { json?: boolean }): Promise<TextChapterContent | null>;
}

const settle = <T>(p: Promise<T> | undefined): Promise<T | null> => (p ? p.catch(() => null) : Promise.resolve(null));

export function createTextApi(transport: IndexStorage): TextApi {
    const manifests = new Map<string, Promise<TextManifest | null>>();

    function manifestOf(id: string): Promise<TextManifest | null> {
        let p = manifests.get(id);
        if (!p) {
            p = settle(transport.getTextManifest?.(id)).then(m => {
                const ok = m && Array.isArray(m.versions) && m.versions.length > 0 ? m : null;
                if (!ok) manifests.delete(id); // 取不到不缓存，下次再试
                return ok;
            });
            manifests.set(id, p);
        }
        return p;
    }

    return {
        getManifest(id) {
            return isSafeSegment(id) ? manifestOf(id) : Promise.resolve(null);
        },

        async getIndex(id, key) {
            if (!isSafeSegment(id) || !isSafeSegment(key) || !transport.getTextIndex) return null;
            return settle(transport.getTextIndex(id, key));
        },

        async getChapter(id, key, chapter, opts) {
            if (!isSafeSegment(id) || !isSafeSegment(key) || !isSafeSegment(chapter) || !transport.getChapter) return null;
            return settle(transport.getChapter(id, key, chapter, opts));
        },
    };
}
