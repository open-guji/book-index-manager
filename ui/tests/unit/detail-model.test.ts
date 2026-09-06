/**
 * 详情页派生层测试。
 *
 * 样本全部取自生产仓实测数据（2026-09-05，book-index 7581ec5）：
 * 史記 35 个版本的 edition 题名、御定佩文韻府的 23 册资源、
 * 武英殿聚珍版叢書的 144 条 contained_works。
 *
 * 重点防的是「推断层悄悄退化」——deriveEra 覆盖率掉了不会报错，
 * 只会让页面上多出一片「—」，所以这里对典型题名逐条钉死。
 */
import { describe, it, expect } from 'vitest';
import {
    deriveEra,
    deriveYear,
    deriveEditionType,
    parseChineseNumber,
    groupRelatedWorks,
    bucketResources,
    resourceNote,
    resourceDisambiguator,
    buildVersionTable,
    buildCollectionTable,
    normalizeVolumeIndex,
    formatVolumeRange,
    measureText,
    numberToChinese,
    eraRank,
    computeVersionPartition,
    normalizeRole,
    roleFacets,
    displayAuthorRole,
    sortYear,
    deriveYearRange,
    deriveDating,
} from '../../src/core/detail-model';
import type { ResourceEntry, CollectionDetailData, VersionGraph } from '../../src/types';
import { mergeVolumeResources } from '../../src/core/resources';

describe('parseChineseNumber', () => {
    it('解析基本数字', () => {
        expect(parseChineseNumber('三')).toBe(3);
        expect(parseChineseNumber('十')).toBe(10);
        expect(parseChineseNumber('十三')).toBe(13);
        expect(parseChineseNumber('二十')).toBe(20);
        expect(parseChineseNumber('四十三')).toBe(43);
        expect(parseChineseNumber('元')).toBe(1);
    });

    it('解析廿 / 卅（史記版本题名里常见）', () => {
        expect(parseChineseNumber('廿')).toBe(20);
        expect(parseChineseNumber('廿四')).toBe(24);
        expect(parseChineseNumber('卅一')).toBe(31);
    });

    it('阿拉伯数字直接通过', () => {
        expect(parseChineseNumber('43')).toBe(43);
    });

    it('非数字返回 undefined', () => {
        expect(parseChineseNumber('甲子')).toBeUndefined();
        expect(parseChineseNumber('')).toBeUndefined();
    });
});

describe('deriveEra', () => {
    it('lineage.year_text 最优先，标记来源为 lineage', () => {
        const r = deriveEra({
            lineage: { year_text: '宋慶元年間', category: '刻本', status: 'extant' },
            edition: '明汲古閣刻本',  // 故意冲突：lineage 必须赢
        });
        expect(r).toEqual({ era: '宋', reign: '慶元', source: 'lineage' });
    });

    it('publication_info.year 次之', () => {
        const r = deriveEra({ publication_info: { year: '清乾隆四十七年（1782年）' } });
        expect(r.era).toBe('清');
        expect(r.reign).toBe('乾隆');
        expect(r.source).toBe('publication');
    });

    it('纯公元年区间也算著录（丛编 publication_info 常见形态）', () => {
        const r = deriveEra({ publication_info: { year: '1773-1803' } });
        expect(r.source).toBe('publication');
        expect(r.reign).toBe('1773');
    });

    // 以下是生产仓 edition 首字分布 Top 榜的真实题名
    const editionCases: [string, string, string][] = [
        // [题名, 期望朝代, 期望年号]
        ['宋乾道七年蔡夢弼東塾刻本', '宋', '乾道'],
        ['宋淳熙三年張杅桐川郡齋刻八年耿秉重修本', '宋', '淳熙'],
        ['宋建安黄善夫家塾刻本', '宋', ''],
        ['元至元二十五年彭寅翁崇道精舍刻本', '元', '至元'],
        ['明萬曆二十四年南京國子監刊崇禎及清順治間遞修本', '明', '萬曆'],
        ['明嘉靖四年金臺汪諒刊本', '明', '嘉靖'],
        ['清光緒三十一年上海久敬齋石印本', '清', '光緒'],
        ['清同治十年崇文書局刊本', '清', '同治'],
        ['日本慶長活字本', '日本', '慶長'],
        ['民國商務印書館百衲本二十四史', '民國', ''],
    ];
    it.each(editionCases)('题名「%s」→ %s %s', (edition, era, reign) => {
        const r = deriveEra({ edition });
        expect(r.era).toBe(era);
        expect(r.reign).toBe(reign);
        expect(r.source).toBe('edition');
    });

    // 不以朝代开头，但版本本身指向确定朝代——生产仓「欽」4062 条、「武」209 条
    const hintCases: [string, string][] = [
        ['欽定四庫全書·文淵閣本', '清'],
        ['欽定四庫全書薈要·摛藻堂本', '清'],
        ['武英殿本', '清'],
        ['武英殿聚珍版', '清'],
        ['百衲本·宋慶元黃善夫刊本', '民國'],  // 百衲本是民国影印，虽然底本是宋
        ['汲古閣刻本', '明'],
    ];
    it.each(hintCases)('特征词「%s」→ %s', (edition, era) => {
        expect(deriveEra({ edition }).era).toBe(era);
    });

    it('推不出时返回空且 source=none', () => {
        // 这些是生产仓里真实存在、且**本就没有朝代**的题名，
        // 显示「—」是正确行为，不要为了提高覆盖率硬猜。
        for (const edition of ['鈔本', '舊鈔本', '稿本', '鉛印本', '江西圖', '哈密圖']) {
            expect(deriveEra({ edition }), edition).toEqual({ era: '', reign: '', source: 'none' });
        }
        expect(deriveEra({})).toEqual({ era: '', reign: '', source: 'none' });
    });

    it('没有 edition 时回退到 title', () => {
        expect(deriveEra({ title: '清康熙五十年內府刊本' }).era).toBe('清');
    });

    it('地名与年号同形时不误判（宋建安 ≠ 東漢建安）', () => {
        // 「建安」既是东汉年号，也是福建建安（刻书重镇）。
        // 不做朝代一致性校验的话，宋本会被标成「宋 · 建安」。
        expect(deriveEra({ edition: '宋建安黄善夫家塾刻本' })).toEqual({
            era: '宋', reign: '', source: 'edition',
        });
    });

    it('朝代细分与简体归一到同一个筛选项', () => {
        // 不归一的话，史記的朝代 chips 会出现 宋/南宋/北宋 三个按钮各筛一小撮
        expect(deriveEra({ edition: '南宋刊本' }).era).toBe('宋');
        expect(deriveEra({ edition: '北宋刻本' }).era).toBe('宋');
        expect(deriveEra({ edition: '南明刊本' }).era).toBe('明');
        expect(deriveEra({ edition: '民国石印本' }).era).toBe('民國');
        expect(deriveEra({ edition: '西漢竹簡' }).era).toBe('漢');
    });

    /*
     * 覆盖率基线（2026-09-05 对生产仓全量 20,853 部 Book 实测）：
     *   有朝代 94.0%（题名推断 91.5% · lineage 1.0% · publication 1.5%）
     *   可排序年份 57.5%
     * 推不出的 6.0% 是「鈔本」「稿本」「江西圖」这类本就无朝代的题名。
     *
     * 若日后规则改动导致覆盖率明显下降，页面上会多出一片「—」而不会报错，
     * 所以用下面这组代表性样本当哨兵。
     */
    it('覆盖率哨兵：代表 Top 朝代分布的题名全部命中', () => {
        const sentinels: [string, string][] = [
            ['欽定四庫全書·文淵閣本', '清'],       // 清 12,561 条（含欽定系列 4,062）
            ['明嘉靖四年金臺汪諒刊本', '明'],       // 明 4,252
            ['日本延享四年刊本', '日本'],           // 日本 766
            ['宋乾道七年蔡夢弼東塾刻本', '宋'],     // 宋 611
            ['元至元二十五年彭寅翁崇道精舍刻本', '元'], // 元 580
            ['民國商務印書館百衲本二十四史', '民國'], // 民國 446
        ];
        for (const [edition, era] of sentinels) {
            expect(deriveEra({ edition }).era, edition).toBe(era);
        }
    });
});

