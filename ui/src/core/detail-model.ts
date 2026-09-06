/**
 * 详情页数据派生层。
 *
 * 设计稿要求的若干列在数据里**没有对应字段**，必须推断。以 2026-09-05
 * 生产仓（91,604 Work / 20,853 Book / 75 Collection）实测填充率为准：
 *
 *   Book.lineage            1.0%   ← 设计稿「刊刻年代」的理想来源，几乎没有
 *   Book.publication_info   2.1%
 *   Book.current_location   0.5%   ← 设计稿「收藏機構」的理想来源，几乎没有
 *   Book.edition           96.4%   ← 但题名里带朝代，可推断
 *   Book.resources[physical] 15,297 条 ← 「收藏機構」的真实来源在这里
 *
 * 所以「刊刻年代」走 lineage → publication_info → 题名推断三级回退，
 * 「收藏機構」直接渲染 physical 资源。推断出的值必须能被 UI 标注来源
 * （eraSource），让读者知道哪些是著录、哪些是我们从题名猜的。
 *
 * 本文件全部是纯函数：无 React、无 IO，可直接单测。
 */
import type {
    BookDetailData,
    DatingInfo,
    CollectionDetailData,
    WorkDetailData,
    IndexDetailData,
    ResourceEntry,
    ResourceGroupInfo,
    VersionGraph,
    VolumeBookMapping,
    VolumeBookEntry,
} from '../types';
import { getResourceTypes } from '../types';
import { getTypeGroupKey, mergeVolumeResources, volumeStats } from './resources';

// ══════════════════════════════════════════════════════════════
// 朝代 / 年代推断
// ══════════════════════════════════════════════════════════════

/** 推断出的朝代及其可信来源 */
export type EraSource = 'lineage' | 'publication' | 'edition' | 'catalog' | 'none';

/**
 * 推断函数只读这几个字段，故用结构类型而非完整 BookDetailData——
 * 这样 ResolvedVersion（version 表的轻量投影）也能直接传进来。
 */
export interface EraInferable {
    title?: string;
    edition?: string;
    lineage?: BookDetailData['lineage'];
    publication_info?: BookDetailData['publication_info'];
    /**
     * 结构化年代（方案 §3）。给了就直接用，不再从题名现推。
     *
     * 这是「优先读 dating、读不到才回退」的入口——旧数据、draft 仓
     * 未迁移的条目都还没有这个字段，回退保证它们不会坏。
     */
    dating?: DatingInfo;
}

export interface DerivedEra {
    /** 朝代名（繁体），如「宋」「清」「日本」；推不出时为空串 */
    era: string;
    /** 年号或纪年文本，如「乾隆」「慶元」「1773」；推不出时为空串 */
    reign: string;
    source: EraSource;
}

/**
 * 直接以朝代名开头的题名前缀。
 *
 * 顺序有意义：长的排前面，否则「南宋」会先被「宋」截断。
 */
const ERA_PREFIXES = [
    '西漢', '東漢', '三國', '西晉', '東晉', '南北朝', '南朝', '北朝', '隋', '唐', '五代',
    '北宋', '南宋', '宋', '遼', '西夏', '金', '元', '南明', '明', '清',
    '民國', '日本', '朝鮮', '高麗', '越南', '琉球',
    // 简体等价（数据里繁简混杂）
    '西汉', '东汉', '西晋', '东晋', '南北朝', '南朝', '北朝', '辽', '民国', '朝鲜', '高丽',
];

/**
 * 朝代名归一：把细分与简体形态并到一个筛选项上。
 *
 * 不归一的话，史記的朝代 chips 会同时出现「宋」「南宋」「北宋」三个按钮，
 * 各自只筛出一小撮——读者点哪个都像是数据缺失。
 */
const ERA_ALIASES: Record<string, string> = {
    北宋: '宋', 南宋: '宋',
    西漢: '漢', 東漢: '漢', 西汉: '漢', 东汉: '漢',
    西晉: '晉', 東晉: '晉', 西晋: '晉', 东晋: '晉',
    南明: '明',
    民国: '民國', 辽: '遼', 朝鲜: '朝鮮', 高丽: '高麗',
    南北朝: '南北朝', 南朝: '南北朝', 北朝: '南北朝',
};

export function normalizeEra(era: string): string {
    return ERA_ALIASES[era] ?? era;
}

/**
 * 不带朝代名、但版本本身指向确定朝代的题名特征。
 *
 * 依据生产仓 edition 首字分布：「欽」4062 条（欽定四庫全書系列）、
 * 「武」209 条（武英殿）——这些占比不小，光靠 ERA_PREFIXES 会全漏。
 */
const ERA_HINTS: { pattern: RegExp; era: string; reign?: string }[] = [
    { pattern: /欽定四庫全書薈要|摛藻堂/, era: '清', reign: '乾隆' },
    { pattern: /欽定四庫全書|四庫全書|文淵閣|文瀾閣|文溯閣|文津閣|文匯閣|文宗閣|文瀾閣/, era: '清', reign: '乾隆' },
    { pattern: /钦定四库全书|四库全书|文渊阁|文澜阁|文溯阁|文津阁/, era: '清', reign: '乾隆' },
    { pattern: /武英殿聚珍|聚珍版/, era: '清', reign: '乾隆' },
    { pattern: /武英殿/, era: '清' },
    { pattern: /百衲本|涵芬樓|涵芬楼|商務印書館|商务印书馆|中華書局|中华书局/, era: '民國' },
    { pattern: /汲古閣|汲古阁/, era: '明', reign: '崇禎' },
];

/** 年号 → 元年公元年份。用于把「乾隆四十三年」折算成可排序的数字。 */
const REIGN_YEARS: Record<string, number> = {
    // 汉唐
    熹平: 172, 建安: 196, 黃初: 220, 太康: 280, 永和: 345, 開皇: 581, 貞觀: 627,
    開元: 713, 天寶: 742, 貞元: 785, 元和: 806, 開成: 836, 會昌: 841, 咸通: 860,
    // 宋
    建隆: 960, 太平興國: 976, 咸平: 998, 天禧: 1017, 慶曆: 1041, 皇祐: 1049,
    嘉祐: 1056, 治平: 1064, 熙寧: 1068, 元豐: 1078, 元祐: 1086, 紹聖: 1094,
    崇寧: 1102, 大觀: 1107, 政和: 1111, 宣和: 1119, 建炎: 1127, 紹興: 1131,
    隆興: 1163, 乾道: 1165, 淳熙: 1174, 紹熙: 1190, 慶元: 1195, 嘉泰: 1201,
    開禧: 1205, 嘉定: 1208, 寶慶: 1225, 紹定: 1228, 端平: 1234, 嘉熙: 1237,
    淳祐: 1241, 寶祐: 1253, 開慶: 1259, 景定: 1260, 咸淳: 1265,
    // 金元
    大定: 1161, 明昌: 1190, 至元: 1264, 大德: 1297, 皇慶: 1312, 延祐: 1314,
    泰定: 1324, 天曆: 1328, 至順: 1330, 至正: 1341,
    // 明
    洪武: 1368, 永樂: 1403, 宣德: 1426, 正統: 1436, 景泰: 1450, 天順: 1457,
    成化: 1465, 弘治: 1488, 正德: 1506, 嘉靖: 1522, 隆慶: 1567, 萬曆: 1573,
    泰昌: 1620, 天啟: 1621, 崇禎: 1628,
    // 南明（歸入「明」）：全库 12 部
    弘光: 1645, 隆武: 1645, 紹武: 1646, 永曆: 1647,
    // 清
    順治: 1644, 康熙: 1662, 雍正: 1723, 乾隆: 1736, 嘉慶: 1796, 道光: 1821,
    咸豐: 1851, 同治: 1862, 光緒: 1875, 宣統: 1909,
    // 日本。江戶至近代较全——全库有 553 部日本刻本因年号表不全推不出年份
    慶長: 1596, 寬永: 1624, 正保: 1644, 慶安: 1648, 承應: 1652,
    明曆: 1655, 萬治: 1658, 寬文: 1661, 延寶: 1673, 天和: 1681, 貞享: 1684,
    元祿: 1688, 寶永: 1704, 享保: 1716, 元文: 1736, 寬保: 1741,
    延享: 1744, 寬延: 1748, 寶曆: 1751, 明和: 1764, 安永: 1772, 天明: 1781,
    寬政: 1789, 享和: 1801, 文化: 1804, 文政: 1818, 天保: 1830, 弘化: 1844,
    嘉永: 1848, 安政: 1854, 萬延: 1860, 文久: 1861, 元治: 1864, 慶應: 1865,
    明治: 1868, 大正: 1912, 昭和: 1926,
    // 日本中世（室町・戰國），少量古钞本会用
    天正: 1573, 文祿: 1592, 永祿: 1558, 天文: 1532,
};

