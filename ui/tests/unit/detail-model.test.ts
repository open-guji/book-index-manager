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
} from '../../src/core/detail-model';
import type { ResourceEntry, CollectionDetailData, VersionGraph } from '../../src/types';

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
        expect(byKey.belongsTo).toEqual(['1', '6']);
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
