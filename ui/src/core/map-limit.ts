/**
 * 有界并发的 Promise.all(items.map(fn))：同时最多 limit 个 fn 在飞，结果按输入顺序返回。
 *
 * 详情页一次要取几十到几百条（人物页展开、版本表、谱系），无上限地同时发出会顶满浏览器连接，
 * 串行又太慢；统一走这里限流。fn 自己负责 catch（与 Promise.all 一样，有一个抛错就整体 reject）。
 */
export const DETAIL_FETCH_CONCURRENCY = 8;

export async function mapLimit<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}