describe('deriveYear', () => {
    it('lineage.year 最优先', () => {
        expect(deriveYear({ lineage: { year: 1195, category: '刻本', status: 'extant' } })).toBe(1195);
    });

    it('年号 + 中文序数折算成公元年', () => {
        // 乾隆元年 = 1736，四十三年 = 1736 + 43 - 1 = 1778
        expect(deriveYear({ edition: '清乾隆四十三年武英殿刊本' })).toBe(1778);
        // 慶元元年 = 1195
        expect(deriveYear({ edition: '宋慶元元年刊本' })).toBe(1195);
        // 乾道七年 = 1165 + 7 - 1 = 1171
        expect(deriveYear({ edition: '宋乾道七年蔡夢弼東塾刻本' })).toBe(1171);
    });

    it('只有年号无序数时取元年', () => {
        expect(deriveYear({ edition: '武英殿本', publication_info: { year: '清乾隆' } })).toBe(1736);
    });

    it('公元年直接采用', () => {
        expect(deriveYear({ publication_info: { year: '1782年' } })).toBe(1782);
    });

    it('不把册号误读成年份', () => {
        // 「第321冊」的 321 在 100–2100 区间内，但前面有「第」——
        // 这条是回归防线：曾经的正则会把它当成公元 321 年
        const y = deriveYear({ title: '摛藻堂四庫全書薈要·第321冊' });
        // 无论如何都不该是 321（会把清代写本排到西晋去）
        expect(y).not.toBe(321);
    });

    it('推不出返回 undefined', () => {
        expect(deriveYear({ edition: '鈔本' })).toBeUndefined();
    });
});

describe('deriveEditionType', () => {
    it('lineage.category 优先', () => {
        expect(deriveEditionType({
            lineage: { category: '石刻', status: 'extant' },
            edition: '清刻本',
        })).toBe('石刻');
    });

    it.each([
        ['武英殿聚珍版叢書', '活字本'],
        ['清光緒三十一年上海久敬齋石印本', '石印本'],
        ['民國涵芬樓影印本', '影印本'],
        ['欽定四庫全書薈要繕寫本', '寫本'],
        ['明鈔本', '抄本'],
        ['宋乾道七年刻本', '刻本'],
    ])('题名「%s」→ %s', (edition, expected) => {
        expect(deriveEditionType({ edition })).toBe(expected);
    });

    it('推不出返回空串', () => {
        expect(deriveEditionType({ edition: '文淵閣本' })).toBe('');
    });
});

describe('groupRelatedWorks', () => {
    it('覆盖生产仓出现过的全部 12 种 relation', () => {
        // 这些 relation 值与出现次数取自 2026-09-05 全量扫描
        const groups = groupRelatedWorks([
            { id: '1', title: '二十四史', relation: 'collected_in' },
            { id: '2', title: '史記集解', relation: 'text_carried_by' },
            { id: '3', title: '史記考證', relation: 'studied_by' },
            { id: '4', title: '漢書', relation: 'related' },
            { id: '5', title: '甲', relation: 'contains_text_of' },
            { id: '6', title: '乙', relation: 'part_of' },
            { id: '7', title: '丙', relation: 'has_part' },
            { id: '8', title: '丁', relation: 'studies' },
            { id: '9', title: '戊', relation: 'preceded_by' },
            { id: '10', title: '己', relation: 'followed_by' },
            { id: '11', title: '庚', relation: 'derived_from' },
            { id: '12', title: '辛', relation: 'related_to' },
        ]);
        const byKey = Object.fromEntries(groups.map(g => [g.key, g.items.map(i => i.id)]));
        // part_of 指向上级**作品**；collected_in 指向**丛编**（史記 collected_in
        // 二十四史，而二十四史 type=collection）。混在一起标「所屬作品」，
        // 页面上就成了「史記的所属作品是二十四史」——二十四史不是作品。
        expect(byKey.belongsTo).toEqual(['6']);
        expect(byKey.collected).toEqual(['1']);
        expect(byKey.contains).toEqual(['5', '7']);
        expect(byKey.derivative).toEqual(['2', '3', '10', '11']);
        expect(byKey.studies).toEqual(['8', '9']);
        expect(byKey.related).toEqual(['4', '12']);
        // 一条都不能丢
        expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(12);
    });

    it('无 relation 落入「相關作品」', () => {
        const groups = groupRelatedWorks([{ id: '1', title: '甲' }]);
        expect(groups).toHaveLength(1);
        expect(groups[0].labelKey).toBe('relatedWorks');
    });

    it('空数组返回空', () => {
        expect(groupRelatedWorks([])).toEqual([]);
    });
});

describe('bucketResources', () => {
    // 史記的 9 条真实资源
    const shijiResources: ResourceEntry[] = [
        { id: '1', name: '维基文库', types: ['text'], url: 'https://zh.wikisource.org/wiki/史記' },
        { id: '2', name: 'CText', types: ['text'], url: 'https://ctext.org/wiki.pl?if=gb&res=948371' },
        { id: '3', name: 'CText', types: ['text'], url: 'https://ctext.org/wiki.pl?if=gb&res=174166' },
        { id: '4', name: 'CText', types: ['text'], url: 'https://ctext.org/wiki.pl?if=gb&res=402481' },
        {
            id: '5', name: '识典古籍', types: ['text', 'image'],
            url: 'https://www.shidianguji.com/book/LS0001',
            metadata: { version: 'v224', edition: '百衲本', check_type: '粗校' },
        },
        {
            id: '6', name: '识典古籍', types: ['text', 'image'],
            url: 'https://www.shidianguji.com/book/SK0698',
            metadata: { version: 'v37', edition: '四庫全書本', check_type: '粗校' },
        },
        { id: '7', name: 'Internet Archive', types: ['image'], url: 'https://archive.org/details/02077347.cn' },
    ];

    it('按 text / image / text+image 分桶', () => {
        const r = bucketResources(shijiResources);
        const byKey = Object.fromEntries(r.buckets.map(b => [b.key, b.items.length]));
        expect(byKey.text).toBe(4);
        expect(byKey.image).toBe(1);
        expect(byKey.textImage).toBe(2);
        expect(byKey.physical).toBeUndefined();  // 空桶不出现
    });

    it('桶顺序固定为 文字 → 影印 → 图文 → 馆藏', () => {
        const r = bucketResources([
            { id: 'a', name: '馆藏', types: ['physical'], url: '' },
            { id: 'b', name: '图文', types: ['text', 'image'], url: '' },
            { id: 'c', name: '文字', types: ['text'], url: '' },
        ]);
        expect(r.buckets.map(b => b.key)).toEqual(['text', 'textImage', 'physical']);
    });

    it('合并分册后再分桶（御定佩文韻府 23 册 → 1 行）', () => {
        const volumes: ResourceEntry[] = Array.from({ length: 23 }, (_, i) => ({
            id: String(i),
            name: `摛藻堂四庫全書薈要·第${321 + i}冊`,
            types: ['image'] as const,
            url: `https://commons.wikimedia.org/wiki/File:x${321 + i}.djvu`,
        }));
        const r = bucketResources(volumes);
        const imageBucket = r.buckets.find(b => b.key === 'image')!;
        expect(imageBucket.items).toHaveLength(1);
        expect(imageBucket.items[0].name).toBe('摛藻堂四庫全書薈要');
        expect(imageBucket.items[0].volumes).toHaveLength(23);
    });

    it('镜像组单独拎出，带 label 与 description', () => {
        const r = bucketResources(
            [
                { id: 'a', name: '原始源', types: ['image'], url: '', group: 'g1', group_role: 'mirror' },
                { id: 'b', name: '备份镜像', types: ['image'], url: '', group: 'g1', group_role: 'origin' },
                { id: 'c', name: '独立资源', types: ['text'], url: '' },
            ],
            { g1: { label: '文淵閣本影像', description: '同一份内容的两处存储' } },
        );
        expect(r.mirrors).toHaveLength(1);
        expect(r.mirrors[0].label).toBe('文淵閣本影像');
        expect(r.mirrors[0].description).toBe('同一份内容的两处存储');
        // origin 排在 mirror 前面
        expect(r.mirrors[0].items.map(i => i.id)).toEqual(['b', 'a']);
        // 镜像组不进普通桶
        expect(r.buckets.flatMap(b => b.items).map(i => i.id)).toEqual(['c']);
    });

    it('空输入返回空结构', () => {
        const r = bucketResources(undefined);
        expect(r.buckets).toEqual([]);
        expect(r.mirrors).toEqual([]);
        expect(r.total).toBe(0);
    });
});