/**
 * 同名年号的消歧表：`朝代|年号` → 元年。
 *
 * 唐「元和」(806) 与 日本「元和」(1615)、明「正德」(1506) 与 日本「正德」(1711)
 * 撞名。扁平的 REIGN_YEARS 存不下两个，故同名的走这张表；
 * 查询时先按朝代查这里，查不到再回退 REIGN_YEARS。
 */
const REIGN_YEARS_BY_ERA: Record<string, number> = {
    '唐|元和': 806, '日本|元和': 1615,
    '明|正德': 1506, '日本|正德': 1711,
};

/** 取年号元年：优先按朝代消歧，其次用通用表 */
function reignStartYear(reign: string, era?: string): number | undefined {
    if (era) {
        const k = REIGN_YEARS_BY_ERA[`${era}|${reign}`];
        if (k != null) return k;
    }
    return REIGN_YEARS[reign];
}

/**
 * 民國紀年：民國 N 年 = 1911 + N。
 *
 * 全库 432 部民國刻本因为没有这条换算而拿不到年份（「民國三年刊本」
 * 明明写着年份却推不出来）。民國不是年号制，单独处理。
 */
const REPUBLIC_EPOCH = 1911;

/**
 * 「某某間」→ 年代區間。
 *
 * 「明隆萬間」= 隆慶元年(1567) 至 萬曆末(1620)：取首尾两个年号的起讫。
 * 全库约 60 部这种写法。区间只用于排序（取下界）与展示，不当确切年份。
 */
export interface YearRange {
    from: number;
    to: number;
}

/** 年号 → 该年号结束年（下一个年号元年 - 1）。惰性由 REIGN_YEARS 推出。 */
function reignEndYear(reign: string): number | undefined {
    const start = REIGN_YEARS[reign];
    if (start == null) return undefined;
    const era = REIGN_ERA[reign];
    // 同朝代内找下一个起始年更大的年号
    let next: number | undefined;
    for (const [r, y] of Object.entries(REIGN_YEARS)) {
        if (REIGN_ERA[r] !== era) continue;
        if (y > start && (next == null || y < next)) next = y;
    }
    return next != null ? next - 1 : undefined;
}

/** 中文数字 → 阿拉伯数字（用于「乾隆四十三年」里的「四十三」） */
const CN_DIGITS: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    十: 10, 廿: 20, 卅: 30, 元: 1,
};

/** 解析「四十三」「廿四」「元」这类中文序数 */
export function parseChineseNumber(s: string): number | undefined {
    if (!s) return undefined;
    if (/^\d+$/.test(s)) return parseInt(s, 10);

    let total = 0;
    let current = 0;
    let seen = false;
    for (const ch of s) {
        const v = CN_DIGITS[ch];
        if (v === undefined) return undefined;
        seen = true;
        if (ch === '十') {
            current = (current || 1) * 10;
        } else if (ch === '廿' || ch === '卅') {
            // 廿四 = 24：廿本身是 20，后续个位直接加
            total += v;
            current = 0;
        } else {
            if (current >= 10) {
                total += current + v;
                current = 0;
            } else {
                current = current * 10 + v;
            }
        }
    }
    const n = total + current;
    return seen && n > 0 ? n : undefined;
}

/** 从一段文本里找朝代前缀 */
function matchEraPrefix(text: string): string | undefined {
    for (const p of ERA_PREFIXES) {
        if (text.startsWith(p)) return p;
    }
    return undefined;
}

/**
 * 年号 → 所属朝代。用于排除跨朝代误匹配：
 * 「宋建安黃善夫家塾刻本」里的「建安」是福建建安（地名），
 * 不是东汉建安年号——不校验的话会把宋本标成「宋 · 建安」。
 */
const REIGN_ERA: Record<string, string> = {};
{
    const assign = (era: string, reigns: string[]) => {
        for (const r of reigns) REIGN_ERA[r] = era;
    };
    assign('東漢', ['熹平', '建安']);
    assign('三國', ['黃初']);
    assign('西晉', ['太康']);
    assign('東晉', ['永和']);
    assign('隋', ['開皇']);
    assign('唐', ['貞觀', '開元', '天寶', '貞元', '元和', '開成', '會昌', '咸通']);
    assign('宋', [
        '建隆', '太平興國', '咸平', '天禧', '慶曆', '皇祐', '嘉祐', '治平', '熙寧',
        '元豐', '元祐', '紹聖', '崇寧', '大觀', '政和', '宣和', '建炎', '紹興',
        '隆興', '乾道', '淳熙', '紹熙', '慶元', '嘉泰', '開禧', '嘉定', '寶慶',
        '紹定', '端平', '嘉熙', '淳祐', '寶祐', '開慶', '景定', '咸淳',
    ]);
    assign('金', ['大定', '明昌']);
    assign('元', ['至元', '大德', '皇慶', '延祐', '泰定', '天曆', '至順', '至正']);
    assign('明', [
        '洪武', '永樂', '宣德', '正統', '景泰', '天順', '成化', '弘治', '正德',
        '嘉靖', '隆慶', '萬曆', '泰昌', '天啟', '崇禎',
        '弘光', '隆武', '紹武', '永曆',
    ]);
    assign('清', ['順治', '康熙', '雍正', '乾隆', '嘉慶', '道光', '咸豐', '同治', '光緒', '宣統']);
    assign('日本', [
        '慶長', '寬永', '正保', '慶安', '承應', '明曆', '萬治', '寬文', '延寶',
        '天和', '貞享', '元祿', '寶永', '享保', '元文', '寬保', '延享', '寬延',
        '寶曆', '明和', '安永', '天明', '寬政', '享和', '文化', '文政', '天保',
        '弘化', '嘉永', '安政', '萬延', '文久', '元治', '慶應', '明治', '大正', '昭和',
        '天正', '文祿', '永祿', '天文',
    ]);
}

/**
 * 从一段文本里找年号。
 *
 * `era` 给定时会校验年号所属朝代一致——否则地名、人名里的两字词
 * 会被当成年号（建安、大观、正德…这类冲突在版本题名里相当常见）。
 */
function matchReign(text: string, era?: string): string | undefined {
    const normalized = era === '北宋' || era === '南宋' ? '宋' : era;
    for (const reign of Object.keys(REIGN_YEARS)) {
        if (!text.includes(reign)) continue;
        if (normalized && REIGN_ERA[reign] && REIGN_ERA[reign] !== normalized) {
            /*
             * 朝代对不上。但同名年号是例外——「元和」在 REIGN_ERA 里登记为唐，
             * 日本也有元和(1615)；若直接 continue，「日本元和元年古活字本」
             * 就永远匹配不到年号。消歧表里有 `朝代|年号` 的才放行。
             */
            if (REIGN_YEARS_BY_ERA[`${normalized}|${reign}`] == null) continue;
        }
        return reign;
    }
    return undefined;
}

/**
 * 推断一个版本的朝代 / 纪年。
 *
 * 三级回退，越靠前越可信：
 *   1. lineage.year_text —— 人工整理的版本传承信息（仅 1% 有）
 *   2. publication_info.year —— 著录的出版年（仅 2% 有）
 *   3. edition ∥ title 的题名前缀与特征词 —— 覆盖约 96%，但是**推断**
 *
 * UI 必须依 source 区分显示（推断的加 hover 提示），不要让读者误以为
 * 「宋 · 慶元」是著录事实。
 */
