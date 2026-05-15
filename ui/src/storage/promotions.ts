/**
 * Draft → Production 升级映射的客户端读取。
 *
 * 文件格式由 book_index_manager/promotion.py 写出，参考：
 *   d:/workspace/overview/项目进展/古籍索引网站/整体设计/2026-05-Draft到Production升级流程.md
 *
 * 这里只关心客户端如何拉取并用作 redirect 查表 —— 不涉及生成逻辑。
 */

export interface PromotionRecord {
    production_id: string;
    type: string;
    promoted_at: string;
}

export interface PromotionsFile {
    version: number;
    promotions: Record<string, PromotionRecord>;
}

/**
 * 把原始 JSON 转成 draft_id → production_id 的扁平 Map，用于 redirect 查表。
 * 容错：缺字段、版本号不匹配都按空映射处理（log 一条 warn）。
 */
export function buildPromotionMap(raw: unknown): Map<string, string> {
    const map = new Map<string, string>();
    if (!raw || typeof raw !== 'object') return map;

    const file = raw as Partial<PromotionsFile>;
    if (typeof file.version !== 'number') {
        console.warn('[promotions] missing version field; treating as empty');
        return map;
    }
    if (file.version !== 1) {
        console.warn(`[promotions] unknown version ${file.version}; treating as empty`);
        return map;
    }

    const promotions = file.promotions;
    if (!promotions || typeof promotions !== 'object') return map;

    for (const [draftId, rec] of Object.entries(promotions)) {
        if (rec && typeof rec === 'object' && typeof (rec as PromotionRecord).production_id === 'string') {
            map.set(draftId, (rec as PromotionRecord).production_id);
        }
    }
    return map;
}