describe('resourceNote', () => {
    it('拼接版本 / 来源 / 册数', () => {
        expect(resourceNote({
            id: '1', name: '识典古籍', url: '', types: ['text', 'image'],
            metadata: { edition: '百衲本', version: 'v224' },
        })).toBe('百衲本 · v224');
    });

    it('分册齐全时显示 n / m 冊', () => {
        expect(resourceNote({
            id: '1', name: 'x', url: '', types: ['image'],
            volumes: [{ volume: 1 }, { volume: 2 }, { volume: 3 }],
            expected_volumes: 3,
        })).toBe('3 / 3 冊');
    });

    it('缺册时标注', () => {
        expect(resourceNote({
            id: '1', name: 'x', url: '', types: ['image'],
            volumes: [{ volume: 1 }, { volume: 2, status: 'missing' }],
            expected_volumes: 2,
        })).toBe('1 / 2 冊 缺 1');
    });

    it('无信息返回空串', () => {
        expect(resourceNote({ id: '1', name: 'x', url: '', types: ['text'] })).toBe('');
    });
});

describe('resourceDisambiguator', () => {
    // 史記在 CText 上的三条资源，名字完全相同且都没有 metadata
    const ctextTrio: ResourceEntry[] = [
        { id: '2', name: 'CText', types: ['text'], url: 'https://ctext.org/wiki.pl?if=gb&res=948371' },
        { id: '3', name: 'CText', types: ['text'], url: 'https://ctext.org/wiki.pl?if=gb&res=174166' },
        { id: '4', name: 'CText', types: ['text'], url: 'https://ctext.org/wiki.pl?if=gb&res=402481' },
    ];

    it('重名且无说明时，用 URL 查询参数区分', () => {
        expect(resourceDisambiguator(ctextTrio[0], ctextTrio)).toBe('948371');
        expect(resourceDisambiguator(ctextTrio[1], ctextTrio)).toBe('174166');
        expect(resourceDisambiguator(ctextTrio[2], ctextTrio)).toBe('402481');
    });

    it('名字唯一时不加后缀', () => {
        const solo: ResourceEntry = {
            id: '1', name: '維基文庫', types: ['text'],
            url: 'https://zh.wikisource.org/wiki/史記',
        };
        expect(resourceDisambiguator(solo, [solo, ...ctextTrio])).toBe('');
    });

    it('已有 note 可区分时不再加后缀', () => {
        // 识典古籍三条同名，但 metadata.edition 已经能区分
        const shidian: ResourceEntry[] = [
            {
                id: '5', name: '识典古籍', types: ['text', 'image'],
                url: 'https://www.shidianguji.com/book/LS0001',
                metadata: { edition: '百衲本' },
            },
            {
                id: '6', name: '识典古籍', types: ['text', 'image'],
                url: 'https://www.shidianguji.com/book/SK0698',
                metadata: { edition: '四庫全書本' },
            },
        ];
        expect(resourceDisambiguator(shidian[0], shidian)).toBe('');
    });

    it('URL 非法时安全返回空串', () => {
        const bad: ResourceEntry[] = [
            { id: '1', name: '同名', types: ['text'], url: 'not a url' },
            { id: '2', name: '同名', types: ['text'], url: 'also bad' },
        ];
        expect(resourceDisambiguator(bad[0], bad)).toBe('');
    });
});

describe('buildVersionTable', () => {
    const versions = [
        { id: 'b1', edition: '百衲本·宋慶元黃善夫刊本', resources: [{ id: 'r', name: '圖庫', types: ['image' as const], url: 'u' }] },
        { id: 'b2', edition: '宋乾道七年蔡夢弼東塾刻本', resources: [{ id: 'r', name: '維基', types: ['image' as const], url: 'u' }] },
        { id: 'b3', edition: '明萬曆二十四年南京國子監刊本', resources: [{ id: 'r', name: '故宮', types: ['physical' as const], url: 'u' }] },
        { id: 'b4', edition: '清乾隆十三年武英殿刊內府精抄本', resources: [] },
    ];

    it('派生行含 name / era / images / holders', () => {
        const t = buildVersionTable(versions, undefined);
        expect(t.rows).toHaveLength(4);
        expect(t.rows[0].name).toBe('百衲本·宋慶元黃善夫刊本');
        expect(t.rows[0].images).toHaveLength(1);
        expect(t.rows[0].hasImage).toBe(true);
        expect(t.rows[2].holders).toHaveLength(1);
        expect(t.rows[2].hasImage).toBe(false);
    });

    it('朝代筛选项按历史顺序，不按出现顺序', () => {
        const t = buildVersionTable(versions, undefined);
        // 百衲本→民國、宋、明、清；历史序应为 宋 明 清 民國
        expect(t.eras).toEqual(['宋', '明', '清', '民國']);
    });

    it('按朝代筛选', () => {
        const t = buildVersionTable(versions, undefined, { era: '明' });
        expect(t.rows.map(r => r.id)).toEqual(['b3']);
        expect(t.allRows).toHaveLength(4);  // allRows 不受筛选影响
    });

    it('仅看有影印', () => {
        const t = buildVersionTable(versions, undefined, { scanOnly: true });
        expect(t.rows.map(r => r.id)).toEqual(['b1', 'b2']);
    });

    it('默认排序把有影印的提前，其余保持录入序', () => {
        // 数据里没有权重字段，用「有影印」近似重要程度——读者最想点开的
        // 就是能看到书影的那些。b1/b2 有 image，b3 只有 physical，b4 没资源。
        const t = buildVersionTable(versions, undefined);
        expect(t.rows.map(r => r.id)).toEqual(['b1', 'b2', 'b3', 'b4']);
    });

    it('默认排序：核心版本优先于「有影印但非核心」', () => {
        const vg: VersionGraph = {
            enabled: true, default_collection: 'core',
            node_groups: {},
            collections: { core: { label: '核心', book_ids: ['b4'] } },
        };
        // b4 无资源但属核心集，应排到最前
        const t = buildVersionTable(versions, vg);
        expect(t.rows[0].id).toBe('b4');
    });

    it('默认排序是稳定的（同权重不打乱录入序）', () => {
        const same = [
            { id: 'x1', edition: '甲本' },
            { id: 'x2', edition: '乙本' },
            { id: 'x3', edition: '丙本' },
        ];
        expect(buildVersionTable(same, undefined).rows.map(r => r.id))
            .toEqual(['x1', 'x2', 'x3']);
    });

    it('按年代排序时无年份的排在后面', () => {
        const t = buildVersionTable(versions, undefined, { sort: 'year' });
        const ids = t.rows.map(r => r.id);
        // 宋乾道七年(1171) < 明萬曆廿四年(1596) < 清乾隆十三年(1748)
        expect(ids.indexOf('b2')).toBeLessThan(ids.indexOf('b3'));
        expect(ids.indexOf('b3')).toBeLessThan(ids.indexOf('b4'));
    });

    it('标记出有推断年代（UI 据此加说明）', () => {
        expect(buildVersionTable(versions, undefined).hasInferredEra).toBe(true);
        const cited = buildVersionTable(
            [{ id: 'x', edition: '某本', lineage: { year_text: '宋', category: '刻本', status: 'extant' } }],
            undefined,
        );
        expect(cited.hasInferredEra).toBe(false);
    });

    it('version_graph 核心集标记为重点，excluded_books 被剔除', () => {
        const vg: VersionGraph = {
            enabled: true,
            default_collection: 'core',
            node_groups: { b1: 'g1', b2: 'g1', b3: 'g2' },
            collections: { core: { label: '核心版本', book_ids: ['b1'] } },
            excluded_books: ['b4'],
        };
        const t = buildVersionTable(versions, vg);
        expect(t.rows).toHaveLength(3);           // b4 被剔除
        expect(t.rows.find(r => r.id === 'b1')!.important).toBe(true);
        expect(t.rows.find(r => r.id === 'b2')!.important).toBe(false);
        expect(t.rows.find(r => r.id === 'b1')!.group).toBe('g1');
    });

    it('空列表不炸', () => {
        const t = buildVersionTable([], undefined);
        expect(t.rows).toEqual([]);
        expect(t.eras).toEqual([]);
    });
});