export function deriveEra(book: EraInferable): DerivedEra {
    const none: DerivedEra = { era: '', reign: '', source: 'none' };

    // 0. 已落盘的 dating 最优先
    const d = book.dating;
    if (d?.era || d?.reign) {
        return {
            era: d.era ?? '',
            reign: d.reign ?? '',
            source: d.certainty === 'attested' ? 'catalog' : 'edition',
        };
    }

    // 1. lineage
    const yearText = book.lineage?.year_text;
    if (yearText) {
        const era = matchEraPrefix(yearText) ?? '';
        return { era: normalizeEra(era), reign: matchReign(yearText, era) ?? '', source: 'lineage' };
    }

    // 2. publication_info.year
    const pubYear = book.publication_info?.year;
    if (pubYear) {
        const era = matchEraPrefix(pubYear) ?? ERA_HINTS.find(h => h.pattern.test(pubYear))?.era ?? '';
        const reign = matchReign(pubYear, era) ?? '';
        if (era || reign) return { era: normalizeEra(era), reign, source: 'publication' };
        // 纯公元年（如「1773-1803」）也算著录
        const ce = pubYear.match(/\d{3,4}/);
        if (ce) return { era: '', reign: ce[0], source: 'publication' };
    }

    // 3. 题名推断。同样只用 edition，edition 为空才退到 title——
    //    title 里的年号是作品主题，不是版本年代（见 deriveYear 的注释）
    const text = book.edition || book.title || '';
    if (text) {
        const prefix = matchEraPrefix(text);
        if (prefix) {
            return { era: normalizeEra(prefix), reign: matchReign(text, prefix) ?? '', source: 'edition' };
        }
        const hint = ERA_HINTS.find(h => h.pattern.test(text));
        if (hint) {
            return {
                era: normalizeEra(hint.era),
                reign: matchReign(text, hint.era) ?? hint.reign ?? '',
                source: 'edition',
            };
        }
    }

    return none;
}

/**
 * 推断可排序的公元年份。
 *
 * 优先 lineage.year（人工著录），其次文本里的 4 位公元年，
 * 最后用年号表折算「乾隆四十三年」→ 1736 + 43 - 1 = 1778。
 */
export function deriveYear(book: EraInferable): number | undefined {
    if (book.dating?.year != null) return book.dating.year;
    if (typeof book.lineage?.year === 'number') return book.lineage.year;

    /*
     * 只看 edition，**不看 title**。
     *
     * title 是作品名，里面的年号是作品的**主题**不是版本的年代：
     *   《會昌一品制集》→ 會昌(841)，实际是宋刻本
     *   《大唐開元禮》  → 開元(713)，实际是清抄本
     *   《咸平集》      → 咸平(998)，实际是清传抄本
     * 全量跑出来 22 条早于 1000 年的里有 4 条是这么来的。
     *
     * edition 为空时才退到 title——那种情况下题名本身兼作版本描述
     * （「宋乾道七年蔡夢弼東塾刻本」这类会被放进 title）。
     */
    const texts = [
        book.lineage?.year_text,
        book.publication_info?.year,
        book.edition,
        book.edition ? undefined : book.title,
    ].filter(Boolean) as string[];

    for (const text of texts) {
        /*
         * 著录里已给出朝代、但没给确切年份时，不要再去题名里捞年号——
         * 「開成石經清補刻孟子」的 publication_info.year 是「清」，
         * 题名里的「開成」是**被补刻的对象**（唐开成石经），不是刊刻年。
         * 捞了就会得到「清 · 836」这种自相矛盾的组合。
         */
        const cited = book.publication_info?.year || book.lineage?.year_text;
        if (cited && text !== cited && matchEraPrefix(cited)) break;
        // 公元年。必须带「年」或被括号/边界包住，且前面不能是「第」——
        // 否则「摛藻堂四庫全書薈要·第321冊」会被读成公元 321 年，
        // 把一部清乾隆写本排到西晋去。
        const ce = text.match(/(?:^|[^\d第卷冊册頁页])(\d{3,4})\s*年/)
            ?? text.match(/[（(](\d{3,4})\s*年?[）)]/);
        if (ce) {
            const n = parseInt(ce[1], 10);
            if (n >= 100 && n <= 2100) return n;
        }

        /*
         * 民國紀年：民國 N 年 = 1911 + N。民國不是年号制，走不通年号表——
         * 全库 432 部民國刻本此前全推不出年份。
         *
         * 但只在**主年代确实是民國**时才用。「清光緒三十二年修民國九年
         * 排印本」的主体是清光緒本，民國九年只是重印年；若直接取 1920，
         * 就会得到「清光緒 1920」这种朝代与年份互相打架的组合（全库 9 条）。
         */
        const rep = text.match(/民[國国]\s*([零〇一二三四五六七八九十廿卅百元\d]+)\s*年/);
        if (rep) {
            const leadEra = matchEraPrefix(text);
            const isRepublicMain = !leadEra || normalizeEra(leadEra) === '民國';
            if (isRepublicMain) {
                const n = parseChineseNumber(rep[1]);
                if (n != null && n >= 1 && n <= 120) return REPUBLIC_EPOCH + n;
            }
        }

        // 年号 + 序数。朝代取自完整的 deriveEra（含「欽定四庫全書」这类
        // 特征词），不能只认题名前缀——否则「欽定四庫全書·文淵閣本」
        // 明明推得出「清·乾隆」，deriveYear 却因为它不以「清」开头而放弃。
        // 归一后再查年号：matchEraPrefix 返回的是原始写法（「南明」），
        // 而 REIGN_ERA 里登记的是归一后的（「明」），不归一就查不到
        const rawEra = matchEraPrefix(text)
            ?? ERA_HINTS.find(h => h.pattern.test(text))?.era;
        const era = rawEra ? normalizeEra(rawEra) : undefined;
        const reign = matchReign(text, era)
            ?? (matchEraPrefix(text) ? undefined : ERA_HINTS.find(h => h.pattern.test(text))?.reign);
        if (reign) {
            // 同名年号（唐/日本「元和」、明/日本「正德」）按朝代消歧
            const base = reignStartYear(reign, era);
            if (base == null) continue;
            const at = text.indexOf(reign);
            const after = at >= 0 ? text.slice(at + reign.length) : '';
            /*
             * 序数有两种写法：
             *   「萬曆二十四年」——年号后直接跟序数
             *   「萬曆壬子(四十年)」——年号后是干支，序数在括注里
             * 后者全库 2,022 条（9.7%）。不认括注的话，这批全部落到
             * 年号元年（萬曆壬子 → 1573 而非 1612），差了近 40 年。
             */
            const ord = after.match(/^([零〇一二三四五六七八九十廿卅元]+)年/)
                ?? after.match(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*[（(]\s*([零〇一二三四五六七八九十廿卅元]+)\s*年?\s*[）)]/);
            const offset = ord ? parseChineseNumber(ord[1]) : undefined;
            return base + (offset ? offset - 1 : 0);
        }
    }
    return undefined;
}

/**
 * 「某某間」的年代區間。
 *
 * 「明隆萬間」= 隆慶元年(1567) 至 萬曆末(1620)：取题名里首尾两个年号的起讫。
 * 「清康雍間」= 康熙元年(1662) 至 雍正末(1735)。
 * 全库约 60 部这种写法，此前一律推不出年份。
 *
 * 区间只用于排序（取下界）与展示，不当确切年份 —— 故与 deriveYear 分开。
 */
