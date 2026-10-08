/**
 * 有界并发的 Promise.all(items.map(fn))：同时最多 limit 个 fn 在飞，结果按输入顺序返回。
 *
 * 详情页一次要取几十到几百条（人物页展开、版本表、谱系），无上限地同时发出会顶满浏览器连接，
 * 串行又太慢；统一走这里限流。fn 自己负责 catch（与 Promise.all 一样，有一个抛错就整体 reject）。
 *
 * limit 非有限数或 <1 一律按 1 处理（不会静默跳过也不会无限并发）。
 * shouldStop 返回 true 后不再取新项（已在飞的跑完）；被跳过的位置在结果里是 undefined，
 * 调用方应在 shouldStop 为真时丢弃整批结果（详情页 effect 的 cancelled 标志正是这个用法）。
 */
export const DETAIL_FETCH_CONCURRENCY = 8;

export async function mapLimit<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
    shouldStop?: () => boolean,
): Promise<R[]> {
    const cap = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(cap, Math.max(1, items.length)) }, async () => {
        while (next < items.length && !shouldStop?.()) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}