describe('buildCollectionTable', () => {
    const base = { id: 'c1', title: '某叢編', type: 'collection' as const };

    it('优先用目录档（含部类 / 册次 / 缺册）', () => {
        const t = buildCollectionTable(
            { ...base, contained_works: [{ id: 'w1', title: '不該用這個' }] } as CollectionDetailData,
            {
                collection_id: 'c1', title: '某叢編', total_volumes: 964,
                stats: { total_books: 2 },
                books: [
                    { title: '周易口訣義', work_id: 'w1', volumes: [1, 2], section: '經', expected_volumes: 2, found_volumes: 2 },
                    { title: '易說', work_id: 'w2', volumes: [3], section: '經', sub_items: ['附錄'] },
                ],
            },
        );
        expect(t.source).toBe('catalog');
        expect(t.rows).toHaveLength(2);
        expect(t.rows[0].section).toBe('經');
        expect(t.rows[0].expected).toBe(2);
        expect(t.rows[1].subItems).toEqual(['附錄']);
        expect(t.sections).toEqual(['經']);
        expect(t.totalVolumes).toBe(964);
    });

    it('无目录档时用 contained_works（武英殿的 144 条走这条路，零额外请求）', () => {
        const t = buildCollectionTable({
            ...base,
            books: ['b1', 'b2'],
            contained_works: [
                { id: 'w1', title: '周易口訣義', volume_index: [2, 3, 4, 5] },
                { id: 'w2', title: '易說', volume_index: [6] },
            ],
        } as CollectionDetailData);
        expect(t.source).toBe('works');
        expect(t.rows[0].title).toBe('周易口訣義');
        expect(t.rows[0].volumes).toEqual([2, 3, 4, 5]);
        expect(t.sections).toEqual([]);
    });

    it('只有 books[] 时回退，未解析的用 ID 占位', () => {
        const t = buildCollectionTable(
            { ...base, books: ['b1', 'b2'] } as CollectionDetailData,
            null,
            new Map([['b1', { title: '解析到的書', edition: '某本' }]]),
        );
        expect(t.source).toBe('books');
        expect(t.rows[0].title).toBe('解析到的書');
        expect(t.rows[1].title).toBe('b2');  // 未解析，用 ID 占位
    });

    it('全空返回空表', () => {
        const t = buildCollectionTable(base as CollectionDetailData);
        expect(t.rows).toEqual([]);
        expect(t.source).toBe('books');
    });
});

describe('normalizeVolumeIndex', () => {
    it('三种生产实测形态都归一成 number[]', () => {
        expect(normalizeVolumeIndex(9)).toEqual([9]);                    // int，3616 条
        expect(normalizeVolumeIndex([321, 322, 323])).toEqual([321, 322, 323]);  // list，877 条
        expect(normalizeVolumeIndex('9-12')).toEqual([9, 10, 11, 12]);   // str，24 条
    });

    it('逗号分隔与全角顿号', () => {
        expect(normalizeVolumeIndex('1,3,5')).toEqual([1, 3, 5]);
        expect(normalizeVolumeIndex('1、3')).toEqual([1, 3]);
    });

    it('空值返回空数组', () => {
        expect(normalizeVolumeIndex(null)).toEqual([]);
        expect(normalizeVolumeIndex(undefined)).toEqual([]);
    });
});

describe('formatVolumeRange', () => {
    it('连续区间用短横（御定佩文韻府 321–343）', () => {
        const vols = Array.from({ length: 23 }, (_, i) => 321 + i);
        expect(formatVolumeRange(vols)).toBe('321–343');
    });

    it('单册直接显示', () => {
        expect(formatVolumeRange([9])).toBe('9');
    });

    it('零散少量用逗号', () => {
        expect(formatVolumeRange([1, 5, 9])).toBe('1, 5, 9');
    });

    it('零散多量用区间 + 计数', () => {
        expect(formatVolumeRange([1, 5, 9, 20])).toBe('1–20 (4冊)');
    });

    it('乱序输入先排序', () => {
        expect(formatVolumeRange([3, 1, 2])).toBe('1–3');
    });

    it('空数组返回空串', () => {
        expect(formatVolumeRange([])).toBe('');
    });
});

describe('measureText / numberToChinese', () => {
    it('measure_info 优先（70% 的 Work 有）', () => {
        expect(measureText({ measure_info: '一百三十篇', juan_count: { number: 130 } } as never)).toBe('一百三十篇');
    });

    it('回退到 juan_count.number 转中文', () => {
        expect(measureText({ juan_count: { number: 130 } } as never)).toBe('一百三十卷');
    });

    it('再回退到 juan_count.description', () => {
        expect(measureText({ juan_count: { description: '卷數不詳' } } as never)).toBe('卷數不詳');
    });

    it('numberToChinese 处理十位省略与零', () => {
        expect(numberToChinese(10)).toBe('十');
        expect(numberToChinese(13)).toBe('十三');
        expect(numberToChinese(130)).toBe('一百三十');
        expect(numberToChinese(444)).toBe('四百四十四');
        expect(numberToChinese(2416)).toBe('二千四百一十六');
        expect(numberToChinese(10000)).toBe('10000');  // 万以上用阿拉伯数字
    });

    it('无计量返回空串', () => {
        expect(measureText({} as never)).toBe('');
    });
});

describe('eraRank', () => {
    it('按历史顺序排', () => {
        expect(eraRank('宋')).toBeLessThan(eraRank('明'));
        expect(eraRank('明')).toBeLessThan(eraRank('清'));
        expect(eraRank('清')).toBeLessThan(eraRank('民國'));
    });

    it('未知朝代排最后', () => {
        expect(eraRank('未知')).toBeGreaterThan(eraRank('民國'));
    });
});