export function deriveYearRange(book: EraInferable): YearRange | undefined {
    const r = book.dating?.year_range;
    if (r && r.length === 2) return { from: r[0], to: r[1] };

    /*
     * 人工著录的 lineage.year_range 直接用——录入者已经判过了。
     * 水滸「文盛堂藏板」就带着 [1640, 1750]，此前被无视，
     * 转而拿 lineage.year=1700 当确切年份，再配上「明」，1700 早过了 1644。
     */
    const lr = book.lineage?.year_range;
    if (lr && lr.length === 2) return { from: lr[0], to: lr[1] };

    /*
     * year_text 是跨代/模糊表述（「明末清初」「宋元間」「約明中葉」）时，
     * 给区间而不是确切年。录入者在 year 里填的是代表值（1650）或中点（1700），
     * 不是考定的确切年份，当成确切年会和朝代打架。
     */
    const yt = book.lineage?.year_text;
    if (yt) {
        const cross = yt.match(/([宋元明清])\s*末\s*([宋元明清])\s*初/);
        if (cross) {
            const a = ERA_END_YEAR[normalizeEra(cross[1])];
            const b = ERA_START_YEAR[normalizeEra(cross[2])];
            if (a != null && b != null) return { from: Math.min(a, b) - 20, to: Math.max(a, b) + 40 };
        }
    }

    const texts = [book.edition, book.title].filter(Boolean) as string[];
    for (const text of texts) {
        if (!/[間间]/.test(text)) continue;
        const era = matchEraPrefix(text) ?? ERA_HINTS.find(h => h.pattern.test(text))?.era;
        const norm = era ? normalizeEra(era) : undefined;

        // 收集题名里出现的、属于该朝代的年号
        const hitReigns: string[] = [];
        for (const r of Object.keys(REIGN_YEARS)) {
            if (!text.includes(r)) continue;
            if (norm && REIGN_ERA[r] && REIGN_ERA[r] !== norm) continue;
            if (reignStartYear(r, norm) != null) hitReigns.push(r);
        }
        /*
         * 单字简写：「隆萬間」= 隆慶–萬曆、「康雍間」= 康熙–雍正、
         * 「曆啟間」= 萬曆–天啟。取「X Y 間」里 X、Y 各作为年号首字去匹配。
         */
        if (hitReigns.length === 0) {
            const abbr = text.match(/([一-鿿])([一-鿿])[間间]/);
            if (abbr && norm) {
                for (const ch of [abbr[1], abbr[2]]) {
                    for (const r of Object.keys(REIGN_YEARS)) {
                        if (REIGN_ERA[r] !== norm) continue;
                        // 首字或尾字命中都算（萬曆的「曆」、天啟的「啟」）
                        if (r[0] !== ch && r[r.length - 1] !== ch) continue;
                        if (reignStartYear(r, norm) != null) { hitReigns.push(r); break; }
                    }
                }
            }
        }
        if (hitReigns.length > 0) {
            const starts = hitReigns.map(r => reignStartYear(r, norm)!).filter(y => y != null);
            const from = Math.min(...starts);
            // 上界取「起始年最晚的那个年号」的结束年——不能只取 max(starts)，
            // 那是它的**元年**：「明隆萬間」的上界该是萬曆末(1620)而非萬曆元年(1573)
            const latest = hitReigns.reduce((a, b) =>
                (reignStartYear(a, norm)! >= reignStartYear(b, norm)! ? a : b));
            const to = reignEndYear(latest) ?? eraEndYear(norm ?? '') ?? Math.max(...starts);
            return { from, to: Math.max(from, to) };
        }
        // 只有朝代没有年号（「明間刊本」）：退到朝代起讫
        if (norm && ERA_START_YEAR[norm] != null) {
            return { from: ERA_START_YEAR[norm], to: eraEndYear(norm) ?? ERA_START_YEAR[norm] };
        }
    }
    return undefined;
}

/**
 * 朝代的起始年，作为无确切纪年时的排序锚点。
 *
 * 「宋建安黃善夫家塾刻本」推得出「宋」却推不出具体年份；若按
 * `year ?? Infinity` 排，它会被扔到清光緒（1905）后面——一个宋本排在
 * 清末刻本之后，读者一眼就看出错了。用朝代起始年当锚点，
 * 至少保证朝代之间的先后是对的。
 */
const ERA_START_YEAR: Record<string, number> = {
    漢: -202, 三國: 220, 晉: 265, 南北朝: 420, 隋: 581, 唐: 618, 五代: 907,
    宋: 960, 遼: 916, 西夏: 1038, 金: 1115, 元: 1271, 明: 1368, 清: 1644,
    民國: 1912,
    // 域外：取其与中土大致对应的年代，仅用于排序不作断代依据
    日本: 1600, 朝鮮: 1392, 高麗: 918, 越南: 1400, 琉球: 1400,
};

// ══════════════════════════════════════════════════════════════
// 底本識別（題名裡同時提到底本與印本）
// ══════════════════════════════════════════════════════════════

/**
 * 派生关系。全库 1,251 部（6.0%）的题名同时提到两个年代。
 *
 * 方向很要紧，两类要分开：
 *   · 「清覆刊武英殿本」——主体是**清**本，武英殿是它翻刻的**底本**
 *   · 「元大德刻明修本」——主体是**元**本，明代只是后来**修版**
 * 用同一套逻辑解析会把主次搞反，故 REPAIR_PATTERNS 单列。
 */
export type DerivationRelation = '影印' | '翻刻' | '傳鈔' | '配補' | '據刊';

const DERIVATION_PATTERNS: { re: RegExp; relation: DerivationRelation }[] = [
    { re: /影印|景印|影鈔|影钞|景鈔|景钞/, relation: '影印' },
    { re: /翻刻|覆刻|覆刊|翻雕|重刊|重雕/, relation: '翻刻' },
    { re: /傳鈔|传钞|傳抄|传抄/, relation: '傳鈔' },
    { re: /配補|配补|百衲/, relation: '配補' },
    { re: /據.{0,12}本|据.{0,12}本/, relation: '據刊' },
];

/**
 * 後修：主體年代在**前**，修版年代在後。
 * 「元大德刻明修本」「明嘉靖間刊後代修補本」「宋紹興間刊明初修補九行本」
 */
const REPAIR_PATTERN = /修補|修补|遞修|递修|[明清元宋]修本|後代修|后代修/;

export interface DerivedDating {
    era: string;
    reign: string;
    year?: number;
    yearRange?: YearRange;
    certainty: 'attested' | 'inferred' | 'uncertain';
    source: 'catalog' | 'edition';
    basis: string;
    /** 底本（本版所依据的更早的本子） */
    basedOn?: { era: string; reign: string; year?: number; relation: DerivationRelation };
    /** 后修：本版之后被谁修过版 */
    laterRepair?: { era: string };
}

/** 题名里「存疑」的措辞 */
const UNCERTAIN_PATTERN = /約|约|疑|傳為|传为|舊題|旧题|相傳|相传|待考|未詳|未详|\(疑\)|（疑）/;

/**
 * 生成一条版本的完整年代判定。
 *
 * 这是 `dating` 字段的生成逻辑（方案 §4）：主年代三级回退、
 * 底本单独识别、可信度三档。落盘脚本与前端回退渲染共用这一个函数，
 * 保证「存进去的」和「现场算的」永远一致。
 */
/**
 * 在一段文本里找出与 `exclude` 不同的另一个朝代（用于识别底本）。
 * 与 deriveEra 的区别：不要求朝代名在开头，扫全段。
 */
function findOtherEra(text: string, exclude: string):
        { era: string; reign: string; year?: number } | undefined {
    for (const raw of ERA_PREFIXES) {
        const i = text.indexOf(raw);
        if (i < 0) continue;
        /*
         * 单字朝代名要防地名误伤：「金陵」的金不是金朝、「明州」的明不是明朝。
         * 要求其后紧跟纪年/版本用语（年號、刻、刊、寫、鈔、本、間…），
         * 否则视为地名或人名的一部分。
         */
        if (raw.length === 1) {
            const next = text[i + 1] ?? '';
            if (!/[刻刊寫写鈔钞抄印本間间初末年時时代人臧藏]/.test(next)
                && !matchReign(text.slice(i), normalizeEra(raw))) continue;
        }
        const era = normalizeEra(raw);
        if (era === exclude) continue;
        const after = text.slice(i);
        const reign = matchReign(after, era) ?? '';
        let year: number | undefined;
        if (reign) {
            const base = reignStartYear(reign, era);
            if (base != null) {
                const rest = after.slice(after.indexOf(reign) + reign.length);
                const ord = rest.match(/^([零〇一二三四五六七八九十廿卅元]+)年/);
                const off = ord ? parseChineseNumber(ord[1]) : undefined;
                year = base + (off ? off - 1 : 0);
            }
        }
        return { era, reign, year };
    }
    /*
     * 特征词兜底：「武英殿本」→ 清。
     *
     * 这里**不**排除与主年代同朝代的——「清同治十一年覆刊武英殿本」
     * 主体是清同治，底本武英殿也是清（乾隆），同朝代但确实是两个本子。
     * 排除同朝代会把这类底本整个丢掉。
     */
    for (const h of ERA_HINTS) {
        if (!h.pattern.test(text)) continue;
        return { era: normalizeEra(h.era), reign: h.reign ?? '' };
    }
    return undefined;
}

