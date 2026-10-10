/**
 * 异体字补漏表（overview#514，501 第 9 条）：variant-chars.json 没收的稀见异体字 → 正字（繁体写法）。
 *
 * 为什么要有：variant-chars.json 是按 book-text 全量统计、只收出现 ≥1000 次的字生成的（见 variant-chars.ts 头注释），
 * 更稀见的异体字（用户反馈的「𠮓」「𡚁」）不在里面，t2cn 也不认，简体模式下就原样漏出来。
 * 这张表是手工维护的补丁：`normalizeVariants` 先查 variant-chars.json，没有再查这里，所以一处加表，
 * 通行繁体（异体字归一）、简体（归一后再 t2cn）、检索归一化三处同时生效。
 *
 * 口径：
 *   - 值写正字的**繁体写法**（和 variant-chars.json 一致），简体由后面的 t2cn 去转（變→变），不要直接写简体；
 *   - 只收有确凿依据的：字形结构（cjkvi-ids）与字书读音／义项（Unihan）都指向同一个正字；
 *   - 不确定的不收（宁可漏转，也不把另一个字改掉），列在 PR／issue 里等人定；
 *   - 不要往 variant-chars.json 里手改：那张表是生成的。
 *
 * 怎么加：往 VARIANT_SUPPLEMENT 追加一行 `'字': '正字', // 依据`，并在 tests/unit/variant-supplement.test.ts 补一条。
 * 网站服务端（lib/server/simplify.ts）目前只引 variant-chars.json；要同口径得另外引这张表。
 */
export const VARIANT_SUPPLEMENT: Readonly<Record<string, string>> = {
    // U+20B93，字形 ⿱䜌又（「變」省去下半的写法），Unihan 日读 ヘン／ベン かわる（＝変）→ 變（简体 变）
    '𠮓': '變',
    // U+21681，字形 ⿱敝大，Unihan 释义 used-up, malpractices，kSemanticVariant 指向 U+5F0A 弊 → 弊；
    // 抽样的 book-text 正文里有 17 处，上下文都是「凋弊」「久弊」「受其弊」「天下之弊」
    '𡚁': '弊',
    // 以下四条来自抽样扫描（见 PR 描述）：教育部异体字字典（twedu）明载的异体，正字是通用规范汉字的繁体写法
    '曅': '曄', // U+66C5
    '㠘': '嶼', // U+3818
    '㹠': '豚', // U+3E60
    '擡': '抬', // U+64E1，t2cn 不转；抬是通用规范汉字，与擡同义
};