describe('computeVersionPartition（从 IndexDetail 迁入，行为不变）', () => {
    it('无 version_graph 时不分组', () => {
        const p = computeVersionPartition(['a', 'b', 'c']);
        expect(p.useGrouping).toBe(false);
        expect(p.coreIds).toEqual(['a', 'b', 'c']);
    });

    it('非核心不足 3 条时不分组', () => {
        const vg: VersionGraph = {
            enabled: true, default_collection: 'core',
            node_groups: { a: 'g1', b: 'g2' },
            collections: { core: { label: '核心', book_ids: ['a'] } },
        };
        expect(computeVersionPartition(['a', 'b'], vg).useGrouping).toBe(false);
    });

    it('核心集展开、其余按组折叠', () => {
        const vg: VersionGraph = {
            enabled: true, default_collection: 'core',
            node_groups: { a: 'core-g', b: 'g1', c: 'g1', d: 'g2' },
            groups: [{ id: 'g1', label: '刻本' }, { id: 'g2', label: '抄本' }],
            collections: { core: { label: '核心', book_ids: ['a'] } },
        };
        const p = computeVersionPartition(['a', 'b', 'c', 'd'], vg);
        expect(p.useGrouping).toBe(true);
        expect(p.coreIds).toEqual(['a']);
        expect(p.groupedIds.map(g => g.label)).toEqual(['刻本', '抄本']);
    });
});

describe('normalizeRole / roleFacets', () => {
    /*
     * 生產倉全量 62,068 條人物—作品關聯裡有 **307 種不同 role 寫法**。
     * 不歸一的話篩選 chips 會炸出上百個按鈕，且「撰」與「等奉敕撰」分屬兩組。
     *
     * 歸一後實測分布（2026-09-05）：
     *   撰 88.77% · 編 8.71% · 注 1.91% · 譯 0.30% · 其他 0.18% · 校 0.09% · 繪 0.04%
     * 99.82% 落入有意義的粗類；其他裡剩的是「託名」「蓋印」「七十一」「宋徽宗」
     * 這類本就不是職任的髒數據。
     */
    it('主流寫法归到對應粗類', () => {
        expect(normalizeRole('撰')).toBe('撰');       // 51,247 条
        expect(normalizeRole('作')).toBe('撰');       // 2,440
        expect(normalizeRole('編')).toBe('編');       // 2,008
        expect(normalizeRole('注')).toBe('注');       // 1,003
        expect(normalizeRole('修')).toBe('編');       // 927
        expect(normalizeRole('纂修')).toBe('編');     // 876
        expect(normalizeRole('輯')).toBe('編');       // 759
        expect(normalizeRole('譯')).toBe('譯');       // 152
    });

    it('长尾变体归到主类，不另起一组', () => {
        // 「等奉敕撰」「舊題撰」若不归一，会各占一个筛选按钮
        for (const r of ['等奉敕撰', '等撰', '奉敕撰', '敕撰', '舊題撰', '御撰', '同撰', '合撰', '譔']) {
            expect(normalizeRole(r), r).toBe('撰');
        }
        for (const r of ['等纂修', '等編', '等修', '敕編', '纂輯', '編輯', '總纂', '編次']) {
            expect(normalizeRole(r), r).toBe('編');
        }
        for (const r of ['集解', '集注', '集註', '箋注', '音義', '疏證']) {
            expect(normalizeRole(r), r).toBe('注');
        }
    });

    it('繁简两写归到同一类', () => {
        // 数据里繁简混杂：辑/輯、註/注、删/刪、传/傳、赞/贊
        expect(normalizeRole('辑')).toBe(normalizeRole('輯'));
        expect(normalizeRole('註')).toBe(normalizeRole('注'));
        expect(normalizeRole('传')).toBe(normalizeRole('傳'));
        expect(normalizeRole('钞')).toBe(normalizeRole('鈔'));
    });

    it('空值与脏数据归「撰」——多是录入时省略的本人著作', () => {
        expect(normalizeRole(null)).toBe('撰');
        expect(normalizeRole(undefined)).toBe('撰');
        expect(normalizeRole('')).toBe('撰');
        expect(normalizeRole('   ')).toBe('撰');
        expect(normalizeRole('author')).toBe('撰');   // 4 条英文脏数据
        expect(normalizeRole('等奉撰')).toBe('撰');  // 私用区坏字
    });

    it('「傳」归撰而非注：数据里是「作传」不是「经之传注」', () => {
        expect(normalizeRole('傳')).toBe('撰');
        expect(normalizeRole('小傳')).toBe('撰');
    });

    it('「編校」归編：以编辑为主，不算校勘', () => {
        expect(normalizeRole('編校')).toBe('編');
        expect(normalizeRole('輯校')).toBe('編');
        expect(normalizeRole('校')).toBe('校');
        expect(normalizeRole('校勘')).toBe('校');
    });

    it('真正无从归类的落「其他」', () => {
        for (const r of ['託名', '蓋印', '七十一', '宋徽宗', '夢禪居士']) {
            expect(normalizeRole(r), r).toBe('其他');
        }
    });

    it('roleFacets 按固定顺序给出计数，空类不出现', () => {
        const facets = roleFacets(['撰', '撰', '編', '注', null, 'author']);
        expect(facets[0]).toEqual({ cls: '全部', label: '全部', count: 6 });
        // null 与 author 都归撰 → 撰 4 条
        expect(facets.find(f => f.cls === '撰')!.count).toBe(4);
        expect(facets.find(f => f.cls === '編')!.count).toBe(1);
        expect(facets.find(f => f.cls === '注')!.count).toBe(1);
        expect(facets.find(f => f.cls === '譯')).toBeUndefined();  // 空类不出现
        // 顺序固定：全部 → 撰 → 編 → 注
        expect(facets.map(f => f.cls)).toEqual(['全部', '撰', '編', '注']);
    });

    it('只有一个粗类时不给筛选（筛了也没用）', () => {
        expect(roleFacets(['撰', '撰', '等奉敕撰'])).toEqual([]);
        expect(roleFacets([])).toEqual([]);
    });
});

describe('displayAuthorRole', () => {
    it('中文职任原样保留', () => {
        expect(displayAuthorRole('撰')).toBe('撰');
        expect(displayAuthorRole('總纂官')).toBe('總纂官');
        expect(displayAuthorRole('等奉敕撰')).toBe('等奉敕撰');
    });

    it('英文占位值不显示', () => {
        // 数据里有 16 条 authors[].role 写成 "author"（录入工具的占位值没换掉），
        // 直接渲染就是「紀昀等編 author」这种中英夹杂
        expect(displayAuthorRole('author')).toBe('');
        expect(displayAuthorRole('ed.')).toBe('');
        expect(displayAuthorRole('AUTHOR')).toBe('');
    });

    it('空值安全', () => {
        expect(displayAuthorRole(undefined)).toBe('');
        expect(displayAuthorRole('')).toBe('');
        expect(displayAuthorRole('   ')).toBe('');
    });
});

describe('mergeVolumeResources：合并行必须可点', () => {
    it('合并出的分册组带首册链接', () => {
        // 御定佩文韻府 23 册各有 wikimedia 链接；合并后若 url 为空，
        // 「影印與全文」那行就只剩文字点不动，读者没有任何入口
        const volumes: ResourceEntry[] = Array.from({ length: 23 }, (_, i) => ({
            id: String(i),
            name: `摛藻堂四庫全書薈要·第${321 + i}冊`,
            types: ['image'] as const,
            url: `https://commons.wikimedia.org/wiki/File:x${321 + i}.djvu`,
        }));
        const merged = mergeVolumeResources(volumes);
        expect(merged).toHaveLength(1);
        expect(merged[0].url, '合并行没有 url，整行不可点').toBeTruthy();
        expect(merged[0].url).toContain('321');   // 取首册
        expect(merged[0].volumes).toHaveLength(23);
    });

    it('分册都没链接时合并行 url 为空但不炸', () => {
        const noUrl: ResourceEntry[] = [
            { id: '1', name: '某書·第1冊', types: ['physical'], url: '' },
            { id: '2', name: '某書·第2冊', types: ['physical'], url: '' },
        ];
        const merged = mergeVolumeResources(noUrl);
        expect(merged).toHaveLength(1);
        expect(merged[0].url).toBe('');
    });
});