export function deriveDating(book: EraInferable): DerivedDating | undefined {
    const era = deriveEra(book);
    if (!era.era && !era.reign) return undefined;

    const text = book.edition || book.title || '';
    /*
     * 题名里有「間」= 一个时间范围（「明洪武間」「清乾隆道光間」），
     * 不是确切纪年。deriveYear 会把它折算成年号元年（洪武間→1368），
     * 那是错的——「洪武間」指的是 1368–1398 整段。
     * 这类一律走 yearRange。
     */
    const isRange = /[間间]/.test(text);

    /*
     * lineage.year_text 是跨代/模糊表述时，lineage.year 不是考定的确切年份，
     * 而是录入者填的代表值或区间中点——不能当确切年用。
     *
     * 水滸「慕尼黑藏本」year_text=「明末清初（推定）」、year=1650：era 取到「明」，
     * year 取 1650 尚可；但「文盛堂藏板」year=1700 配「明」就越界了（明止 1644）。
     * 这类一律退到区间。
     */
    const ltext = book.lineage?.year_text ?? '';
    const lineageVague = /末[宋元明清]初|[約约]|推定|前後|前后|左右/.test(ltext);

    /*
     * 「原刻…補印/補修」：主体是**原刻**，补印是后事。
     *
     * 石渠閣補印本 year_text=「明萬曆十七年（1589）原刻、清康熙五年（1666）石渠閣補印」，
     * 而 lineage.year=1666 记的是补印年。deriveEra 从文本抓第一个朝代得「明萬曆」，
     * deriveYear 取 1666，拼成「明萬曆 1666」——萬曆 1573–1620 装不下。
     * 与题名侧「清光緒…修民國九年排印本」是同一个错，此前只在 edition 路径修过。
     */
    const reprint = ltext.match(/([宋元明清])[^、，,]*?[（(](\d{3,4})[）)][^、，,]*?原刻/);

    let year: number | undefined;
    if (isRange || lineageVague) {
        year = undefined;
    } else if (reprint) {
        year = parseInt(reprint[2], 10);   // 取原刻年，不取补印年
    } else {
        year = deriveYear(book);
    }
    const range = year == null ? deriveYearRange(book) : undefined;

    // ── 可信度 ──
    let certainty: DerivedDating['certainty'];
    if (era.source === 'lineage' || era.source === 'publication') {
        certainty = 'attested';
    } else if (UNCERTAIN_PATTERN.test(text)) {
        // 题名明说存疑（「舊題」「相傳」「疑」…）
        certainty = 'uncertain';
    } else if (!era.reign && year == null) {
        // 只推出朝代，连年号都没有（「明刊本」，全库 2,224 条）
        certainty = 'uncertain';
    } else {
        certainty = 'inferred';
    }

    const basis = era.source === 'edition'
        ? `題名「${text}」`
        : era.source === 'lineage'
            ? `版本傳承著錄「${book.lineage?.year_text ?? book.lineage?.year ?? ''}」`
            : `出版著錄「${book.publication_info?.year ?? ''}」`;

    const out: DerivedDating = {
        era: era.era,
        reign: era.reign,
        year,
        yearRange: range,
        certainty,
        source: era.source === 'edition' ? 'edition' : 'catalog',
        basis,
    };

    // ── 后修：lineage 的「原刻…補印」──
    if (reprint) {
        const repEra = ltext.match(/[、，,]\s*([宋元明清])/);
        if (repEra && repEra[1] !== out.era) out.laterRepair = { era: repEra[1] };
    }

    // ── 后修（方向：主体在前）──
    if (!out.laterRepair && REPAIR_PATTERN.test(text)) {
        const rep = text.match(/([宋元明清])\s*(?:初|末)?\s*(?:修補|修补|遞修|递修|修)/);
        if (rep && rep[1] !== era.era) out.laterRepair = { era: rep[1] };
    }

    // ── 底本（方向：主体在前，底本在后）──
    const pat = DERIVATION_PATTERNS.find(d => d.re.test(text));
    if (pat) {
        /*
         * 底本在关键词**之后**（「…覆刊武英殿本」）或整条题名里另有一个
         * 朝代（「百衲本·宋慶元黃善夫刊本」）。
         *
         * 不能直接对尾串调 deriveEra —— 那个函数只认**前缀**与特征词，
         * 而「武英殿本」「宋慶元黃善夫刊本」多半不在开头。这里改为
         * 在整条题名里扫所有朝代名，取与主年代不同的那个。
         */
        const at = text.search(pat.re);
        const tail = text.slice(at);
        const sub = findOtherEra(tail, era.era) ?? findOtherEra(text, era.era);
        if (sub) {
            out.basedOn = {
                era: sub.era,
                reign: sub.reign,
                year: sub.year,
                relation: pat.relation,
            };
        }
    }
    return out;
}

/** 朝代终止年，供「某某間」取区间上界 */
const ERA_END_YEAR: Record<string, number> = {
    漢: 220, 三國: 280, 晉: 420, 南北朝: 589, 隋: 618, 唐: 907, 五代: 960,
    宋: 1279, 遼: 1125, 西夏: 1227, 金: 1234, 元: 1368,
    /*
     * 明延至 1662：南明（弘光/隆武/永曆）归一到「明」，刻本确实有
     * 「明弘光元年」(1645)、「南明隆武二年」(1646)。止于 1644 会误判为越界。
     * 民國止于 1975：臺灣續用民國紀年，1955/1959/1969/1973 年的印本都是真的，
     * 1949 会误判为越界。取 1975 而非一个哨兵大数——这个值会直接进 year_range
     * 显示给读者（「民國間影印本」→ 1912–2100 是没法看的）。
     */
    明: 1662, 清: 1911,
    民國: 1975,
    日本: 1912, 朝鮮: 1897, 高麗: 1392, 越南: 1945, 琉球: 1879,
};

function eraEndYear(era: string): number | undefined {
    return ERA_END_YEAR[era];
}

/**
 * 排序用年份：有确切纪年就用，否则退到朝代起始年。
 * 返回 undefined 表示连朝代都推不出来（「鈔本」「稿本」这类）。
 */
export function sortYear(book: EraInferable): number | undefined {
    /*
     * 三级：确切纪年 → 区间下界 → 朝代起始年。
     *
     * 中间那级不能少：「明洪武間刊本」有 1368–1398 的区间，
     * 若直接跳到朝代起始年，它会和「明萬曆間」（1573–1619）并列在 1368，
     * 洪武本与万历本在排序上就分不开了。
     */
    const y = deriveYear(book);
    if (y != null) return y;
    const range = deriveYearRange(book);
    if (range) return range.from;
    const era = deriveEra(book).era;
    return era ? ERA_START_YEAR[era] : undefined;
}

/**
 * 朝代排序权重（用于「按年代先后」排序时，同朝代无年份的排在一起）。
 * 取值是 normalizeEra 之后的形态，域外朝代（日本、朝鮮…）排在本朝之后。
 */
const ERA_ORDER = [
    '漢', '三國', '晉', '南北朝', '隋', '唐', '五代',
    '宋', '遼', '西夏', '金', '元', '明', '清', '民國',
    '日本', '朝鮮', '高麗', '越南', '琉球',
];

export function eraRank(era: string): number {
    const i = ERA_ORDER.indexOf(era);
    return i === -1 ? ERA_ORDER.length : i;
}

// ══════════════════════════════════════════════════════════════
// 关联作品分组
// ══════════════════════════════════════════════════════════════

export interface RelatedWorkRef {
    id: string;
    title: string;
    relation?: string;
}

export interface RelatedGroup {
    key: string;
    /** i18n key，UI 侧翻译 */
    labelKey: 'belongsToWork' | 'collectedIn' | 'containedWorks'
        | 'derivativeWorks' | 'studies' | 'relatedWorks';
    items: RelatedWorkRef[];
}

/**
 * 把 related_works 按 relation 分成 5 桶。
 *
 * 现有 IndexDetail 只识别 4 种 relation，剩下 8 种（contains_text_of 4231 条、
 * collected_in 3376 条、studies 304 条…）全落进「相關作品」兜底桶，
 * 语义全丢。这里覆盖生产仓里出现过的全部 12 种。
 */
export function groupRelatedWorks(items: RelatedWorkRef[]): RelatedGroup[] {
    const buckets: Record<string, RelatedWorkRef[]> = {
        belongsTo: [], collected: [], contains: [], derivative: [], studies: [], related: [],
    };

    for (const it of items) {
        const r = it.relation;
        /*
         * part_of 与 collected_in 要分开。
         *
         * part_of 指向**上级作品**（如某篇属于某集）；
         * collected_in 指向**丛编**（史記 collected_in 二十四史，
         * 而二十四史是 type=collection）。
         * 混在一起标「所屬作品」，页面上就成了「史記的所属作品是二十四史」——
         * 二十四史根本不是作品。
         */
        if (r === 'part_of') buckets.belongsTo.push(it);
        else if (r === 'collected_in') buckets.collected.push(it);
        else if (r === 'has_part' || r === 'contains_text_of') buckets.contains.push(it);
        else if (r === 'text_carried_by' || r === 'studied_by' || r === 'derived_from'
            || r === 'followed_by' || r === 'has_adaptation') buckets.derivative.push(it);
        else if (r === 'studies' || r === 'preceded_by') buckets.studies.push(it);
        else buckets.related.push(it);
    }

    const out: RelatedGroup[] = [];
    const push = (key: string, labelKey: RelatedGroup['labelKey']) => {
        if (buckets[key].length) out.push({ key, labelKey, items: buckets[key] });
    };
    push('belongsTo', 'belongsToWork');
    push('collected', 'collectedIn');
    push('contains', 'containedWorks');
    push('derivative', 'derivativeWorks');
    push('studies', 'studies');
    push('related', 'relatedWorks');
    return out;
}