describe('sortYear：按年代排序的锚点', () => {
    it('有确切纪年时用纪年', () => {
        expect(sortYear({ edition: '宋乾道七年蔡夢弼東塾刻本' })).toBe(1171);
        expect(sortYear({ edition: '清乾隆四十三年武英殿刊本' })).toBe(1778);
    });

    it('只知朝代时退到朝代起始年，不被扔到末尾', () => {
        // 「宋建安黃善夫家塾刻本」推得出「宋」但无确切纪年。
        // 若按 year ?? Infinity 排，它会排到清光緒（1905）后面——
        // 一个宋本排在清末石印本之后，一眼就是错的。
        const song = sortYear({ edition: '宋建安黄善夫家塾刻本' });
        const qing = sortYear({ edition: '清光緒三十一年上海久敬齋石印本' });
        expect(song).toBeDefined();
        expect(song!, '宋本应排在清末刻本之前').toBeLessThan(qing!);
    });

    it('推不出朝代时返回 undefined', () => {
        expect(sortYear({ edition: '鈔本' })).toBeUndefined();
    });

    it('欽定四庫全書系列能推出乾隆年份（特征词而非题名前缀）', () => {
        // deriveYear 原先只认题名**前缀**，而「欽定四庫全書·文淵閣本」
        // 不以朝代开头，于是明明推得出「清·乾隆」却拿不到年份，
        // 排序时被扔到末尾
        expect(deriveYear({ edition: '欽定四庫全書·文淵閣本' })).toBe(1736);
        expect(sortYear({ edition: '欽定四庫全書·文淵閣本' })).toBe(1736);
    });
});

describe('buildVersionTable 按年代排序', () => {
    it('宋本排在清本之前，即使宋本没有确切纪年', () => {
        const versions = [
            { id: 'qing', edition: '清光緒三十一年上海久敬齋石印本' },
            { id: 'song', edition: '宋建安黄善夫家塾刻本' },
            { id: 'ming', edition: '明嘉靖四年金臺汪諒刊本' },
            { id: 'siku', edition: '欽定四庫全書·文淵閣本' },
        ];
        const ids = buildVersionTable(versions, undefined, { sort: 'year' }).rows.map(r => r.id);
        expect(ids.indexOf('song')).toBeLessThan(ids.indexOf('ming'));
        expect(ids.indexOf('ming')).toBeLessThan(ids.indexOf('siku'));
        expect(ids.indexOf('siku')).toBeLessThan(ids.indexOf('qing'));
    });

    it('推不出年代的排最后', () => {
        const versions = [
            { id: 'chao', edition: '鈔本' },
            { id: 'song', edition: '宋刻本' },
        ];
        expect(buildVersionTable(versions, undefined, { sort: 'year' }).rows.map(r => r.id))
            .toEqual(['song', 'chao']);
    });
});

describe('民國紀年', () => {
    it('民國 N 年 = 1911 + N', () => {
        // 全库 432 部民國刻本此前全推不出年份——民國不是年号制，
        // 走不通年号表那条路
        expect(deriveYear({ edition: '民國三年刊本' })).toBe(1914);
        expect(deriveYear({ edition: '民國七年王氏聚珍仿宋印書局鉛印本' })).toBe(1918);
        expect(deriveYear({ edition: '民國二十五年鉛印本' })).toBe(1936);
        expect(deriveYear({ edition: '民國廿二年刊本' })).toBe(1933);
    });

    it('简体「民国」同样识别', () => {
        expect(deriveYear({ edition: '民国十九年中华书局铅印四部备要本' })).toBe(1930);
    });

    it('荒谬的年数不接受', () => {
        // 民國只有 38 年（大陆），给个宽松上界 120；超出的多半是误匹配
        expect(deriveYear({ edition: '民國三百年刊本' })).toBeUndefined();
    });
});

describe('日本年號', () => {
    it('江戶年號可折算', () => {
        // 全库 553 部日本刻本因年号表不全推不出年份
        expect(deriveYear({ edition: '日本安永八年青黎閣刊本' })).toBe(1779);   // 1772+8-1
        expect(deriveYear({ edition: '日本寬文九年刊本' })).toBe(1669);          // 1661+9-1
        expect(deriveYear({ edition: '日本安政四年聿修堂重刊本' })).toBe(1857);  // 1854+4-1
        expect(deriveYear({ edition: '日本文化七年刊本' })).toBe(1810);          // 1804+7-1
        expect(deriveYear({ edition: '日本嘉永三年存誠藥室刊本' })).toBe(1850);  // 1848+3-1
    });

    it('同名年號按朝代消歧', () => {
        // 「元和」唐 806 / 日本 1615；「正德」明 1506 / 日本 1711
        expect(deriveYear({ edition: '唐元和元年寫本' })).toBe(806);
        expect(deriveYear({ edition: '日本元和元年古活字本' })).toBe(1615);
        expect(deriveYear({ edition: '明正德九年建陽刘氏慎独斋刊本' })).toBe(1514);
        expect(deriveYear({ edition: '日本正德三年刊本' })).toBe(1713);
    });

    it('日本无年号时仍能推出朝代', () => {
        expect(deriveEra({ edition: '日本鈔本' }).era).toBe('日本');
        expect(deriveYear({ edition: '日本鈔本' })).toBeUndefined();
    });
});

describe('deriveYearRange：「某某間」', () => {
    it('取首尾年号的起讫', () => {
        // 「明隆萬間」= 隆慶元年(1567) 至 萬曆末(1619，泰昌元年 1620 前一年)
        const r = deriveYearRange({ edition: '明隆萬間海寧查志隆刊本' });
        expect(r).toBeDefined();
        expect(r!.from).toBe(1567);
        expect(r!.to).toBe(1619);
    });

    it('单个年号的「間」取该年号起讫', () => {
        const r = deriveYearRange({ edition: '明嘉靖間刊本' });
        expect(r!.from).toBe(1522);
        expect(r!.to).toBeGreaterThan(1560);   // 嘉靖 1522–1566
    });

    it('只有朝代没有年号时退到朝代起讫', () => {
        // 明的下界是 1662 不是 1644：南明（弘光/隆武/永曆）归一到「明」，
        // 刻本确有「明弘光元年」(1645)、「南明隆武二年」(1646)。
        const r = deriveYearRange({ edition: '明間刊本' });
        expect(r).toEqual({ from: 1368, to: 1662 });
    });

    it('lineage.year_range 优先于 lineage.year', () => {
        // 水滸「文盛堂藏板」：year=1700 是区间中点不是考定年，源数据自带真区间
        const r = deriveYearRange({
            title: '忠義水滸全書',
            lineage: { year: 1700, year_text: '明末清初', year_range: [1640, 1750], category: '刻本', status: 'extant' },
        } as never);
        expect(r).toEqual({ from: 1640, to: 1750 });
    });

    it('year_text 跨代（明末清初）给区间', () => {
        const r = deriveYearRange({
            title: '水滸忠義志傳',
            lineage: { year: 1650, year_text: '明末清初（推定）', category: '刻本', status: 'extant' },
        } as never);
        expect(r).toBeDefined();
        expect(r!.from).toBeLessThan(1644);
        expect(r!.to).toBeGreaterThan(1644);
    });

    it('没有「間」字不返回区间', () => {
        expect(deriveYearRange({ edition: '明嘉靖四年金臺汪諒刊本' })).toBeUndefined();
    });
});

describe('deriveDating：完整年代判定', () => {
    it('著录来源标 attested', () => {
        const d = deriveDating({
            edition: '某本',
            lineage: { year: 1195, year_text: '宋慶元', category: '刻本', status: 'extant' },
        });
        expect(d!.certainty).toBe('attested');
        expect(d!.source).toBe('catalog');
        expect(d!.year).toBe(1195);
    });

    it('题名推断标 inferred，并记下依据', () => {
        const d = deriveDating({ edition: '清乾隆四十三年武英殿刊本' });
        expect(d!.certainty).toBe('inferred');
        expect(d!.source).toBe('edition');
        expect(d!.era).toBe('清');
        expect(d!.reign).toBe('乾隆');
        expect(d!.year).toBe(1778);
        expect(d!.basis).toContain('題名');
    });

    it('只有朝代没有年号年份标 uncertain', () => {
        // 「明刊本」这类全库 2,224 条（10.7%）：写进 dating 但标存疑，
        // 排序用朝代起始年——总比什么都没有强
        const d = deriveDating({ edition: '明刊本' });
        expect(d!.era).toBe('明');
        expect(d!.certainty).toBe('uncertain');
        expect(d!.year).toBeUndefined();
    });

    it('题名有存疑措辞标 uncertain', () => {
        expect(deriveDating({ edition: '明萬曆間舊題某氏刊本' })!.certainty).toBe('uncertain');
    });

    it('推不出任何年代时不生成 dating', () => {
        expect(deriveDating({ edition: '鈔本' })).toBeUndefined();
        expect(deriveDating({ edition: '江西圖' })).toBeUndefined();
    });

    it('底本：影印/翻刻的主体是印本，底本记在 basedOn', () => {
        // 百衲本的矛盾就出在这里：年份取自底本(宋慶元 1195)、朝代取自
        // 印本(百衲本→民國)，两者互不知情
        const d = deriveDating({ edition: '百衲本·宋慶元黃善夫刊本' });
        expect(d!.era, '主体应是民國影印本').toBe('民國');
        expect(d!.basedOn, '底本应单独记录').toBeDefined();
        expect(d!.basedOn!.era).toBe('宋');
    });

    it('底本：清覆刊武英殿本', () => {
        const d = deriveDating({ edition: '清同治十一年四川成都書局覆刊武英殿本' });
        expect(d!.era).toBe('清');
        expect(d!.year).toBe(1872);      // 同治 1862 + 11 - 1
        expect(d!.basedOn?.relation).toBe('翻刻');
    });

    it('後修方向相反：主体在前，修版在后', () => {
        // 「元大德刻明修本」的主体是**元**大德刻本，明代只是修版；
        // 用底本的逻辑解析会把主次搞反
        const d = deriveDating({ edition: '元大德刻明修本' });
        expect(d!.era, '主体是元刻本').toBe('元');
        expect(d!.laterRepair?.era, '明只是后来修版').toBe('明');
        expect(d!.basedOn, '后修不是底本').toBeUndefined();
    });

    it('後修：宋紹興間刊明初修補九行本', () => {
        const d = deriveDating({ edition: '宋紹興間刊明初修補九行本' });
        expect(d!.era).toBe('宋');
        expect(d!.laterRepair?.era).toBe('明');
    });
});

describe('deriveDating 的四个坑（全量报告里抓出来的）', () => {
    it('单字朝代名不被地名误伤', () => {
        // 「金陵荊山書林」的金是金陵（南京），不是金朝
        const d = deriveDating({ edition: '明萬曆間金陵荊山書林刊配補影鈔本' });
        expect(d!.era).toBe('明');
        expect(d!.basedOn?.era, '金陵被当成金朝底本').not.toBe('金');
    });

    it('「間」表示区间，不能折算成年号元年', () => {
        // 「明洪武間」指 1368–1398 整段，不是洪武元年 1368
        const d = deriveDating({ edition: '明洪武間內府刊本' });
        expect(d!.year, '「洪武間」不该给确切年份').toBeUndefined();
        expect(d!.yearRange).toBeDefined();
        expect(d!.yearRange!.from).toBe(1368);

        // 跨年号的「清乾隆道光間」同理
        const d2 = deriveDating({ edition: '清乾隆道光間長塘鮑氏刊知不足齋叢書之一' });
        expect(d2!.year).toBeUndefined();
        expect(d2!.yearRange!.from).toBe(1736);
        expect(d2!.yearRange!.to).toBeGreaterThan(1840);   // 道光末 1850
    });

    it('南明年號可识别（弘光/隆武/永曆）', () => {
        // 此前「南明永曆間刊本」推成 1403–1619，差了两百多年
        expect(deriveYear({ edition: '明弘光元年文來閣刻本' })).toBe(1645);
        expect(deriveYear({ edition: '南明隆武二年刊本' })).toBe(1646);
        const d = deriveDating({ edition: '南明永曆間刊本' });
        expect(d!.yearRange!.from).toBe(1647);
    });

    it('同朝代的底本也记录', () => {
        // 「清同治十一年覆刊武英殿本」主体是清同治，底本武英殿也是清（乾隆），
        // 同朝代但确实是两个本子，不能因为朝代相同就丢掉
        const d = deriveDating({ edition: '清同治十一年四川成都書局覆刊武英殿本' });
        expect(d!.basedOn).toBeDefined();
        expect(d!.basedOn!.relation).toBe('翻刻');
    });
});

describe('sortYear 用区间下界', () => {
    it('「明洪武間」与「明萬曆間」在排序上能分开', () => {
        // 若两者都退到朝代起始年 1368，洪武本和万历本就并列了
        const hw = sortYear({ edition: '明洪武間內府刊本' });
        const wl = sortYear({ edition: '明萬曆間刊本' });
        expect(hw).toBe(1368);
        expect(wl).toBe(1573);
        expect(hw!).toBeLessThan(wl!);
    });

    it('确切纪年优先于区间', () => {
        expect(sortYear({ edition: '明萬曆二十四年刊本' })).toBe(1596);
    });
});

describe('干支括注的序数年', () => {
    it('「年號干支(N年)」取括注里的序数', () => {
        // 全库 2,022 条（9.7%）是这种写法。不认括注的话全部落到年号元年，
        // 「萬曆壬子」会变成 1573 而不是 1612，差近 40 年
        expect(deriveYear({ edition: '明萬曆壬子(四十年)刊本' })).toBe(1612);      // 1573+40-1
        expect(deriveYear({ edition: '明嘉靖丁巳(三十六年)顧名儒建陽刊本' })).toBe(1557); // 1522+36-1
        expect(deriveYear({ edition: '清雍正壬子(十年)刊本' })).toBe(1732);        // 1723+10-1
        expect(deriveYear({ edition: '清嘉慶丙辰(元年)刊本' })).toBe(1796);        // 嘉慶元年
    });

    it('不带干支的括注不误取', () => {
        // 「摛藻堂四庫全書薈要·第321冊」的 321 不能被当成年份
        expect(deriveYear({ title: '摛藻堂四庫全書薈要·第321冊' })).not.toBe(321);
    });
});