// ══════════════════════════════════════════════════════════════
// 资源分桶
// ══════════════════════════════════════════════════════════════

export interface ResourceBucket {
    key: 'text' | 'image' | 'textImage' | 'physical';
    items: ResourceEntry[];
}

export interface MirrorGroup {
    key: string;
    label: string;
    description?: string;
    items: ResourceEntry[];
}

export interface BucketedResources {
    buckets: ResourceBucket[];
    mirrors: MirrorGroup[];
    /** 合并分册后的总数，用于「N 个资源」计数 */
    total: number;
}

/**
 * 把资源按类型分桶（文字全文库 / 影印资源 / 图文对照 / 馆藏），
 * 并把同源镜像组（resource_groups）单独拎出来。
 *
 * 先合并分册系列——御定佩文韻府 23 条「第N冊」在分桶前必须先并成 1 条，
 * 否则「影印資源」栏会出现 23 行一模一样的名字。
 */
export function bucketResources(
    items: ResourceEntry[] | undefined,
    groups?: Record<string, ResourceGroupInfo>,
): BucketedResources {
    const merged = mergeVolumeResources(items || []);

    const mirrorMap = new Map<string, ResourceEntry[]>();
    const standalone: ResourceEntry[] = [];
    for (const it of merged) {
        if (it.group) {
            if (!mirrorMap.has(it.group)) mirrorMap.set(it.group, []);
            mirrorMap.get(it.group)!.push(it);
        } else {
            standalone.push(it);
        }
    }
    // origin 优先于 mirror
    for (const arr of mirrorMap.values()) {
        arr.sort((a, b) => {
            const w = (r: ResourceEntry) => r.group_role === 'origin' ? 0 : r.group_role === 'mirror' ? 1 : 2;
            return w(a) - w(b);
        });
    }

    const byKey: Record<ResourceBucket['key'], ResourceEntry[]> = {
        text: [], image: [], textImage: [], physical: [],
    };
    for (const it of standalone) {
        const types = getResourceTypes(it);
        const hasText = types.includes('text');
        const hasImage = types.includes('image');
        if (hasText && hasImage) byKey.textImage.push(it);
        else if (hasText) byKey.text.push(it);
        else if (hasImage) byKey.image.push(it);
        else byKey.physical.push(it);
    }

    const order: ResourceBucket['key'][] = ['text', 'image', 'textImage', 'physical'];
    const buckets = order
        .filter(k => byKey[k].length > 0)
        .map(k => ({ key: k, items: byKey[k] }));

    const mirrors: MirrorGroup[] = [...mirrorMap.entries()].map(([key, items]) => ({
        key,
        label: groups?.[key]?.label || key,
        description: groups?.[key]?.description,
        items,
    }));

    return { buckets, mirrors, total: merged.length };
}

/**
 * 资源的一行说明文字（设计稿里名称下方的小字）。
 * 例：「原卷掃描 · 23 / 23 冊」「精校版 · 圖文對照」「文淵閣本 · v224」
 */
export function resourceNote(item: ResourceEntry): string {
    const parts: string[] = [];
    const meta = item.metadata || {};
    if (meta.edition) parts.push(String(meta.edition));
    if (item.source_label) parts.push(item.source_label);
    if (item.details) parts.push(item.details);
    const stats = volumeStats(item);
    if (stats && stats.expected > 0) {
        parts.push(stats.missing > 0
            ? `${stats.found} / ${stats.expected} 冊 缺 ${stats.missing}`
            : `${stats.found} / ${stats.expected} 冊`);
    }
    if (meta.version) parts.push(String(meta.version));
    return parts.join(' · ');
}

/**
 * 同名资源的区分后缀。
 *
 * 史記在 CText 上有三条资源，名字都叫「中國哲學書電子化計劃」，
 * 且都没有 metadata —— 页面上就是三行一模一样的字，读者无从选择。
 * 设计稿写的是「哲學書電子化 (卷本一/二/三)」，那是人工编的；
 * 我们只能从 URL 里取可区分的标识（res=948371 之类）作为退路。
 *
 * 返回空串表示无需区分。
 */
export function resourceDisambiguator(item: ResourceEntry, siblings: ResourceEntry[]): string {
    if (resourceNote(item)) return '';
    const sameName = siblings.filter(s => s.name === item.name);
    if (sameName.length < 2) return '';

    // URL 里最有辨识度的那段：查询参数值 > 末段路径
    try {
        const u = new URL(item.url);
        const res = u.searchParams.get('res') || u.searchParams.get('id');
        if (res) return res;
        const last = u.pathname.split('/').filter(Boolean).pop();
        if (last) return decodeURIComponent(last);
    } catch { /* URL 不合法就放弃区分 */ }
    return '';
}

// ══════════════════════════════════════════════════════════════
// 版本表（作品页「相關版本」）
// ══════════════════════════════════════════════════════════════

/** 已解析的版本条目（BookDetailData 的子集 + 派生字段） */
export interface ResolvedVersion {
    id: string;
    title?: string;
    edition?: string;
    type?: string;
    resources?: ResourceEntry[];
    resource_groups?: Record<string, ResourceGroupInfo>;
    publication_info?: BookDetailData['publication_info'];
    current_location?: BookDetailData['current_location'];
    lineage?: BookDetailData['lineage'];
}

export interface VersionRow {
    id: string;
    /** 显示名：edition 优先（96.4% 有），回退 title */
    name: string;
    era: DerivedEra;
    year?: number;
    /** 影印图源（types 含 image 的资源） */
    images: ResourceEntry[];
    /** 收藏机构（types 含 physical 的资源 + current_location） */
    holders: ResourceEntry[];
    /** current_location.name —— 没有 physical 资源时的回退 */
    locationName?: string;
    /**
     * 排序用年份：确切纪年优先，否则退到朝代起始年。
     * 与 `year` 的区别是它对「宋建安黃善夫家塾刻本」这种只知朝代的
     * 也给得出值，不至于被扔到清末刻本后面。
     */
    sortYear?: number;
    /** 是否重点版本（在 version_graph 核心集内） */
    important: boolean;
    /** 所属分组 id（version_graph.node_groups） */
    group?: string;
    hasImage: boolean;
}

export interface VersionTableOptions {
    /** 朝代筛选，空串或 undefined = 全部 */
    era?: string;
    /** 仅看有影印 */
    scanOnly?: boolean;
    /** 排序：default = 录入序（人工排的重要程度）；year = 年代先后 */
    sort?: 'default' | 'year';
}

export interface VersionTable {
    rows: VersionRow[];
    /** 全部行（未筛选），用于计数 */
    allRows: VersionRow[];
    /** 可用的朝代筛选项（按历史顺序） */
    eras: string[];
    /** 是否有任何一行的年代是推断出来的（UI 据此显示说明） */
    hasInferredEra: boolean;
}

export function buildVersionRow(v: ResolvedVersion, vg?: VersionGraph): VersionRow {
    const resources = v.resources || [];
    const images: ResourceEntry[] = [];
    const holders: ResourceEntry[] = [];
    for (const r of resources) {
        const types = getResourceTypes(r);
        if (types.includes('image')) images.push(r);
        if (types.includes('physical')) holders.push(r);
    }

    return {
        id: v.id,
        name: v.edition || v.title || v.id,
        era: deriveEra(v),
        year: deriveYear(v),
        sortYear: sortYear(v),
        images,
        holders,
        locationName: v.current_location?.name,
        important: isCoreVersion(v.id, vg),
        group: vg?.node_groups?.[v.id],
        hasImage: images.length > 0,
    };
}

/** 该 book 是否在 version_graph 的核心集合内 */
function isCoreVersion(bid: string, vg?: VersionGraph): boolean {
    if (!vg) return false;
    const key = vg.default_collection;
    if (!key) return false;
    const coll = vg.collections?.[key];
    const bookIds = coll?.book_ids ?? (key === 'core' ? vg.core_books ?? [] : []);
    if (bookIds.includes(bid)) return true;
    const groups = coll?.groups ?? [];
    const g = vg.node_groups?.[bid];
    return !!g && groups.includes(g);
}