describe('优先读 dating 字段（Phase C 回退链）', () => {
    it('有 dating 时直接用，不再从题名现推', () => {
        // 题名说清乾隆，dating 说宋慶元 —— 以 dating 为准
        // （人工订正的场景：题名写错了，或题名是印本而 dating 记的是底本判定）
        const d = deriveEra({
            edition: '清乾隆四十三年武英殿刊本',
            dating: { era: '宋', reign: '慶元', year: 1195, certainty: 'attested' },
        });
        expect(d.era).toBe('宋');
        expect(d.reign).toBe('慶元');
        expect(d.source).toBe('catalog');
        expect(deriveYear({
            edition: '清乾隆四十三年武英殿刊本',
            dating: { era: '宋', year: 1195, certainty: 'attested' },
        })).toBe(1195);
    });

    it('dating.certainty=inferred 时标记为推断', () => {
        expect(deriveEra({ dating: { era: '清', reign: '乾隆', certainty: 'inferred' } }).source)
            .toBe('edition');
    });

    it('没有 dating 时回退到题名推断——旧数据不会坏', () => {
        // draft 仓、未迁移的条目都没有这个字段
        const d = deriveEra({ edition: '清乾隆四十三年武英殿刊本' });
        expect(d.era).toBe('清');
        expect(d.source).toBe('edition');
    });

    it('dating 的 year_range 也被采用', () => {
        expect(deriveYearRange({ dating: { era: '明', year_range: [1368, 1398] } }))
            .toEqual({ from: 1368, to: 1398 });
    });

    it('dating 优先于 lineage.year', () => {
        expect(deriveYear({
            dating: { year: 1500 },
            lineage: { year: 1200, category: '刻本', status: 'extant' },
        })).toBe(1500);
    });
});

describe('title 里的年号不当版本年代', () => {
    it('作品名里的年号是主题不是刊刻年', () => {
        // 全量跑出来 22 条早于 1000 年的里，有 4 条是这么来的
        expect(deriveYear({ title: '會昌一品制集', edition: '宋刻本' }), '會昌是作品名不是刊年')
            .not.toBe(841);
        expect(deriveYear({ title: '大唐開元禮', edition: '清抄本' }), '開元是作品名不是刊年')
            .not.toBe(713);
        expect(deriveYear({ title: '咸平集', edition: '清平江陳氏酉畇草堂傳抄四庫全書本' }))
            .not.toBe(998);
    });

    it('edition 为空时才退到 title', () => {
        // 有些条目把版本描述放在 title 里
        expect(deriveYear({ title: '宋乾道七年蔡夢弼東塾刻本' })).toBe(1171);
    });

    it('石刻类的真实早期年代不受影响', () => {
        // 開成石經刻於開成年間(836–840)，題名未署具體年份，取元年 836；
        // 咸通九年有確切紀年
        expect(deriveYear({ edition: '唐開成石經刻石' })).toBe(836);
        expect(deriveYear({ edition: '唐懿宗咸通九年王玠刻本' })).toBe(868);
    });
});

describe('著录朝代优先于题名年号', () => {
    it('「清補刻」不取题名里被补刻对象的年号', () => {
        // 「開成石經清補刻孟子」著录说清，题名里的「開成」是被补刻的对象
        // （唐开成石经），不是刊刻年——捞了会得到「清 · 836」这种矛盾组合
        const y = deriveYear({
            edition: '開成石經清補刻孟子',
            publication_info: { year: '清', details: '清代補刻九石足十三經之數' },
        });
        expect(y, '不该取到唐开成的 836').not.toBe(836);
    });

    it('著录有确切年份时照常使用', () => {
        expect(deriveYear({
            edition: '熹平石經殘石',
            lineage: { year: 175, category: '石刻', status: 'fragment' },
        })).toBe(175);
    });
});

describe('朝代与年份必须自洽', () => {
    it('「清光緒…修民國…印」主体是清，不取民國的年份', () => {
        // 全库 9 条这种句式。两个年代此前各自独立扫出，
        // 结果是「清光緒 1920」——朝代与年份互相打架
        const d = deriveDating({ edition: '清光緒三十二年修民國九年排印本' });
        expect(d!.era).toBe('清');
        expect(d!.year, '不该取民國九年的 1920').not.toBe(1920);
        expect(d!.year).toBe(1906);   // 光緒三十二年
    });

    it('主体确实是民國时照常取', () => {
        expect(deriveYear({ edition: '民國九年排印本' })).toBe(1920);
        expect(deriveYear({ edition: '民國廿四年刊本' })).toBe(1935);
    });
});

describe('全库一致性哨兵（2026-09-05 实测基线）', () => {
    /*
     * 对生产仓 13,287 条「有朝代且有年份」的 dating 做过朝代—年份区间校验，
     * 不自洽的只剩 3 条，且都是**源数据自身矛盾**（人工录入的 lineage 里
     * year 与 year_text 打架，如 year:1605 却标「清顺治至康熙初年」），
     * 不是推断错误——推断如实反映了著录。
     *
     * 下面这组守的是推断侧不要再引入新的不自洽。
     */
    const ERA_RANGE: Record<string, [number, number]> = {
        宋: [960, 1279], 元: [1271, 1368], 明: [1368, 1662],
        清: [1644, 1912], 民國: [1912, 1949],
    };

    it.each([
        '宋乾道七年蔡夢弼東塾刻本',
        '元至元二十五年彭寅翁崇道精舍刻本',
        '明嘉靖四年金臺汪諒刊本',
        '清光緒三十一年上海久敬齋石印本',
        '民國廿四年刊本',
        '欽定四庫全書·文淵閣本',
        '明萬曆丙辰(四十四年)南京吏科給事中黃起龍重刊本',
        '清光緒三十二年修民國九年排印本',
    ])('「%s」的朝代与年份自洽', (edition) => {
        const d = deriveDating({ edition });
        expect(d).toBeDefined();
        if (!d!.era || d!.year == null) return;
        const r = ERA_RANGE[d!.era];
        if (!r) return;
        expect(d!.year, `${d!.era} 的年份 ${d!.year} 落在 ${r[0]}–${r[1]} 之外`)
            .toBeGreaterThanOrEqual(r[0] - 30);
        expect(d!.year).toBeLessThanOrEqual(r[1] + 30);
    });
});

describe('刊刻年代：lineage 路径（水滸六例）', () => {
    const L = (lineage: unknown) => ({ title: '水滸傳', lineage } as never);

    it('跨代 year_text 不产出确切年，改走区间', () => {
        // 此前：era=明 + year=1700 → 明止 1644，朝代与年份打架
        const d = deriveDating(L({ year: 1700, year_text: '明末清初', year_range: [1640, 1750], category: '刻本', status: 'extant' }));
        expect(d!.year).toBeUndefined();
        expect(d!.yearRange).toEqual({ from: 1640, to: 1750 });
    });

    it('「原刻…補印」取原刻年，补印记入 laterRepair', () => {
        // 石渠閣補印本：lineage.year=1666 是补印年，主体是明萬曆 1589 原刻
        const d = deriveDating(L({
            year: 1666,
            year_text: '明萬曆十七年（1589）原刻、清康熙五年（1666）石渠閣補印',
            category: '刻本', status: 'extant',
        }));
        expect(d!.era).toBe('明');
        expect(d!.year).toBe(1589);          // 不是 1666
        expect(d!.laterRepair?.era).toBe('清');
    });

    it('朝代与年份必须自洽', () => {
        const cases = [
            { year: 1700, year_text: '明末清初', year_range: [1640, 1750] as [number, number], category: '刻本', status: 'extant' },
            { year: 1650, year_text: '明末清初（推定）', category: '刻本', status: 'extant' },
            { year: 1666, year_text: '明萬曆十七年（1589）原刻、清康熙五年（1666）石渠閣補印', category: '刻本', status: 'extant' },
        ];
        const BOUND: Record<string, [number, number]> = { 明: [1368, 1662], 清: [1616, 1911] };
        for (const c of cases) {
            const d = deriveDating(L(c));
            if (d?.era && d.year != null && BOUND[d.era]) {
                const [lo, hi] = BOUND[d.era];
                expect(d.year, `${d.era} ${d.year} 越界（${c.year_text}）`).toBeGreaterThanOrEqual(lo);
                expect(d.year, `${d.era} ${d.year} 越界（${c.year_text}）`).toBeLessThanOrEqual(hi);
            }
        }
    });
});