export function buildVersionTable(
    versions: ResolvedVersion[],
    vg: VersionGraph | undefined,
    opts: VersionTableOptions = {},
): VersionTable {
    const excluded = new Set(vg?.excluded_books ?? []);
    const allRows = versions
        .filter(v => !excluded.has(v.id))
        .map(v => buildVersionRow(v, vg));

    let rows = allRows;
    if (opts.era) rows = rows.filter(r => r.era.era === opts.era);
    if (opts.scanOnly) rows = rows.filter(r => r.hasImage);

    if (opts.sort === 'year') {
        /*
         * 用 sortYear（确切纪年 → 朝代起始年）而非 year。
         *
         * 只按 year 排的话，「宋建安黃善夫家塾刻本」因为没有确切纪年，
         * 会被扔到「清光緒三十一年」后面——一个宋本排在清末石印本之后，
         * 读者一眼就看出错了。
         *
         * 稳定排序：同年份保持录入序。
         */
        rows = rows
            .map((r, i) => ({ r, i }))
            .sort((a, b) => {
                const ay = a.r.sortYear, by = b.r.sortYear;
                if (ay != null && by != null) return ay - by || a.i - b.i;
                if (ay != null) return -1;      // 推不出年代的排最后
                if (by != null) return 1;
                return a.i - b.i;
            })
            .map(x => x.r);
    } else {
        /*
         * 默认顺序 ≈ 设计稿的「重要程度」。数据里没有显式权重字段，
         * 用两个可得的信号近似：
         *   1. version_graph 核心集（人工标注的重点版本，但只有 6 部作品有）
         *   2. 有影印图源的排前面——读者最想点开的就是能看到书影的那些
         * 其余保持录入序（人工录入时大体已按重要性排过）。
         * 稳定排序，同权重不打乱原有次序。
         */
        rows = rows
            .map((r, i) => ({ r, i }))
            .sort((a, b) => {
                const w = (x: VersionRow) => (x.important ? 0 : 1) * 2 + (x.hasImage ? 0 : 1);
                return w(a.r) - w(b.r) || a.i - b.i;
            })
            .map(x => x.r);
    }

    // 朝代筛选项按历史顺序，且只列真的出现过的
    const eraSet = new Set(allRows.map(r => r.era.era).filter(Boolean));
    const eras = [...eraSet].sort((a, b) => eraRank(a) - eraRank(b));

    return {
        rows,
        allRows,
        eras,
        hasInferredEra: allRows.some(r => r.era.source === 'edition'),
    };
}

/**
 * 版本分组：核心集直接展开，其余按 group 折叠。
 * （从 IndexDetail.computeVersionPartition 迁入，逻辑不变）
 */
export interface VersionPartition {
    useGrouping: boolean;
    coreIds: string[];
    groupedIds: { id: string; label: string; description?: string; ids: string[] }[];
}

export function computeVersionPartition(ids: string[], vg?: VersionGraph): VersionPartition {
    if (!vg || !vg.default_collection || !vg.node_groups) {
        return { useGrouping: false, coreIds: ids, groupedIds: [] };
    }
    const coreColl = vg.collections?.[vg.default_collection];
    const collGroups = coreColl?.groups ?? [];
    const collBookIds = coreColl?.book_ids ?? [];
    const hasCollRange = collGroups.length > 0 || collBookIds.length > 0;
    const legacyCoreBooks = (!hasCollRange && vg.default_collection === 'core' && Array.isArray(vg.core_books))
        ? vg.core_books
        : [];
    if (!hasCollRange && legacyCoreBooks.length === 0) {
        return { useGrouping: false, coreIds: ids, groupedIds: [] };
    }
    const coreGroupSet = new Set(collGroups);
    const coreBookSet = new Set([...collBookIds, ...legacyCoreBooks]);

    const isCore = (bid: string): boolean => {
        if (coreBookSet.has(bid)) return true;
        const g = vg.node_groups![bid];
        return g != null && coreGroupSet.has(g);
    };

    const coreIds: string[] = [];
    const otherByGroup = new Map<string, string[]>();
    const ungroupedOther: string[] = [];

    for (const bid of ids) {
        if (vg.excluded_books?.includes(bid)) continue;
        if (isCore(bid)) {
            coreIds.push(bid);
        } else {
            const g = vg.node_groups![bid];
            if (g) {
                if (!otherByGroup.has(g)) otherByGroup.set(g, []);
                otherByGroup.get(g)!.push(bid);
            } else {
                ungroupedOther.push(bid);
            }
        }
    }

    const otherCount = ungroupedOther.length + [...otherByGroup.values()].reduce((s, a) => s + a.length, 0);
    if (otherCount < 3) {
        return { useGrouping: false, coreIds: ids, groupedIds: [] };
    }

    const groupMeta = new Map((vg.groups ?? []).map(g => [g.id, g]));
    const groupedIds = [...otherByGroup.entries()].map(([gid, bids]) => {
        const meta = groupMeta.get(gid);
        return { id: gid, label: meta?.label ?? gid, description: meta?.description, ids: bids };
    });
    if (ungroupedOther.length > 0) {
        groupedIds.push({ id: '__other__', label: '其他版本', description: undefined, ids: ungroupedOther });
    }

    return { useGrouping: true, coreIds, groupedIds };
}

// ══════════════════════════════════════════════════════════════
// 人物：職任（works[].role）歸一
// ══════════════════════════════════════════════════════════════

/**
 * 職任歸一。
 *
 * 生產倉全量 62,068 條人物—作品關聯裡出現了 **307 種不同寫法**：
 * 撰 51,247（82.6%）· 作 2,440 · 編 2,008 · 注 1,003 · 修 927 · 纂修 876 …
 * 長尾則是「等奉敕撰」「舊題撰」「集解」「校正並音釋」這類，
 * 還混著繁簡兩寫（輯/辑、註/注、刪/删、傳/传、贊/赞）與私用區壞字。
 *
 * 不歸一的話篩選 chips 會炸出上百個按鈕，且「撰」與「等奉敕撰」分屬兩組。
 * 這裡只歸「篩選用的粗類」，原始寫法仍原樣顯示在「職任」列裡——
 * 「等奉敕撰」與「撰」的區別對版本學是有意義的，不能真的抹掉。
 */
export type RoleClass = '撰' | '編' | '注' | '校' | '譯' | '繪' | '其他';

export const ROLE_CLASS_ORDER: RoleClass[] = ['撰', '編', '注', '校', '譯', '繪', '其他'];

/** 各粗類的判定關鍵字（按序匹配，先命中先歸） */
const ROLE_RULES: { cls: RoleClass; re: RegExp }[] = [
    // 譯 / 繪 放前面：它們的字不會出現在別類裡，先撈掉免得被後面的寬規則吃掉
    { cls: '譯', re: /譯|译/ },
    { cls: '繪', re: /繪|绘|畫|画|圖|图|篆|摹/ },
    // 校勘類：校、訂、勘、審、正
    // 校勘類。排除同時含「編/輯/纂」的（如「編校」「輯校」以編輯為主）
    { cls: '校', re: /^(?!.*[編编輯辑纂])(?=.*(校|訂|订|勘|審|审|考異)).*/ },
    // 注疏類：注、註、疏、箋、解、釋、音、義疏、章句、評
    // 「傳」不在此列——數據裡的「傳」「小傳」是「作傳」（撰寫傳記），
    // 不是「經之傳注」，歸「撰」更貼切
    { cls: '注', re: /注|註|疏|箋|笺|解|釋|释|音|義疏|章句|評|评|批|論|论|答/ },
    // 編輯類：編、輯、纂、集、選、錄、彙、續、補、刪
    { cls: '編', re: /編|编|輯|辑|纂|集|選|选|錄|录|彙|汇|續|续|補|补|刪|删|修|次|定/ },
    // 撰著類：撰、作、著、述、製、書、記、傳（作傳）
    { cls: '撰', re: /撰|譔|作|著|述|製|制|書|书|記|记|傳|传|題|题|序|跋|讚|贊|赞|頌|颂/ },
];

/**
 * 把原始 role 歸到粗類。
 * 空值歸「撰」——802 條 null + 121 條空串，絕大多數是錄入時省略的作者本人著作。
 */
export function normalizeRole(role?: string | null): RoleClass {
    if (!role || !role.trim()) return '撰';
    // 去掉私用區壞字與空白（實測有 '等奉撰' 這種）
    const t = role.replace(/[\s-]/g, '');
    if (!t) return '撰';
    if (t === 'author') return '撰';
    for (const { cls, re } of ROLE_RULES) {
        if (re.test(t)) return cls;
    }
    return '其他';
}

/**
 * 作者署名里的 role 显示值。
 *
 * 数据里有 16 条 `authors[].role` 写成英文 "author"（录入工具的占位值
 * 没被替换掉），直接渲染就是「紀昀等編 author」这种中英夹杂。
 * 这类无信息量的占位值不显示；真正的中文职任（撰/編/總纂官…）原样保留。
 */
export function displayAuthorRole(role?: string): string {
    if (!role) return '';
    const t = role.trim();
    if (!t) return '';
    // 不含任何 CJK 字符的（"author"、"ed."…）都是占位或未翻译值，不显示
    if (!/[一-鿿]/.test(t)) return '';
    return t;
}

export interface RoleFacet {
    cls: RoleClass | '全部';
    label: string;
    count: number;
}

/** 統計各粗類條數，供篩選 chips 用；空類不出現 */
export function roleFacets(roles: (string | null | undefined)[]): RoleFacet[] {
    const counts = new Map<RoleClass, number>();
    for (const r of roles) {
        const c = normalizeRole(r);
        counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const out: RoleFacet[] = [{ cls: '全部', label: '全部', count: roles.length }];
    for (const cls of ROLE_CLASS_ORDER) {
        const n = counts.get(cls);
        if (n) out.push({ cls, label: cls, count: n });
    }
    // 只有一個粗類時篩選沒有意義
    return out.length > 2 ? out : [];
}

// ══════════════════════════════════════════════════════════════
// 丛编子目表
// ══════════════════════════════════════════════════════════════

export interface CollectionRow {
    /** 链接目标（work_id 或 book_id）；无匹配时为空 */
    id?: string;
    title: string;
    /** 部类（经史子集等），仅目录档有 */
    section?: string;
    /** 册号列表 */
    volumes: number[];
    /** 附属子目（如「附錄一卷」） */
    subItems?: string[];
    edition?: string;
    /** 缺册统计（目录档有） */
    found?: number;
    expected?: number;
}

export interface CollectionTable {
    rows: CollectionRow[];
    /** 数据来源：catalog = 目录档（最全）；works = contained_works；books = 仅 ID */
    source: 'catalog' | 'works' | 'books';
    /** 可用的部类筛选项 */
    sections: string[];
    /** 全帙册数（目录档有） */
    totalVolumes?: number;
}

/**
 * 构造丛编「收錄書籍」表。
 *
 * 三级数据源，按信息量降序：
 *   1. volume_book_mapping.json —— 含部类/册次/缺册/附属子目，但生产仓只有 7 份
 *   2. contained_works[] —— 含标题与册次，29 部丛编有（其中 16 部带 volume_index）
 *   3. books[] —— 只有 ID，需逐条 getItem 才能拿标题
 *
 * 优先级很重要：武英殿聚珍版有 144 条 contained_works（自带标题+册次），
 * 走第 2 级就能直接渲染，不必对 books[] 发 144 次请求。
 */
export function buildCollectionTable(
    coll: CollectionDetailData,
    catalog?: VolumeBookMapping | null,
    resolvedBooks?: Map<string, { title?: string; edition?: string }>,
): CollectionTable {
    // 1. 目录档
    if (catalog && catalog.books && catalog.books.length > 0) {
        const rows = catalog.books.map((b: VolumeBookEntry) => ({
            id: b.work_id || b.book_id || undefined,
            title: b.title,
            section: b.section,
            volumes: b.volumes || [],
            subItems: b.sub_items,
            edition: b.edition,
            found: b.found_volumes,
            expected: b.expected_volumes,
        }));
        const sections = [...new Set(rows.map(r => r.section).filter(Boolean))] as string[];
        return { rows, source: 'catalog', sections, totalVolumes: catalog.total_volumes };
    }

    // 2. contained_works
    if (coll.contained_works && coll.contained_works.length > 0) {
        const rows = coll.contained_works.map(w => ({
            id: w.id,
            title: w.title,
            volumes: normalizeVolumeIndex(w.volume_index),
        }));
        return { rows, source: 'works', sections: [] };
    }

    // 3. books（惰性解析）
    const rows = (coll.books || []).map(id => ({
        id,
        title: resolvedBooks?.get(id)?.title || id,
        edition: resolvedBooks?.get(id)?.edition,
        volumes: [] as number[],
    }));
    return { rows, source: 'books', sections: [] };
}

/** volume_index 有 int / number[] / string 三种形态（生产仓实测），统一成 number[] */
export function normalizeVolumeIndex(vi: unknown): number[] {
    if (vi == null) return [];
    if (typeof vi === 'number') return [vi];
    if (Array.isArray(vi)) return vi.filter((n): n is number => typeof n === 'number');
    if (typeof vi === 'string') {
        // "9-12" 或 "9,10,11"
        const range = vi.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
        if (range) {
            const [a, b] = [parseInt(range[1]), parseInt(range[2])];
            return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
        }
        return vi.split(/[,、]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }
    return [];
}

/** 格式化册号范围：连续用「321–343」，零散用逗号，过多用「a–b (N 冊)」 */
export function formatVolumeRange(volumes: number[], unitVolume = '冊'): string {
    if (volumes.length === 0) return '';
    if (volumes.length === 1) return `${volumes[0]}`;
    const sorted = [...volumes].sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (last - first + 1 === sorted.length) return `${first}–${last}`;
    if (sorted.length <= 3) return sorted.join(', ');
    return `${first}–${last} (${sorted.length}${unitVolume})`;
}

// ══════════════════════════════════════════════════════════════
// facts 列（intro 右侧）
// ══════════════════════════════════════════════════════════════

export interface Fact {
    key: string;
    label: string;
    value: string;
    /** 点击跳转（如「收入」跳父丛编、「著錄」滚到书目区） */
    href?: string;
    /** 内部条目 ID（渲染成 BidLink） */
    linkId?: string;
    /** 锚点（页内滚动） */
    anchor?: string;
    /** hover 提示（如「據版本題名推斷」） */
    title?: string;
}

/** 中文数字（用于「一百三十篇」这种计量文本的回退） */
const CHINESE_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CHINESE_UNITS = ['', '十', '百', '千'];

export function numberToChinese(n: number): string {
    if (n <= 0) return '';
    if (n >= 10000) return String(n);
    const str = String(n);
    const len = str.length;
    let result = '';
    let lastWasZero = false;
    for (let i = 0; i < len; i++) {
        const digit = parseInt(str[i]);
        const unitIndex = len - 1 - i;
        if (digit === 0) {
            lastWasZero = true;
        } else {
            if (lastWasZero && result) result += '〇';
            lastWasZero = false;
            if (digit === 1 && unitIndex === 1 && i === 0) {
                result += CHINESE_UNITS[unitIndex];
            } else {
                result += CHINESE_DIGITS[digit] + CHINESE_UNITS[unitIndex];
            }
        }
    }
    return result;
}

/** 计量文本：measure_info 优先（70% 有），回退 juan_count */
export function measureText(detail: Partial<IndexDetailData>, juanUnit = '卷'): string {
    const d = detail as { measure_info?: string; juan_count?: { number?: number; description?: string } };
    if (d.measure_info) return d.measure_info;
    if (d.juan_count?.number) return numberToChinese(d.juan_count.number) + juanUnit;
    if (d.juan_count?.description) return d.juan_count.description;
    return '';
}

/**
 * 版本类型推断（写本 / 刻本 / 活字本…）。
 * lineage.category 只有 1% 有，其余从题名尾缀猜。
 */
export function deriveEditionType(book: EraInferable): string {
    if (book.lineage?.category) return book.lineage.category;
    const text = book.edition || book.title || '';
    const patterns: [RegExp, string][] = [
        [/活字|聚珍/, '活字本'],
        [/石印/, '石印本'],
        [/影印|景印/, '影印本'],
        [/寫本|写本|繕寫|缮写/, '寫本'],
        [/鈔本|抄本/, '抄本'],
        [/拓本/, '拓本'],
        [/批校|評本|评本|校本/, '校本'],
        [/刻本|刊本|梓行|開雕/, '刻本'],
        [/排印|鉛印|铅印/, '排印本'],
    ];
    for (const [p, label] of patterns) {
        if (p.test(text)) return label;
    }
    return '';
}
